import logging
import os

from fastapi import BackgroundTasks, HTTPException, Request
from opentelemetry.trace import get_tracer as opentelemetry_get_tracer
from clerk_backend_api import Clerk
from clerk_backend_api import AuthenticateRequestOptions
from google.oauth2 import service_account

from services.workflow_service import get_workflow_auth_context
from folio.utils.convex_client.convex_client import ConvexClient
from folio.utils.storage_helper import GoogleCloudStorageHelper
from folio.utils.storage_backend.storage_backend import GCSStorageBackend
from folio.utils.data_lakehouse import (
    DataLakeHouse,
    InMemoryDuckDbLakeHouse,
    OutOfMemoryDuckDbLakeHouse,
)
from TaskExecutor import FastAPIBackgroundTaskExecutor, TaskExecutor
from folio.utils.usage_cop import (
    BillingInfo,
    BillingService,
    UserBillingNotSetupError,
    Plan,
)


# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("my_fastapi_app")

# Initialize tracer
tracer = opentelemetry_get_tracer(__name__)

# Auth setup
sdk = Clerk(bearer_auth=os.getenv("CLERK_SECRET_KEY"))
WORKFLOW_ID_HEADER = "X-Workflow-Id"


REQUIRED_ENV_VARS = [
    "CLERK_SECRET_KEY",
    "MODAL_TOKEN_ID",
    "MODAL_TOKEN_SECRET",
    "PYTHONPATH",
    "CONVEX_HTTP_CLIENT_API_KEY",
    "REDIS_URL",
    "PORT",
    # "TEST_FOLIO_SHEET_CONFIG",
    # "FLOWER_UNAUTHENTICATED_API",
    # "LIBS_PATH",
    "RESULT_LIMIT",
    "ENV",
    "BUCKET_NAME",
    "FAL_KEY",
    "FOLIO_API_KEY",
    "API_BASE_URL",
    "PREFECT_API_URL",
    "PREFECT_API_KEY",
    "PREFECT_DEPLOYMENT_ID",
    "METRONOME_API_TOKEN",
    "GOOGLE_ACCESS_KEY_ID",
    "GOOGLE_ACCESS_KEY_SECRET",
    "GOOGLE_SERVICE_ACCOUNT_JSON",
]

# Optional feature flags (logged at startup)
OPTIONAL_ENV_VARS = [
    "ENABLE_BILLING_CHECKS",  # when true, enforce billing limits based on usage
]


def get_task_executor(background_tasks: BackgroundTasks) -> TaskExecutor:
    # Return the appropriate executor (e.g., swap with CeleryTaskExecutor)
    return FastAPIBackgroundTaskExecutor(background_tasks)


def get_storage_helper():
    return GoogleCloudStorageHelper()


def _resolve_workflow_user_id(req: Request, workflow_id: str | None = None) -> str | None:
    """Resolve and validate workflow user from persisted bearer token context."""
    workflow_id = workflow_id or req.headers.get(WORKFLOW_ID_HEADER)
    if not workflow_id:
        return None

    try:
        workflow_storage = GCSStorageBackend(get_storage_helper())
        auth_context = get_workflow_auth_context(workflow_id, workflow_storage)
    except Exception:
        logger.exception("Failed to load workflow auth context for %s", workflow_id)
        return None

    if not auth_context:
        logger.warning("No auth context found for workflow %s", workflow_id)
        return None

    authorization_header = auth_context.get("authorization_header")
    if not isinstance(authorization_header, str) or not authorization_header:
        logger.warning("Missing authorization header in workflow context for %s", workflow_id)
        return None

    # Rebuild the request with the saved bearer token.
    # Clerk verifies it and returns the user id from `sub`.
    synthetic_scope = dict(req.scope)
    synthetic_headers = list(synthetic_scope.get("headers", []))
    synthetic_headers = [
        (k, v) for (k, v) in synthetic_headers if k.lower() != b"authorization"
    ]
    synthetic_headers.append(
        (b"authorization", authorization_header.encode("utf-8"))
    )
    synthetic_scope["headers"] = synthetic_headers
    synthetic_req = Request(synthetic_scope)

    request_state = sdk.authenticate_request(synthetic_req, AuthenticateRequestOptions())
    if not request_state.is_signed_in:
        logger.warning("Stored workflow token failed Clerk validation for %s", workflow_id)
        return None

    user_id = request_state.payload.get("sub") if request_state.payload else None
    if isinstance(user_id, str) and user_id:
        req.state.workflow_id = workflow_id
        return user_id

    logger.warning("Stored workflow token missing sub claim for %s", workflow_id)
    return None


def verify_api_key(req: Request):
    """Ensure request is authorized via the X-System-Key header."""
    system_key = req.headers.get("X-System-Key")
    expected_key = os.environ.get("FOLIO_API_KEY")
    if system_key and expected_key and system_key == expected_key:
        workflow_id = req.headers.get(WORKFLOW_ID_HEADER)
        workflow_user_id = _resolve_workflow_user_id(req, workflow_id=workflow_id)
        if workflow_id and not workflow_user_id:
            raise HTTPException(
                status_code=401,
                detail=(
                    "Missing or invalid workflow auth token context "
                    f"for workflow_id={workflow_id}"
                ),
            )
        req.state.user_id = workflow_user_id or "system_api_key"
        return True
    raise HTTPException(status_code=403, detail="Forbidden")


def verify_token(req: Request):
    """Validate Clerk JWT or X-System-Key API key and attach the user id to the request."""
    request_state = sdk.authenticate_request(req, AuthenticateRequestOptions())
    if request_state.is_signed_in:
        req.state.user_id = (
            request_state.payload.get("sub") if request_state.payload else None
        )
        return True
    try:
        return verify_api_key(req)
    except HTTPException:
        return False


def _is_truthy(value: str | None) -> bool:
    return str(value or "false").strip().lower() == "true"


def get_billing_service(request: Request) -> BillingService:
    """Get the billing service for the authenticated user."""
    from fastapi import HTTPException

    user_id = getattr(request.state, "user_id", None)
    if not user_id:
        raise HTTPException(status_code=400, detail="Missing user id")

    # Initialize BillingService bound to the user and cache billing info
    try:
        return BillingService(user_id)
    except UserBillingNotSetupError as e:
        # If billing enforcement is on, surface a clear error to the client
        if _is_truthy(os.environ.get("ENABLE_BILLING_CHECKS")):
            raise HTTPException(
                status_code=403,
                detail=(
                    "User billing is not set up. Please configure your billing "
                    "information to continue."
                ),
            ) from e

        # Billing checks disabled -> return a safe stub so downstream code has
        # a BillingService with plausible metadata (customer_id/plan/credits).
        # Credits are in cents; use a generous default for dev/local flows.
        stub = BillingService(user_id, prefetch_plan=False)
        stub.set_billing_info(
            BillingInfo(
                customer_id=user_id,
                plan=Plan.BASIC,
                credits_remaining=1_000_000,  # $10,000 in dev credits
            )
        )
        return stub


# Logger dependency


def get_logger():
    return logger


# Tracer dependency


def get_tracer():
    return tracer


# Validate required env variables


def validate_env_variables(required_vars):
    missing_vars = [var for var in required_vars if var not in os.environ]
    if missing_vars:
        raise EnvironmentError(
            f"Missing required environment variables: {', '.join(missing_vars)}"
        )
    logger.info("All required environment variables are set.")


# This is to get the client to which we are syncing the data. In this case, it is Convex.
def get_datasync_client():
    convex_client = ConvexClient(
        api_key=os.environ.get("CONVEX_HTTP_CLIENT_API_KEY"),
        environment=os.environ.get("ENV"),
    )
    return convex_client


# TODO: Add my self-generated API KEY for convex here
validate_env_variables(REQUIRED_ENV_VARS)


def startup_event(app):
    def _startup_event():
        validate_env_variables(REQUIRED_ENV_VARS)
        # Log optional env vars for visibility
        for opt in OPTIONAL_ENV_VARS:
            present = opt in os.environ
            logger.info("Optional env %s present: %s", opt, present)
        logger.info("Loading up duckdb...")
        gcs_helper = GoogleCloudStorageHelper()
        default_project_name = "__default__"

        duckdb_lakehouse: DataLakeHouse = InMemoryDuckDbLakeHouse(
            gcs_helper=gcs_helper, project_name=default_project_name
        )
        app.state.duckdb_lakehouse = duckdb_lakehouse
        logger.info(
            "Initialized in-memory lakehouse with default prefix: %s",
            default_project_name,
        )
        logger.info("Startup tasks completed.")

    return _startup_event


def shutdown_event(app):
    def _shutdown_event():
        logger.info("Shutting down the application...")
        # Close the connection gracefully
        # app.state.conn.close()
        logger.info("Shutdown tasks completed.")

    return _shutdown_event


# Dependency to access DuckDB connection


def get_lakehouse(request: Request) -> DataLakeHouse:
    return request.app.state.duckdb_lakehouse


def resolve_project_lakehouse(
    current_lakehouse: DataLakeHouse,
    gcs_helper: GoogleCloudStorageHelper,
    convex_project_id: str,
) -> DataLakeHouse:
    """
    Return a lakehouse bound to the requested project id.
    If the injected lakehouse already matches, reuse it.
    Otherwise use the out-of-memory backend for per-project operations.
    """
    if current_lakehouse.prefix == convex_project_id:
        return current_lakehouse

    return OutOfMemoryDuckDbLakeHouse(gcs_helper, convex_project_id)

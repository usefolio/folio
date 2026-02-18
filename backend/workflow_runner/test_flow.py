import os
import json
import re
import httpx
from typing import Dict, Any, List, Optional, Tuple, Union
from pathlib import Path
import prefect
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
)

from prefect.artifacts import create_markdown_artifact
from prefect import flow, task, get_run_logger, pause_flow_run
from prefect.context import get_run_context

from folio.utils.shared_types.shared_types import DataProcessingWorkflowType
from folio.utils.workflow_tools import (
    WorkflowStepWithLiteralStrings,
    WorkflowTemplateWithPlaceholderRef,
    convert_placeholder_step_to_literal,
    load_workflow_template_from_json,
)
from folio.utils.workflow_tools.workflow_tools import (
    WorkflowTemplateWithLiteralStrings,
    parse_json_file_to_literal_workflow,
)

from prefect.futures import wait

WORKFLOW_ID_HEADER = "X-Workflow-Id"


def get_system_api_key() -> str:
    api_key = os.environ.get("FOLIO_API_KEY")
    if not api_key:
        raise ValueError("FOLIO_API_KEY environment variable not set")
    return api_key


def build_folio_api_headers(
    workflow_id: Optional[str] = None,
    auth_header: Optional[str] = None,
) -> Dict[str, str]:
    headers = {"X-System-Key": get_system_api_key()}
    if workflow_id:
        headers[WORKFLOW_ID_HEADER] = workflow_id
    if auth_header:
        headers["Authorization"] = auth_header
    return headers


def redact_sensitive_headers(headers: Dict[str, str]) -> Dict[str, str]:
    redacted = dict(headers)
    if "Authorization" in redacted:
        redacted["Authorization"] = "Bearer ***redacted***"
    return redacted


def log_http_error_artifact(
    name: str, url: str, status_code: int, body: str, headers: dict
):
    create_markdown_artifact(
        key=f"http-error-post-with-retry",
        markdown=f"""
            ### HTTP {status_code} Error at {url}

            **Headers**:
            ```json
            {json.dumps(headers, indent=2)}

            Response
            {body}
            ```
        """,
    )


def is_retryable_status(status_code: int) -> bool:
    """Return True if status code is retryable."""
    return (
        status_code == 429 or status_code >= 500
    )  # we actually want to retry 400s because a column may be a bit late


def handle_response_status(
    response: httpx.Response,
    logger,
    *,
    default=None,
) -> Optional[Any]:
    """Handle common HTTP statuses.

    Returns the provided ``default`` if the status code is 400 or 404.
    Logs details about 422 responses before re-raising the error for all
    other unexpected statuses.
    """
    if response.status_code in {400, 404}:
        msg = f"Ignoring {response.status_code} error from {response.request.url}."
        try:
            details = response.json()
            msg += f" Details: {json.dumps(details)}"
        except Exception:
            msg += f" Response text: {response.text}"
        logger.warning(msg)
        return default

    try:
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 422:
            try:
                detail = exc.response.json()
            except Exception:
                detail = exc.response.text
            logger.error(f"422 error from {exc.request.url}: {json.dumps(detail)}")
        raise

    return None


@retry(
    reraise=True,
    stop=stop_after_attempt(5),
    wait=wait_exponential(multiplier=1, min=1, max=10),
    retry=retry_if_exception_type(httpx.HTTPError),
)
def post_with_retry(
    url: str,
    *,
    json: dict | None = None,
    headers: dict | None = None,
    timeout: float = 180.0,
    logger: Optional[Any] = None,
) -> httpx.Response:
    """Send a POST request with retries and configurable timeout.

    Retries apply to HTTP errors and request errors such as timeouts.
    """
    try:
        response = httpx.post(url, json=json, headers=headers, timeout=timeout)
        if is_retryable_status(response.status_code):
            logger.warning(f"Retrying on HTTP {response.status_code} for {url}")
            raise httpx.HTTPStatusError(
                f"Retrying on HTTP {response.status_code}",
                request=response.request,
                response=response,
            )
        return response
    except httpx.HTTPStatusError as exc:
        response = exc.response
        if response is not None:
            log_http_error_artifact(
                name="post_with_retry",
                url=response.request.url,
                status_code=response.status_code,
                body=response.text,
                headers=dict(response.headers),
            )
        raise


@retry(
    reraise=True,
    stop=stop_after_attempt(5),
    wait=wait_exponential(multiplier=1, min=1, max=10),
    retry=retry_if_exception_type(httpx.HTTPError),
)
def put_with_retry(
    url: str,
    *,
    data: bytes | None = None,
    headers: dict | None = None,
    timeout: float = 180.0,
) -> httpx.Response:
    """Send a PUT request with retries and configurable timeout."""
    response = httpx.put(url, content=data, headers=headers, timeout=timeout)
    if is_retryable_status(response.status_code):
        raise httpx.HTTPStatusError(
            f"Retrying on HTTP {response.status_code}",
            request=response.request,
            response=response,
        )
    return response


@task(name="load_workflow_template")
def load_workflow_template_from_template(
    template: str,
    workflow_type: DataProcessingWorkflowType,
    workflow_id: str,
) -> Union[WorkflowTemplateWithPlaceholderRef, WorkflowTemplateWithLiteralStrings]:
    """
    Load a workflow template from a JSON file

    Args:
        template: JSON file containing the workflow template

    Returns:
        The loaded workflow template with placeholders
    """
    logger = get_run_logger()

    if workflow_type == DataProcessingWorkflowType.TEMPLATE:
        template = load_workflow_template_from_json(
            template, WorkflowTemplateWithPlaceholderRef
        )
    elif workflow_type == DataProcessingWorkflowType.LITERAL:
        template: WorkflowTemplateWithLiteralStrings = (
            parse_json_file_to_literal_workflow(template, workflow_id)
        )
    else:
        raise ValueError(
            f"Unknown workflow type: {workflow_type}. Expected 'template' or 'literal'."
        )

    logger.info(
        f"Loaded workflow template: {template.name} with {len(template.steps)} steps"
    )
    return template


@task(name="get_upload_url")
def get_upload_url(
    base_url: str,
    workflow_id: Optional[str] = None,
    auth_header: Optional[str] = None,
) -> Tuple[str, str]:
    """
    Request a presigned upload URL from the API

    Args:
        base_url: The base URL of the API

    Returns:
        Tuple containing the presigned URL and GUID
    """
    logger = get_run_logger()

    upload_url_request_body = {"fileName": "my_test_file.parquet"}

    headers = build_folio_api_headers(workflow_id, auth_header)

    logger.info(f"Requesting upload URL from {base_url}/asset_storage/upload_url")
    logger.info(f"Request headers: {json.dumps(redact_sensitive_headers(headers))}")

    response = post_with_retry(
        f"{base_url}/asset_storage/upload_url",
        json=upload_url_request_body,
        headers=headers,
        logger=logger,
    )

    handled = handle_response_status(response, logger, default=("", ""))
    if handled is not None:
        return handled

    data = response.json()

    presigned_url = data["url"]
    guid = data["guid"]

    logger.info(f"Received presigned URL: {presigned_url}")
    logger.info(f"Received GUID: {guid}")

    return presigned_url, guid


@task(name="upload_file")
def upload_file(presigned_url: str, file_path: str) -> bool:
    """
    Upload a file to the presigned URL

    Args:
        presigned_url: The presigned URL for uploading
        file_path: Path to the file to upload

    Returns:
        True if successful
    """
    logger = get_run_logger()

    logger.info(f"Reading file from {file_path}")
    with open(file_path, "rb") as f:
        file_data = f.read()

    logger.info(f"Uploading file to {presigned_url}")
    response = put_with_retry(presigned_url, data=file_data)

    handled = handle_response_status(response, logger, default=False)
    if handled is not None:
        return handled

    logger.info(f"File uploaded successfully, status code: {response.status_code}")

    return True


@task(name="create_convex_project")
def create_convex_project(convex_url: str, user_id: str, api_key: str) -> str:
    """
    Create a project in Convex

    Args:
        convex_url: The URL of the Convex API
        user_id: The user ID
        api_key: The API key

    Returns:
        The project ID
    """
    logger = get_run_logger()

    create_project_body = {
        "text": "some_name",
        "owner": user_id,
        "apiKey": api_key,
        "projectGrouping": None,
        "synced": False,
    }

    logger.info(f"Creating project in Convex at {convex_url}/createProject")
    logger.info(f"Request body: {json.dumps(create_project_body)}")

    response = post_with_retry(
        f"{convex_url}/createProject",
        json=create_project_body,
        timeout=180.0,
        logger=logger,
    )

    handled = handle_response_status(response, logger, default="")
    if handled is not None:
        return handled

    data = response.json()

    project_id = data["project_id"]
    logger.info(f"Created Convex project with ID: {project_id}")

    return project_id


@task(name="upload_dataset_with_id")
def upload_dataset_with_id(
    base_url: str,
    convex_project_id: str,
    guid: str,
    convex_url: str,
    workflow_id: Optional[str] = None,
    auth_header: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Upload a dataset with the given ID

    Args:
        base_url: The base URL of the API
        convex_project_id: The Convex project ID
        guid: The GUID of the file
        convex_url: The Convex URL to use as callback

    Returns:
        The response data
    """
    logger = get_run_logger()

    request_body = {
        "convex_project_id": convex_project_id,
        "file_name": "test",
        "callback_url": convex_url,
        "file_id": guid,
    }

    headers = build_folio_api_headers(workflow_id, auth_header)

    logger.info(f"Uploading dataset with ID to {base_url}/upload_dataset/with_id")

    response = post_with_retry(
        f"{base_url}/upload_dataset/with_id",
        json=request_body,
        headers=headers,
        timeout=60.0,
        logger=logger,
    )

    handled = handle_response_status(response, logger, default={})
    if handled is not None:
        return handled

    data = response.json()

    logger.info(f"Upload dataset response: {json.dumps(data)}")

    return data


@task(name="create_convex_view")
def create_convex_view(
    convex_url: str, name: str, project_id: str, filter: str, api_key: str
) -> str:
    """
    Create a view in Convex

    Args:
        convex_url: The URL of the Convex API
        name: The name of the view
        project_id: The project ID
        filter: The SQL filter to apply
        api_key: The API key

    Returns:
        The view ID
    """
    logger = get_run_logger()

    create_sheet_body = {
        "text": f"{name}",
        "project_id": project_id,
        "filter": filter,
        "apiKey": api_key,
    }

    endpoint = f"{convex_url}/createSheet"
    logger.info(f"Creating sheet in Convex at {endpoint}")
    logger.info(f"Request body: {json.dumps(create_sheet_body)}")

    response = post_with_retry(
        endpoint,
        json=create_sheet_body,
        timeout=180.0,
        logger=logger,
    )

    handled = handle_response_status(response, logger, default="")
    if handled is not None:
        return handled

    try:
        data = response.json()
        sheet_id = data["sheet_id"]
    except (KeyError, json.JSONDecodeError) as exc:
        logger.error(f"Error parsing sheet creation response: {exc}")
        raise

    logger.info(f"Created sheet with ID {sheet_id}, in project with ID: {project_id}")
    return sheet_id


@task(name="populate convex view")
def populate_convex_view(
    base_url: str,
    step: WorkflowStepWithLiteralStrings,
    workflow_id: Optional[str] = None,
    auth_header: Optional[str] = None,
):
    """
    Populate a view created in convex

    Args:
        base_url: The base URL of the API
        convex_url: The Convex URL to use as callback
        convex_project_id: The Convex project ID
        convex_view_id: The Convex sheet ID
        filter: The SQL filter to apply

    """
    logger = get_run_logger()

    headers = build_folio_api_headers(workflow_id, auth_header)

    logger.info(f"Processing data at {base_url}/create_view")

    response = post_with_retry(
        f"{base_url}/create_view",
        json=step.payload.model_dump(),
        headers=headers,
        timeout=180.0,
        logger=logger,
    )

    handled = handle_response_status(response, logger, default={})
    if handled is None:
        data = response.json()

        job_id = data["job_id"]
        items_to_process = data["items_to_process"]

        logger.info(
            f"Populating view with {items_to_process} new items, based on job ID: {job_id}"
        )


@task(name="create_convex_column")
def create_convex_column(
    convex_url: str, name: str, project_id: str, api_key: str
) -> str:
    """
    Create a column in Convex

    Args:
        convex_url: The URL of the Convex API
        name: The name of the column
        project_id: The project ID
        api_key: The API key

    Returns:
        The column ID
    """
    logger = get_run_logger()

    create_project_body = {
        "text": f"{name}",
        "project_id": project_id,
        "apiKey": api_key,
    }

    logger.info(f"Creating column in Convex at {convex_url}/createColumn")
    logger.info(f"Request body: {json.dumps(create_project_body)}")

    response = post_with_retry(
        f"{convex_url}/createColumn",
        json=create_project_body,
        timeout=180.0,
        logger=logger,
    )

    handled = handle_response_status(response, logger, default="")
    if handled is not None:
        return handled

    data = response.json()

    column_id = data["column_id"]
    logger.info(f"Created column with ID {column_id}, in project with ID: {project_id}")
    return column_id


@task(name="process_data")
def process_data(
    base_url: str,
    step: WorkflowStepWithLiteralStrings,
    workflow_id: Optional[str] = None,
    auth_header: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Process the data to create a new column

    Args:
        base_url: The base URL of the API
        step: The workflow step to execute

    Returns:
        The response data
    """
    logger = get_run_logger()

    # Write request artifacts
    payload_json = json.dumps(step.payload.model_dump(), indent=2)
    logger.info("Process-step payload:\n%s", payload_json)
    create_markdown_artifact(
        key=f"process-input",
        markdown=f"# Payload sent to /process\n```json\n{payload_json}\n```",
    )

    headers = build_folio_api_headers(workflow_id, auth_header)
    endpoint = f"{base_url}/process"

    logger.info(f"Processing data at {endpoint}")

    try:
        response = post_with_retry(
            endpoint,
            json=step.payload.model_dump(),
            headers=headers,
            timeout=180.0,
            logger=logger,
        )
    except httpx.HTTPStatusError as exc:
        if exc.response is not None and exc.response.status_code == 400:
            logger.warning(
                "createColumn returned HTTP 400 after retries – "
                "assuming the column already exists; continuing workflow."
            )
            return ""  # act as a no-op
        raise

    handled = handle_response_status(response, logger, default={"items_to_process": 0})
    if handled is not None:
        return handled

    data = response.json()

    # Create an artifact to store the results
    create_markdown_artifact(
        key="process-results",
        markdown=f"""
    # Data Processing Results

    - Job ID: {data.get('job_id')}
    - Items to process: {data.get('items_to_process')}
    - Cell states: {data.get('cell_states', 'Not available')}

    # Inputs:
    - {json.dumps(step.payload.model_dump(), indent=2)}

            """,
    )

    return data


COLUMN_RE = re.compile(r'"([^"]+)"')  # crude: grabs „Level 1 partition“


def column_needed(step) -> Optional[str]:
    if step.action == "process" and step.payload.sql_condition:
        m = COLUMN_RE.search(step.payload.sql_condition)
        return m.group(1) if m else None
    return None


@task(name="identity")
def identity(x):
    return x


# ----------------------------------------------------------------------
#  main flow
# ----------------------------------------------------------------------
@flow(name="data_processing_workflow")
def data_processing_workflow(
    template: Optional[str] = None,
    template_path: Optional[str] = None,
    base_url: Optional[str] = None,
    user_id: Optional[str] = None,
    workflow_type: DataProcessingWorkflowType = DataProcessingWorkflowType.TEMPLATE,
    convex_url: Optional[str] = None,
    auth_header: Optional[str] = None,
):
    logger = get_run_logger()

    # ------------------------------------------------------------------
    #  environment / parameter handling (unchanged)
    # ------------------------------------------------------------------
    base_url = base_url or os.environ.get("API_BASE_URL", "http://127.0.0.1:8000")
    user_id = user_id or os.environ.get("TEST_USER_ID")
    convex_api_key = os.environ.get("CONVEX_HTTP_CLIENT_API_KEY")
    convex_url = convex_url or os.environ.get("CONVEX_URL")
    system_api_key = get_system_api_key()

    context = get_run_context()
    workflow_id = str(context.flow_run.id)

    missing = [
        name
        for name, val in [
            ("TEST_USER_ID", user_id),
            ("CONVEX_HTTP_CLIENT_API_KEY", convex_api_key),
            ("CONVEX_URL", convex_url),
            ("FOLIO_API_KEY", system_api_key),
        ]
        if not val
    ]
    if missing:
        raise ValueError(f"Missing required env vars: {', '.join(missing)}")

    logger.info(f"Starting data processing workflow run {workflow_id}")

    # ------------------------------------------------------------------
    #  load the workflow JSON
    # ------------------------------------------------------------------
    if not template:
        template = Path(template_path).read_text(encoding="utf-8")

    workflow: WorkflowTemplateWithPlaceholderRef = load_workflow_template_from_template(
        template, workflow_type, workflow_id=workflow_id
    )
    if not workflow.steps:
        raise ValueError("Workflow contains no steps")

    # ------------------------------------------------------------------
    #  template-specific bootstrap (upload → create project → dataset)
    # ------------------------------------------------------------------
    if workflow_type == DataProcessingWorkflowType.TEMPLATE:
        presigned_url, guid = get_upload_url(
            base_url,
            workflow_id=workflow_id,
            auth_header=auth_header,
        )
        convex_project_id = create_convex_project(convex_url, user_id, convex_api_key)
        upload_dataset_with_id(
            base_url,
            convex_project_id,
            guid,
            convex_url,
            workflow_id=workflow_id,
            auth_header=auth_header,
        )

    # ------------------------------------------------------------------
    #  we will treat process-steps first, view-steps later
    # ------------------------------------------------------------------
    process_steps, view_steps = [], []
    for s in workflow.steps:
        (process_steps if s.action == "process" else view_steps).append(s)

    produced: Dict[str, prefect.futures.PrefectFuture] = {}
    all_futures: List[prefect.futures.PrefectFuture] = []

    # ================================================================
    #  1️⃣  RUN ALL PROCESS / COLUMN STEPS WITH DEPENDENCIES
    # ================================================================
    for idx, step in enumerate(process_steps):
        needs = column_needed(step)
        wait_for = [produced[needs]] if needs in produced else []

        # ---- create column if template-driven ----
        if workflow_type == DataProcessingWorkflowType.TEMPLATE:
            col_id_future = create_convex_column.submit(
                convex_url,
                step.payload.column_name,
                convex_project_id,
                convex_api_key,
                wait_for=wait_for,
            )
            compiled = convert_placeholder_step_to_literal(
                step,
                {
                    "convex_project_id": convex_project_id,
                    "convex_column_id": col_id_future,
                    "callback_url": convex_url,
                    "workflow_id": workflow_id,
                },
            )
        else:
            compiled = identity.submit(step, wait_for=wait_for)

        # ---- fire /process ----
        proc_future = process_data.submit(
            base_url,
            compiled,
            workflow_id,
            auth_header,
            wait_for=(
                [compiled]
                if isinstance(compiled, prefect.futures.PrefectFuture)
                else wait_for
            ),
        )
        all_futures.append(proc_future)
        produced[step.payload.output_name] = proc_future

        # ---- look at immediate response to decide on pause ----
        result = proc_future.result()  # blocks this branch only
        if result.get("items_to_process", 0) != 0 and idx < len(process_steps) - 1:
            logger.info(f"{result['items_to_process']} items queued – pausing flow")
            pause_flow_run()

    # ================================================================
    #  2️⃣  AFTER COLUMNS ARE DONE, RUN ALL VIEW STEPS IN PARALLEL
    # ================================================================
    for step in view_steps:
        view_name = step.payload.sql_filter

        if workflow_type == DataProcessingWorkflowType.TEMPLATE:
            view_id_future = create_convex_view.submit(
                convex_url, view_name, convex_project_id, view_name, convex_api_key
            )
            compiled = convert_placeholder_step_to_literal(
                step,
                {
                    "convex_project_id": convex_project_id,
                    "convex_sheet_id": view_id_future,
                    "callback_url": convex_url,
                },
            )
        else:
            compiled = identity.submit(step)

        fut = populate_convex_view.submit(
            base_url,
            compiled,
            workflow_id,
            auth_header,
            wait_for=(
                [compiled]
                if isinstance(compiled, prefect.futures.PrefectFuture)
                else None
            ),
        )
        all_futures.append(fut)

    # ------------------------------------------------------------------
    #  final sync – wait for every outstanding future, then finish
    # ------------------------------------------------------------------
    wait(all_futures)
    logger.info(f"Workflow {workflow_id} completed successfully.")


if __name__ == "__main__":
    pass

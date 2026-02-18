import os
from typing import List, Optional, Dict
import time
from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.concurrency import run_in_threadpool
import logging
from pydantic import BaseModel, Field


from folio.utils.data_lakehouse.data_lakehouse import (
    ColumnAlreadyExists,
    DataLakeHouse,
    DuckDbQueryExecutionError,
)

from folio.utils.shared_types import (
    SructuredOrTextGenerationPromptModel,
)

from dependencies import (
    get_lakehouse,
    verify_token,
    get_storage_helper,
    get_billing_service,
    _resolve_workflow_user_id,
    resolve_project_lakehouse,
)
from folio.utils.usage_cop.models import InsufficientCreditsError
from folio.utils.shared_types.shared_types import (
    SERVICE_PROVIDER,
    DataLakehouseOperationType,
)
from folio.utils.storage_backend.storage_backend import GCSStorageBackend
from folio.utils.storage_helper.gcs_helper import GoogleCloudStorageHelper
from services.create_column import (
    ColumnDoesNotExist,
    NoCellsToProcess,
    TooMuchDataToProcess,
    estimate_input_price,
    run_column_action,
)
from services.workflow_service import store_request
router = APIRouter(prefix="/process")

logger = logging.getLogger(__name__)


class ProcessRequest(BaseModel):
    convex_project_id: str
    convex_column_id: str
    column_name: str
    prompt: SructuredOrTextGenerationPromptModel
    sql_condition: Optional[str] = None
    output_name: Optional[str] = None
    prompt_input_columns: Optional[List[str]] = Field(default=[])
    workflow_id: Optional[str] = None
    api_keys: Optional[Dict[SERVICE_PROVIDER, str]] = {}
    # TODO: This is only needed because o how convex does its lower envs. Should not be used at all in prod.
    callback_url: Optional[str] = None


class ProcessResponse(BaseModel):
    job_id: str
    message: str
    items_to_process: int
    cell_states: str


class TokenEstimateResponse(BaseModel):
    total_tokens: int
    total_price: float


@router.post("", response_model=ProcessResponse)
async def process_data(
    body: ProcessRequest,
    request: Request,
    authorized: bool = Depends(verify_token),
    data_lakehouse: DataLakeHouse = Depends(get_lakehouse),
    gcs_helper: GoogleCloudStorageHelper = Depends(get_storage_helper),
) -> ProcessResponse:

    # Generate unique job ID
    job_id = f"job_{int(time.time())}"
    logger.info("Starting Job %s", job_id)

    if not authorized:
        raise HTTPException(status_code=401, detail="Unauthorized")

    if getattr(request.state, "user_id", None) == "system_api_key":
        if not body.workflow_id:
            raise HTTPException(
                status_code=401,
                detail=(
                    "System-key workflow requests must include workflow_id "
                    "for token-based user claim resolution."
                ),
            )
        workflow_user_id = _resolve_workflow_user_id(
            request, workflow_id=body.workflow_id
        )
        if not workflow_user_id:
            raise HTTPException(
                status_code=401,
                detail=(
                    "Missing or invalid workflow auth token context "
                    f"for workflow_id={body.workflow_id}"
                ),
            )
        request.state.user_id = workflow_user_id

    billing = get_billing_service(request)
    user_id = billing.billing_info.customer_id
    plan = billing.billing_info.plan

    data_lakehouse = resolve_project_lakehouse(
        data_lakehouse, gcs_helper, body.convex_project_id
    )

    # Estimate price (USD) for this request, then convert to cents for credit checks
    try:
        total_tokens, price_usd = await run_in_threadpool(
            estimate_input_price,
            body.prompt,
            body.prompt_input_columns,
            body.sql_condition,
            data_lakehouse,
        )
    except ColumnDoesNotExist as e:
        raise HTTPException(status_code=404, detail=str(e)) from e

    # Verify the customer has enough credits (cents) to cover the estimated price
    try:
        billing.ensure_sufficient_credits(int(round(price_usd * 100.0)))
    except InsufficientCreditsError as e:
        if os.environ.get("ENABLE_BILLING_CHECKS", "").lower() in ("1", "true", "yes"):
            raise HTTPException(status_code=402, detail=str(e)) from e

    workflow_storage = GCSStorageBackend(gcs_helper)
    store_request(
        path=request.url.path,
        key=body.convex_project_id,
        new_request=body.model_dump(),
        storage_backend=workflow_storage,
    )

    try:
        nr_of_jobs, cell_states = await run_in_threadpool(
            run_column_action,
            data_lakehouse_operation_type=DataLakehouseOperationType.CREATE_COLUMN,
            job_id=job_id,
            external_project_id=body.convex_project_id,
            external_column_id=body.convex_column_id,
            column_name=body.column_name,
            customer_id=user_id,
            plan=plan,
            billing_service=billing,
            prompt=body.prompt,
            input_columns=body.prompt_input_columns,
            sql_condition=body.sql_condition,
            workflow_id=body.workflow_id,
            output_name=body.output_name,
            callback_url=body.callback_url,
            data_lakehouse=data_lakehouse,
        )

        return ProcessResponse(
            job_id=job_id,
            message="Processing started",
            items_to_process=nr_of_jobs,
            cell_states=cell_states,
        )
    except ColumnDoesNotExist as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except ColumnAlreadyExists as exc:
        logger.info("Column %s already exists", body.column_name)
        raise HTTPException(status_code=400, detail="Column already exists") from exc
    except TooMuchDataToProcess as e:
        logger.warning("Too much data to process")
        raise HTTPException(status_code=400, detail=str(e)) from e
    except NoCellsToProcess as e:
        logger.info("No cells to process for %s", body.sql_condition)
        raise HTTPException(status_code=400, detail=str(e)) from e
    except DuckDbQueryExecutionError:
        raise
    except Exception as e:
        logger.exception("Unexpected error")
        raise HTTPException(
            status_code=500, detail="Something unexpected happened on our side."
        ) from e


@router.post("/estimate_cost", response_model=TokenEstimateResponse)
async def estimate_token_count(
    request: ProcessRequest,
    data_lakehouse: DataLakeHouse = Depends(get_lakehouse),
    authorized: bool = Depends(verify_token),
    gcs_helper: GoogleCloudStorageHelper = Depends(get_storage_helper),
) -> TokenEstimateResponse:

    if not authorized:
        raise HTTPException(status_code=401, detail="Unauthorized")

    data_lakehouse = resolve_project_lakehouse(
        data_lakehouse, gcs_helper, request.convex_project_id
    )

    try:
        total_tokens, price = await run_in_threadpool(
            estimate_input_price,
            request.prompt,
            request.prompt_input_columns,
            request.sql_condition,
            data_lakehouse,
        )
        return TokenEstimateResponse(
            total_tokens=total_tokens,
            total_price=price,
        )
    except ColumnDoesNotExist as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except DuckDbQueryExecutionError:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

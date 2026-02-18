import time
from typing import List, Tuple, Optional

from pydantic import BaseModel
from fastapi import HTTPException, Depends, APIRouter, BackgroundTasks, Request
from fastapi.concurrency import run_in_threadpool
from opentelemetry.trace import Status, StatusCode
from tenacity import retry, stop_after_attempt, wait_exponential

from bg_tasks import create_relationships_task
import modal
from dependencies import (
    verify_token,
    get_tracer,
    get_logger,
    get_lakehouse,
    get_storage_helper,
    resolve_project_lakehouse,
)
from folio.utils.data_lakehouse.data_lakehouse import (
    DataLakeHouse,
    OutOfMemoryDuckDbLakeHouse,
    DuckDbQueryExecutionError,
)
from folio.utils.shared_types import DatasetConfig
from folio.utils.storage_backend.storage_backend import GCSStorageBackend
from folio.utils.storage_helper.gcs_helper import GoogleCloudStorageHelper

from services.workflow_service import store_request


router = APIRouter(
    prefix="/create_view",
    tags=["create_view"],
)


class ViewCreationRequest(BaseModel):
    convex_project_id: str
    convex_sheet_id: str
    sql_filter: str
    # TODO: This is only needed because o how convex does its lower envs. Should not be used at all in prod.
    callback_url: Optional[str]


class ViewCreationResponse(BaseModel):
    job_id: str
    items_to_process: int


@router.post("", response_model=ViewCreationResponse)
async def create_view(
    body: ViewCreationRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    authorized: bool = Depends(verify_token),
    duckdb_lakehouse: DataLakeHouse = Depends(get_lakehouse),
    gcs_helper: GoogleCloudStorageHelper = Depends(get_storage_helper),
    tracer=Depends(get_tracer),
    logger=Depends(get_logger),
) -> ViewCreationResponse:

    if not authorized:
        raise HTTPException(status_code=401, detail="Unauthorized")

    with tracer.start_as_current_span("create_view_endpoint") as span:
        try:
            # Generate unique job ID
            job_id = f"job_{int(time.time())}_view"
            span.set_attribute("job_id", job_id)
            logger.info("Starting Job %s", job_id)

            duckdb_lakehouse = resolve_project_lakehouse(
                duckdb_lakehouse, gcs_helper, body.convex_project_id
            )

            workflow_storage = GCSStorageBackend(gcs_helper)
            store_request(
                path=request.url.path,
                key=body.convex_project_id,
                new_request=body.model_dump(),
                storage_backend=workflow_storage,
            )

            # TODO: Pull this from metadata storage
            dataset_config = DatasetConfig()
            id_column_name = dataset_config.PRIMARY_KEY_COLUMN
            external_row_column_name = dataset_config.EXTERNAL_DATASYNC_ROW_COLUMN

            query = duckdb_lakehouse.generate_join_across_all_cols(
                f"DISTINCT ON({duckdb_lakehouse.name_for_default_dataset}.{id_column_name}) {duckdb_lakehouse.name_for_default_dataset}.{id_column_name}, {duckdb_lakehouse.name_for_default_dataset}.{external_row_column_name}",
                body.sql_filter,
                "",
            )
            logger.debug("Query: %s", query)
            if isinstance(duckdb_lakehouse, OutOfMemoryDuckDbLakeHouse):
                data_to_process = await duckdb_lakehouse.run_sql_async(query)
            else:
                data_to_process = await run_in_threadpool(
                    duckdb_lakehouse.run_sql, query
                )

            logger.info("Fetched %d items", len(data_to_process))

            sheet_row_relationship_tuples = [
                (item[1], f"{body.convex_sheet_id}", item[0])
                for item in data_to_process
            ]

            task = create_relationships_task.delay(
                sheet_row_relationship_tuples, body.callback_url
            )
            # background_tasks.add_task(create_relationships, sheet_row_relationship_tuples, request.callback_url)
            logger.info("Started Celery task with ID: %s", task.id)

            logger.debug("First 10 relationships: %s", sheet_row_relationship_tuples[:10])

            # Fetch data
        except DuckDbQueryExecutionError as e:
            span.set_status(Status(StatusCode.ERROR))
            span.record_exception(e)
            raise
        except Exception as e:
            span.set_status(Status(StatusCode.ERROR))
            span.record_exception(e)
            logger.error(f"Error in create_view endpoint: {str(e)}")
            raise HTTPException(status_code=500, detail=str(e)) from e
        return ViewCreationResponse(
            job_id=job_id, message="Done", items_to_process=len(data_to_process)
        )

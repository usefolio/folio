from enum import Enum
import os
import io
import time
import asyncio
import tempfile
from typing import Dict, List, Tuple
import requests
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
from fastapi import Form, APIRouter, Depends, UploadFile, HTTPException
import logging
from pydantic import BaseModel

from folio.utils.convex_client.convex_client import ConvexClient
from folio.utils.data_lakehouse.data_lakehouse import (
    DataLakeHouse,
    OutOfMemoryDuckDbLakeHouse,
)
from folio.utils.dataset_processor.dataset_processor import (
    ConvexDataSync,
    TabularDataProcessor,
    FileType,
    TabularFileMetadata,
    ProcessingError,
)
from folio.utils.dataset_processor.file_utils import (
    _detect_file_type,
    _is_csv_file,
)
from folio.utils.shared_types import DatasetConfig
from folio.utils.shared_types.shared_types import (
    DataLakehouseOperationType,
    SheetTaskType,
)
from folio.utils.storage_helper.gcs_helper import GoogleCloudStorageHelper, FileExists
from dependencies import (
    get_lakehouse,
    verify_token,
    get_tracer,
    get_logger,
    get_storage_helper,
    get_billing_service,
    resolve_project_lakehouse,
)
from services.create_column import run_column_action
from folio.utils.usage_cop import BillingService

router = APIRouter(
    prefix="/upload_dataset",
    tags=["upload_dataset"],
)

logger = logging.getLogger(__name__)


class UploadDatasetWithIdRequest(BaseModel):
    convex_project_id: str
    file_name: str
    callback_url: str
    file_id: str


async def parse_upload_dataset_request(
    convex_project_id: str = Form(...),
    file_name: str = Form(...),
    callback_url: str = Form(...),
    file: UploadFile = UploadFile(...),
):
    return {
        "convex_project_id": convex_project_id,
        "file_name": file_name,
        "callback_url": callback_url,
        "file": file,
    }


async def parse_validate_dataset_request(
    convex_project_id: str = Form(...),
    file_name: str = Form(...),
    file: UploadFile = UploadFile(...),
    callback_url: str | None = Form(None),
):
    return {
        "convex_project_id": convex_project_id,
        "file_name": file_name,
        "file": file,
        "callback_url": callback_url,
    }


class UploadDatasetResponse(BaseModel):
    columns: list[str]
    job_id: str


class DatasetValidationResponse(BaseModel):
    is_valid: bool
    message: str
    file_type: FileType | None = None
    warnings: Dict[str, str] | None = None


class UploadMultiDatasetRequest(BaseModel):
    convex_project_id: str
    callback_url: str
    file_ids: List[str]
    file_type: FileType


async def create_rows(parsed_data, callback_url) -> List[Tuple[int, str, int]]:
    api_key = os.environ.get("CONVEX_HTTP_CLIENT_API_KEY")

    if callback_url and callback_url != "":
        convex_client = ConvexClient(
            api_key, environment="dev", base_url_overwrite=callback_url
        )
    else:
        convex_client = ConvexClient(api_key, environment="dev")

    # Function to batch the data
    def batch_data(data, batch_size):
        for i in range(0, len(data), batch_size):
            yield data[i : i + batch_size]

    start_time = time.time()

    async def create():

        tasks = []
        results = []
        # Async function to process a single batch

        async def process_batch(batch):
            try:
                # Use the bulk creation function
                _results = await convex_client.create_row_bulk(
                    batch
                )  # Simulates network or DB latency
                for result in _results:
                    results.append(result)

            except Exception as e:
                logger.warning("Error with batch: %s", e)
                raise e

            return _results

        # Main async function
        batch_size = 250
        for batch in batch_data(parsed_data, batch_size):
            tasks.append(asyncio.create_task(process_batch(batch)))
        await asyncio.gather(*tasks)
        return results

    results = await create()
    end_time = time.time()
    logger.info(
        "Time taken to process %d items: %s seconds",
        len(parsed_data),
        end_time - start_time,
    )
    return results


async def _upload_dataset_with_tabular_processor(
    gcs_helper: GoogleCloudStorageHelper,
    convex_client: ConvexClient,
    convex_project_id: str,
    file_name: str,
    tabular_data_processor: TabularDataProcessor,
    data_lakehouse: DataLakeHouse,
    media_columns: Dict[str, FileType] | None = None,
):
    media_columns = media_columns or {}

    try:
        file_type = _detect_file_type(tabular_data_processor.initial_file_path)
    except ProcessingError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    try:
        file_size = os.path.getsize(tabular_data_processor.initial_file_path)
    except OSError:
        file_size = 0

    file_metadata = TabularFileMetadata(
        file_id="",
        file_name=file_name,
        file_type=file_type,
        file_size=file_size,
        media_columns=media_columns,
    )

    validation_result = tabular_data_processor.validate(
        file_metadata, tabular_data_processor.initial_file_path
    )
    if not validation_result.success:
        raise HTTPException(
            status_code=400,
            detail={
                "message": validation_result.message,
                "errors": validation_result.errors,
            },
        )

    try:
        schema = await tabular_data_processor.extract_schema(
            file_metadata, tabular_data_processor.initial_file_path
        )

        dataset_config = DatasetConfig()
        data_sync_client = ConvexDataSync(
            convex_client,
            convex_project_id,
            dataset_config,
        )

        if isinstance(data_lakehouse, OutOfMemoryDuckDbLakeHouse):
            last_id = await data_lakehouse.get_last_id_async()
        else:
            last_id = await asyncio.to_thread(data_lakehouse.get_last_id)

        if last_id > 0:
            # ie the project already has data
            cols = await data_sync_client.get_columns(schema)
        else:
            # Create columns in external data sync
            cols = await data_sync_client.create_columns(schema, file_metadata)

        # Get payloads to create rows
        df, payloads, token_counts, skipped = tabular_data_processor.extract_data(
            file_metadata, tabular_data_processor.initial_file_path, last_id
        )
        # Create Rows in cexternal data sync
        created_rows_df = await data_sync_client.create_rows(cols, payloads)

        joined_df = df.merge(
            created_rows_df,
            on=dataset_config.PRIMARY_KEY_COLUMN,
            how="inner",
            suffixes=(
                "",
                "_drop",
            ),  # Keep left columns as-is; label right duplicates as "_drop"
        )

        # Then remove any columns that got "_drop" appended
        joined_df = joined_df[
            [col for col in joined_df.columns if not col.endswith("_drop")]
        ]

        # Save the dataframe as a parquet file
        processed_table = pa.Table.from_pandas(joined_df)
        pq.write_table(processed_table, tabular_data_processor.processed_file_path)

        logger.info("Uploading processed file to GCS")
        # Step 9: Upload the processed file to GCS
        try:
            data_lakehouse.create_dataset_file(
                convex_project_id, tabular_data_processor.processed_file_path
            )
        except FileExists as e:
            raise HTTPException(status_code=500, detail=str(e)) from e

        columns = [col.name for col in schema.columns]

        return cols
    except ProcessingError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("", response_model=UploadDatasetResponse)
async def upload_dataset(
    request: dict = Depends(parse_upload_dataset_request),
    authorized: bool = Depends(verify_token),
    billing: BillingService = Depends(get_billing_service),
    data_lakehouse: DataLakeHouse = Depends(get_lakehouse),
    gcs_helper: GoogleCloudStorageHelper = Depends(get_storage_helper),
) -> UploadDatasetResponse:

    convex_project_id = request["convex_project_id"]
    file_name = request["file_name"]
    callback_url = request["callback_url"]
    file = request["file"]
    job_id = f"job_{int(time.time())}"

    data_lakehouse = resolve_project_lakehouse(
        data_lakehouse, gcs_helper, convex_project_id
    )

    if authorized is False:
        raise HTTPException(status_code=401, detail="Unauthorized")

    user_id = billing.billing_info.customer_id
    plan = billing.billing_info.plan

    api_key = os.environ.get("CONVEX_HTTP_CLIENT_API_KEY")
    if callback_url and callback_url != "":
        # convex_client = ConvexClient(callback_url)
        convex_client = ConvexClient(
            api_key, environment="dev", base_url_overwrite=callback_url
        )
    else:
        # convex_client = ConvexClient(CONVEX_URL)
        convex_client = ConvexClient(api_key, environment="dev")

    tabular_data_processor = TabularDataProcessor(
        DatasetConfig(), gcs_helper, convex_client
    )

    # Step 0: Read the file into memoery
    file_content = await file.read()

    try:
        _file_content = io.BytesIO(file_content)
        tabular_data_processor.create_from_in_memory_file(file_name, _file_content)
    except FileExists as e:
        raise HTTPException(status_code=409, detail=str(e)) from e

    columns = await _upload_dataset_with_tabular_processor(
        gcs_helper,
        convex_client,
        convex_project_id,
        file_name,
        tabular_data_processor,
        data_lakehouse,
    )

    return UploadDatasetResponse(columns=[item[0] for item in columns], job_id=job_id)


@router.post("/validate", response_model=DatasetValidationResponse)
async def validate_dataset(
    request: dict = Depends(parse_validate_dataset_request),
    authorized: bool = Depends(verify_token),
    gcs_helper: GoogleCloudStorageHelper = Depends(get_storage_helper),
) -> DatasetValidationResponse:

    if authorized is False:
        raise HTTPException(status_code=401, detail="Unauthorized")

    file_name = request["file_name"]
    callback_url = request.get("callback_url")
    file = request["file"]

    file_bytes = await file.read()
    temp_file_path = None

    try:
        suffix = os.path.splitext(file_name)[1] or ".tmp"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
            temp_file.write(file_bytes)
            temp_file_path = temp_file.name

        api_key = os.environ.get("CONVEX_HTTP_CLIENT_API_KEY")
        if callback_url and callback_url != "":
            convex_client = ConvexClient(
                api_key, environment="dev", base_url_overwrite=callback_url
            )
        else:
            convex_client = ConvexClient(api_key, environment="dev")

        tabular_data_processor = TabularDataProcessor(
            DatasetConfig(), gcs_helper, convex_client
        )
        tabular_data_processor.initial_file_path = temp_file_path

        try:
            file_type = _detect_file_type(temp_file_path)
        except ProcessingError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        file_metadata = TabularFileMetadata(
            file_id="",
            file_name=file_name,
            file_type=file_type,
            file_size=len(file_bytes),
        )

        validation_result = tabular_data_processor.validate(
            file_metadata, temp_file_path
        )
        if not validation_result.success:
            raise HTTPException(
                status_code=400,
                detail={
                    "message": validation_result.message,
                    "errors": validation_result.errors,
                },
            )

        warnings = None
        if validation_result.data:
            warnings = validation_result.data.get("warnings")

        return DatasetValidationResponse(
            is_valid=True,
            message=validation_result.message,
            file_type=file_type,
            warnings=warnings,
        )
    finally:
        if temp_file_path and os.path.exists(temp_file_path):
            try:
                os.remove(temp_file_path)
            except OSError:
                logger.warning(
                    "Failed to remove temp validation file %s", temp_file_path
                )


def download_from_presigned_url_streaming(presigned_url: str, local_path: str) -> None:
    """
    Download a large file from a pre-signed GCS URL using streaming

    Args:
        presigned_url: The pre-signed URL to download from
        local_path: Where to save the file locally
    """
    with requests.get(presigned_url, stream=True, timeout=300) as response:
        response.raise_for_status()
        with open(local_path, "wb") as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)


@router.post("/with_id", response_model=UploadDatasetResponse)
async def upload_dataset_with_url(
    request: UploadDatasetWithIdRequest,
    authorized: bool = Depends(verify_token),
    gcs_helper: GoogleCloudStorageHelper = Depends(get_storage_helper),
    data_lakehouse=Depends(get_lakehouse),
    logger=Depends(get_logger),
) -> UploadDatasetResponse:

    convex_project_id = request.convex_project_id
    callback_url = request.callback_url
    file_id = request.file_id
    # Generate unique job ID
    job_id = f"job_{int(time.time())}"
    logger.info("Starting upload_dataset_with_id job %s", job_id)

    data_lakehouse = resolve_project_lakehouse(
        data_lakehouse, gcs_helper, request.convex_project_id
    )

    if authorized is False:
        raise HTTPException(status_code=401, detail="Unauthorized")

    api_key = os.environ.get("CONVEX_HTTP_CLIENT_API_KEY")
    if callback_url and callback_url != "":
        # convex_client = ConvexClient(callback_url)
        convex_client = ConvexClient(
            api_key, environment="dev", base_url_overwrite=callback_url
        )
    else:
        # convex_client = ConvexClient(CONVEX_URL)
        convex_client = ConvexClient(api_key, environment="dev")

    tabular_data_processor = TabularDataProcessor(
        DatasetConfig(), gcs_helper, convex_client
    )

    try:
        tabular_data_processor.create_from_storage_file(file_id)
    except FileNotFoundError as e:
        msg = (
            f"File with id {file_id} not found in bucket {os.environ.get('BUCKET_NAME')}"
        )
        logger.error(msg)
        raise HTTPException(status_code=404, detail=msg) from e
    except PermissionError as e:
        msg = f"Access denied when reading file {file_id}"
        logger.error(msg)
        raise HTTPException(status_code=403, detail=msg) from e
    except Exception as e:
        logger.exception("Unexpected error preparing file %s: %s", file_id, e)
        raise HTTPException(status_code=500, detail=str(e)) from e

    columns = await _upload_dataset_with_tabular_processor(
        gcs_helper,
        convex_client,
        convex_project_id,
        request.file_name,
        tabular_data_processor,
        data_lakehouse,
    )

    return UploadDatasetResponse(columns=[item[0] for item in columns], job_id=job_id)


def get_file_extension(file_type: FileType) -> str:
    """Get the file extension based on the file type"""
    if file_type == FileType.AUDIO:
        return ".mp3"
    elif file_type == FileType.PDF:
        return ".pdf"
    elif file_type == FileType.XML:
        return ".xml"
    elif file_type == FileType.IMAGE:
        return ".jpg"
    return ""


@router.post("/with_ids")
async def upload_multimedia_dataset(
    request: UploadMultiDatasetRequest,
    authorized: bool = Depends(verify_token),
    billing: BillingService = Depends(get_billing_service),
    gcs_helper: GoogleCloudStorageHelper = Depends(get_storage_helper),
    data_lakehouse: DataLakeHouse = Depends(get_lakehouse),
    tracer=Depends(get_tracer),
    logger=Depends(get_logger),
) -> UploadDatasetResponse:
    # Upload multiple files as a dataset with optional transcription for audio files.

    # Args:
    #     request: The upload request containing file IDs and metadata
    #     authorized: Authorization check
    #     gcs_helper: Injected storage helper
    #     tracer: Tracer for OpenTelemetry
    #     logger: Logger for logging

    # Returns:
    #     Response with dataset information
    if not authorized:
        raise HTTPException(status_code=401, detail="Unauthorized")

    data_lakehouse = resolve_project_lakehouse(
        data_lakehouse, gcs_helper, request.convex_project_id
    )

    user_id = billing.billing_info.customer_id
    plan = billing.billing_info.plan
    
    convex_project_id = request.convex_project_id
    file_ids = request.file_ids
    file_type = request.file_type
    callback_url = request.callback_url

    file_column_name = "files"
    media_cols = {file_column_name: file_type}

    # Generate a unique job ID
    job_id = f"multi_upload_{int(time.time())}"

    df = pd.DataFrame(
        {
            file_column_name: file_ids,
        }
    )

    api_key = os.environ.get("CONVEX_HTTP_CLIENT_API_KEY")
    if callback_url and callback_url != "":
        # convex_client = ConvexClient(callback_url)
        convex_client = ConvexClient(
            api_key, environment="dev", base_url_overwrite=callback_url
        )
    else:
        # convex_client = ConvexClient(CONVEX_URL)
        convex_client = ConvexClient(api_key, environment="dev")

    tabular_data_processor = TabularDataProcessor(
        DatasetConfig(), gcs_helper, convex_client
    )

    tabular_data_processor.create_from_pandas_dataframe(df)

    # Creates a new dataset with the fileids as tabular data (fetched from the
    # tabular data processor).
    columns = await _upload_dataset_with_tabular_processor(
        gcs_helper,
        convex_client,
        convex_project_id,
        job_id,
        tabular_data_processor,
        data_lakehouse,
        media_cols,
    )

    # TODO: TEMP
    content_column_name = "content"
    convex_column_id = convex_client.create_column(
        content_column_name, convex_project_id
    )

    if file_type == FileType.AUDIO:
        task_type = SheetTaskType.TRANSCRIPTION_WITH_FAL
    elif file_type == FileType.PDF:
        task_type = SheetTaskType.PDF_TRANSCRIPTION_WITH_MARKER
    elif file_type == FileType.XML:
        task_type = SheetTaskType.XML_TRANSCRIPTION_WITH_MARKER
    else:
        raise ValueError(f"Unsupported file type: {file_type}")

    len_tasks, cell_states = run_column_action(
        data_lakehouse_operation_type=DataLakehouseOperationType.CREATE_COLUMN,
        job_id=job_id,
        external_project_id=convex_project_id,
        external_column_id=convex_column_id,
        customer_id=user_id,
        plan=plan,
        billing_service=billing,
        input_columns=[file_column_name],
        column_name=content_column_name,
        sql_condition="1=1",
        workflow_id=None,
        callback_url=callback_url,
        ## LLM Stuff thass being left empty
        prompt=None,
        output_name=None,
        ##
        data_lakehouse=data_lakehouse,
        task_type=task_type,
    )

    convex_client.update_column(
        {
            # TODO: We are again assuming that for each job, its only items from the same column
            "column": convex_column_id,
            "cell_state": cell_states,
            "rows": [],
            "cells": [],
        }
    )

    return UploadDatasetResponse(columns=[item[0] for item in columns], job_id=job_id)

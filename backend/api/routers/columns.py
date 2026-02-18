import os
from typing import List

from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from folio.utils.data_lakehouse.data_lakehouse import (
    DataLakeHouse,
    OutOfMemoryDuckDbLakeHouse,
    DuckDbQueryExecutionError,
)
from folio.utils.storage_helper.gcs_helper import GoogleCloudStorageHelper

from dependencies import (
    get_lakehouse,
    verify_token,
    get_storage_helper,
    resolve_project_lakehouse,
)
router = APIRouter(prefix="/columns")


class ColumnsListRequest(BaseModel):
    convex_project_id: str


class ColumnsListResponse(BaseModel):
    columns: List[str]


@router.post("/list", response_model=ColumnsListResponse)
async def list_columns(
    body: ColumnsListRequest,
    request: Request,
    data_lakehouse: DataLakeHouse = Depends(get_lakehouse),
    authorized: bool = Depends(verify_token),
    gcs_helper: GoogleCloudStorageHelper = Depends(get_storage_helper),
) -> ColumnsListResponse:
    """
    Get a list of user-facing columns for a project, excluding internal system columns.
    """
    if not authorized:
        raise HTTPException(status_code=401, detail="Unauthorized")

    data_lakehouse = resolve_project_lakehouse(
        data_lakehouse, gcs_helper, body.convex_project_id
    )

    try:
        if isinstance(data_lakehouse, OutOfMemoryDuckDbLakeHouse):
            columns = await data_lakehouse.get_user_columns_async()
        else:
            columns = await run_in_threadpool(data_lakehouse.get_user_columns)
        return ColumnsListResponse(columns=columns)
    except DuckDbQueryExecutionError:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error retrieving columns: {e}",
        ) from e

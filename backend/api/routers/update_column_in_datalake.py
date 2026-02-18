import cProfile
import io
import pstats
import time
import os
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from dependencies import get_lakehouse, get_storage_helper, resolve_project_lakehouse
from folio.utils.storage_helper.gcs_helper import GoogleCloudStorageHelper


router = APIRouter(
    prefix="/update_column_in_datalake",
    tags=["datalake"],
)


class UpdateColumnInDataLakeRequest(BaseModel):
    convex_project_id: str
    column_name: str
    # TODO: For scalability / reliability purposes
    # probably better that this is a list of files in the future
    file: str


@router.post("")
async def update_column_in_datalake(
    request: UpdateColumnInDataLakeRequest,
    duckdb_lakehouse=Depends(get_lakehouse),
    gcs_helper: GoogleCloudStorageHelper = Depends(get_storage_helper),
):
    # Check if the /mnt/tmp directory exists
    tmp_dir = os.getenv("MOUNT_PATH", "../local_tmp")
    if not os.path.exists(tmp_dir):
        raise HTTPException(
            status_code=404, detail=f"Directory {tmp_dir} does not exist."
        )

    duckdb_lakehouse = resolve_project_lakehouse(
        duckdb_lakehouse, gcs_helper, request.convex_project_id
    )

    mount_path = os.getenv("MOUNT_PATH", "../local_tmp")
    local_file = f"{mount_path}/{request.file}"
    duckdb_lakehouse.add_data_to_colum_from_file(
        column_name=request.column_name, local_file_path=local_file
    )

    return {"message": "Operation successful"}

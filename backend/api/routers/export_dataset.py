import os
import asyncio
from typing import List, Tuple

from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel
import json
import pandas as pd
import uuid

from folio.utils.data_lakehouse.data_lakehouse import (
    DataLakeHouse,
    DuckDbQueryExecutionError,
)
from folio.utils.storage_helper.gcs_helper import GoogleCloudStorageHelper

from dependencies import (
    get_lakehouse,
    verify_token,
    get_storage_helper,
    resolve_project_lakehouse,
)
router = APIRouter(prefix="/export")


class SheetObject(BaseModel):
    name: str
    condition: str
    column_names: List[str]


class ExportRequest(BaseModel):
    convex_project_id: str
    sheet_objects: List[SheetObject]


class ExportResponse(BaseModel):
    url: str


def _quote(col: str) -> str:
    """Always quote column names for DuckDB."""
    return f'"{col}"'


def _build_query(lakehouse: DataLakeHouse, sheet: SheetObject) -> str:
    cols = ", ".join(_quote(c) for c in sheet.column_names)
    return lakehouse.generate_join_across_all_cols(
        "DISTINCT " + cols, sheet.condition, ""
    )


def _run_query(
    lakehouse: DataLakeHouse, query: str, column_names: List[str]
) -> pd.DataFrame:
    "†" "Blocking call executed in thread pool." ""
    # Modal can fail serializing pandas objects for local callers.
    # Fetch raw rows and build the DataFrame in-process instead.
    rows = lakehouse.run_sql(query, return_as_df=False)
    return pd.DataFrame(rows, columns=column_names)


def strip_extraction_keyword(df: pd.DataFrame) -> pd.DataFrame:
    """
    For every column, if the cell looks like {"extraction_keyword": "..."}
    (either as a dict or as a JSON-encoded str), replace the cell with the
    inner value so the caller sees plain strings in the Excel export.
    """
    for col in df.columns:
        # quick peek—skip empty columns entirely
        series = df[col]
        if series.dropna().empty:
            continue

        def grab(val):
            if pd.isna(val):
                return val  # keep NaNs/None untouched

            # val might already be a dict
            if isinstance(val, dict):
                return val.get("extraction_keyword", val)

            # or it could be a JSON string
            if isinstance(val, str) and val.lstrip().startswith("{"):
                try:
                    parsed = json.loads(val)
                    if isinstance(parsed, dict):
                        return parsed.get("extraction_keyword", val)
                except json.JSONDecodeError:
                    pass  # leave as-is if it isn't valid JSON

            return val  # leave any other scalar unchanged

        df[col] = series.map(grab)

    return df


async def _fetch_sheet_df(
    lakehouse: DataLakeHouse, sheet: SheetObject
) -> Tuple[str, pd.DataFrame]:
    """Run one sheet's query in a background thread and return its DataFrame."""
    query = _build_query(lakehouse, sheet)
    df = await run_in_threadpool(_run_query, lakehouse, query, sheet.column_names)
    df = strip_extraction_keyword(df)
    return sheet.name, df


@router.post("", response_model=ExportResponse)
async def export(
    body: ExportRequest,
    request: Request,
    data_lakehouse: DataLakeHouse = Depends(get_lakehouse),
    authorized: bool = Depends(verify_token),
    gcs_helper: GoogleCloudStorageHelper = Depends(get_storage_helper),
) -> ExportResponse:

    if not authorized:
        raise HTTPException(status_code=401, detail="Unauthorized")

    data_lakehouse = resolve_project_lakehouse(
        data_lakehouse, gcs_helper, body.convex_project_id
    )

    # ---------------------------------------------
    # Fetch each sheet's DataFrame in parallel
    # ---------------------------------------------
    try:
        sheet_results = await asyncio.gather(
            *[_fetch_sheet_df(data_lakehouse, sh) for sh in body.sheet_objects]
        )
    except DuckDbQueryExecutionError:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error exporting data: {e}",
        ) from e

    # ---------------------------------------------
    # Write all DataFrames into one Excel workbook
    # ---------------------------------------------
    local_output_dir = os.getenv("MOUNT_PATH", "../local_tmp")
    os.makedirs(local_output_dir, exist_ok=True)
    filename = f"{body.convex_project_id}_{uuid.uuid4()}.xlsx"
    filepath = os.path.join(local_output_dir, filename)

    with pd.ExcelWriter(filepath, engine="openpyxl") as writer:
        for sheet_name, df in sheet_results:
            df.to_excel(writer, sheet_name=sheet_name, index=False)

    destination_path = f"{gcs_helper.files_directory_name}/{filename}"
    gcs_helper.upload_file(filepath, destination_path)

    url = gcs_helper.generate_pre_signed_url_for_download(destination_path)

    return ExportResponse(url=url)

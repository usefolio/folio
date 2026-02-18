import re
import os
from datetime import datetime
import tempfile
import shutil
import pandas as pd
from fastapi import Depends
from fastapi import APIRouter
from folio.utils.storage_helper import GoogleCloudStorageHelper
from dependencies import get_storage_helper
import logging

router = APIRouter(
    prefix="/compact",
)

logger = logging.getLogger(__name__)


def categorize_files(folder: str, files: list[str]) -> dict[str, list[str]]:
    file_dict = {}
    pattern = rf"{folder}/([^/]+)/"
    for file in files:
        match = re.match(pattern, file)
        if match:
            category = match.group(1)
            if category not in file_dict:
                file_dict[category] = []
            file_dict[category].append(file)

    # print(file_dict)
    return file_dict


def merge_category_files(
    folder: str, category: str, files: list[str], gcs_helper
) -> None:
    temp_dir = tempfile.mkdtemp()
    dfs = []
    schema = None

    try:
        # Download and validate each file
        for file in files:
            temp_path = f"{temp_dir}/{file.split('/')[-1]}"
            # print(f"Temp path is {temp_path}")
            gcs_helper.download_blob_to_file(file, temp_path)
            # print(f"Downloading {file} as {temp_path}")
            df = pd.read_parquet(temp_path)

            if schema is None:
                schema = df.dtypes.to_dict()
            elif df.dtypes.to_dict() != schema:
                raise ValueError(f"Schema mismatch in file {file}")

            dfs.append(df)

        # Merge files
        merged_df = pd.concat(dfs, ignore_index=True)
        date_str = datetime.now().strftime("%Y%m%d")

        # Save merged file temporarily
        merged_path = f"{temp_dir}/merged.parquet"
        merged_df.to_parquet(merged_path, index=False)
        logger.info("Merged files")

        # Upload to correct category folder
        destination = f"{folder}/{category}/compacted-{date_str}.parquet"
        try:
            gcs_helper.upload_file(merged_path, destination)
        except FileExistsError:
            logger.info(
                "File %s already exists; deleting and overwriting for compaction.",
                destination,
            )
            gcs_helper.delete_blob(destination)
            gcs_helper.upload_file(merged_path, destination)
        logger.info("Merged files uploaded to %s", destination)

        # Delete original files
        for file in files:
            if file == destination:
                continue
            gcs_helper.delete_blob(file)
            logger.info("Deleted %s", file)
    except Exception as e:
        logger.exception("Error merging files: %s", e)

    finally:
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir)


@router.post("")
def compact(
    gcs_helper: GoogleCloudStorageHelper = Depends(get_storage_helper),
):
    folder_name = "transcripts"

    files = gcs_helper.walk_gcs_bucket(f"{folder_name}/")
    logger.debug("All files: %s", files)
    cat_dict = categorize_files(f"{folder_name}", files)
    logger.debug("Categories example: %s", cat_dict.get("category"))

    if len(files) == 1:
        # TODO: There is probably a better way to check if the only file that exists is the compacted file..
        return {"message": "No files to compact"}

    for category, file_list in cat_dict.items():
        try:
            merge_category_files(f"{folder_name}", category, file_list, gcs_helper)
            logger.info("Successfully merged %s", category)
        except Exception as e:
            logger.warning("Failed to merge %s: %s", category, e)
            continue
    return {"message": "Success"}

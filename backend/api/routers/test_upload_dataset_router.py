import io
import os
import sys
import types
import unittest
from unittest.mock import MagicMock, patch

from fastapi import UploadFile, HTTPException

REQUIRED_ENV_VARS = [
    "CLERK_SECRET_KEY",
    "MODAL_TOKEN_ID",
    "MODAL_TOKEN_SECRET",
    "CONVEX_PROJECT_ID",
    "CONVEX_URL",
    "CONVEX_HTTP_CLIENT_API_KEY",
    "REDIS_URL",
    "PORT",
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

for env_var in REQUIRED_ENV_VARS:
    os.environ.setdefault(env_var, "test")

bg_tasks_module = types.ModuleType("bg_tasks")
bg_tasks_tasks_module = types.ModuleType("bg_tasks.bg_tasks")


def _noop(*args, **kwargs):
    return None


bg_tasks_tasks_module.start_processing_daemons_task = _noop
bg_tasks_tasks_module.enqueue_backfill_task = _noop

bg_tasks_module.bg_tasks = bg_tasks_tasks_module

sys.modules.setdefault("bg_tasks", bg_tasks_module)
sys.modules.setdefault("bg_tasks.bg_tasks", bg_tasks_tasks_module)

from folio.utils.dataset_processor.dataset_processor import (
    FileType,
    ProcessingError,
    ProcessingResult,
)

from api.routers.upload_dataset import validate_dataset


class ValidateDatasetRouteTests(unittest.IsolatedAsyncioTestCase):
    async def test_validate_dataset_success(self):
        upload = UploadFile(filename="sample.csv", file=io.BytesIO(b"col1,col2\n1,2\n"))
        request = {
            "convex_project_id": "proj-123",
            "file_name": "sample.csv",
            "file": upload,
            "callback_url": None,
        }
        gcs_helper = MagicMock()

        with patch(
            "api.routers.upload_dataset._detect_file_type", return_value=FileType.CSV
        ), patch(
            "api.routers.upload_dataset.TabularDataProcessor.validate"
        ) as mock_validate:
            mock_validate.return_value = ProcessingResult(
                success=True,
                message="Validation successful",
                data={"warnings": {"note": "check"}},
            )

            response = await validate_dataset(request, True, gcs_helper)

        self.assertTrue(response.is_valid)
        self.assertEqual(response.message, "Validation successful")
        self.assertEqual(response.file_type, FileType.CSV)
        self.assertEqual(response.warnings, {"note": "check"})

    async def test_validate_dataset_detection_error(self):
        upload = UploadFile(filename="sample.csv", file=io.BytesIO(b"col1,col2\n1,2\n"))
        request = {
            "convex_project_id": "proj-123",
            "file_name": "sample.csv",
            "file": upload,
            "callback_url": None,
        }
        gcs_helper = MagicMock()

        with patch(
            "api.routers.upload_dataset._detect_file_type",
            side_effect=ProcessingError("friendly message"),
        ):
            with self.assertRaises(HTTPException) as ctx:
                await validate_dataset(request, True, gcs_helper)

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertEqual(ctx.exception.detail, "friendly message")


if __name__ == "__main__":
    unittest.main()

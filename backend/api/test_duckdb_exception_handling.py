import os
import asyncio
import json
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException
from starlette.requests import Request

# Seed required env vars before importing API modules (dependencies.py validates at import time).
_REQUIRED_TEST_ENV = {
    "CLERK_SECRET_KEY": "test",
    "MODAL_TOKEN_ID": "test",
    "MODAL_TOKEN_SECRET": "test",
    "CONVEX_PROJECT_ID": "test_project",
    "CONVEX_URL": "http://localhost",
    "CONVEX_HTTP_CLIENT_API_KEY": "test",
    "REDIS_URL": "redis://localhost:6379/0",
    "PORT": "8000",
    "RESULT_LIMIT": "100",
    "ENV": "test",
    "BUCKET_NAME": "test-bucket",
    "FAL_KEY": "test",
    "FOLIO_API_KEY": "test",
    "API_BASE_URL": "http://localhost",
    "PREFECT_API_URL": "http://localhost",
    "PREFECT_API_KEY": "test",
    "PREFECT_DEPLOYMENT_ID": "test",
    "METRONOME_API_TOKEN": "test",
    "GOOGLE_ACCESS_KEY_ID": "test",
    "GOOGLE_ACCESS_KEY_SECRET": "test",
    "GOOGLE_SERVICE_ACCOUNT_JSON": "{}",
}
for _k, _v in _REQUIRED_TEST_ENV.items():
    os.environ.setdefault(_k, _v)

from main import duckdb_query_exception_handler
from routers.columns import ColumnsListRequest, list_columns
from folio.utils.data_lakehouse.data_lakehouse import (
    DuckDbQueryExecutionError,
    InMemoryDuckDbLakeHouse,
)


def _request(path: str = "/test") -> Request:
    scope = {
        "type": "http",
        "http_version": "1.1",
        "method": "POST",
        "scheme": "http",
        "path": path,
        "raw_path": path.encode(),
        "query_string": b"",
        "headers": [],
        "client": ("testclient", 50000),
        "server": ("testserver", 80),
    }
    return Request(scope)


def test_duckdb_query_exception_handler_returns_expected_response():
    exc = DuckDbQueryExecutionError(
        "DuckDB failed to execute query",
        error_code="DUCKDB_QUERY_ERROR",
        error_type="ParserException",
    )

    response = asyncio.run(duckdb_query_exception_handler(_request("/columns/list"), exc))
    payload = json.loads(response.body.decode())

    assert response.status_code == 500
    assert payload["error"] == "DuckDbQueryExecutionError"
    assert payload["detail"]["code"] == "DUCKDB_QUERY_ERROR"
    assert payload["detail"]["message"] == "DuckDB failed to execute query"
    assert payload["detail"]["duckdb_error_type"] == "ParserException"
    assert response.headers["x-error-code"] == "DUCKDB_QUERY_ERROR"


def test_columns_router_propagates_duckdb_exception_with_inmemory_lakehouse_mock():
    lakehouse = MagicMock(spec=InMemoryDuckDbLakeHouse)
    lakehouse.prefix = "project-1"
    lakehouse.get_user_columns.side_effect = DuckDbQueryExecutionError(
        "missing parquet file",
        error_code="DUCKDB_QUERY_ERROR",
        error_type="IOException",
    )

    body = ColumnsListRequest(convex_project_id="project-1")
    with pytest.raises(DuckDbQueryExecutionError):
        asyncio.run(
            list_columns(
                body=body,
                request=_request("/columns/list"),
                data_lakehouse=lakehouse,
                authorized=True,
                gcs_helper=MagicMock(),
            )
        )

    lakehouse.get_user_columns.assert_called_once()


def test_columns_router_wraps_unknown_exception_as_http_500():
    lakehouse = MagicMock(spec=InMemoryDuckDbLakeHouse)
    lakehouse.prefix = "project-1"
    lakehouse.get_user_columns.side_effect = RuntimeError("boom")

    body = ColumnsListRequest(convex_project_id="project-1")
    with pytest.raises(HTTPException) as excinfo:
        asyncio.run(
            list_columns(
                body=body,
                request=_request("/columns/list"),
                data_lakehouse=lakehouse,
                authorized=True,
                gcs_helper=MagicMock(),
            )
        )

    assert excinfo.value.status_code == 500
    assert excinfo.value.detail == "Error retrieving columns: boom"

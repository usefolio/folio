import os

import pytest
from fastapi import HTTPException
from starlette.requests import Request

# Seed required env vars before importing dependencies.py
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
    "FOLIO_API_KEY": "test-system-key",
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

from dependencies import verify_api_key


def _request_with_headers(headers: list[tuple[bytes, bytes]]) -> Request:
    scope = {
        "type": "http",
        "http_version": "1.1",
        "method": "POST",
        "scheme": "http",
        "path": "/process",
        "raw_path": b"/process",
        "query_string": b"",
        "headers": headers,
        "client": ("testclient", 50000),
        "server": ("testserver", 80),
    }
    return Request(scope)


def test_verify_api_key_uses_workflow_user_context(monkeypatch):
    req = _request_with_headers(
        [
            (b"x-system-key", b"test-system-key"),
            (b"x-workflow-id", b"wf-123"),
        ]
    )

    monkeypatch.setattr(
        "dependencies._resolve_workflow_user_id", lambda _req, workflow_id=None: "user_1"
    )

    assert verify_api_key(req) is True
    assert req.state.user_id == "user_1"


def test_verify_api_key_requires_context_when_workflow_header_present(monkeypatch):
    req = _request_with_headers(
        [
            (b"x-system-key", b"test-system-key"),
            (b"x-workflow-id", b"wf-456"),
        ]
    )

    monkeypatch.setattr(
        "dependencies._resolve_workflow_user_id", lambda _req, workflow_id=None: None
    )

    with pytest.raises(HTTPException) as excinfo:
        verify_api_key(req)

    assert excinfo.value.status_code == 401
    assert "Missing or invalid workflow auth token context" in str(excinfo.value.detail)


def test_verify_api_key_falls_back_to_system_user_without_workflow_header(monkeypatch):
    req = _request_with_headers(
        [
            (b"x-system-key", b"test-system-key"),
        ]
    )

    monkeypatch.setattr(
        "dependencies._resolve_workflow_user_id", lambda _req, workflow_id=None: None
    )

    assert verify_api_key(req) is True
    assert req.state.user_id == "system_api_key"

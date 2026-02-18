import datetime
from typing import Any, Dict, Optional
from folio.utils.storage_backend.storage_backend import GCSStorageBackend

WORKFLOW_TABLE_NAME = "workflow"
AUTH_CONTEXT_FIELD = "auth_context"
AUTHORIZATION_HEADER_FIELD = "authorization_header"


def store_request(
    path: str,
    key: str,
    new_request: dict,  # or a pydantic model, e.g. `new_request: YourModel`
    storage_backend: GCSStorageBackend,  # or whatever storage backend you're using
):
    """
    Store each incoming request body in a single list under the same key in GCS.
    Each item is appended with an ISO8601 timestamp, so you can sort them later.
    """
    try:
        # 1. Attempt to retrieve the existing object
        existing_data = storage_backend.get_obj(WORKFLOW_TABLE_NAME, key)
        # Assuming we store everything in a "requests" array
        requests_list = existing_data["requests"]
    except KeyError:
        # If the object doesn't exist, create a brand-new one
        existing_data = {"requests": []}
        requests_list = existing_data["requests"]

    # 2. Append the new incoming request data with a timestamp
    timestamp = datetime.datetime.now(datetime.timezone.utc).isoformat()
    # You can store everything in a single dict or nest them
    item_to_store = {
        "timestamp": timestamp,
        "path": path,
        "request_data": new_request,
    }
    requests_list.append(item_to_store)

    # 3. Insert or patch the updated data back into GCS
    if storage_backend.obj_exists(WORKFLOW_TABLE_NAME, key):
        storage_backend.patch_obj(WORKFLOW_TABLE_NAME, key, existing_data)
        return {"detail": "Appended new request to existing list."}
    else:
        storage_backend.insert_obj(WORKFLOW_TABLE_NAME, key, existing_data)
        return {"detail": "Created new object with initial request."}


def store_workflow_auth_context(
    workflow_id: str,
    user_id: str,
    authorization_header: str,
    storage_backend: GCSStorageBackend,
) -> Dict[str, Any]:
    """Persist initiating user context for a workflow run."""
    if not workflow_id:
        raise ValueError("workflow_id is required")
    if not user_id:
        raise ValueError("user_id is required")
    if not authorization_header:
        raise ValueError("authorization_header is required")

    auth_context = {
        "user_id": user_id,
        AUTHORIZATION_HEADER_FIELD: authorization_header,
        "captured_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }

    if storage_backend.obj_exists(WORKFLOW_TABLE_NAME, workflow_id):
        storage_backend.patch_obj(
            WORKFLOW_TABLE_NAME,
            workflow_id,
            {AUTH_CONTEXT_FIELD: auth_context},
        )
    else:
        storage_backend.insert_obj(
            WORKFLOW_TABLE_NAME,
            workflow_id,
            {"requests": [], AUTH_CONTEXT_FIELD: auth_context},
        )

    return auth_context


def get_workflow_auth_context(
    workflow_id: str,
    storage_backend: GCSStorageBackend,
) -> Optional[Dict[str, Any]]:
    """Retrieve persisted auth context for a workflow run."""
    if not workflow_id:
        return None

    try:
        existing_data = storage_backend.get_obj(WORKFLOW_TABLE_NAME, workflow_id)
    except KeyError:
        return None

    auth_context = existing_data.get(AUTH_CONTEXT_FIELD)
    if not isinstance(auth_context, dict):
        return None

    user_id = auth_context.get("user_id")
    if not isinstance(user_id, str) or not user_id:
        return None

    authorization_header = auth_context.get(AUTHORIZATION_HEADER_FIELD)
    if not isinstance(authorization_header, str) or not authorization_header:
        return None

    return auth_context

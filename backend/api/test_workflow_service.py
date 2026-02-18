from copy import deepcopy

from services.workflow_service import (
    get_workflow_auth_context,
    store_request,
    store_workflow_auth_context,
)


class InMemoryStorageBackend:
    def __init__(self):
        self._objects = {}

    def _key(self, table: str, key: str):
        return (table, key)

    def get_obj(self, table: str, key: str):
        obj_key = self._key(table, key)
        if obj_key not in self._objects:
            raise KeyError(f"Object not found: {table}/{key}")
        return deepcopy(self._objects[obj_key])

    def insert_obj(self, table: str, key: str, obj: dict):
        obj_key = self._key(table, key)
        if obj_key in self._objects:
            raise Exception(f"Object already exists: {table}/{key}")
        self._objects[obj_key] = deepcopy(obj)

    def patch_obj(self, table: str, key: str, obj: dict):
        current = self.get_obj(table, key)
        self._objects[self._key(table, key)] = self._deep_merge(current, deepcopy(obj))

    def obj_exists(self, table: str, key: str) -> bool:
        return self._key(table, key) in self._objects

    def _deep_merge(self, base: dict, updates: dict):
        for merge_key, merge_value in updates.items():
            if (
                merge_key in base
                and isinstance(base[merge_key], dict)
                and isinstance(merge_value, dict)
            ):
                self._deep_merge(base[merge_key], merge_value)
            else:
                base[merge_key] = merge_value
        return base


def test_store_workflow_auth_context_creates_object():
    storage = InMemoryStorageBackend()

    auth_context = store_workflow_auth_context(
        workflow_id="wf-123",
        user_id="user_abc",
        authorization_header="Bearer token-123",
        storage_backend=storage,
    )

    assert auth_context["user_id"] == "user_abc"
    assert auth_context["authorization_header"] == "Bearer token-123"
    stored = storage.get_obj("workflow", "wf-123")
    assert stored["auth_context"]["user_id"] == "user_abc"
    assert stored["auth_context"]["authorization_header"] == "Bearer token-123"
    assert stored["requests"] == []


def test_store_workflow_auth_context_preserves_existing_requests():
    storage = InMemoryStorageBackend()

    store_request(
        path="/process",
        key="wf-456",
        new_request={"foo": "bar"},
        storage_backend=storage,
    )
    store_workflow_auth_context(
        workflow_id="wf-456",
        user_id="user_xyz",
        authorization_header="Bearer token-456",
        storage_backend=storage,
    )

    stored = storage.get_obj("workflow", "wf-456")
    assert stored["auth_context"]["user_id"] == "user_xyz"
    assert stored["auth_context"]["authorization_header"] == "Bearer token-456"
    assert len(stored["requests"]) == 1
    assert stored["requests"][0]["path"] == "/process"


def test_get_workflow_auth_context_handles_missing_workflow():
    storage = InMemoryStorageBackend()
    assert get_workflow_auth_context("missing", storage) is None


def test_get_workflow_auth_context_requires_authorization_header():
    storage = InMemoryStorageBackend()
    storage.insert_obj(
        "workflow",
        "wf-789",
        {
            "requests": [],
            "auth_context": {
                "user_id": "user_abc",
                # authorization_header intentionally missing
            },
        },
    )

    assert get_workflow_auth_context("wf-789", storage) is None

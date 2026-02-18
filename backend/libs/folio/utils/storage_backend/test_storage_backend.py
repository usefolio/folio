"""
Unit tests for the storage backend classes.
These tests mock the GoogleCloudStorageHelper to store files in a temp directory.
"""

import os
import json
import tempfile
import shutil
from unittest.mock import MagicMock, patch
import pytest
from typing import Dict, Any

# Import the storage backend classes
# This assumes the code is in a module named 'storage_backend'
from .storage_backend import StorageBackend, GCSStorageBackend


class MockGCSHelper:
    """
    Mock implementation of GoogleCloudStorageHelper that stores files in a temp directory
    """

    def __init__(self, root_dir):
        """
        Initialize with a root directory

        Args:
            root_dir: Root directory for storing files
        """
        self.root_dir = root_dir

    def _verify_file_exists(self, path):
        """Check if a file exists"""
        full_path = os.path.join(self.root_dir, path)
        if not os.path.exists(full_path):
            raise FileNotFoundError(f"File {path} not found")

    def download_blob_to_file(self, source_path, dest_path):
        """Download a file from storage to a local file"""
        full_path = os.path.join(self.root_dir, source_path)
        if not os.path.exists(full_path):
            raise FileNotFoundError(f"File {source_path} not found")

        # Copy the file
        shutil.copy(full_path, dest_path)

    def upload_file(self, source_path, dest_path, ignore_file_exists=False):
        """Upload a file to storage"""
        # Create the destination directory if it doesn't exist
        full_path = os.path.join(self.root_dir, dest_path)
        os.makedirs(os.path.dirname(full_path), exist_ok=True)

        # Check if the file exists and we're not ignoring that
        if os.path.exists(full_path) and not ignore_file_exists:
            raise Exception(f"File {dest_path} already exists")

        # Copy the file
        shutil.copy(source_path, full_path)

    def patch_file_serialized(self, source_path, dest_path, ignore_file_exists=False):
        """Patch an existing file by overwriting it."""
        full_path = os.path.join(self.root_dir, dest_path)
        if not os.path.exists(full_path) and not ignore_file_exists:
            raise FileNotFoundError(f"File {dest_path} not found")
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        shutil.copy(source_path, full_path)

    def delete_blob(self, path):
        """Delete a file from storage"""
        full_path = os.path.join(self.root_dir, path)
        if not os.path.exists(full_path):
            raise FileNotFoundError(f"File {path} not found")

        # Delete the file
        os.remove(full_path)


@pytest.fixture
def temp_dir():
    """Create a temporary directory for testing"""
    # Create a temporary directory
    temp_dir = tempfile.mkdtemp()

    # Return the directory path
    yield temp_dir

    # Clean up after the test
    shutil.rmtree(temp_dir)


@pytest.fixture
def mock_gcs_helper(temp_dir):
    """Create a mock GCS helper that uses the temp directory"""
    return MockGCSHelper(temp_dir)


@pytest.fixture
def storage_backend(mock_gcs_helper):
    """Create a storage backend using the mock GCS helper"""
    return GCSStorageBackend(mock_gcs_helper)


def test_get_obj_nonexistent(storage_backend):
    """Test getting a non-existent object"""
    # Try to get a non-existent object
    with pytest.raises(KeyError) as excinfo:
        storage_backend.get_obj("workflow", "nonexistent")

    # Check the error message
    assert "Object with key nonexistent does not exist in table workflow" in str(
        excinfo.value
    )


def test_insert_and_get_obj(storage_backend):
    """Test inserting and then getting an object"""
    # Define the object to insert
    test_obj = {
        "name": "Test Workflow",
        "description": "This is a test workflow",
        "actions": [{"action": "test", "params": {"key": "value"}}],
    }

    # Insert the object
    storage_backend.insert_obj("workflow", "test-project", test_obj)

    # Get the object
    retrieved_obj = storage_backend.get_obj("workflow", "test-project")

    # Check that the retrieved object matches the inserted object
    assert retrieved_obj == test_obj


def test_insert_obj_already_exists(storage_backend):
    """Test inserting an object that already exists"""
    # Define the object to insert
    test_obj = {"name": "Test Object"}

    # Insert the object
    storage_backend.insert_obj("workflow", "test-project", test_obj)

    # Try to insert it again
    with pytest.raises(Exception) as excinfo:
        storage_backend.insert_obj("workflow", "test-project", test_obj)

    # Check the error message
    assert "Object already exists" in str(excinfo.value)


def test_patch_obj(storage_backend):
    """Test patching an object"""
    # Define the object to insert
    test_obj = {
        "name": "Test Workflow",
        "description": "This is a test workflow",
        "actions": [],
    }

    # Insert the object
    storage_backend.insert_obj("workflow", "test-project", test_obj)

    # Define the patch
    patch = {
        "description": "Updated description",
        "actions": [{"action": "test", "params": {"key": "value"}}],
    }

    # Apply the patch
    storage_backend.patch_obj("workflow", "test-project", patch)

    # Get the updated object
    updated_obj = storage_backend.get_obj("workflow", "test-project")

    # Check that the object was updated correctly
    assert updated_obj["name"] == "Test Workflow"  # Unchanged
    assert updated_obj["description"] == "Updated description"  # Updated
    assert len(updated_obj["actions"]) == 1  # Updated
    assert updated_obj["actions"][0]["action"] == "test"  # New item


def test_patch_obj_nonexistent(storage_backend):
    """Test patching a non-existent object"""
    # Try to patch a non-existent object
    with pytest.raises(KeyError) as excinfo:
        storage_backend.patch_obj("workflow", "nonexistent", {"name": "Updated"})

    # Check the error message
    assert "Object not found: workflow/nonexistent" in str(excinfo.value)


def test_obj_exists(storage_backend):
    """Test checking if an object exists"""
    # Define the object to insert
    test_obj = {"name": "Test Object"}

    # Check before insertion
    assert not storage_backend.obj_exists("workflow", "test-project")

    # Insert the object
    storage_backend.insert_obj("workflow", "test-project", test_obj)

    # Check after insertion
    assert storage_backend.obj_exists("workflow", "test-project")


def test_delete_obj(storage_backend):
    """Test deleting an object"""
    # Define the object to insert
    test_obj = {"name": "Test Object"}

    # Insert the object
    storage_backend.insert_obj("workflow", "test-project", test_obj)

    # Check that it exists
    assert storage_backend.obj_exists("workflow", "test-project")

    # Delete the object
    storage_backend.delete_obj("workflow", "test-project")

    # Check that it no longer exists
    assert not storage_backend.obj_exists("workflow", "test-project")


def test_delete_obj_nonexistent(storage_backend):
    """Test deleting a non-existent object"""
    # Try to delete a non-existent object
    with pytest.raises(KeyError) as excinfo:
        storage_backend.delete_obj("workflow", "nonexistent")

    # Check the error message
    assert "Object not found" in str(excinfo.value)


def test_invalid_table(storage_backend):
    """Test using an invalid table name"""
    # Try to use an invalid table name
    with pytest.raises(ValueError) as excinfo:
        storage_backend.get_obj("invalid_table", "test-project")

    # Check the error message
    assert "Unsupported table" in str(excinfo.value)


def test_multiple_inserts_different_tables(storage_backend):
    """Test inserting objects in different tables"""
    # Define objects for different tables
    workflow_obj = {"name": "Test Workflow"}
    metadata_obj = {"tables": {}}
    usage_events_obj = {"events": []}

    # Insert the objects
    storage_backend.insert_obj("workflow", "test-project", workflow_obj)
    storage_backend.insert_obj("metadata", "test-project", metadata_obj)
    storage_backend.insert_obj("usage_events", "test-project", usage_events_obj)

    # Check that they all exist
    assert storage_backend.obj_exists("workflow", "test-project")
    assert storage_backend.obj_exists("metadata", "test-project")
    assert storage_backend.obj_exists("usage_events", "test-project")

    # Get and check the objects
    retrieved_workflow = storage_backend.get_obj("workflow", "test-project")
    retrieved_metadata = storage_backend.get_obj("metadata", "test-project")
    retrieved_usage_events = storage_backend.get_obj("usage_events", "test-project")

    assert retrieved_workflow == workflow_obj
    assert retrieved_metadata == metadata_obj
    assert retrieved_usage_events == usage_events_obj


def test_complex_object(storage_backend):
    """Test inserting and retrieving a complex nested object"""
    # Define a complex object
    complex_obj = {
        "name": "Complex Workflow",
        "metadata": {
            "created_at": "2025-03-31T12:00:00",
            "created_by": "test-user",
            "tags": ["test", "example", "complex"],
        },
        "config": {"timeout": 30, "retry": {"max_attempts": 3, "delay": 5}},
        "actions": [
            {
                "id": "action-1",
                "type": "process",
                "params": {
                    "input": "data.csv",
                    "output": "results.json",
                    "options": {"header": True, "delimiter": ","},
                },
            },
            {
                "id": "action-2",
                "type": "transform",
                "params": {
                    "input": "results.json",
                    "output": "transformed.json",
                    "transforms": [
                        {"field": "name", "operation": "uppercase"},
                        {"field": "age", "operation": "multiply", "value": 2},
                    ],
                },
            },
        ],
    }

    # Insert the object
    storage_backend.insert_obj("workflow", "complex-project", complex_obj)

    # Get the object
    retrieved_obj = storage_backend.get_obj("workflow", "complex-project")

    # Check that the retrieved object matches the inserted object
    assert retrieved_obj == complex_obj

    # Check specific nested fields
    assert retrieved_obj["metadata"]["tags"] == ["test", "example", "complex"]
    assert retrieved_obj["config"]["retry"]["max_attempts"] == 3
    assert (
        retrieved_obj["actions"][1]["params"]["transforms"][0]["operation"]
        == "uppercase"
    )


def test_patching_nested_fields(storage_backend):
    """Test patching nested fields in an object"""
    # Define the object to insert
    test_obj = {
        "name": "Nested Object",
        "config": {"timeout": 30, "retry": {"max_attempts": 3, "delay": 5}},
        "data": {"items": [{"id": 1, "value": "one"}, {"id": 2, "value": "two"}]},
    }

    # Insert the object
    storage_backend.insert_obj("workflow", "nested-project", test_obj)

    # Define a patch that updates nested fields
    patch = {
        "config": {
            "timeout": 60,
            "retry": {
                "max_attempts": 5
                # Note: 'delay' is not in the patch
            },
        },
        "data": {
            "items": [
                {"id": 1, "value": "ONE"},
                {"id": 2, "value": "TWO"},
                {"id": 3, "value": "THREE"},
            ]
        },
    }

    # Apply the patch
    storage_backend.patch_obj("workflow", "nested-project", patch)

    # Get the updated object
    updated_obj = storage_backend.get_obj("workflow", "nested-project")

    # Check that the object was updated correctly
    assert updated_obj["name"] == "Nested Object"  # Unchanged
    assert updated_obj["config"]["timeout"] == 60  # Updated
    assert updated_obj["config"]["retry"]["max_attempts"] == 5  # Updated
    assert updated_obj["config"]["retry"]["delay"] == 5  # Unchanged
    assert len(updated_obj["data"]["items"]) == 3  # Updated
    assert updated_obj["data"]["items"][0]["value"] == "ONE"  # Updated
    assert updated_obj["data"]["items"][2]["id"] == 3  # New item


def test_insert_then_delete_then_insert(storage_backend):
    """Test inserting, deleting, then inserting an object again"""
    # Define the object
    test_obj = {"name": "Test Object"}

    # Insert the object
    storage_backend.insert_obj("workflow", "test-project", test_obj)

    # Delete the object
    storage_backend.delete_obj("workflow", "test-project")

    # Check that it no longer exists
    assert not storage_backend.obj_exists("workflow", "test-project")

    # Insert a different object with the same key
    new_obj = {"name": "New Object"}
    storage_backend.insert_obj("workflow", "test-project", new_obj)

    # Get and check the object
    retrieved_obj = storage_backend.get_obj("workflow", "test-project")
    assert retrieved_obj == new_obj
    assert retrieved_obj["name"] == "New Object"


def test_large_object(storage_backend):
    """Test inserting and retrieving a large object"""
    # Create a large object
    large_obj = {
        "name": "Large Object",
        "items": [{"id": i, "value": f"Item {i}"} for i in range(1000)],
    }

    # Insert the object
    storage_backend.insert_obj("workflow", "large-project", large_obj)

    # Get the object
    retrieved_obj = storage_backend.get_obj("workflow", "large-project")

    # Check that the retrieved object matches the inserted object
    assert retrieved_obj == large_obj
    assert len(retrieved_obj["items"]) == 1000
    assert retrieved_obj["items"][999]["value"] == "Item 999"


def test_storage_backend_with_real_temp_files(temp_dir):
    """Test the storage backend with actual temporary files"""
    # Create the mock GCS helper
    mock_helper = MockGCSHelper(temp_dir)

    # Create the storage backend
    storage = GCSStorageBackend(mock_helper)

    # Define a test object
    test_obj = {"name": "Test Object", "description": "For file testing"}

    # Insert the object
    storage.insert_obj("workflow", "file-test", test_obj)

    # Check that the file exists in the expected location
    file_path = os.path.join(temp_dir, "workflow/file-test/file.json")
    assert os.path.exists(file_path)

    # Read the file directly
    with open(file_path, "r") as f:
        file_content = json.load(f)

    # Check the file content
    assert file_content == test_obj

    # Modify the file directly
    file_content["description"] = "Modified directly"
    with open(file_path, "w") as f:
        json.dump(file_content, f)

    # Get the object and check that it reflects the direct modification
    retrieved_obj = storage.get_obj("workflow", "file-test")
    assert retrieved_obj["description"] == "Modified directly"

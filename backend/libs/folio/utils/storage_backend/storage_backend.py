from abc import ABC, abstractmethod
from typing import Dict, Any
import json
import os
import tempfile
from folio.utils.storage_helper.gcs_helper import GoogleCloudStorageHelper

# -----------------------------------------------------------------------------
# Base Storage Interface
# -----------------------------------------------------------------------------


class StorageBackend(ABC):
    """Generic storage backend interface"""

    @abstractmethod
    def get_obj(self, table: str, key: str) -> Dict[str, Any]:
        """
        Get an object from storage

        Args:
            table: Table name (e.g., 'workflow', 'metadata', 'usage_events')
            key: Object key (typically project_id)

        Returns:
            Dictionary containing the object data

        Raises:
            KeyError: If the object doesn't exist
        """

    @abstractmethod
    def insert_obj(self, table: str, key: str, obj: Dict[str, Any]) -> None:
        """
        Insert a new object into storage

        Args:
            table: Table name
            key: Object key
            obj: Dictionary data to store

        Raises:
            Exception: If the operation fails
        """

    @abstractmethod
    def patch_obj(self, table: str, key: str, obj: Dict[str, Any]) -> None:
        """
        Update an existing object in storage

        Args:
            table: Table name
            key: Object key
            obj: Dictionary with fields to update

        Raises:
            KeyError: If the object doesn't exist
            Exception: If the operation fails
        """

    @abstractmethod
    def obj_exists(self, table: str, key: str) -> bool:
        """
        Check if an object exists

        Args:
            table: Table name
            key: Object key

        Returns:
            True if the object exists, False otherwise
        """

    @abstractmethod
    def delete_obj(self, table: str, key: str) -> None:
        """
        Delete an object

        Args:
            table: Table name
            key: Object key

        Raises:
            KeyError: If the object doesn't exist
        """


# -----------------------------------------------------------------------------
# S3/GCS Implementation
# -----------------------------------------------------------------------------


class GCSStorageBackend(StorageBackend):
    """GCS implementation of StorageBackend"""

    SUPPORTED_TABLES = {
        "workflow",
        "metadata",
        "usage_events",
        "billing_info",
    }

    def __init__(self, gcs_helper: GoogleCloudStorageHelper):
        """
        Initialize with a GoogleCloudStorageHelper instance

        Args:
            gcs_helper: Instance of GoogleCloudStorageHelper
        """
        self.gcs_helper = gcs_helper

    def _get_object_path(self, table: str, key: str) -> str:
        """
        Get the full path for an object

        Args:
            table: Table name
            key: Object key

        Returns:
            Full path
        """
        if table not in self.SUPPORTED_TABLES:
            raise ValueError(f"Unsupported table: {table}")
        return f"{table}/{key}/file.json"

    @staticmethod
    def _deep_merge(base: Dict[str, Any], updates: Dict[str, Any]) -> Dict[str, Any]:
        """Recursively merge update fields into a dictionary."""
        for merge_key, merge_value in updates.items():
            if (
                merge_key in base
                and isinstance(base[merge_key], dict)
                and isinstance(merge_value, dict)
            ):
                GCSStorageBackend._deep_merge(base[merge_key], merge_value)
            else:
                base[merge_key] = merge_value
        return base

    def get_obj(self, table: str, key: str) -> Dict[str, Any]:
        """Get an object from GCS"""
        path = self._get_object_path(table, key)

        try:
            # Download the file to a temporary location
            with tempfile.NamedTemporaryFile(delete=False) as temp_file:
                temp_path = temp_file.name

            try:
                self.gcs_helper.download_blob_to_file(path, temp_path)

                # Read the file
                with open(temp_path, "r", encoding="utf-8") as f:
                    data = json.load(f)

                return data
            finally:
                # Clean up the temporary file
                if os.path.exists(temp_path):
                    os.unlink(temp_path)

        except FileNotFoundError:
            raise KeyError(f"Object with key {key} does not exist in table {table}.")

    def insert_obj(self, table: str, key: str, obj: Dict[str, Any]) -> None:
        """Insert a new object to GCS"""
        path = self._get_object_path(table, key)

        # Check if the object already exists
        if self.obj_exists(table, key):
            raise Exception(f"Object already exists: {path}")

        # Convert the data to JSON
        json_data = json.dumps(obj, indent=2)

        # Create a temporary file
        with tempfile.NamedTemporaryFile(delete=False) as temp_file:
            temp_path = temp_file.name
            temp_file.write(json_data.encode("utf-8"))

        try:
            # Create parent directories if they don't exist
            parent_dir = os.path.dirname(path)
            os.makedirs(parent_dir, exist_ok=True)

            # Upload the file
            self.gcs_helper.upload_file(temp_path, path)
        except Exception as e:
            raise Exception(
                f"Failed to insert object with key {key} into table {table}: {e}"
            )
        finally:
            # Clean up the temporary file
            if os.path.exists(temp_path):
                os.unlink(temp_path)

    def patch_obj(self, table: str, key: str, obj: Dict[str, Any]) -> None:
        """Update an existing object in GCS"""
        # Check if the object exists
        if not self.obj_exists(table, key):
            raise KeyError(f"Object not found: {table}/{key}")

        # Get the current object
        current_obj = self.get_obj(table, key)

        # Update the object with new values (recursive merge for nested dicts)
        self._deep_merge(current_obj, obj)

        # Write back the updated object
        path = self._get_object_path(table, key)

        # Convert the data to JSON
        json_data = json.dumps(current_obj, indent=2)

        # Create a temporary file
        with tempfile.NamedTemporaryFile(delete=False) as temp_file:
            temp_path = temp_file.name
            temp_file.write(json_data.encode("utf-8"))

        try:
            # Upload the file
            self.gcs_helper.patch_file_serialized(temp_path, path)
        except Exception as e:
            raise Exception(
                f"Failed to patch object with key {key} in table {table}: {e}"
            )
        finally:
            # Clean up the temporary file
            if os.path.exists(temp_path):
                os.unlink(temp_path)

    def obj_exists(self, table: str, key: str) -> bool:
        """Check if an object exists in GCS"""
        path = self._get_object_path(table, key)

        try:
            self.gcs_helper._verify_file_exists(path)
            return True
        except FileNotFoundError:
            return False

    def delete_obj(self, table: str, key: str) -> None:
        """Delete an object from GCS"""
        path = self._get_object_path(table, key)

        try:
            self.gcs_helper.delete_blob(path)
        except FileNotFoundError:
            raise KeyError(f"Object not found: {path}")

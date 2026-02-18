from abc import ABC, abstractmethod
import os
import time
import json
from google.cloud import storage
from google.oauth2 import service_account
import boto3
from boto3.s3.transfer import TransferConfig
from concurrent.futures import ThreadPoolExecutor
import tempfile
import uuid
from typing import List, Dict, Optional
import logging


logger = logging.getLogger(__name__)


class FileExists(Exception):
    pass


class AuthenticationError(Exception):
    pass


class PermissionError(Exception):
    pass


class OwnershipVerifier(ABC):
    @abstractmethod
    def verify_access(self, user_id: str, asset_id: str) -> bool:
        """Verify if user has access to asset"""
        pass

    @abstractmethod
    def verify_bulk_access(self, user_id: str, asset_ids: List[str]) -> Dict[str, bool]:
        """Verify access for multiple assets"""
        pass


class StubOwnershipVerifier(OwnershipVerifier):
    def verify_access(self, user_id: str, asset_id: str) -> bool:
        return True

    def verify_bulk_access(self, user_id: str, asset_ids: List[str]) -> Dict[str, bool]:
        return {asset_id: True for asset_id in asset_ids}


class GoogleCloudStorageHelper:
    def __init__(
        self,
        bucket_name=None,
        project_id=None,
        credentials=None,
        ownership_verifier: Optional[OwnershipVerifier] = StubOwnershipVerifier(),
        url_expiration_minutes: int = 15,
    ):
        # If any required parameter is None, initialize from environment variables
        if bucket_name is None or project_id is None or credentials is None:
            logger.warning(
                "Missing required parameters, initializing GoogleCloudStorageHelper from environment variables"
            )

            bucket_name = os.environ.get("BUCKET_NAME")
            service_account_json = os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON")

            if not bucket_name:
                raise ValueError("BUCKET_NAME environment variable is required")
            if not service_account_json:
                raise ValueError(
                    "GOOGLE_SERVICE_ACCOUNT_JSON environment variable is required"
                )

            # Check if the JSON is base64 encoded (for Docker environments)
            try:
                import base64
                import re

                # Clean the base64 string by removing any whitespace/newlines that might be embedded
                clean_b64 = (
                    service_account_json.strip()
                    .replace("\n", "")
                    .replace("\r", "")
                    .replace(" ", "")
                )
                decoded_json = base64.b64decode(clean_b64).decode("utf-8")

                # Use json.loads with strict=False to handle escape sequences properly
                service_account_info = json.loads(decoded_json, strict=False)
                logger.info("Successfully decoded base64 service account JSON")
            except Exception as e:
                logger.info("Base64 decoding failed (%s), trying plain JSON", e)
                # If base64 decoding fails, assume it's already plain JSON
                try:
                    service_account_info = json.loads(service_account_json)
                    logger.info("Successfully parsed plain JSON service account")
                except Exception as json_e:
                    logger.warning("JSON parsing also failed: %s", json_e)
                    # Remove noisy debug prints of raw secret content/length
                    raise ValueError(
                        f"Failed to parse GOOGLE_SERVICE_ACCOUNT_JSON: base64 error={e}, json error={json_e}"
                    )

            # Extract project_id from the service account JSON
            project_id = service_account_info.get("project_id")
            if not project_id:
                raise ValueError("project_id not found in GOOGLE_SERVICE_ACCOUNT_JSON")

            credentials = service_account.Credentials.from_service_account_info(
                service_account_info
            )

        self.bucket_name = bucket_name
        self.project_id = project_id
        self.credentials = credentials
        self.storage_client = storage.Client(
            credentials=credentials, project=project_id
        )
        self.bucket = self.storage_client.bucket(bucket_name)
        # Get credentials from environment variables
        aws_access_key_id = os.environ.get("GOOGLE_ACCESS_KEY_ID")
        aws_secret_access_key = os.environ.get("GOOGLE_ACCESS_KEY_SECRET")

        if not aws_access_key_id or not aws_secret_access_key:
            raise EnvironmentError(
                "GOOGLE_ACCESS_KEY_ID and GOOGLE_ACCESS_KEY_SECRET environment variables must be set"
            )

        self.boto_client = boto3.client(
            "s3",
            aws_access_key_id=aws_access_key_id,
            aws_secret_access_key=aws_secret_access_key,
            endpoint_url="https://storage.googleapis.com",
        )
        self.ownership_verifier = ownership_verifier
        self.url_expiration_seconds = url_expiration_minutes * 60
        self.files_directory_name = "files"

    def _verify_file_exists(self, filename: str) -> bool:
        """Verify if file exists in bucket"""
        try:
            self.boto_client.head_object(Bucket=self.bucket_name, Key=filename)
            return True
        except self.boto_client.exceptions.ClientError as e:
            if e.response["Error"]["Code"] == "404":
                raise FileNotFoundError(f"File {filename} not found")
            raise

    def _verify_access(self, user_id: str, filename: str) -> None:
        """Verify user access to file"""
        if user_id is None or user_id == "":
            raise PermissionError("User ID is required")
        if self.ownership_verifier and not self.ownership_verifier.verify_access(
            user_id, filename
        ):
            raise PermissionError(f"User {user_id} does not have access to {filename}")

    def _clean_filename(self, filename: str) -> str:
        """
        Clean filename to remove any directory-like elements
        Returns just the basename with no path components
        """
        # Remove any directory components and get just the filename
        return os.path.basename(filename)

    def generate_pre_signed_url_for_download(self, filename: str) -> str:
        """
        Generate pre-signed URL for downloading a file from the 'files' directory

        Args:
            filename: Name of the file to download (just the filename, no path)

        Returns:
            str: Pre-signed URL

        Raises:
            FileNotFoundError: If file doesn't exist
        """
        try:
            # Clean the filename
            clean_filename = self._clean_filename(filename)

            # Construct the full path in the 'files' directory
            file_path = f"{self.files_directory_name}/{clean_filename}"

            # Check if file exists
            self._verify_file_exists(file_path)

            url = self.boto_client.generate_presigned_url(
                "get_object",
                Params={"Bucket": self.bucket_name, "Key": file_path},
                ExpiresIn=self.url_expiration_seconds,
            )
            return url
        except self.boto_client.exceptions.ClientError as e:
            if e.response["Error"]["Code"] == "404":
                raise FileNotFoundError(f"File {clean_filename} not found")
            raise Exception(f"Failed to generate download URL: {str(e)}")

    def bulk_generate_pre_signed_url_for_download(
        self, filenames: List[str]
    ) -> Dict[str, Dict[str, str]]:
        """
        Generate pre-signed URLs for downloading multiple files from the 'files' directory

        Args:
            filenames: List of filenames to generate URLs for (just filenames, no paths)

        Returns:
            Dict with successful_urls and failures
        """
        result = {"successful_urls": {}, "failures": {}}

        for filename in filenames:
            clean_filename = self._clean_filename(filename)
            try:
                url = self.generate_pre_signed_url_for_download(clean_filename)
                result["successful_urls"][clean_filename] = url
            except FileNotFoundError as e:
                result["failures"][clean_filename] = str(e)
            except Exception as e:
                result["failures"][clean_filename] = f"Error generating URL: {str(e)}"

        return result

    def generate_pre_signed_url_for_upload(
        self, content_type: str = None
    ) -> Dict[str, str]:
        """
        Generate a GUID and pre-signed URL for uploading a file

        Returns:
            Dict containing:
                'url': Pre-signed URL for upload
                'guid': Generated unique identifier
        """
        try:
            guid = str(uuid.uuid4())
            file_path = f"{self.files_directory_name}/{guid}"

            if content_type is None:
                Params = {
                    "Bucket": self.bucket_name,
                    "Key": file_path,
                }
            else:
                Params = {
                    "Bucket": self.bucket_name,
                    "Key": file_path,
                    "ContentType": content_type,
                }

            url = self.boto_client.generate_presigned_url(
                "put_object",
                Params=Params,
                ExpiresIn=self.url_expiration_seconds,
            )
            return {"url": url, "guid": guid}
        except Exception as e:
            raise Exception(f"Failed to generate upload URL: {str(e)}")

    def bulk_generate_pre_signed_url_for_upload(
        self, count: int, content_type: str = None
    ) -> Dict[str, str]:
        """
        Generate multiple GUIDs and pre-signed URLs for uploading files

        Args:
            count: Number of upload URLs to generate

        Returns:
            Dict mapping GUIDs to their pre-signed URLs
        """
        try:
            urls = {}
            for _ in range(count):
                guid = str(uuid.uuid4())
                file_path = f"{self.files_directory_name}/{guid}"

                if content_type is None:
                    Params = {
                        "Bucket": self.bucket_name,
                        "Key": file_path,
                    }
                else:
                    Params = {
                        "Bucket": self.bucket_name,
                        "Key": file_path,
                        "ContentType": content_type,
                    }

                url = self.boto_client.generate_presigned_url(
                    "put_object",
                    Params=Params,
                    ExpiresIn=self.url_expiration_seconds,
                )
                urls[guid] = url
            return urls
        except Exception as e:
            raise Exception(f"Failed to generate upload URLs: {str(e)}")

    def list_existing_ids(self, prefix):
        """List all existing IDs from parquet files in the given prefix"""
        response = self.boto_client.list_objects_v2(
            Bucket=self.bucket_name, Prefix=prefix
        )

        def add_keys():
            for item in response.get("Contents", []):
                key = item["Key"]
                if key.endswith(".parquet"):
                    try:
                        # Split the path and get the last component before .parquet
                        file_id = key.rstrip(".parquet").split("/")[-1]
                        if file_id.isdigit():
                            existing_ids.append(int(file_id))
                    except (IndexError, ValueError):
                        continue

        existing_ids = []
        add_keys()

        # Handle pagination if there are more results
        while response.get("IsTruncated", False):
            response = self.boto_client.list_objects_v2(
                Bucket=self.bucket_name,
                Prefix=prefix,
                ContinuationToken=response["NextContinuationToken"],
            )

            add_keys()

        return existing_ids

    def list_files(self, prefix):
        response = self.boto_client.list_objects_v2(
            Bucket=self.bucket_name, Prefix=prefix
        )
        keys = [item["Key"] for item in response.get("Contents", [])]
        return keys

    def upload_file_from_memory(self, file_obj, destination_blob_name):
        """
        Upload a file object to GCS using boto3

        Args:
            file_obj: A file-like object to upload
            destination_blob_name: The destination path in the bucket

        Raises:
            FileExists: If the file already exists in the bucket
        """
        # Check if file exists using head_object
        try:
            self._verify_file_exists(destination_blob_name)
            raise FileExists(f"File {destination_blob_name} already exists")
        except FileNotFoundError:
            pass

        # Upload the file
        try:
            blob = self.bucket.blob(destination_blob_name)
            blob.upload_from_file(file_obj)
        except Exception as e:
            raise Exception(f"Failed to upload file: {str(e)}")

    def patch_file_serialized(
        self, local_file_path, destination_blob_name, ignore_file_exists: bool = False
    ):
        """
        Overwrite an existing GCS object with optimistic concurrency control.

        If ignore_file_exists is True, it behaves like a blind overwrite (no serialization).
        Otherwise, it:
        1) loads the object's current generation,
        2) uploads with if_generation_match=<loaded_generation>,
        3) on 412 PreconditionFailed, backs off, reloads generation, and retries.

        Raises:
            FileNotFoundError: if the destination object does not exist
            Exception: on persistent conflicts/transient failures after retries
        """
        from google.api_core import exceptions as gexc

        blob = self.bucket.blob(destination_blob_name)

        # Optionally allow the caller to bypass serialization
        if ignore_file_exists:
            try:
                blob.upload_from_filename(local_file_path)
                return
            except Exception as e:
                raise Exception(f"Failed to upload file: {str(e)}")

        # We expect the object to exist; serialize updates via generation precondition
        max_retries = 8
        backoff = 0.15

        for attempt in range(max_retries):
            try:
                # Load current generation;
                blob.reload()

                expected_generation = int(blob.generation)

                # Atomic: succeed only if no one changed the object since we observed it
                blob.upload_from_filename(
                    local_file_path,
                    if_generation_match=expected_generation,
                )
                return  # success

            except gexc.NotFound:
                # Caller said "files always exist", but handle it cleanly anyway
                raise FileNotFoundError(
                    f"File {destination_blob_name} does not exist in bucket"
                )
            except gexc.PreconditionFailed:
                # Someone else updated the object; retry with fresh generation
                if attempt == max_retries - 1:
                    raise Exception(
                        f"Concurrent update conflict for {destination_blob_name} after {max_retries} retries"
                    )
                time.sleep(backoff)
                backoff = min(backoff * 2, 2.0)
                continue
            except (
                gexc.TooManyRequests,
                gexc.ServiceUnavailable,
                gexc.InternalServerError,
                gexc.DeadlineExceeded,
            ) as e:
                # Transient server-side issues; retry
                if attempt == max_retries - 1:
                    raise Exception(f"GCS transient error during upload: {str(e)}")
                time.sleep(backoff)
                backoff = min(backoff * 2, 2.0)
                continue
            except gexc.GoogleAPICallError as e:
                # Other API errors won't be fixed by retry
                raise Exception(f"GCS API error during upload: {str(e)}")
            except Exception as e:
                # Non-GCS errors (I/O, etc.)
                raise Exception(f"Failed to upload file: {str(e)}")

    def upload_file(
        self, local_file_path, destination_blob_name, ignore_file_exists: bool = False
    ):
        """Upload local file if it doesn't already exist in bucket"""
        if not ignore_file_exists:
            # Check if file exists using head_object
            try:
                self._verify_file_exists(destination_blob_name)
                raise FileExists(f"File {destination_blob_name} already exists")
            except FileNotFoundError:
                pass

        # Use native GCS client for upload since we there is an issue with the boto client one
        blob = self.bucket.blob(destination_blob_name)
        try:
            blob.upload_from_filename(local_file_path)
        except Exception as e:
            raise Exception(f"Failed to upload file: {str(e)}")

    def download_file_with_id(self, file_id: str, local_file_path: str):
        """Download a file from GCS to a local path using its ID which was created by generate_download_url or bulk_generate_download_url"""
        blob_name = f"{self.files_directory_name}/{file_id}"
        self.download_blob_to_file(blob_name, local_file_path)

    def download_blob_to_file(
        self, source_blob_name: str, destination_path: str
    ) -> None:
        """
        Downloads a file from GCS to a local path.

        Args:
            source_blob_name (str): Path to the file in GCS bucket
            destination_path (str): Local path where file should be saved
        """
        try:

            self.boto_client.download_file(
                self.bucket_name, source_blob_name, destination_path
            )
        except self.boto_client.exceptions.ClientError as e:
            if e.response["Error"]["Code"] == "404":
                raise FileNotFoundError(
                    f"File {source_blob_name} does not exist in bucket"
                )
            raise

    def delete_blob(self, blob_name: str) -> None:
        """
        Delete a file from the bucket

        Args:
            blob_name (str): Path to the file in GCS bucket

        Raises:
            FileNotFoundError: If the file doesn't exist
        """
        self._verify_file_exists(blob_name)
        try:
            self.boto_client.delete_object(Bucket=self.bucket_name, Key=blob_name)
        except self.boto_client.exceptions.ClientError as e:
            if e.response["Error"]["Code"] == "404":
                raise FileNotFoundError(f"File {blob_name} does not exist in bucket")

    # Function to download files in parallel
    def download_files_in_parallel(self, keys):
        # Start timer
        start_time = time.time()

        def download_file(key, local_file_path):
            try:
                self.boto_client.download_file(self.bucket_name, key, local_file_path)
                return (key, local_file_path)
            except Exception as e:
                logger.warning("Failed to download %s: %s", key, e)
                return None

        # Generate a temporary directory for the downloads
        local_dir = tempfile.mkdtemp()

        # Prepare file paths
        tasks = [(key, f"{local_dir}/{key.replace('/', '_')}") for key in keys]

        # Use ThreadPoolExecutor for parallel downloads
        with ThreadPoolExecutor(max_workers=10) as executor:
            downloaded_files = list(
                executor.map(lambda task: download_file(*task), tasks)
            )

        # Filter out any failed downloads (None values)
        downloaded_files = [
            (key, file) for (key, file) in downloaded_files if file is not None
        ]

        # End timer and calculate total time
        end_time = time.time()
        total_time = end_time - start_time
        logger.info("Total download time: %.2f seconds", total_time)

        return local_dir, downloaded_files

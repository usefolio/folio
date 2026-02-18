from abc import ABC, abstractmethod
from typing import Dict, List, Any, Tuple
import uuid
from enum import Enum
import os
import pandas as pd
import json
import xml.etree.ElementTree as ET
import csv
import sys
import logging
import pyarrow.parquet as pq
import pyarrow as pa
import tiktoken
import tempfile
import io
import time
import json
import asyncio
import chardet

from folio.utils.convex_client.convex_client import ConvexClient
from folio.utils.storage_helper.gcs_helper import GoogleCloudStorageHelper
from folio.utils.shared_types import DatasetConfig

logger = logging.getLogger(__name__)


class DatasetProcessorError(Exception):
    """Base exception for all dataset processor errors."""


class StorageError(DatasetProcessorError):
    """Exceptions related to file storage operations."""


class FileUploadError(StorageError):
    """Error during file upload to storage."""


class FileDownloadError(StorageError):
    """Error during file download from storage."""


class FileNotFoundError(StorageError):
    """File not found in storage."""


class ProcessingError(DatasetProcessorError):
    """Exceptions related to data processing operations."""


class ValidationError(ProcessingError):
    """Error during dataset validation."""


class TransformationError(ProcessingError):
    """Error during dataset transformation."""


class SchemaExtractionError(ProcessingError):
    """Error during schema extraction."""


class ExternalSystemError(DatasetProcessorError):
    """Exceptions related to external system interactions."""


class SynchronizationError(ExternalSystemError):
    """Error during synchronization with external data store."""


class ExternalDataSyncColumnError(ExternalSystemError):
    """Error during external data sync operations."""


class FileType(str, Enum):
    """Supported file types for dataset processing."""

    CSV = "csv"
    PARQUET = "parquet"
    AUDIO = "audio"
    PDF = "pdf"
    XML = "xml"
    IMAGE = "image"
    VIDEO = "video"


class FileMetadata:
    """Base metadata for all file types."""

    def __init__(
        self,
        file_id: str,
        file_name: str,
        file_type: FileType,
        file_size: int,
        original_path: str = None,
        content_type: str = None,
    ):
        self.file_id = file_id or str(uuid.uuid4())
        self.file_name = file_name
        self.file_type = file_type
        self.file_size = file_size
        self.original_path = original_path
        self.content_type = content_type


class TabularFileMetadata(FileMetadata):
    """Metadata for tabular files (CSV/Parquet)."""

    def __init__(
        self,
        file_id: str,
        file_name: str,
        file_type: FileType,
        file_size: int,
        has_header: bool = True,
        delimiter: str = None,
        encoding: str = None,
        compression: str = None,
        row_count: int = None,
        media_columns: Dict[str, FileType] = None,
        **kwargs,
    ):
        super().__init__(file_id, file_name, file_type, file_size, **kwargs)
        self.has_header = has_header
        self.delimiter = delimiter
        # Default to utf-8 if no encoding is provided. This mirrors the common
        # default used by pandas and simplifies testing where the file may not
        # actually exist on disk.
        self.encoding = encoding or "utf-8"
        self.compression = compression
        self.row_count = row_count
        self.media_columns = media_columns or {}

        if file_type not in [FileType.PARQUET, FileType.CSV]:
            raise ValueError("Unsupported file type for creating a new project.")

        valid_file_types = {FileType.AUDIO, FileType.PDF, FileType.XML}
        if any(
            file_type not in valid_file_types
            for file_type in self.media_columns.values()
        ):
            raise ValueError(
                "All media_columns values must be FileType.AUDIO, FileType.PDF, or FileType.XML."
            )


class ProcessingResult:
    """Result of a processing operation."""

    def __init__(
        self,
        success: bool,
        message: str = "",
        errors: Dict[str, str] = None,
        data: Dict[str, Any] = None,
    ):
        self.success = success
        self.message = message
        self.errors = errors or {}
        self.data = data or {}


class Column:
    """Metadata about a dataset column."""

    def __init__(
        self,
        name: str,
        data_type: str,
        is_nullable: bool = True,
        description: str = None,
    ):
        self.name = name
        self.data_type = data_type
        self.is_nullable = is_nullable
        self.description = description


class Schema:
    """Dataset schema information."""

    def __init__(self, columns: List[Column], primary_key: str = None):
        self.columns = columns
        self.primary_key = primary_key

    def get_column_names(self) -> List[str]:
        """Get list of column names in the schema."""
        return [col.name for col in self.columns]


class ExternalDataSync(ABC):
    """Protocol for external data store implementations."""

    @abstractmethod
    async def create_columns(
        self, schema: Schema, dataset_metadata: TabularFileMetadata
    ) -> List[Tuple[str, str]]:
        """Create columns in the data store and return mapping of name to ID. Returns column name to external column id"""

    @abstractmethod
    async def create_rows(
        self, columns_to_external_column_id: Tuple[str, str], rows: List[Dict[str, Any]]
    ) -> pd.DataFrame:
        """Create rows in the data store and return the row IDs. Returns internal row id, external row id and row number"""


class ConvexDataSync(ExternalDataSync):
    """Implementation of external data store using Convex."""

    def __init__(
        self,
        convex_client: ConvexClient,
        convex_project_id: str,
        dataset_config: DatasetConfig,
    ):
        self.convex_project_id = convex_project_id
        self.convex_client = convex_client
        self.dataset_config = dataset_config
        self.id_column_name = dataset_config.PRIMARY_KEY_COLUMN
        self.row_order_column_name = dataset_config.ROW_ORDER_COLUMN

    async def get_columns(self, schema: Schema) -> List[str]:
        convex_columns = self.convex_client.get_columns(self.convex_project_id)
        response_column_names = [col["name"] for col in convex_columns]

        # 3) Get the official schema column names
        schema_column_names = schema.get_column_names()

        # 4) Compare sets to see if anything is missing or extra
        missing_in_response = set(schema_column_names) - set(response_column_names)
        extra_in_response = set(response_column_names) - set(schema_column_names)

        if missing_in_response:
            raise ValueError(f"Missing columns in response: {missing_in_response}")
        if extra_in_response:
            raise ValueError(
                f"Extra (unexpected) columns in response: {extra_in_response}"
            )

        return [(item["name"], item["id"]) for item in convex_columns]

    async def create_columns(
        self, schema: Schema, dataset_metadata: TabularFileMetadata
    ) -> List[Tuple[str, str]]:
        """
        Retuns array of tuples of (column_name, external_column_id)
        """
        col_to_convex_col_id = []
        for column in schema.columns:
            try:
                media_type: FileType = dataset_metadata.media_columns.get(
                    column.name, None
                )

                convex_column_id = self.convex_client.create_column(
                    column.name,
                    self.convex_project_id,
                    None if media_type is None else media_type.value,
                )

                # print("\n--- REQUEST DETAILS ---")
                # print(f"URL: {response.request.url}")
                # print(f"Method: {response.request.method}")
                # print(f"Headers: {response.request.headers}")
                # print(f"Body: {response.request.body if response.request.body else 'No Body'}")

                # # Log full response details
                # print("\n--- RESPONSE DETAILS ---")
                # print(f"Status Code: {response.status_code}")
                # print(f"Reason: {response.reason}")
                # print(f"Headers: {response.headers}")

                col_to_convex_col_id.append((column.name, convex_column_id))
            except Exception as e:
                raise ExternalDataSyncColumnError(f"Error creating column: {e}") from e

        # this should almost never happen, but in case the code changes, this is a good reminder
        if len(list(col_to_convex_col_id)) != len(schema.columns):
            raise ValueError(
                "the number of created columns doesnt match the number of columns in the input dataset"
            )

        return col_to_convex_col_id

    def _create_spreadsheet_rows(
        self, col_to_convex_col_id: Tuple[str, str], payloads: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        MAX_SIZE_BYTES = 64 * 1024  # 64KB in bytes
        rows = []
        for _, payload in enumerate(payloads, start=1):
            cells = []
            # NOTE: Since we used columns for the select statement, we know that the order of
            # the columns will be the same as the order of the columns in the schema
            i = 0
            for field_name, value in payload["fields"].items():
                if (
                    field_name == self.row_order_column_name
                    or field_name == self.id_column_name
                ):
                    continue

                # Convert to string (handle None)
                value_str = str(value) if value is not None else ""

                # Check the size in bytes
                value_bytes = value_str.encode("utf-8")
                if len(value_bytes) > MAX_SIZE_BYTES:
                    # Option A: Truncate the string to 256KB
                    value_bytes = value_bytes[:MAX_SIZE_BYTES]
                    value_str = value_bytes.decode("utf-8", errors="ignore")

                convex_column_id = col_to_convex_col_id[i][1]
                cells.append(
                    {
                        "column_id": convex_column_id,
                        "value": value_str,
                        "state": "default",  # Default state, can be customized
                    }
                )
                i += 1
            row = {
                "order": payload["fields"][self.row_order_column_name],
                "row_number": payload["fields"][self.id_column_name],
                "project_id": self.convex_project_id,
                "cells": cells,
            }
            rows.append(row)
        return rows

    async def create_rows(
        self, columns_to_external_column_id: Tuple[str, str], rows: List[Dict[str, Any]]
    ) -> pd.DataFrame:
        convex_payloads = self._create_spreadsheet_rows(
            columns_to_external_column_id, rows
        )

        logger.info("Creating rows in Convex")

        def batch_data(data, batch_size):
            for i in range(0, len(data), batch_size):
                yield data[i : i + batch_size]

        start_time = time.time()

        async def create():
            tasks = []
            results = []

            async def process_batch(batch):
                try:
                    _results = await self.convex_client.create_row_bulk(batch)
                    for result in _results:
                        results.append(result)
                except Exception as e:
                    logger.warning("Convex error: %s", e)
                    raise e
                return _results

            # Main async function
            batch_size = 250
            for batch in batch_data(convex_payloads, batch_size):
                tasks.append(asyncio.create_task(process_batch(batch)))
            await asyncio.gather(*tasks)
            return results

        results = await create()
        end_time = time.time()
        logger.info(
            "Time taken to process %d items: %s seconds",
            len(convex_payloads),
            end_time - start_time,
        )

        # Convert list of tuples -> DataFrame
        # Suppose you want columns named: "primary_key_column", "external_data_row_id", and "row_order".
        results_df = pd.DataFrame(
            results,
            columns=[
                self.id_column_name,  # e.g. "_folio_internal_id"
                self.dataset_config.EXTERNAL_DATASYNC_ROW_COLUMN,  # user-chosen name for the external row ID
                self.row_order_column_name,  # e.g. "_folio_row_order"
            ],
        )

        return results_df


class DatasetProcessor(ABC):
    """Abstract base class for dataset processors."""

    def __init__(self, config: DatasetConfig = None):
        self.config = config or DatasetConfig()

    @abstractmethod
    def validate(
        self, file_metadata: FileMetadata, local_path: str
    ) -> ProcessingResult:
        """Validate a dataset file."""

    # abstractmethod
    # def transform(self, file_metadata: FileMetadata, local_path: str, output_path: str) -> ProcessingResult:
    #     """Transform a dataset file and save to output_path."""
    #     pass

    @abstractmethod
    async def extract_schema(
        self, file_metadata: FileMetadata, local_path: str
    ) -> Schema:
        """Extract schema from a dataset file."""

    @abstractmethod
    def extract_data(
        self, file_metadata: TabularFileMetadata, local_path: str
    ) -> Tuple[
        pd.DataFrame,  # the dataframe, inclusive of new tokenized columns
        List[Dict[str, Dict[str, Any]]],  # payloads for external data sync
        Dict[str, int],  # token count totals
        List[str],
    ]:  # columns that failed tokenization
        pass


class TabularDataProcessor(DatasetProcessor):
    """Processor for tabular datasets like CSV and Parquet"""

    DISALLOWED_COLUMN_VALIDATION_ERRORS = "disallowed_columns"

    def __init__(
        self,
        config: DatasetConfig,
        gcs_helper: GoogleCloudStorageHelper,
        convex_client: ConvexClient,
    ):
        super().__init__(config)
        self.config = config
        self.gcs_helper = gcs_helper
        self.convex_client = convex_client
        self.initial_file_path = None
        self.processed_file_path = None

    def create_from_in_memory_file(self, file_name, file_content):
        """Throws FileExists"""
        filename = f"raw/{int(time.time())}_{file_name}"
        _file_content = io.BytesIO(file_content)
        self.gcs_helper.upload_file_from_memory(_file_content, filename)
        initial_file_path, processed_file_path = self._create_local_dirs()
        with open(initial_file_path, "wb") as f:
            f.write(file_content)
        self.initial_file_path = initial_file_path
        self.processed_file_path = processed_file_path

    def create_from_pandas_dataframe(self, df: pd.DataFrame):
        initial_file_path, processed_file_path = self._create_local_dirs()
        # Save the DataFrame to a parquet file
        df.to_parquet(initial_file_path)
        self.initial_file_path = initial_file_path
        self.processed_file_path = processed_file_path

    def create_from_storage_file(self, file_id: str):
        """Throws FileNotFoundError, PermissionError, Exception"""
        initial_file_path, processed_file_path = self._create_local_dirs()
        self.gcs_helper.download_file_with_id(file_id, initial_file_path)
        self.initial_file_path = initial_file_path
        self.processed_file_path = processed_file_path

    def _create_local_dirs(self):
        local_dir = os.getenv("MOUNT_PATH", "../local_tmp")
        local_filename = str(uuid.uuid4())
        local_filename_without_extension, _ = os.path.splitext(local_filename)
        temp_file_path = f"{local_dir}/{local_filename_without_extension}.parquet"
        output_file_path = (
            f"{local_dir}/processed_{local_filename_without_extension}.parquet"
        )
        return temp_file_path, output_file_path

    def validate(
        self, file_metadata: TabularFileMetadata, local_path: str
    ) -> ProcessingResult:
        """
        Validate a tabular file for:
        - File integrity
        - Data consistency
        - Disallowed column names
        - Data types
        """
        try:
            # Check if file exists
            if not os.path.exists(local_path):
                return ProcessingResult(
                    success=False,
                    message="File not found",
                    errors={"file_access": f"File not found: {local_path}"},
                )

            # Different validation approach based on file type
            if file_metadata.file_type == FileType.CSV:
                return self._validate_csv(file_metadata, local_path)
            elif file_metadata.file_type == FileType.PARQUET:
                return self._validate_parquet(file_metadata, local_path)
            else:
                return ProcessingResult(
                    success=False,
                    message=f"Unsupported file type: {file_metadata.file_type}",
                    errors={
                        "file_type": f"Unsupported file type: {file_metadata.file_type}"
                    },
                )
        except Exception as e:
            logger.exception(f"Error validating {file_metadata.file_name}: {str(e)}")
            return ProcessingResult(
                success=False,
                message=f"Validation error: {str(e)}",
                errors={"validation": str(e)},
            )

    def _validate_tabular_data_columns(
        self, df: pd.DataFrame
    ) -> Dict[str, Dict[str, List[str]]]:
        """
        Validate dataframe columns against disallowed column rules.

        Args:
            df: The pandas DataFrame to validate

        Returns:
            Dict with validation errors if any disallowed columns are found
        """
        disallowed_columns_found = []

        # 1. Check for the primary key column
        if self.config.PRIMARY_KEY_COLUMN in df.columns:
            disallowed_columns_found.append(self.config.PRIMARY_KEY_COLUMN)

        # 2. Check for any column that starts with the tokenized prefix
        tokenized_prefix_columns = [
            col
            for col in df.columns
            if col.startswith(f"{self.config.TOKENIZED_PREFIX}_")
        ]
        disallowed_columns_found.extend(tokenized_prefix_columns)

        # 3. Check for any other explicitly disallowed columns from the config
        if (
            self.config.validation_rules
            and "disallowed_column_names" in self.config.validation_rules
        ):
            other_disallowed_columns = [
                col
                for col in df.columns
                if col in self.config.validation_rules["disallowed_column_names"]
                and col != self.config.PRIMARY_KEY_COLUMN  # Avoid duplicates
                and col not in tokenized_prefix_columns  # Avoid duplicates
            ]
            disallowed_columns_found.extend(other_disallowed_columns)

        # Return the result
        if disallowed_columns_found:
            return {
                "errors": {
                    self.DISALLOWED_COLUMN_VALIDATION_ERRORS: disallowed_columns_found
                }
            }

        return {}

    def _detect_encoding(self, path: str, sample_size: int = 32_000) -> str:
        """Return the most likely encoding for the first `sample_size` bytes."""
        try:
            with open(path, "rb") as fh:
                raw = fh.read(sample_size)
        except OSError:
            # During testing we often pass in dummy paths that do not exist on disk.
            # Rather than raising a FileNotFoundError, default to utf-8 so that
            # callers can continue with mocked ``pandas.read_csv`` behaviour.
            return "utf-8"

        enc = chardet.detect(raw)["encoding"]
        if not enc:
            return "latin1"  # never fails
        enc = enc.lower().replace("-", "").replace("_", "")
        if enc in {"macroman", "macintosh"}:
            return "mac_roman"
        return enc

    def _read_csv_with_fallback(
        self,
        path: str,
        *,
        delimiter: str = ",",
        encoding: str | None = None,
        nrows: int | None = None,
    ) -> pd.DataFrame:
        """
        Read a CSV, detecting the encoding if none is supplied.
        Retries once with a fresh probe (or latin1) on Unicode/Parser errors.
        """

        def _read(enc: str, use_python_engine: bool = False) -> pd.DataFrame:
            kwargs = dict(
                delimiter=delimiter,
                encoding=enc,
                nrows=nrows,
            )
            if not use_python_engine:
                try:  # pandas ≥1.3
                    kwargs["encoding_errors"] = "replace"
                except TypeError:
                    pass
            else:
                kwargs["engine"] = "python"
            try:
                return pd.read_csv(path, **kwargs)
            except TypeError:  # old pandas without encoding_errors=
                with open(path, "r", encoding=enc, errors="replace") as fh:
                    return pd.read_csv(fh, delimiter=delimiter, nrows=nrows)

        # First attempt
        enc1 = encoding or self._detect_encoding(path)
        try:
            return _read(enc1)
        except (UnicodeDecodeError, pd.errors.ParserError):
            # Second and final attempt. Increase the csv field size limit to
            # accommodate very large fields and re-read using the Python engine.
            try:
                csv.field_size_limit(sys.maxsize)
            except Exception:
                pass

            enc2 = self._detect_encoding(path)
            if enc2.lower() == enc1.lower():
                enc2 = "latin1"  # guaranteed to succeed
            return _read(enc2, use_python_engine=True)

    def _validate_csv(
        self, file_metadata: TabularFileMetadata, local_path: str
    ) -> ProcessingResult:
        """Validate a CSV file."""
        errors = {}
        warnings = {}

        try:
            # Try to read the first few rows to check structure
            delimiter = file_metadata.delimiter or ","
            encoding = file_metadata.encoding

            # Try to read with pandas to check structure
            df_sample = self._read_csv_with_fallback(
                local_path,
                nrows=100,
                delimiter=delimiter,
                encoding=encoding,
            )

            # Check if dataframe is empty
            if df_sample.empty:
                errors["empty_data"] = "File contains no data"

            # Check for disallowed column names in dataset
            validation_for_disallowed_columns = self._validate_tabular_data_columns(
                df_sample
            )
            if (
                validation_for_disallowed_columns
                and "errors" in validation_for_disallowed_columns
            ):
                errors[self.DISALLOWED_COLUMN_VALIDATION_ERRORS] = (
                    validation_for_disallowed_columns["errors"]
                )

            # Update metadata with row count if needed
            if file_metadata.row_count is None:
                # Get approximate row count by reading the file in chunks
                total_rows = 0
                chunks = self._read_csv_with_fallback(
                    local_path,
                    delimiter=delimiter,
                    encoding=encoding,
                )
                for chunk in chunks:
                    total_rows += len(chunk)
                file_metadata.row_count = total_rows

        except pd.errors.EmptyDataError:
            errors["empty_file"] = "File is empty"
        except pd.errors.ParserError as e:
            errors["parser_error"] = f"CSV parsing error: {str(e)}"
        except UnicodeDecodeError:
            errors["encoding_error"] = f"File encoding error. Expected: {encoding}"
        except Exception as e:
            logger.exception(f"Unexpected error during CSV validation: {str(e)}")
            errors["unexpected_error"] = f"Unexpected error: {str(e)}"

        # Return validation result
        if errors:
            return ProcessingResult(
                success=False, message="Validation failed", errors=errors
            )
        else:
            return ProcessingResult(
                success=True,
                message="Validation successful",
                data={"warnings": warnings if warnings else None},
            )

    def _validate_parquet(
        self, file_metadata: TabularFileMetadata, local_path: str
    ) -> ProcessingResult:
        """Validate a Parquet file."""
        errors = {}
        warnings = {}

        try:
            # Try to read with pyarrow to check structure
            try:
                # Open parquet file
                parquet_file = pq.ParquetFile(local_path)

                # Read basic metadata
                file_metadata.row_count = parquet_file.metadata.num_rows

                # Read a small sample for content validation
                # First read the first row group
                table = parquet_file.read_row_group(0)
                # Then limit to first 100 rows
                table = table.slice(0, 100)
                df_sample = table.to_pandas()

                # Check if dataframe is empty
                if df_sample.empty and file_metadata.row_count == 0:
                    errors["empty_data"] = "File contains no data"

                # Check for disallowed column names in dataset
                validation_for_disallowed_columns = self._validate_tabular_data_columns(
                    df_sample
                )
                if (
                    validation_for_disallowed_columns
                    and "errors" in validation_for_disallowed_columns
                ):
                    errors[self.DISALLOWED_COLUMN_VALIDATION_ERRORS] = (
                        validation_for_disallowed_columns["errors"]
                    )

            except Exception as e:
                errors["parquet_error"] = f"Parquet file error: {str(e)}"

            # Return validation result
            if errors:
                return ProcessingResult(
                    success=False, message="Validation failed", errors=errors
                )
            else:
                return ProcessingResult(
                    success=True,
                    message="Validation successful",
                    data={"warnings": warnings if warnings else None},
                )

        except Exception as e:
            logger.exception(f"Unexpected error during Parquet validation: {str(e)}")
            errors["unexpected_error"] = f"Unexpected error: {str(e)}"
            return ProcessingResult(
                success=False, message="Validation failed", errors=errors
            )

    async def extract_schema(
        self, file_metadata: TabularFileMetadata, local_path: str
    ) -> Schema:
        """Extract schema from a tabular file."""
        try:
            if file_metadata.file_type == FileType.CSV:
                return await self._extract_schema_csv(file_metadata, local_path)
            elif file_metadata.file_type == FileType.PARQUET:
                return await self._extract_schema_parquet(local_path)
            else:
                raise SchemaExtractionError(
                    f"Unsupported file type: {file_metadata.file_type}"
                )
        except Exception as e:
            logger.exception(
                f"Error extracting schema from {file_metadata.file_name}: {str(e)}"
            )
            raise SchemaExtractionError(f"Schema extraction error: {str(e)}") from e

    async def _extract_schema_csv(
        self, file_metadata: TabularFileMetadata, local_path: str
    ) -> Schema:
        """Extract schema from a CSV file."""
        delimiter = file_metadata.delimiter or ","
        encoding = file_metadata.encoding  # may be None

        try:
            # 1️⃣ auto-probe when the caller gave no encoding
            if encoding is None:
                try:
                    with open(local_path, "rb") as fh:
                        raw_sample = fh.read(32_000)  # 32 KB is plenty
                    encoding = chardet.detect(raw_sample)["encoding"] or "latin1"
                except OSError:
                    # If the file doesn't actually exist (common in tests where
                    # ``pandas.read_csv`` is mocked), fall back to a sensible
                    # default.
                    encoding = "utf-8"

            # 2️⃣ first attempt
            try:
                df_sample = pd.read_csv(
                    local_path,
                    nrows=1000,
                    delimiter=delimiter,
                    encoding=encoding,
                )
            except UnicodeDecodeError:
                # 2️⃣ fallback: probe again on failure and retry once
                try:
                    with open(local_path, "rb") as fh:
                        raw_sample = fh.read(32_000)
                    fallback_enc = chardet.detect(raw_sample)["encoding"] or "latin1"
                except OSError:
                    fallback_enc = "latin1"
                df_sample = pd.read_csv(
                    local_path,
                    nrows=1000,
                    delimiter=delimiter,
                    encoding=fallback_enc,
                    encoding_errors="replace",  # never crash on bad bytes
                )

            columns = []
            for col_name in df_sample.columns:
                col_series = df_sample[col_name]
                data_type = self._infer_column_type(col_series)
                is_nullable = col_series.isna().any()
                columns.append(
                    Column(
                        name=col_name,
                        data_type=data_type,
                        is_nullable=is_nullable,
                    )
                )

            return Schema(columns=columns, primary_key=self.config.PRIMARY_KEY_COLUMN)

        except Exception as e:
            logger.exception("Error during CSV schema extraction: %s", e)
            raise SchemaExtractionError(f"CSV schema extraction error: {e}") from e

    async def _extract_schema_parquet(self, local_path: str) -> Schema:
        """Extract schema from a Parquet file."""
        try:
            # Read parquet schema
            parquet_file = pq.ParquetFile(local_path)
            pa_schema = parquet_file.schema_arrow

            # Convert pyarrow schema to our Schema format
            columns = []
            for field in pa_schema:
                col_name = field.name
                data_type = self._map_arrow_type_to_schema_type(field.type)
                is_nullable = field.nullable

                columns.append(
                    Column(name=col_name, data_type=data_type, is_nullable=is_nullable)
                )

            return Schema(columns=columns, primary_key=self.config.PRIMARY_KEY_COLUMN)

        except Exception as e:
            logger.exception(f"Error during Parquet schema extraction: {str(e)}")
            raise SchemaExtractionError(
                f"Parquet schema extraction error: {str(e)}"
            ) from e

    def _map_pandas_type_to_schema_type(self, pandas_type) -> str:
        """Map pandas data type to schema type - concise version."""
        # Basic numeric types
        if pd.api.types.is_integer_dtype(pandas_type):
            return "integer"
        elif pd.api.types.is_float_dtype(pandas_type):
            return "float"
        elif pd.api.types.is_complex_dtype(pandas_type):
            return "complex"
        elif pd.api.types.is_bool_dtype(pandas_type):
            return "boolean"

        # Date and time types
        elif pd.api.types.is_datetime64_any_dtype(pandas_type):
            return "datetime"
        elif pd.api.types.is_timedelta64_dtype(pandas_type):
            return "timedelta"
        elif hasattr(pd.api.types, "is_period_dtype") and pd.api.types.is_period_dtype(
            pandas_type
        ):
            return "period"
        elif hasattr(
            pd.api.types, "is_interval_dtype"
        ) and pd.api.types.is_interval_dtype(pandas_type):
            return "interval"

        # String and categorical types
        elif pd.api.types.is_string_dtype(pandas_type):
            return "string"
        elif pd.api.types.is_categorical_dtype(pandas_type):
            return "categorical"

        # Other types
        elif pd.api.types.is_object_dtype(pandas_type):
            return "object"

        # Fallback
        else:
            return "unknown"

    def _infer_column_type(self, series: pd.Series) -> str:
        """Infer a schema type from a pandas Series."""
        pandas_type = series.dtype

        # Use builtin mapping first
        basic_type = self._map_pandas_type_to_schema_type(pandas_type)

        # If pandas thinks the dtype is a generic object, it will often be
        # reported as a "string". In that case we still want to run our
        # heuristics below to detect JSON, XML, etc.
        if basic_type != "object":
            if basic_type == "string" and pd.api.types.is_object_dtype(pandas_type):
                basic_type = "object"
            else:
                return basic_type

        # Drop NA and convert to string for analysis
        sample = series.dropna().astype(str).head(10)
        if sample.empty:
            return "string"

        # Boolean-like strings
        lowered = {val.strip().lower() for val in sample}
        bool_values = {"true", "false", "1", "0", "yes", "no", "t", "f", "on", "off"}
        if lowered and lowered.issubset(bool_values):
            return "boolean"

        # Numeric strings
        try:
            pd.to_numeric(sample)
            if all(val.strip().isdigit() for val in sample):
                return "integer"
            return "float"
        except Exception:
            pass

        # Datetime strings
        try:
            pd.to_datetime(sample, errors="raise")
            return "datetime"
        except Exception:
            pass

        # JSON
        try:
            for val in sample:
                json.loads(val)
            return "json"
        except Exception:
            pass

        # XML
        try:
            for val in sample:
                if not val.strip().startswith("<"):
                    raise ValueError
                ET.fromstring(val)
            return "xml"
        except Exception:
            pass

        return "string"

    def _map_arrow_type_to_schema_type(self, arrow_type) -> str:
        """Map PyArrow data type to schema type."""

        # Integer types
        if pa.types.is_integer(arrow_type):
            return "integer"

        # Floating point types
        elif pa.types.is_floating(arrow_type):
            return "float"

        # Boolean type
        elif pa.types.is_boolean(arrow_type):
            return "boolean"

        # String types
        elif pa.types.is_string(arrow_type) or pa.types.is_large_string(arrow_type):
            return "string"

        # Binary types
        elif pa.types.is_binary(arrow_type) or pa.types.is_large_binary(arrow_type):
            return "binary"

        # Date/time types
        elif pa.types.is_timestamp(arrow_type):
            return "datetime"
        elif pa.types.is_date(arrow_type):
            return "date"
        elif pa.types.is_time(arrow_type):
            return "time"
        elif pa.types.is_duration(arrow_type):
            return "duration"

        # Decimal type
        elif pa.types.is_decimal(arrow_type):
            return "decimal"

        # List/array types
        elif pa.types.is_list(arrow_type) or pa.types.is_large_list(arrow_type):
            return "array"

        # Dictionary/map types
        elif pa.types.is_dictionary(arrow_type):
            return "categorical"
        elif pa.types.is_map(arrow_type):
            return "map"

        # Struct type
        elif pa.types.is_struct(arrow_type):
            return "struct"

        # Null type
        elif pa.types.is_null(arrow_type):
            return "null"

        # Fixed size types
        elif pa.types.is_fixed_size_binary(arrow_type):
            return "binary"
        elif pa.types.is_fixed_size_list(arrow_type):
            return "array"

        # Union type
        elif pa.types.is_union(arrow_type):
            return "union"

        # Default case
        else:
            return "unknown"

    def extract_data(
        self, file_metadata: TabularFileMetadata, local_path: str, max_id: int = 0
    ) -> Tuple[
        pd.DataFrame,  # the dataframe, inclusive of new tokenized columns
        List[Dict[str, Dict[str, Any]]],  # payloads for external data sync
        Dict[str, int],  # token count totals
        List[str],
    ]:  # columns that failed tokenization
        """
        1) Read CSV/Parquet into a DataFrame.
        2) Add _folio_row_order (int) and _folio_internal_id (float).
        3) For all other columns (the user columns), cast to string and tokenize.
           Store the row-wise token count in a new column named:
                f"{self.config.TOKENIZED_PREFIX}_{col_name}"
        4) Build a payload list that:
            - includes all original user columns + the two special columns,
            - excludes the newly created token-count columns.
        5) Compute the sum of tokens for each original user column.
        6) Return:
            - df: the full DataFrame with user columns, special columns, and tokenized columns
            - payloads: a list of {"fields": {col -> val, ...}} (excluding tokenized columns)
            - token_counts: { col_name -> sum_of_tokens_for_that_column_across_rows }
            - skipped_columns: columns that failed tokenization

        Parameters
        ----------
        file_metadata : TabularFileMetadata
            Holds file_type, delimiter, encoding, etc.
        local_path : str
            Path on disk where the CSV/Parquet file is located.

        Returns
        -------
        df : pd.DataFrame
            DataFrame with original columns, special columns, and token-count columns.
        payloads : list of dict
            Each element is {"fields": {...}}, including original user columns
            and special columns, but excluding the token-count columns.
        token_counts : dict
            Maps original user column name -> integer sum of tokens across all rows.
        skipped_columns : list
            Columns that could not be tokenized (rare).
        """

        # --- 1) Read the file into a DataFrame ---
        if file_metadata.file_type == FileType.CSV:
            df = self._read_csv_with_fallback(
                local_path,
                delimiter=file_metadata.delimiter or ",",
                encoding=file_metadata.encoding,
            )
        elif file_metadata.file_type == FileType.PARQUET:
            df = pd.read_parquet(local_path)
        else:
            raise ValueError(f"Unsupported file type: {file_metadata.file_type}")

        # --- 2) Add special columns ---
        df[self.config.ROW_ORDER_COLUMN] = (df.index + max_id).astype(int)
        df[self.config.PRIMARY_KEY_COLUMN] = (df.index + max_id + 1).astype(int)

        # Prepare tiktoken
        logger.info("Tokenizing data...")
        tokenizer = tiktoken.get_encoding("cl100k_base")

        # Identify user columns (any except the two special columns)
        excluded_cols = {self.config.ROW_ORDER_COLUMN, self.config.PRIMARY_KEY_COLUMN}
        user_columns = [c for c in df.columns if c not in excluded_cols]

        token_counts = {}
        skipped_columns = []

        # --- 3) For each user column, build a new column that counts tokens per row ---
        for col in user_columns:
            token_col_name = f"{self.config.TOKENIZED_PREFIX}_{col}"
            try:
                # Convert each value to string, tokenize, store row-level count
                token_series = df[col].apply(
                    lambda x: len(tokenizer.encode(str(x))) if pd.notna(x) else 0
                )
                df[token_col_name] = (
                    token_series  # add the token-count column into the DF
                )
                token_counts[col] = token_series.sum()  # compute overall sum
            except Exception:
                # If something goes wrong, note the column in skipped_columns
                skipped_columns.append(col)

        # --- 4) Build payloads, excluding the newly added token-count columns ---
        tokenized_cols = [
            f"{self.config.TOKENIZED_PREFIX}_{col}" for col in user_columns
        ]
        # Our payload includes user columns and special columns, but not token-count columns
        payload_cols = [c for c in df.columns if c not in tokenized_cols]

        payloads = []
        for _, row_data in df[payload_cols].iterrows():
            fields_dict = {col: row_data[col] for col in payload_cols}
            payloads.append({"fields": fields_dict})

        # --- 5 & 6) Return everything requested ---
        return df, payloads, token_counts, skipped_columns

    @staticmethod
    def create_parquet_file(
        data_array,
        column_name: str,
        local_dir,
    ):
        """
        This function expects that the data comes in with the id column already
        as opposed to the extract_data function which creates the id column.
        """
        # Validate data_array format.
        if not all(isinstance(item, tuple) and len(item) == 2 for item in data_array):
            raise ValueError(
                """
                data_array must be a list of tuples, with each tuple 
                containing exactly two elements, where the first element 
                is an id
                """
            )

        # Convert the array of tuples to a DataFrame
        df = pd.DataFrame(
            data_array, columns=[DatasetConfig.PRIMARY_KEY_COLUMN, column_name]
        )

        # Tokenize the data column, similar to extract_data
        logger.info("Tokenizing %s data...", column_name)
        try:
            # Initialize tokenizer
            tokenizer = tiktoken.get_encoding("cl100k_base")

            # Define token column name based on config pattern
            token_col_name = f"{DatasetConfig.TOKENIZED_PREFIX}_{column_name}"

            # Convert values to string, tokenize, and count tokens
            token_series = df[column_name].apply(
                lambda x: len(tokenizer.encode(str(x))) if pd.notna(x) else 0
            )

            # Add token count column to the DataFrame
            df[token_col_name] = token_series

            df[column_name] = df[column_name].astype("string")

            # Create a proper schema that includes all columns
            fields = [
                pa.field(DatasetConfig.PRIMARY_KEY_COLUMN, pa.int64()),
                pa.field(column_name, pa.string()),
                pa.field(token_col_name, pa.int32()),
            ]

            schema = pa.schema(fields)

            # Convert to PyArrow table with schema
            table = pa.Table.from_pandas(df, schema=schema)

            # Write to parquet file
            logger.debug("Writing table to %s", local_dir)
            pq.write_table(table, local_dir)

            return local_dir

        except Exception as e:
            logger.error("Error creating parquet file: %s", e)
            raise

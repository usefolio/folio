import unittest
from unittest.mock import Mock, patch, MagicMock, ANY, mock_open
import os
import io
import tempfile
import csv
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
import uuid
import json
from typing import Dict, List, Any, Tuple
import asyncio


# Helper function to run async tests
def async_test(coro):
    def wrapper(*args, **kwargs):
        loop = asyncio.get_event_loop()
        return loop.run_until_complete(coro(*args, **kwargs))

    return wrapper


# Import the classes we want to test
from folio.utils.dataset_processor import (
    DatasetProcessorError,
    StorageError,
    FileUploadError,
    FileDownloadError,
    FileNotFoundError,
    ValidationError,
    TransformationError,
    SchemaExtractionError,
    ExternalSystemError,
    SynchronizationError,
    ExternalDataSyncColumnError,
    FileType,
    FileMetadata,
    TabularFileMetadata,
    ProcessingResult,
    Column,
    Schema,
    ExternalDataSync,
    ConvexDataSync,
    DatasetProcessor,
    TabularDataProcessor,
)
from folio.utils.shared_types import DatasetConfig
from folio.utils.convex_client.convex_client import ConvexClient
from folio.utils.storage_helper.gcs_helper import GoogleCloudStorageHelper


class TestFileMetadata(unittest.TestCase):
    """Tests for the FileMetadata class."""

    def test_init(self):
        """Test initialization of FileMetadata."""
        file_id = "test_id"
        file_name = "test.csv"
        file_type = FileType.CSV
        file_size = 1024

        metadata = FileMetadata(file_id, file_name, file_type, file_size)

        self.assertEqual(metadata.file_id, file_id)
        self.assertEqual(metadata.file_name, file_name)
        self.assertEqual(metadata.file_type, file_type)
        self.assertEqual(metadata.file_size, file_size)
        self.assertIsNone(metadata.original_path)
        self.assertIsNone(metadata.content_type)

    def test_init_with_optional_params(self):
        """Test initialization of FileMetadata with optional parameters."""
        file_id = "test_id"
        file_name = "test.csv"
        file_type = FileType.CSV
        file_size = 1024
        original_path = "/path/to/file"
        content_type = "text/csv"

        metadata = FileMetadata(
            file_id,
            file_name,
            file_type,
            file_size,
            original_path=original_path,
            content_type=content_type,
        )

        self.assertEqual(metadata.original_path, original_path)
        self.assertEqual(metadata.content_type, content_type)

    def test_auto_id_generation(self):
        """Test that an ID is auto-generated when not provided."""
        file_name = "test.csv"
        file_type = FileType.CSV
        file_size = 1024

        metadata = FileMetadata(None, file_name, file_type, file_size)

        self.assertIsNotNone(metadata.file_id)
        # Check that it's a valid UUID
        uuid.UUID(metadata.file_id)


class TestTabularFileMetadata(unittest.TestCase):
    """Tests for the TabularFileMetadata class."""

    def test_init(self):
        """Test initialization of TabularFileMetadata."""
        file_id = "test_id"
        file_name = "test.csv"
        file_type = FileType.CSV
        file_size = 1024

        metadata = TabularFileMetadata(file_id, file_name, file_type, file_size)

        self.assertEqual(metadata.file_id, file_id)
        self.assertEqual(metadata.file_name, file_name)
        self.assertEqual(metadata.file_type, file_type)
        self.assertEqual(metadata.file_size, file_size)
        self.assertTrue(metadata.has_header)
        self.assertIsNone(metadata.delimiter)
        self.assertEqual(metadata.encoding, "utf-8")
        self.assertIsNone(metadata.compression)
        self.assertIsNone(metadata.row_count)
        self.assertEqual(metadata.media_columns, {})

    def test_init_with_optional_params(self):
        """Test initialization of TabularFileMetadata with optional parameters."""
        file_id = "test_id"
        file_name = "test.csv"
        file_type = FileType.CSV
        file_size = 1024
        has_header = False
        delimiter = ";"
        encoding = "latin-1"
        compression = "gzip"
        row_count = 100
        media_columns = {"audio_col": FileType.AUDIO}

        metadata = TabularFileMetadata(
            file_id,
            file_name,
            file_type,
            file_size,
            has_header=has_header,
            delimiter=delimiter,
            encoding=encoding,
            compression=compression,
            row_count=row_count,
            media_columns=media_columns,
        )

        self.assertFalse(metadata.has_header)
        self.assertEqual(metadata.delimiter, delimiter)
        self.assertEqual(metadata.encoding, encoding)
        self.assertEqual(metadata.compression, compression)
        self.assertEqual(metadata.row_count, row_count)
        self.assertEqual(metadata.media_columns, media_columns)

    def test_xml_media_column(self):
        """TabularFileMetadata should accept XML media columns"""
        file_id = "test_id"
        file_name = "test.csv"
        file_type = FileType.CSV
        file_size = 1024
        media_columns = {"xml_col": FileType.XML}

        metadata = TabularFileMetadata(
            file_id,
            file_name,
            file_type,
            file_size,
            media_columns=media_columns,
        )

        self.assertEqual(metadata.media_columns, media_columns)

    def test_invalid_file_type(self):
        """Test that an error is raised for invalid file types."""
        file_id = "test_id"
        file_name = "test.pdf"
        file_type = FileType.PDF  # Not a tabular file type
        file_size = 1024

        with self.assertRaises(ValueError):
            TabularFileMetadata(file_id, file_name, file_type, file_size)

    def test_invalid_media_column_type(self):
        """Test that an error is raised for invalid media column types."""
        file_id = "test_id"
        file_name = "test.csv"
        file_type = FileType.CSV
        file_size = 1024
        media_columns = {"video_col": FileType.VIDEO}  # Invalid media type

        with self.assertRaises(ValueError):
            TabularFileMetadata(
                file_id, file_name, file_type, file_size, media_columns=media_columns
            )


class TestProcessingResult(unittest.TestCase):
    """Tests for the ProcessingResult class."""

    def test_init(self):
        """Test initialization of ProcessingResult."""
        success = True
        message = "Test message"
        errors = {"error1": "Error message"}
        data = {"key1": "value1"}

        result = ProcessingResult(success, message, errors, data)

        self.assertEqual(result.success, success)
        self.assertEqual(result.message, message)
        self.assertEqual(result.errors, errors)
        self.assertEqual(result.data, data)

    def test_init_defaults(self):
        """Test initialization of ProcessingResult with defaults."""
        success = True
        message = "Test message"

        result = ProcessingResult(success, message)

        self.assertEqual(result.success, success)
        self.assertEqual(result.message, message)
        self.assertEqual(result.errors, {})
        self.assertEqual(result.data, {})


class TestColumn(unittest.TestCase):
    """Tests for the Column class."""

    def test_init(self):
        """Test initialization of Column."""
        name = "test_column"
        data_type = "string"
        is_nullable = False
        description = "Test column description"

        column = Column(name, data_type, is_nullable, description)

        self.assertEqual(column.name, name)
        self.assertEqual(column.data_type, data_type)
        self.assertEqual(column.is_nullable, is_nullable)
        self.assertEqual(column.description, description)

    def test_init_defaults(self):
        """Test initialization of Column with defaults."""
        name = "test_column"
        data_type = "string"

        column = Column(name, data_type)

        self.assertEqual(column.name, name)
        self.assertEqual(column.data_type, data_type)
        self.assertTrue(column.is_nullable)
        self.assertIsNone(column.description)


class TestSchema(unittest.TestCase):
    """Tests for the Schema class."""

    def test_init(self):
        """Test initialization of Schema."""
        columns = [Column("col1", "string"), Column("col2", "integer")]
        primary_key = "col1"

        schema = Schema(columns, primary_key)

        self.assertEqual(schema.columns, columns)
        self.assertEqual(schema.primary_key, primary_key)

    def test_init_defaults(self):
        """Test initialization of Schema with defaults."""
        columns = [Column("col1", "string"), Column("col2", "integer")]

        schema = Schema(columns)

        self.assertEqual(schema.columns, columns)
        self.assertIsNone(schema.primary_key)

    def test_get_column_names(self):
        """Test the get_column_names method."""
        columns = [Column("col1", "string"), Column("col2", "integer")]

        schema = Schema(columns)

        self.assertEqual(schema.get_column_names(), ["col1", "col2"])


class TestConvexDataSync(unittest.TestCase):
    """Tests for the ConvexDataSync class."""

    def setUp(self):
        """Set up test fixtures."""
        self.convex_client = Mock(spec=ConvexClient)
        self.convex_project_id = "test_project"
        self.dataset_config = DatasetConfig()

        self.convex_data_sync = ConvexDataSync(
            self.convex_client, self.convex_project_id, self.dataset_config
        )

    def test_init(self):
        """Test initialization of ConvexDataSync."""
        self.assertEqual(
            self.convex_data_sync.convex_project_id, self.convex_project_id
        )
        self.assertEqual(self.convex_data_sync.convex_client, self.convex_client)
        self.assertEqual(self.convex_data_sync.dataset_config, self.dataset_config)
        self.assertEqual(
            self.convex_data_sync.id_column_name, self.dataset_config.PRIMARY_KEY_COLUMN
        )
        self.assertEqual(
            self.convex_data_sync.row_order_column_name,
            self.dataset_config.ROW_ORDER_COLUMN,
        )

    @patch("asyncio.to_thread")
    @async_test
    async def test_create_rows(self, mock_to_thread):
        """Test the create_rows method."""
        # Setup mocks
        columns_to_external_column_id = [
            ("col1", "ext_col1_id"),
            ("col2", "ext_col2_id"),
        ]

        rows = [
            {
                "fields": {
                    self.dataset_config.PRIMARY_KEY_COLUMN: 1,
                    self.dataset_config.ROW_ORDER_COLUMN: 1,
                    "col1": "value1",
                    "col2": "value2",
                }
            }
        ]

        self.convex_client.create_row_bulk.return_value = [(1, "ext_row_id_1", 1)]

        # Mock to_thread to directly execute the function
        mock_to_thread.side_effect = lambda fn, *args: fn(*args)

        # Call the method
        result = await self.convex_data_sync.create_rows(
            columns_to_external_column_id, rows
        )

        # Verify the result
        self.assertIsInstance(result, pd.DataFrame)
        self.assertEqual(len(result), 1)
        self.assertEqual(
            list(result.columns),
            [
                self.dataset_config.PRIMARY_KEY_COLUMN,
                self.dataset_config.EXTERNAL_DATASYNC_ROW_COLUMN,
                self.dataset_config.ROW_ORDER_COLUMN,
            ],
        )
        self.assertEqual(result.iloc[0][self.dataset_config.PRIMARY_KEY_COLUMN], 1)
        self.assertEqual(
            result.iloc[0][self.dataset_config.EXTERNAL_DATASYNC_ROW_COLUMN],
            "ext_row_id_1",
        )
        self.assertEqual(result.iloc[0][self.dataset_config.ROW_ORDER_COLUMN], 1)

    @async_test
    async def test_create_columns(self):
        """Test the create_columns method."""
        # Setup test data
        schema = Schema([Column("col1", "string"), Column("col2", "integer")])

        file_metadata = TabularFileMetadata(
            "test_id",
            "test.csv",
            FileType.CSV,
            1024,
            media_columns={"col1": FileType.AUDIO},
        )

        # Mock the create_column method
        self.convex_client.create_column.side_effect = ["ext_col1_id", "ext_col2_id"]

        # Call the method
        result = await self.convex_data_sync.create_columns(schema, file_metadata)

        # Verify the result
        self.assertEqual(len(result), 2)
        self.assertEqual(result[0], ("col1", "ext_col1_id"))
        self.assertEqual(result[1], ("col2", "ext_col2_id"))

        # Verify the client calls
        self.convex_client.create_column.assert_any_call(
            "col1", self.convex_project_id, "audio"
        )
        self.convex_client.create_column.assert_any_call(
            "col2", self.convex_project_id, None
        )

    @async_test
    async def test_create_columns_error(self):
        """Test the create_columns method with an error."""
        # Setup test data
        schema = Schema([Column("col1", "string")])

        file_metadata = TabularFileMetadata("test_id", "test.csv", FileType.CSV, 1024)

        # Mock the create_column method to raise an exception
        self.convex_client.create_column.side_effect = Exception("Test error")

        # Call the method and expect an exception
        with self.assertRaises(ExternalDataSyncColumnError):
            await self.convex_data_sync.create_columns(schema, file_metadata)

    @async_test
    async def test_get_columns(self):
        """Test the get_columns method."""
        # Setup test data
        schema = Schema([Column("col1", "string"), Column("col2", "integer")])

        # Mock the get_columns method
        self.convex_client.get_columns.return_value = [
            {"name": "col1", "id": "ext_col1_id"},
            {"name": "col2", "id": "ext_col2_id"},
        ]

        # Call the method
        result = await self.convex_data_sync.get_columns(schema)

        # Verify the result
        self.assertEqual(len(result), 2)
        self.assertEqual(result[0], ("col1", "ext_col1_id"))
        self.assertEqual(result[1], ("col2", "ext_col2_id"))

        # Verify the client call
        self.convex_client.get_columns.assert_called_once_with(self.convex_project_id)

    @async_test
    async def test_get_columns_missing_column(self):
        """Test the get_columns method with a missing column."""
        # Setup test data
        schema = Schema([Column("col1", "string"), Column("col2", "integer")])

        # Mock the get_columns method to return fewer columns
        self.convex_client.get_columns.return_value = [
            {"name": "col1", "id": "ext_col1_id"}
        ]

        # Call the method and expect an exception
        with self.assertRaises(ValueError):
            await self.convex_data_sync.get_columns(schema)

    @async_test
    async def test_get_columns_extra_column(self):
        """Test the get_columns method with an extra column."""
        # Setup test data
        schema = Schema([Column("col1", "string")])

        # Mock the get_columns method to return extra columns
        self.convex_client.get_columns.return_value = [
            {"name": "col1", "id": "ext_col1_id"},
            {"name": "col2", "id": "ext_col2_id"},
        ]

        # Call the method and expect an exception
        with self.assertRaises(ValueError):
            await self.convex_data_sync.get_columns(schema)


class TestTabularDataProcessor(unittest.TestCase):
    """Tests for the TabularDataProcessor class."""

    def setUp(self):
        """Set up test fixtures."""
        self.config = DatasetConfig()
        self.gcs_helper = Mock(spec=GoogleCloudStorageHelper)
        self.convex_client = Mock(spec=ConvexClient)

        self.processor = TabularDataProcessor(
            self.config, self.gcs_helper, self.convex_client
        )

    def test_init(self):
        """Test initialization of TabularDataProcessor."""
        self.assertEqual(self.processor.config, self.config)
        self.assertEqual(self.processor.gcs_helper, self.gcs_helper)
        self.assertEqual(self.processor.convex_client, self.convex_client)
        self.assertIsNone(self.processor.initial_file_path)
        self.assertIsNone(self.processor.processed_file_path)

    @patch("time.time", return_value=12345)
    @patch("builtins.open", new_callable=mock_open())  # Add this line
    def test_create_from_in_memory_file(self, mock_file, mock_time):
        """Test the create_from_in_memory_file method."""
        file_name = "test.csv"
        file_content = b"col1,col2\nvalue1,value2"

        # Mock the GCS helper and _create_local_dirs
        self.processor._create_local_dirs = Mock(
            return_value=("local/path", "processed/path")
        )

        # Call the method
        self.processor.create_from_in_memory_file(file_name, file_content)

        # Verify the GCS helper call
        self.gcs_helper.upload_file_from_memory.assert_called_once()
        self.assertEqual(self.processor.initial_file_path, "local/path")
        self.assertEqual(self.processor.processed_file_path, "processed/path")

    def test_create_from_pandas_dataframe(self):
        """Test the create_from_pandas_dataframe method."""
        df = pd.DataFrame({"col1": [1, 2], "col2": ["a", "b"]})

        # Mock the _create_local_dirs method
        self.processor._create_local_dirs = Mock(
            return_value=("local/path", "processed/path")
        )

        # Mock the DataFrame.to_parquet method
        with patch.object(pd.DataFrame, "to_parquet") as mock_to_parquet:
            # Call the method
            self.processor.create_from_pandas_dataframe(df)

            # Verify the calls
            mock_to_parquet.assert_called_once_with("local/path")
            self.assertEqual(self.processor.initial_file_path, "local/path")
            self.assertEqual(self.processor.processed_file_path, "processed/path")

    def test_create_from_storage_file(self):
        """Test the create_from_storage_file method."""
        file_id = "test_file_id"

        # Mock the _create_local_dirs method
        self.processor._create_local_dirs = Mock(
            return_value=("local/path", "processed/path")
        )

        # Call the method
        self.processor.create_from_storage_file(file_id)

        # Verify the GCS helper call
        self.gcs_helper.download_file_with_id.assert_called_once_with(
            file_id, "local/path"
        )
        self.assertEqual(self.processor.initial_file_path, "local/path")
        self.assertEqual(self.processor.processed_file_path, "processed/path")

    @patch("os.getenv", return_value="../local_tmp")
    @patch("uuid.uuid4", return_value="test-uuid")
    def test_create_local_dirs(self, mock_uuid, mock_getenv):
        """Test the _create_local_dirs method."""
        # Call the method
        initial_path, processed_path = self.processor._create_local_dirs()

        # Verify the paths
        self.assertEqual(initial_path, "../local_tmp/test-uuid.parquet")
        self.assertEqual(processed_path, "../local_tmp/processed_test-uuid.parquet")

    @patch("os.path.exists", return_value=False)
    def test_validate_file_not_found(self, mock_exists):
        """Test the validate method when the file doesn't exist."""
        file_metadata = TabularFileMetadata("test_id", "test.csv", FileType.CSV, 1024)
        local_path = "/path/to/nonexistent/file"

        # Call the method
        result = self.processor.validate(file_metadata, local_path)

        # Verify the result
        self.assertFalse(result.success)
        self.assertEqual(result.message, "File not found")
        self.assertIn("file_access", result.errors)

    @patch("os.path.exists", return_value=True)
    def test_validate_unsupported_file_type(self, mock_exists):
        """Test the validate method with an unsupported file type."""
        # Create a mock TabularFileMetadata with an invalid file type (hack for test)
        file_metadata = Mock(spec=TabularFileMetadata)
        file_metadata.file_name = "test.unknown"
        file_metadata.file_type = "unknown"  # Not a valid FileType

        local_path = "/path/to/file"

        # Call the method
        result = self.processor.validate(file_metadata, local_path)

        # Verify the result
        self.assertFalse(result.success)
        self.assertIn("Unsupported file type", result.message)
        self.assertIn("file_type", result.errors)

    @patch("os.path.exists", return_value=True)
    def test_validate_csv_validation_error(self, mock_exists):
        """Test the _validate_csv method with validation errors."""
        file_metadata = TabularFileMetadata("test_id", "test.csv", FileType.CSV, 1024)
        local_path = "/path/to/file"

        # Mock the _validate_csv method to return an error
        with patch.object(self.processor, "_validate_csv") as mock_validate_csv:
            mock_validate_csv.return_value = ProcessingResult(
                success=False,
                message="CSV validation failed",
                errors={"parser_error": "Invalid CSV format"},
            )

            # Call the method
            result = self.processor.validate(file_metadata, local_path)

            # Verify the result
            self.assertFalse(result.success)
            self.assertEqual(result.message, "CSV validation failed")
            self.assertIn("parser_error", result.errors)

    @patch("os.path.exists", return_value=True)
    def test_validate_parquet_validation_error(self, mock_exists):
        """Test the _validate_parquet method with validation errors."""
        file_metadata = TabularFileMetadata(
            "test_id", "test.parquet", FileType.PARQUET, 1024
        )
        local_path = "/path/to/file"

        # Mock the _validate_parquet method to return an error
        with patch.object(self.processor, "_validate_parquet") as mock_validate_parquet:
            mock_validate_parquet.return_value = ProcessingResult(
                success=False,
                message="Parquet validation failed",
                errors={"parquet_error": "Invalid Parquet format"},
            )

            # Call the method
            result = self.processor.validate(file_metadata, local_path)

            # Verify the result
            self.assertFalse(result.success)
            self.assertEqual(result.message, "Parquet validation failed")
            self.assertIn("parquet_error", result.errors)

    def test_validate_exception(self):
        """Test the validate method when an exception is raised."""
        file_metadata = TabularFileMetadata("test_id", "test.csv", FileType.CSV, 1024)
        local_path = "/path/to/file"

        # Mock os.path.exists to raise an exception
        with patch("os.path.exists", side_effect=Exception("Test exception")):
            # Call the method
            result = self.processor.validate(file_metadata, local_path)

            # Verify the result
            self.assertFalse(result.success)
            self.assertIn("Validation error", result.message)
            self.assertIn("validation", result.errors)

    @patch("os.path.exists", return_value=True)
    def test_validate_csv_success(self, mock_exists):
        """Test the _validate_csv method with successful validation."""
        file_metadata = TabularFileMetadata("test_id", "test.csv", FileType.CSV, 1024)
        local_path = "/path/to/file"

        # Create a sample DataFrame
        df = pd.DataFrame({"col1": [1, 2], "col2": ["a", "b"]})

        # Mock pd.read_csv to return our sample DataFrame
        with patch("pandas.read_csv", return_value=df):
            # Mock _validate_tabular_data_columns to return no errors
            with patch.object(
                self.processor, "_validate_tabular_data_columns", return_value={}
            ):
                # Call the method
                result = self.processor._validate_csv(file_metadata, local_path)

                # Verify the result
                self.assertTrue(result.success)
                self.assertEqual(result.message, "Validation successful")

    @patch("os.path.exists", return_value=True)
    def test_validate_csv_disallowed_columns(self, mock_exists):
        """Test the _validate_csv method with disallowed columns."""
        file_metadata = TabularFileMetadata("test_id", "test.csv", FileType.CSV, 1024)
        local_path = "/path/to/file"

        # Create a sample DataFrame with a disallowed column
        df = pd.DataFrame(
            {
                self.config.PRIMARY_KEY_COLUMN: [1, 2],  # This is a disallowed column
                "col2": ["a", "b"],
            }
        )

        # Mock pd.read_csv to return our sample DataFrame
        with patch("pandas.read_csv", return_value=df):
            # Call the method
            result = self.processor._validate_csv(file_metadata, local_path)

            # Verify the result
            self.assertFalse(result.success)
            self.assertEqual(result.message, "Validation failed")
            self.assertIn(
                self.processor.DISALLOWED_COLUMN_VALIDATION_ERRORS, result.errors
            )

    @patch("pyarrow.parquet.ParquetFile")
    def test_validate_parquet_success(self, mock_parquet_file):
        """Test the _validate_parquet method with successful validation."""
        file_metadata = TabularFileMetadata(
            "test_id", "test.parquet", FileType.PARQUET, 1024
        )
        local_path = "/path/to/file"

        # Create a sample DataFrame
        df = pd.DataFrame({"col1": [1, 2], "col2": ["a", "b"]})

        # Mock ParquetFile and its methods
        mock_metadata = MagicMock()
        mock_metadata.num_rows = 2
        mock_parquet_file.return_value.metadata = mock_metadata

        mock_table = MagicMock()
        mock_table.to_pandas.return_value = df
        mock_parquet_file.return_value.read_row_group.return_value = mock_table

        # Mock _validate_tabular_data_columns to return no errors
        with patch.object(
            self.processor, "_validate_tabular_data_columns", return_value={}
        ):
            # Call the method
            result = self.processor._validate_parquet(file_metadata, local_path)

            # Verify the result
            self.assertTrue(result.success)
            self.assertEqual(result.message, "Validation successful")
            self.assertEqual(file_metadata.row_count, 2)

    @patch("pyarrow.parquet.ParquetFile")
    def test_validate_parquet_empty(self, mock_parquet_file):
        """Test the _validate_parquet method with an empty file."""
        file_metadata = TabularFileMetadata(
            "test_id", "test.parquet", FileType.PARQUET, 1024
        )
        local_path = "/path/to/file"

        # Create an empty DataFrame
        df = pd.DataFrame()

        # Mock ParquetFile and its methods
        mock_metadata = MagicMock()
        mock_metadata.num_rows = 0
        mock_parquet_file.return_value.metadata = mock_metadata

        mock_table = MagicMock()
        mock_table.to_pandas.return_value = df
        mock_parquet_file.return_value.read_row_group.return_value = mock_table

        # Call the method
        result = self.processor._validate_parquet(file_metadata, local_path)

        # Verify the result
        self.assertFalse(result.success)
        self.assertEqual(result.message, "Validation failed")
        self.assertIn("empty_data", result.errors)

    @patch("pyarrow.parquet.ParquetFile", side_effect=Exception("Test exception"))
    def test_validate_parquet_exception(self, mock_parquet_file):
        """Test the _validate_parquet method when an exception is raised."""
        file_metadata = TabularFileMetadata(
            "test_id", "test.parquet", FileType.PARQUET, 1024
        )
        local_path = "/path/to/file"

        # Call the method
        result = self.processor._validate_parquet(file_metadata, local_path)

        # Verify the result
        self.assertFalse(result.success)
        self.assertEqual(result.message, "Validation failed")
        self.assertIn("parquet_error", result.errors)

    @async_test
    async def test_extract_schema_csv(self):
        """Test extracting schema from a CSV file."""
        file_metadata = TabularFileMetadata("test_id", "test.csv", FileType.CSV, 1024)
        local_path = "/path/to/file"

        # Create a sample DataFrame
        df = pd.DataFrame(
            {
                "int_col": [1, 2, 3],
                "float_col": [1.1, 2.2, 3.3],
                "str_col": ["a", "b", "c"],
                "bool_col": [True, False, True],
                "nullable_col": [1, None, 3],
            }
        )

        # Mock pd.read_csv to return our sample DataFrame
        with patch("pandas.read_csv", return_value=df):
            # Call the method
            schema = await self.processor._extract_schema_csv(file_metadata, local_path)

            # Verify the schema
            self.assertEqual(len(schema.columns), 5)

            # Check column names
            column_names = schema.get_column_names()
            for col_name in df.columns:
                self.assertIn(col_name, column_names)

            # Check data types
            for column in schema.columns:
                if column.name == "int_col":
                    self.assertEqual(column.data_type, "integer")
                elif column.name == "float_col":
                    self.assertEqual(column.data_type, "float")
                elif column.name == "str_col":
                    self.assertEqual(column.data_type, "string")
                elif column.name == "bool_col":
                    self.assertEqual(column.data_type, "boolean")
                elif column.name == "nullable_col":
                    # pandas will infer this as float due to NaN
                    self.assertEqual(column.data_type, "float")
                    self.assertTrue(column.is_nullable)

            # Check primary key
            self.assertEqual(schema.primary_key, self.config.PRIMARY_KEY_COLUMN)

    @async_test
    async def test_extract_schema_csv_structured(self):
        """Structured columns like JSON and XML are detected."""
        file_metadata = TabularFileMetadata("test_id", "test.csv", FileType.CSV, 1024)
        local_path = "/path/to/file"

        df = pd.DataFrame(
            {
                "xml_col": ["<root><a>1</a></root>", "<root><b>2</b></root>"],
                "json_col": ["{\"a\":1}", "{\"b\":2}"],
                "text_col": ["foo", "bar"],
            }
        )

        with patch("pandas.read_csv", return_value=df):
            schema = await self.processor._extract_schema_csv(file_metadata, local_path)

            types = {c.name: c.data_type for c in schema.columns}
            self.assertEqual(types["xml_col"], "xml")
            self.assertEqual(types["json_col"], "json")
            self.assertEqual(types["text_col"], "string")

    @async_test
    async def test_extract_schema_csv_exception(self):
        """Test extracting schema from a CSV file with an exception."""
        file_metadata = TabularFileMetadata("test_id", "test.csv", FileType.CSV, 1024)
        local_path = "/path/to/file"

        # Mock pd.read_csv to raise an exception
        with patch("pandas.read_csv", side_effect=Exception("Test exception")):
            # Call the method and expect an exception
            with self.assertRaises(SchemaExtractionError):
                await self.processor._extract_schema_csv(file_metadata, local_path)

    @async_test
    async def test_extract_schema_parquet(self):
        """Test extracting schema from a Parquet file."""
        local_path = "/path/to/file"

        # Create mock Arrow schema
        pa_schema = pa.schema(
            [
                pa.field("int_col", pa.int64(), nullable=False),
                pa.field("float_col", pa.float64()),
                pa.field("str_col", pa.string()),
                pa.field("bool_col", pa.bool_()),
            ]
        )

        # Mock ParquetFile and its schema_arrow property
        mock_parquet_file = MagicMock()
        mock_parquet_file.schema_arrow = pa_schema

        with patch("pyarrow.parquet.ParquetFile", return_value=mock_parquet_file):
            # Call the method
            schema = await self.processor._extract_schema_parquet(local_path)

            # Verify the schema
            self.assertEqual(len(schema.columns), 4)

            # Check column properties
            for column in schema.columns:
                if column.name == "int_col":
                    self.assertEqual(column.data_type, "integer")
                    self.assertFalse(column.is_nullable)
                elif column.name == "float_col":
                    self.assertEqual(column.data_type, "float")
                    self.assertTrue(column.is_nullable)
                elif column.name == "str_col":
                    self.assertEqual(column.data_type, "string")
                    self.assertTrue(column.is_nullable)
                elif column.name == "bool_col":
                    self.assertEqual(column.data_type, "boolean")
                    self.assertTrue(column.is_nullable)

            # Check primary key
            self.assertEqual(schema.primary_key, self.config.PRIMARY_KEY_COLUMN)

    @async_test
    async def test_extract_schema_parquet_exception(self):
        """Test extracting schema from a Parquet file with an exception."""
        local_path = "/path/to/file"

        # Mock ParquetFile to raise an exception
        with patch(
            "pyarrow.parquet.ParquetFile", side_effect=Exception("Test exception")
        ):
            # Call the method and expect an exception
            with self.assertRaises(SchemaExtractionError):
                await self.processor._extract_schema_parquet(local_path)

    @async_test
    async def test_extract_schema(self):
        """Test the extract_schema method."""
        file_metadata = TabularFileMetadata("test_id", "test.csv", FileType.CSV, 1024)
        local_path = "/path/to/file"

        # Mock the specific extract method based on file type
        with patch.object(self.processor, "_extract_schema_csv") as mock_extract_csv:
            # Set up the mock to return a schema
            mock_extract_csv.return_value = Schema(
                [Column("col1", "string"), Column("col2", "integer")]
            )

            # Call the method
            schema = await self.processor.extract_schema(file_metadata, local_path)

            # Verify the schema
            self.assertEqual(len(schema.columns), 2)
            self.assertEqual(schema.columns[0].name, "col1")
            self.assertEqual(schema.columns[1].name, "col2")

    @async_test
    async def test_extract_schema_unsupported_file_type(self):
        """Test the extract_schema method with an unsupported file type."""
        # Create a mock TabularFileMetadata with an invalid file type (hack for test)
        file_metadata = Mock(spec=TabularFileMetadata)
        file_metadata.file_name = "test.unknown"
        file_metadata.file_type = "unknown"  # Not a valid FileType

        local_path = "/path/to/file"

        # Call the method and expect an exception
        with self.assertRaises(SchemaExtractionError):
            await self.processor.extract_schema(file_metadata, local_path)

    def test_map_pandas_type_to_schema_type(self):
        """Test the _map_pandas_type_to_schema_type method."""
        # Test with various pandas dtypes
        test_cases = [
            (pd.Int64Dtype(), "integer"),
            (pd.Float64Dtype(), "float"),
            (pd.BooleanDtype(), "boolean"),
            (pd.StringDtype(), "string"),
            (pd.DatetimeTZDtype(tz="UTC"), "datetime"),
            (pd.CategoricalDtype(), "categorical"),
            (pd.Int8Dtype(), "integer"),
            (pd.Float32Dtype(), "float"),
            (pd.Int16Dtype(), "integer"),
            (pd.Int32Dtype(), "integer"),
            (pd.UInt8Dtype(), "integer"),
            (pd.UInt16Dtype(), "integer"),
            (pd.UInt32Dtype(), "integer"),
            (pd.UInt64Dtype(), "integer"),
            (pd.Series([1, 2, 3]).dtype, "integer"),
            (pd.Series([1.1, 2.2, 3.3]).dtype, "float"),
            (pd.Series(["a", "b", "c"]).dtype, "string"),
            (pd.Series([True, False, True]).dtype, "boolean"),
        ]

        for dtype, expected_type in test_cases:
            result = self.processor._map_pandas_type_to_schema_type(dtype)
            self.assertEqual(result, expected_type, f"Failed for dtype {dtype}")

    def test_map_arrow_type_to_schema_type(self):
        """Test the _map_arrow_type_to_schema_type method."""
        # Test with various PyArrow types
        test_cases = [
            (pa.int8(), "integer"),
            (pa.int16(), "integer"),
            (pa.int32(), "integer"),
            (pa.int64(), "integer"),
            (pa.uint8(), "integer"),
            (pa.uint16(), "integer"),
            (pa.uint32(), "integer"),
            (pa.uint64(), "integer"),
            (pa.float16(), "float"),
            (pa.float32(), "float"),
            (pa.float64(), "float"),
            (pa.bool_(), "boolean"),
            (pa.string(), "string"),
            (pa.large_string(), "string"),
            (pa.binary(), "binary"),
            (pa.large_binary(), "binary"),
            (pa.date32(), "date"),
            (pa.date64(), "date"),
            (pa.timestamp("s"), "datetime"),
            (pa.time32("s"), "time"),
            (pa.time64("us"), "time"),
            (pa.duration("s"), "duration"),
            (pa.decimal128(10, 2), "decimal"),
            (pa.list_(pa.int32()), "array"),
            (pa.large_list(pa.int32()), "array"),
            (pa.dictionary(pa.int32(), pa.string()), "categorical"),
            (pa.struct([("f1", pa.int32()), ("f2", pa.string())]), "struct"),
            (pa.null(), "null"),
            (
                pa.union(
                    [pa.field("a", pa.int32()), pa.field("b", pa.string())],
                    mode=pa.lib.UnionMode_SPARSE,
                ),
                "union",
            ),
        ]

        for arrow_type, expected_type in test_cases:
            result = self.processor._map_arrow_type_to_schema_type(arrow_type)
            self.assertEqual(
                result, expected_type, f"Failed for arrow_type {arrow_type}"
            )

    @patch("tiktoken.get_encoding")
    def test_extract_data_csv(self, mock_get_encoding):
        """Test the extract_data method with a CSV file."""
        file_metadata = TabularFileMetadata("test_id", "test.csv", FileType.CSV, 1024)
        local_path = "/path/to/file"

        # Create a sample DataFrame
        df = pd.DataFrame(
            {
                "col1": [1, 2, 3],
                "col2": ["a", "b", "c"],
            }
        )

        # Mock pd.read_csv to return our sample DataFrame
        with patch("pandas.read_csv", return_value=df):
            # Mock the tokenizer
            mock_tokenizer = Mock()
            mock_tokenizer.encode.side_effect = lambda x: [1, 2, 3]  # Simulated tokens
            mock_get_encoding.return_value = mock_tokenizer

            # Call the method
            result_df, payloads, token_counts, skipped_columns = (
                self.processor.extract_data(file_metadata, local_path)
            )

            # Verify the result DataFrame
            self.assertEqual(len(result_df), 3)  # 3 rows
            self.assertEqual(
                len(result_df.columns),
                6,  # 2 initial cols, 2 tokenized cols, 2 system cols
            )  # 2 original cols + 2 special cols

            # Check that special columns were added
            self.assertIn(self.config.PRIMARY_KEY_COLUMN, result_df.columns)
            self.assertIn(self.config.ROW_ORDER_COLUMN, result_df.columns)

            # Check that token count columns were added
            tokenized_col1 = f"{self.config.TOKENIZED_PREFIX}_col1"
            tokenized_col2 = f"{self.config.TOKENIZED_PREFIX}_col2"
            self.assertIn(tokenized_col1, result_df.columns)
            self.assertIn(tokenized_col2, result_df.columns)

            # Check the payloads
            self.assertEqual(len(payloads), 3)  # 3 rows
            for i, payload in enumerate(payloads):
                self.assertIn("fields", payload)
                self.assertEqual(
                    len(payload["fields"]), 4
                )  # 2 original cols + 2 special cols
                self.assertEqual(payload["fields"]["col1"], i + 1)
                self.assertEqual(payload["fields"]["col2"], ["a", "b", "c"][i])

            # Check token counts
            self.assertEqual(len(token_counts), 2)  # 2 original columns
            self.assertIn("col1", token_counts)
            self.assertIn("col2", token_counts)

            # Check skipped columns
            self.assertEqual(skipped_columns, [])

    @patch("tiktoken.get_encoding")
    def test_extract_data_parquet(self, mock_get_encoding):
        """Test the extract_data method with a Parquet file."""
        file_metadata = TabularFileMetadata(
            "test_id", "test.parquet", FileType.PARQUET, 1024
        )
        local_path = "/path/to/file"

        # Create a sample DataFrame
        df = pd.DataFrame(
            {
                "col1": [1, 2, 3],
                "col2": ["a", "b", "c"],
            }
        )

        # Mock pd.read_parquet to return our sample DataFrame
        with patch("pandas.read_parquet", return_value=df):
            # Mock the tokenizer
            mock_tokenizer = Mock()
            mock_tokenizer.encode.side_effect = lambda x: [1, 2, 3]  # Simulated tokens
            mock_get_encoding.return_value = mock_tokenizer

            # Call the method
            result_df, payloads, token_counts, skipped_columns = (
                self.processor.extract_data(file_metadata, local_path)
            )

            # Verify the results (same as CSV test)
            self.assertEqual(len(result_df), 3)
            self.assertEqual(
                len(result_df.columns), 6
            )  # 2 original + 2 tokenized + 2 system cols

    @patch("tiktoken.get_encoding")
    def test_extract_data_tokenization_exception(self, mock_get_encoding):
        """Test the extract_data method when tokenization fails for a column."""
        file_metadata = TabularFileMetadata("test_id", "test.csv", FileType.CSV, 1024)
        local_path = "/path/to/file"

        # Create a sample DataFrame
        df = pd.DataFrame(
            {
                "col1": [1, 2, 3],
                "col2": ["a", "b", "c"],
            }
        )

        # Mock pd.read_csv to return our sample DataFrame
        with patch("pandas.read_csv", return_value=df):
            # Set up the mock tokenizer
            mock_tokenizer = Mock()

            # For col1, return a list with 3 tokens (so len will be 3)
            # For col2, raise an exception
            def encode_side_effect(text):
                if text in ["1", "2", "3"]:  # col1 values as strings
                    return [1, 2, 3]  # Return a list that has length 3
                else:
                    raise Exception("Tokenization error")

            mock_tokenizer.encode.side_effect = encode_side_effect
            mock_get_encoding.return_value = mock_tokenizer

            # Call the method
            result_df, payloads, token_counts, skipped_columns = (
                self.processor.extract_data(file_metadata, local_path)
            )

            # Verify skipped columns
            self.assertEqual(skipped_columns, ["col2"])

            # Check token counts (should only have col1)
            self.assertEqual(len(token_counts), 1)
            self.assertIn("col1", token_counts)
            self.assertNotIn("col2", token_counts)

    def test_extract_data_unsupported_file_type(self):
        """Test the extract_data method with an unsupported file type."""
        # Create a mock TabularFileMetadata with an invalid file type (hack for test)
        file_metadata = Mock(spec=TabularFileMetadata)
        file_metadata.file_name = "test.unknown"
        file_metadata.file_type = "unknown"  # Not a valid FileType

        local_path = "/path/to/file"

        # Call the method and expect an exception
        with self.assertRaises(ValueError):
            self.processor.extract_data(file_metadata, local_path)

    @patch("uuid.uuid4", return_value="test-uuid")
    @patch("pandas.DataFrame")
    @patch("pyarrow.Table")  # Patch the class, not the method
    @patch("pyarrow.parquet.write_table")
    @patch("tiktoken.get_encoding")
    def test_create_parquet_file(
        self,
        mock_get_encoding,
        mock_write_table,
        mock_table_class,  # Mock the class
        mock_dataframe,
        mock_uuid,
    ):
        """Test the static create_parquet_file method."""
        # Setup test data
        data_array = [(1, "value1"), (2, "value2"), (3, "value3")]
        column_name = "test_column"
        local_dir = "/path/to/output"

        # Set up the from_pandas class method to return a mock Table
        mock_table = Mock()
        mock_table_class.from_pandas.return_value = mock_table

        # Mock the tokenizer
        mock_tokenizer = Mock()
        mock_tokenizer.encode.side_effect = lambda x: [1, 2, 3]  # Simulated tokens
        mock_get_encoding.return_value = mock_tokenizer

        # Call the method
        result = TabularDataProcessor.create_parquet_file(
            data_array, column_name, local_dir
        )

        # Verify the calls
        mock_dataframe.assert_called_once()
        mock_table_class.from_pandas.assert_called_once()
        mock_write_table.assert_called_once_with(mock_table, local_dir)

        # Verify the result
        self.assertEqual(result, local_dir)

    def test_create_parquet_file_invalid_data(self):
        """Test the static create_parquet_file method with invalid data."""
        # Setup invalid test data (not tuples)
        data_array = [[1, "value1"], [2, "value2"]]
        column_name = "test_column"
        local_dir = "/path/to/output"

        # Call the method and expect an exception
        with self.assertRaises(ValueError):
            TabularDataProcessor.create_parquet_file(data_array, column_name, local_dir)

    def test_create_parquet_file_tuples_wrong_length(self):
        """Test the static create_parquet_file method with tuples of wrong length."""
        # Setup invalid test data (tuples with wrong length)
        data_array = [(1, "value1", "extra"), (2, "value2", "extra")]
        column_name = "test_column"
        local_dir = "/path/to/output"

        # Call the method and expect an exception
        with self.assertRaises(ValueError):
            TabularDataProcessor.create_parquet_file(data_array, column_name, local_dir)

    def test_is_csv_file_with_sniffer_failure(self):
        """_is_csv_file should fall back to pandas when Sniffer fails."""
        from folio.utils.dataset_processor.file_utils import _is_csv_file

        complex_xml = (
            "<root><transcript><header><ticker>AAPL</ticker>"
            "<date>2025-06-07</date></header><body><section>"
            "<p>This is <b>bold</b> text with <i>italic</i> &amp; special characters.</p>"
            "<csv_data>name,age,city\nJohn,25,NYC\nJane,30,LA</csv_data>"
            "<code><![CDATA[<foo>bar</foo> & more]]></code>"
            "</section></body></transcript></root>"
        )
        csv_content = f"ticker,xml\nAAPL,\"{complex_xml}\"\n"
        with tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False) as f:
            f.write(csv_content)
            temp_path = f.name

        with patch("csv.Sniffer.sniff", side_effect=csv.Error):
            self.assertTrue(_is_csv_file(temp_path))

        os.remove(temp_path)

    def test_is_csv_file_handles_parser_errors_with_fallback(self):
        """_is_csv_file should still return True when pandas raises."""
        from folio.utils.dataset_processor.file_utils import _is_csv_file

        csv_content = "ticker,price\nAAPL,190\n"
        with tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False) as f:
            f.write(csv_content)
            temp_path = f.name

        with patch("csv.Sniffer.sniff", side_effect=csv.Error), patch(
            "pandas.read_csv", side_effect=pd.errors.ParserError("boom")
        ):
            self.assertTrue(_is_csv_file(temp_path))

        os.remove(temp_path)

    def test_detect_file_type_extension_fallback(self):
        """_detect_file_type should use the file extension if sniffing fails."""
        from folio.utils.dataset_processor.file_utils import _detect_file_type

        complex_xml = (
            "<root><transcript><header><ticker>AAPL</ticker>"
            "<date>2025-06-07</date></header><body><section>"
            "<p>This is <b>bold</b> text with <i>italic</i> &amp; special characters.</p>"
            "<csv_data>name,age,city\nJohn,25,NYC\nJane,30,LA</csv_data>"
            "<code><![CDATA[<foo>bar</foo> & more]]></code>"
            "</section></body></transcript></root>"
        )
        csv_content = f"ticker,xml\nAAPL,\"{complex_xml}\"\n"
        with tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False) as f:
            f.write(csv_content)
            temp_path = f.name

        with patch("folio.utils.dataset_processor.file_utils._is_csv_file", return_value=False):
            detected = _detect_file_type(temp_path)
            self.assertEqual(detected, FileType.CSV)

        os.remove(temp_path)

    def test_is_csv_file_with_commas_in_xml(self):
        """Complex HTML content still counts as CSV after fallback heuristics."""
        from folio.utils.dataset_processor.file_utils import _is_csv_file

        complex_xml_with_comma = (
            "<root><transcript><header><ticker>AAPL</ticker>"
            "<date>2025-06-07</date></header><body><section>"
            "<p>First, this section contains, multiple commas, and <b>tags</b>.</p>"
            "<csv_data>name,age,city\nJohn,25,NYC\nJane,30,LA</csv_data>"
            "<code><![CDATA[<foo attr=\"bar,baz\">value</foo>]]></code>"
            "</section></body></transcript></root>"
        )
        csv_content = f"ticker,xml\nAAPL,\"{complex_xml_with_comma}\"\n"
        with tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False) as f:
            f.write(csv_content)
            temp_path = f.name

        with patch("csv.Sniffer.sniff", side_effect=csv.Error):
            self.assertTrue(_is_csv_file(temp_path))

        os.remove(temp_path)

    def test_is_csv_file_large_xml_exceeding_sample(self):
        """Detection succeeds when the first row exceeds the sample size."""
        from folio.utils.dataset_processor.file_utils import _is_csv_file

        long_xml = "<root>" + ("A" * 3000) + "</root>"
        csv_content = f"id,xml\n1,\"{long_xml}\"\n"
        with tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False) as f:
            f.write(csv_content)
            temp_path = f.name

        # No patching: sniffer should fail on truncated sample but fallback should succeed
        self.assertTrue(_is_csv_file(temp_path))

        os.remove(temp_path)

    def test_validate_csv_with_commas_in_xml(self):
        """_validate_csv should parse XML columns containing commas."""
        file_metadata = TabularFileMetadata("test_id", "test.csv", FileType.CSV, 1024)
        complex_xml_with_comma = (
            "<root><transcript><header><ticker>AAPL</ticker>"
            "<date>2025-06-07</date></header><body><section>"
            "<p>First, this section contains, multiple commas, and <b>tags</b>.</p>"
            "<csv_data>name,age,city\nJohn,25,NYC\nJane,30,LA</csv_data>"
            "<code><![CDATA[<foo attr=\"bar,baz\">value</foo>]]></code>"
            "</section></body></transcript></root>"
        )

        df = pd.DataFrame({"ticker": ["AAPL"], "xml": [complex_xml_with_comma]})

        def fake_read_csv(*args, **kwargs):
            if kwargs.get("engine") == "python":
                return df
            raise pd.errors.ParserError("mock fail")

        with patch("pandas.read_csv", side_effect=fake_read_csv):
            with patch.object(self.processor, "_validate_tabular_data_columns", return_value={}):
                result = self.processor._validate_csv(file_metadata, "temp.csv")
                self.assertTrue(result.success)

    def test_is_csv_file_with_nested_csv_in_xml(self):
        """XML containing CSV data should not break detection."""
        from folio.utils.dataset_processor.file_utils import _is_csv_file

        nested_xml = (
            "<config><data_table>product,price\nApple,1.99\nOrange,2.49</data_table></config>"
        )
        csv_content = f"id,xml\n1,\"{nested_xml}\"\n"
        with tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False) as f:
            f.write(csv_content)
            temp_path = f.name

        with patch("csv.Sniffer.sniff", side_effect=csv.Error):
            self.assertTrue(_is_csv_file(temp_path))

        os.remove(temp_path)

    def test_validate_csv_with_nested_csv_in_xml(self):
        """_validate_csv handles XML fields that embed CSV tables."""
        file_metadata = TabularFileMetadata("test_id", "test.csv", FileType.CSV, 1024)
        nested_xml = (
            "<config><data_table>product,price\nApple,1.99\nOrange,2.49</data_table></config>"
        )

        df = pd.DataFrame({"id": [1], "xml": [nested_xml]})

        def fake_read_csv(*args, **kwargs):
            if kwargs.get("engine") == "python":
                return df
            raise pd.errors.ParserError("mock fail")

        with patch("pandas.read_csv", side_effect=fake_read_csv):
            with patch.object(self.processor, "_validate_tabular_data_columns", return_value={}):
                result = self.processor._validate_csv(file_metadata, "temp.csv")
                self.assertTrue(result.success)

    def test_read_csv_fallback_sets_field_size_limit(self):
        """_read_csv_with_fallback should raise field size limit for large fields."""
        with patch("pandas.read_csv", side_effect=[pd.errors.ParserError("bad"), pd.DataFrame({"a": [1]})]) as mock_read:
            with patch("csv.field_size_limit") as mock_limit:
                df = self.processor._read_csv_with_fallback("dummy.csv")
                mock_limit.assert_called()
                self.assertFalse(df.empty)

    def test_validate_csv_with_wide_row(self):
        """_validate_csv can handle extremely wide single-row CSVs."""
        file_metadata = TabularFileMetadata("test_id", "wide.csv", FileType.CSV, 1024)
        headers = [f"col_{i}" for i in range(200)]
        df = pd.DataFrame({h: ["val"] for h in headers})

        with patch("pandas.read_csv", return_value=df):
            with patch.object(self.processor, "_validate_tabular_data_columns", return_value={}):
                result = self.processor._validate_csv(file_metadata, "wide.csv")
                self.assertTrue(result.success)



# Run the tests if the script is executed directly
if __name__ == "__main__":
    unittest.main()

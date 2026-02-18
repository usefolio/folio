import os
import pytest
import pandas as pd
import duckdb
from unittest.mock import MagicMock, patch
import uuid
from datetime import datetime
import io


from folio.utils.shared_types.shared_types import DatasetConfig
from folio.utils.shared_types.shared_types import DuckDbErrorPayload
from folio.utils.dataset_processor.dataset_processor import (
    TabularDataProcessor,
    FileType,
    TabularFileMetadata,
)
from data_lakehouse import (
    InMemoryDuckDbLakeHouse,
    OutOfMemoryDuckDbLakeHouse,
    ColumnAlreadyExists,
    ColumnDoesNotExist,
    SchemaMismatchOnColumnUpdate,
    DuckDbQueryExecutionError,
    DUCKDB_QUERY_ERROR_CODE,
)

# Constants for testing
TEST_DIR = "test_tmp"
PROJECT_NAME = "test_project"


@pytest.fixture(scope="function")
def setup_test_directory():
    """Create and clean up test directory for parquet files."""
    os.makedirs(TEST_DIR, exist_ok=True)
    yield
    # Clean up test files after test
    for file in os.listdir(TEST_DIR):
        file_path = os.path.join(TEST_DIR, file)
        if os.path.isfile(file_path):
            os.remove(file_path)
    if os.path.exists(TEST_DIR):
        os.rmdir(TEST_DIR)


@pytest.fixture
def mock_gcs_helper():
    """Create a mock for GoogleCloudStorageHelper."""
    mock_helper = MagicMock()

    # Configure list_existing_ids to return existing IDs
    mock_helper.list_existing_ids.return_value = [1]

    # Configure upload_file to succeed
    mock_helper.upload_file = MagicMock(return_value=True)
    mock_helper.upload_file_from_memory = MagicMock(return_value=True)

    return mock_helper


@pytest.fixture
def mock_convex_client():
    """Create a mock for ConvexClient."""
    mock_client = MagicMock()

    # Mock methods used by TabularDataProcessor
    mock_client.create_column = MagicMock(return_value="column-id-123")
    mock_client.get_columns = MagicMock(
        return_value=[{"id": "column-id-123", "name": "test_column"}]
    )

    return mock_client


@pytest.fixture
def data_processor(mock_gcs_helper, mock_convex_client):
    """Create a TabularDataProcessor instance."""
    config = DatasetConfig()
    return TabularDataProcessor(config, mock_gcs_helper, mock_convex_client)


@pytest.fixture
def test_datasets(setup_test_directory, data_processor):
    """Create real test datasets using TabularDataProcessor."""
    datasets = {}

    # Create base data DataFrame
    base_df = pd.DataFrame(
        {
            "id": [1001, 1002, 1003],
            "name": ["Alice", "Bob", "Charlie"],
            "score": [85, 92, 78],
        }
    )

    # Create the main dataset
    base_file = os.path.join(TEST_DIR, "base_data.parquet")
    base_df.to_parquet(base_file)

    # Create file metadata
    base_metadata = TabularFileMetadata(
        file_id="base-data",
        file_name="base_data.parquet",
        file_type=FileType.PARQUET,
        file_size=os.path.getsize(base_file),
    )

    # Process base data using the processor
    with patch.object(data_processor, "processed_file_path", base_file):
        with patch.object(data_processor, "initial_file_path", base_file):
            # Extract schema to prepare for processing
            schema = pytest.run_awaitable(
                data_processor.extract_schema(base_metadata, base_file)
            )

            # Process the data
            df, payloads, token_counts, skipped = data_processor.extract_data(
                base_metadata, base_file
            )

            # Save processed data
            main_data_file = os.path.join(TEST_DIR, "data.parquet")
            df.to_parquet(main_data_file)
            datasets["_folio_data"] = main_data_file

    # Create language column data
    language_data = [(1, "English"), (2, "Spanish"), (3, "French")]
    language_file = os.path.join(TEST_DIR, "language_column.parquet")
    TabularDataProcessor.create_parquet_file(language_data, "language", language_file)
    datasets["language"] = language_file

    # Create sentiment column data
    sentiment_data = [(1, "Positive"), (2, "Negative")]
    sentiment_file = os.path.join(TEST_DIR, "sentiment_column.parquet")
    TabularDataProcessor.create_parquet_file(
        sentiment_data, "sentiment", sentiment_file
    )
    datasets["sentiment"] = sentiment_file

    # Create data for updating sentiment
    sentiment_update_data = [(3, "Neutral"), (4, "Very Positive")]
    sentiment_update_file = os.path.join(TEST_DIR, "sentiment_update.parquet")
    TabularDataProcessor.create_parquet_file(
        sentiment_update_data, "sentiment", sentiment_update_file
    )
    datasets["sentiment_update"] = sentiment_update_file

    # Create data with mismatched schema
    schema_mismatch_data = [(1, "Value1"), (2, "Value2")]
    schema_mismatch_file = os.path.join(TEST_DIR, "wrong_schema.parquet")
    TabularDataProcessor.create_parquet_file(
        schema_mismatch_data, "different_field", schema_mismatch_file
    )
    datasets["wrong_schema"] = schema_mismatch_file

    # Create empty column for new columns
    empty_data = []
    empty_file = os.path.join(TEST_DIR, "empty_column.parquet")
    TabularDataProcessor.create_parquet_file(empty_data, "new_column", empty_file)
    datasets["empty_column"] = empty_file

    return datasets


@pytest.fixture
def setup_gcs_paths(test_datasets, mock_gcs_helper):
    """Configure the GCS helper with the test datasets."""
    # Map of GCS paths to local paths
    gcs_to_local = {
        f"{PROJECT_NAME}/data.parquet": test_datasets["_folio_data"],
        f"{PROJECT_NAME}/language/2025-03-28/1.parquet": test_datasets["language"],
        f"{PROJECT_NAME}/sentiment/2025-03-28/1.parquet": test_datasets["sentiment"],
    }

    # Configure list_files to return appropriate files
    mock_gcs_helper.list_files.return_value = list(gcs_to_local.keys())

    # Configure download_files_in_parallel
    mock_gcs_helper.download_files_in_parallel.return_value = (TEST_DIR, gcs_to_local)

    return gcs_to_local


@pytest.fixture
def in_memory_lakehouse(mock_gcs_helper, setup_gcs_paths):
    """Create an InMemoryDuckDbLakeHouse instance."""
    return InMemoryDuckDbLakeHouse(mock_gcs_helper, PROJECT_NAME)


@pytest.fixture
def out_of_memory_lakehouse(mock_gcs_helper, setup_gcs_paths):
    """Create an OutOfMemoryDuckDbLakeHouse instance."""
    # Mock the environment variable needed by OutOfMemoryDuckDbLakeHouse
    with patch.dict("os.environ", {"ENV": "test"}):
        return OutOfMemoryDuckDbLakeHouse(mock_gcs_helper, PROJECT_NAME)


# Common test functions that work with both implementations
def test_get_column_folders(in_memory_lakehouse):
    """Test that get_column_folders returns the correct columns."""
    columns = in_memory_lakehouse.get_column_folders()
    assert set(columns) == {"language", "sentiment", "_folio_data"}


def test_generate_join_query(in_memory_lakehouse):
    """Test that the generated join query includes all columns."""
    query = in_memory_lakehouse.generate_join_across_all_cols()

    # Check that all columns are included in the join
    assert '"language"' in query
    assert '"sentiment"' in query
    assert "_folio_data" in query

    # Check key query components
    assert "LEFT JOIN" in query
    assert f"_folio_data.{DatasetConfig.PRIMARY_KEY_COLUMN}" in query
    assert "ORDER BY" in query
    assert "limit 10" in query


def test_generate_anti_join_query(in_memory_lakehouse):
    """Test that the anti-join query is generated correctly."""
    query = in_memory_lakehouse.generate_anti_join_for_specific_column("language")

    # Check the structure of the anti-join query
    assert "WITH existing as" in query
    assert "anti join existing" in query
    assert f"using ({DatasetConfig.PRIMARY_KEY_COLUMN})" in query


def test_claim_column(in_memory_lakehouse, test_datasets):
    """Test claiming a new column."""
    # Mock the necessary methods
    in_memory_lakehouse.gcs_helper.upload_file = MagicMock()
    in_memory_lakehouse._create_filename_for_column = MagicMock(
        return_value=(
            test_datasets["empty_column"],
            f"{PROJECT_NAME}/new_column/2025-03-28/1.parquet",
        )
    )

    # Mock get_columns to ensure the new column doesn't appear to exist yet
    original_get_columns = in_memory_lakehouse.get_columns
    in_memory_lakehouse.get_columns = MagicMock(
        return_value=[c for c in original_get_columns() if c != "new_column"]
    )

    # Claim the column
    in_memory_lakehouse.claim_column("new_column")

    # Verify column was added
    in_memory_lakehouse.get_columns = original_get_columns  # Restore original method
    assert "new_column" in in_memory_lakehouse.get_column_folders()

    # Verify upload was called
    in_memory_lakehouse.gcs_helper.upload_file.assert_called_once()


# # Tests specific to InMemoryDuckDbLakeHouse
class TestInMemoryDuckDbLakeHouse:
    def test_initialization(self, in_memory_lakehouse, setup_gcs_paths):
        """Test that the InMemoryDuckDbLakeHouse is initialized correctly."""

        # Check that initial files are correctly identified
        assert set(in_memory_lakehouse.initial_files.keys()) == {
            "language",
            "sentiment",
            "_folio_data",
        }

        # Check that new_files includes the local paths
        for column, files in in_memory_lakehouse.new_files.items():
            for file in files:
                assert os.path.exists(file)

        # Check that tables are created in DuckDB
        tables = in_memory_lakehouse.run_sql("SHOW TABLES")
        table_names = [row[0] for row in tables]
        assert set(table_names) == {"language", "sentiment", "_folio_data"}

    def test_datasets_initialized_correctly(self, in_memory_lakehouse):
        """Test that the datasets are initialized correctly in the database."""
        # Check that the data in the 'data' table matches expected values
        result = in_memory_lakehouse.run_sql(
            f"SELECT {DatasetConfig.PRIMARY_KEY_COLUMN} FROM language ORDER BY {DatasetConfig.PRIMARY_KEY_COLUMN}"
        )

        # Verify we have at least 3 records from our test data
        assert len(result) >= 3

        # Check specific values to ensure correct initialization
        assert result[0][0] == 1
        assert result[1][0] == 2
        assert result[2][0] == 3

    def test_run_sql_query(self, in_memory_lakehouse):
        """Test running SQL queries on the in-memory database."""
        # Simple query to get data from a single table
        result = in_memory_lakehouse.run_sql(
            f"SELECT * FROM _folio_data ORDER BY {DatasetConfig.PRIMARY_KEY_COLUMN}"
        )
        assert len(result) >= 3  # At least our 3 test records

        pk_col_index = None
        name_col_index = None
        id_col_index = None

        # Find column indices dynamically
        columns_query = in_memory_lakehouse.run_sql(
            f"DESCRIBE SELECT * FROM _folio_data"
        )
        for i, col_info in enumerate(columns_query):
            if col_info[0] == DatasetConfig.PRIMARY_KEY_COLUMN:
                pk_col_index = i
            elif col_info[0] == "name":
                name_col_index = i
            elif col_info[0] == "id":
                id_col_index = i

        assert (
            pk_col_index is not None
        ), f"Could not find {DatasetConfig.PRIMARY_KEY_COLUMN} column"
        assert name_col_index is not None, "Could not find name column"

        # Test with the identified indices
        assert result[0][pk_col_index] == 1  # _folio_internal_id
        assert result[0][id_col_index] == 1001  # id
        assert result[0][name_col_index] == "Alice"  # name

        # Join query across tables using correct columns
        query = f"""
        SELECT
            _folio_data.{DatasetConfig.PRIMARY_KEY_COLUMN},
            _folio_data.name,
            language.language,
            sentiment.sentiment
        FROM _folio_data
        LEFT JOIN language ON language.{DatasetConfig.PRIMARY_KEY_COLUMN} = _folio_data.{DatasetConfig.PRIMARY_KEY_COLUMN}
        LEFT JOIN sentiment ON sentiment.{DatasetConfig.PRIMARY_KEY_COLUMN} = _folio_data.{DatasetConfig.PRIMARY_KEY_COLUMN}
        ORDER BY _folio_data.{DatasetConfig.PRIMARY_KEY_COLUMN}
        """
        result = in_memory_lakehouse.run_sql(query)
        assert len(result) >= 3

        # Verify the joined data
        assert result[0][0] == 1  # ID
        assert result[0][1] == "Alice"  # name
        assert result[0][2] == "English"  # language
        assert result[0][3] == "Positive"  # sentiment

        # Third row should have null sentiment (because id=1003 is missing from sentiment table)
        assert result[2][0] == 3  # _folio_internal_id
        assert result[2][3] is None  # sentiment is null

    def test_add_column(self, in_memory_lakehouse, test_datasets):
        """Test adding a new column to the database."""
        # Add a new column
        in_memory_lakehouse._add_column(
            "new_column", [test_datasets["sentiment_update"]]
        )

        # Verify the column was added
        tables = in_memory_lakehouse.run_sql("SHOW TABLES")
        table_names = [row[0] for row in tables]
        assert "new_column" in table_names

        # Check data in the new column using the correct column name
        result = in_memory_lakehouse.run_sql(
            f'SELECT * FROM "new_column" ORDER BY {DatasetConfig.PRIMARY_KEY_COLUMN}'
        )

        # Find column indices
        columns_query = in_memory_lakehouse.run_sql(
            f'DESCRIBE SELECT * FROM "new_column"'
        )
        pk_col_index = None
        value_col_index = None

        for i, col_info in enumerate(columns_query):
            if col_info[0] == DatasetConfig.PRIMARY_KEY_COLUMN:
                pk_col_index = i
            elif col_info[0] == "sentiment":
                value_col_index = i

        assert (
            pk_col_index is not None
        ), f"Could not find {DatasetConfig.PRIMARY_KEY_COLUMN} column"
        assert value_col_index is not None, "Could not find sentiment column"

        assert len(result) == 2
        assert result[0][pk_col_index] == 3  # _folio_internal_id
        assert result[0][value_col_index] == "Neutral"  # sentiment

    def test_update_column(self, in_memory_lakehouse, test_datasets):
        """Test updating an existing column."""
        # Update the sentiment column
        in_memory_lakehouse._update_column(
            "sentiment", [test_datasets["sentiment_update"]]
        )

        # Verify the column was updated with a direct query
        query = f"""
        SELECT
            _folio_data.{DatasetConfig.PRIMARY_KEY_COLUMN},
            sentiment.sentiment
        FROM _folio_data
        LEFT JOIN sentiment ON sentiment.{DatasetConfig.PRIMARY_KEY_COLUMN} = _folio_data.{DatasetConfig.PRIMARY_KEY_COLUMN}
        ORDER BY _folio_data.{DatasetConfig.PRIMARY_KEY_COLUMN}
        """
        result = in_memory_lakehouse.run_sql(query)
        assert len(result) >= 3

        # Check that id=1003 now has a sentiment
        assert result[2][0] == 3  # _folio_internal_id
        assert result[2][1] == "Neutral"

    def test_schema_mismatch_error(self, in_memory_lakehouse, test_datasets):
        """Test that updating a column with a mismatched schema raises an error."""
        with pytest.raises(SchemaMismatchOnColumnUpdate):
            in_memory_lakehouse._update_column(
                "sentiment", [test_datasets["wrong_schema"]]
            )

    def test_column_already_exists_error(self, in_memory_lakehouse, test_datasets):
        """Test that adding a column that already exists raises an error."""
        with pytest.raises(ColumnAlreadyExists):
            in_memory_lakehouse._add_column("sentiment", [test_datasets["sentiment"]])

    def test_get_last_id(self, in_memory_lakehouse):
        """Test getting the last ID from the database."""
        # Modify the method to avoid circular reference
        with patch.object(in_memory_lakehouse, "conn") as mock_conn:
            mock_execute = MagicMock()
            mock_conn.execute.return_value = mock_execute
            mock_execute.fetchall.return_value = [(1003,)]

            # Call get_last_id with a patched conn to avoid circular reference
            last_id = in_memory_lakehouse.get_last_id()
            assert last_id == 1003

    def test_add_data_to_column(self, in_memory_lakehouse, test_datasets):
        """Test adding data to an existing column."""
        # Mock the necessary methods
        in_memory_lakehouse._create_filename_for_column = MagicMock(
            return_value=(
                test_datasets["sentiment_update"],
                f"{PROJECT_NAME}/sentiment/2025-03-28/2.parquet",
            )
        )
        in_memory_lakehouse._update_column = MagicMock()

        # Add data to column
        data_array = [(1003, "Neutral"), (1004, "Very Positive")]
        result = in_memory_lakehouse.add_data_to_column("sentiment", data_array)

        # Verify results
        assert result[0] == test_datasets["sentiment_update"]
        assert result[1] == f"{PROJECT_NAME}/sentiment/2025-03-28/2.parquet"

        # Verify methods were called
        in_memory_lakehouse.gcs_helper.upload_file.assert_called_once()
        in_memory_lakehouse._update_column.assert_called_once()

    def test_run_sql_wraps_duckdb_errors(self, in_memory_lakehouse):
        """Test that local DuckDB errors are surfaced with a stable error code."""
        with pytest.raises(DuckDbQueryExecutionError) as excinfo:
            in_memory_lakehouse.run_sql("SELECT * FROM does_not_exist")

        assert excinfo.value.error_code == DUCKDB_QUERY_ERROR_CODE
        assert excinfo.value.error_type is not None
        assert excinfo.value.query == "SELECT * FROM does_not_exist"


# Tests specific to OutOfMemoryDuckDbLakeHouse
class TestOutOfMemoryDuckDbLakeHouse:
    def test_get_last_id(self, out_of_memory_lakehouse, test_datasets):
        """Test getting the last ID by patching run_sql and creating a dataset."""
        from unittest.mock import patch

        # Expected SQL result
        sql_result = [(1003,)]

        # Patch the run_sql method
        with patch.object(
            out_of_memory_lakehouse.__class__, "_run_sql", autospec=True
        ) as mock_run_sql:
            # Configure the mock to return our test result
            mock_run_sql.return_value = sql_result

            try:
                # Create a dataset to ensure there's data
                out_of_memory_lakehouse._create_filename = MagicMock(
                    return_value=(
                        test_datasets["_folio_data"],
                        f"{PROJECT_NAME}/data/test.parquet",
                    )
                )
                out_of_memory_lakehouse.gcs_helper.upload_file = MagicMock()
                out_of_memory_lakehouse.create_dataset_file(
                    PROJECT_NAME, test_datasets["_folio_data"]
                )

                # Call get_last_id
                last_id = out_of_memory_lakehouse.get_last_id()

                # Verify the result is what we expect
                assert last_id == 1003

                # Verify that run_sql was called with the correct SQL query
                mock_run_sql.assert_called_once()
                call_args = mock_run_sql.call_args[0]
                sql_query = call_args[1]
                assert (
                    f"select MAX({DatasetConfig.PRIMARY_KEY_COLUMN})".lower()
                    in sql_query.lower()
                )

            finally:
                # No need to restore the original run_sql as the patch context manager does this automatically
                pass

    def test_get_column_folders(self, out_of_memory_lakehouse):
        """Test getting column folders for out-of-memory database."""
        # This test is already good as it doesn't use remote query execution
        columns = out_of_memory_lakehouse.get_column_folders()
        assert set(columns) == {"language", "sentiment", "_folio_data"}

    def test_run_sql_maps_structured_duckdb_errors(
        self, out_of_memory_lakehouse
    ):
        """Test structured DuckDB errors are converted to DuckDbQueryExecutionError."""
        payload = {
            "error_code": DUCKDB_QUERY_ERROR_CODE,
            "error_type": "ParserException",
            "message": "syntax error at or near \"FROM\"",
            "query": "SELECT FROM",
        }
        remote_exception = RuntimeError(
            DuckDbErrorPayload(**payload).model_dump_json()
        )

        mock_query_fn = MagicMock()
        mock_query_fn.remote.side_effect = remote_exception

        with patch(
            "data_lakehouse.data_lakehouse._modal_function_from_known_app_names",
            return_value=mock_query_fn,
        ):
            with pytest.raises(DuckDbQueryExecutionError) as excinfo:
                out_of_memory_lakehouse._run_sql("SELECT FROM")

        assert excinfo.value.error_code == DUCKDB_QUERY_ERROR_CODE
        assert excinfo.value.error_type == "ParserException"
        assert excinfo.value.query == "SELECT FROM"

    def test_run_sql_does_not_wrap_non_structured_remote_errors(
        self, out_of_memory_lakehouse
    ):
        """Test non-DuckDB remote errors are propagated unchanged."""
        mock_query_fn = MagicMock()
        mock_query_fn.remote.side_effect = RuntimeError("remote transport failed")

        with patch(
            "data_lakehouse.data_lakehouse._modal_function_from_known_app_names",
            return_value=mock_query_fn,
        ):
            with pytest.raises(RuntimeError, match="remote transport failed"):
                out_of_memory_lakehouse._run_sql("SELECT 1")

    def test_run_sql_maps_returned_duckdb_error_payload(
        self, out_of_memory_lakehouse
    ):
        """Test returned DuckDB error payloads are converted to DuckDbQueryExecutionError."""
        mock_query_fn = MagicMock()
        mock_query_fn.remote.return_value = DuckDbErrorPayload(
            error_code=DUCKDB_QUERY_ERROR_CODE,
            error_type="BinderException",
            message='Referenced column "foo" not found',
            query="SELECT foo FROM bar",
        )

        with patch(
            "data_lakehouse.data_lakehouse._modal_function_from_known_app_names",
            return_value=mock_query_fn,
        ):
            with pytest.raises(DuckDbQueryExecutionError) as excinfo:
                out_of_memory_lakehouse._run_sql("SELECT foo FROM bar")

        assert excinfo.value.error_code == DUCKDB_QUERY_ERROR_CODE
        assert excinfo.value.error_type == "BinderException"
        assert excinfo.value.query == "SELECT foo FROM bar"

    def test_get_columns(self, out_of_memory_lakehouse):
        """Test getting columns via remote query function."""
        # Expected result
        expected_columns = [
            (DatasetConfig.PRIMARY_KEY_COLUMN, "INTEGER", "NO"),
            (DatasetConfig.ROW_ORDER_COLUMN, "INTEGER", "NO"),
            ("name", "VARCHAR", "NO"),
            ("score", "INTEGER", "NO"),
        ]

        # Mock the get_columns method
        original_get_columns = out_of_memory_lakehouse.get_columns

        def mock_get_columns(self):
            return [
                "language",
                "sentiment",
                "_folio_data",
                DatasetConfig.PRIMARY_KEY_COLUMN,
                DatasetConfig.ROW_ORDER_COLUMN,
                "name",
                "score",
            ]

        # Also mock run_sql which would be called by get_columns
        original_run_sql = out_of_memory_lakehouse.run_sql

        def mock_run_sql(self, stmt):
            return expected_columns

        # Replace the methods with our mocks
        out_of_memory_lakehouse.__class__.get_columns = mock_get_columns
        out_of_memory_lakehouse.__class__.run_sql = mock_run_sql

        try:
            # Call the method
            columns = out_of_memory_lakehouse.get_columns()

            # Verify result
            assert set(columns) == {
                "language",
                "sentiment",
                "_folio_data",
                DatasetConfig.PRIMARY_KEY_COLUMN,
                DatasetConfig.ROW_ORDER_COLUMN,
                "name",
                "score",
            }

        finally:
            # Restore the original methods
            out_of_memory_lakehouse.__class__.get_columns = original_get_columns
            out_of_memory_lakehouse.__class__.run_sql = original_run_sql

    def test_claim_column(self, out_of_memory_lakehouse):
        """Test claiming a column in out-of-memory database."""
        from unittest.mock import patch
        import pytest

        # Mock TabularDataProcessor.create_parquet_file directly
        with patch(
            "folio.utils.dataset_processor.dataset_processor.TabularDataProcessor.create_parquet_file"
        ) as mock_create_parquet:
            # Mock the dependent methods
            out_of_memory_lakehouse._add_column = MagicMock()
            out_of_memory_lakehouse.gcs_helper.upload_file = MagicMock()

            # Save original get_columns
            original_get_columns = out_of_memory_lakehouse.get_columns

            try:
                # Test 1: New column creation
                # Configure get_columns to return a list not containing "new_column"
                out_of_memory_lakehouse.get_columns = MagicMock(
                    return_value=["existing_column"]
                )

                # Mock _create_filename_for_column
                out_of_memory_lakehouse._create_filename_for_column = MagicMock(
                    return_value=(
                        os.path.join(TEST_DIR, "new_column.parquet"),
                        f"{PROJECT_NAME}/new_column/2025-03-28/2.parquet",
                    )
                )

                # Claim a column
                result = out_of_memory_lakehouse.claim_column("new_column")

                # Verify the result
                assert result[0] == os.path.join(TEST_DIR, "new_column.parquet")
                assert result[1] == f"{PROJECT_NAME}/new_column/2025-03-28/2.parquet"

                # Verify methods were called
                mock_create_parquet.assert_called_once()
                out_of_memory_lakehouse._add_column.assert_called_once()
                out_of_memory_lakehouse.gcs_helper.upload_file.assert_called_once()

                # Test 2: Attempting to claim an existing column
                # Reset mocks for the second test
                mock_create_parquet.reset_mock()
                out_of_memory_lakehouse._add_column.reset_mock()
                out_of_memory_lakehouse.gcs_helper.upload_file.reset_mock()

                # Configure get_columns to return a list containing "existing_column"
                out_of_memory_lakehouse.get_columns = MagicMock(
                    return_value=["existing_column"]
                )

                # Attempt to claim a column that already exists
                with pytest.raises(ColumnAlreadyExists) as excinfo:
                    out_of_memory_lakehouse.claim_column("existing_column")

                # Verify the exception message
                assert "Column existing_column already exists" in str(excinfo.value)

                # Verify no methods were called
                mock_create_parquet.assert_not_called()
                out_of_memory_lakehouse._add_column.assert_not_called()
                out_of_memory_lakehouse.gcs_helper.upload_file.assert_not_called()

            finally:
                # Restore original method
                out_of_memory_lakehouse.get_columns = original_get_columns

    def test_create_dataset_file(self, out_of_memory_lakehouse, test_datasets):
        """Test creating a dataset file in out-of-memory database."""
        # Mock the dependent methods
        out_of_memory_lakehouse._create_filename = MagicMock(
            return_value=(test_datasets["_folio_data"], f"{PROJECT_NAME}/data/2.parquet")
        )
        out_of_memory_lakehouse.gcs_helper.upload_file = MagicMock()

        # Create a dataset file
        out_of_memory_lakehouse.create_dataset_file(
            PROJECT_NAME, test_datasets["_folio_data"]
        )

        # Verify methods were called
        out_of_memory_lakehouse._create_filename.assert_called_once()
        out_of_memory_lakehouse.gcs_helper.upload_file.assert_called_once_with(
            test_datasets["_folio_data"], f"{PROJECT_NAME}/data/2.parquet"
        )


# Helper for async functions in pytest
@pytest.fixture
def event_loop():
    """Create an instance of the default event loop for each test case."""
    import asyncio

    policy = asyncio.get_event_loop_policy()
    loop = policy.new_event_loop()
    yield loop
    loop.close()


# Helper to run awaitable in pytest
def run_awaitable(awaitable):
    """Run an awaitable in a new event loop."""
    import asyncio

    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(awaitable)
    finally:
        loop.close()


# Add the helper to pytest namespace for use in tests
pytest.run_awaitable = run_awaitable

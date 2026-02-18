import copy
import random
import re
from datetime import datetime
import os
from typing import Protocol
from abc import ABC, abstractmethod
import uuid

import duckdb
import pyarrow as pa
import pyarrow.parquet as pq

from folio.utils.dataset_processor.dataset_processor import TabularDataProcessor
from folio.utils.shared_types.shared_types import (
    DatasetConfig,
    DUCKDB_QUERY_ERROR_CODE,
    DuckDbErrorPayload,
    parse_duckdb_error_payload,
)
from folio.utils.storage_helper import GoogleCloudStorageHelper
import pandas as pd
import modal
import logging

logger = logging.getLogger(__name__)
MODAL_APP_NAME_CANDIDATES = ("folio-sheet",)


def _modal_function_from_known_app_names(task_name: str) -> modal.Function:
    last_error: Exception | None = None
    for app_name in MODAL_APP_NAME_CANDIDATES:
        try:
            return modal.Function.from_name(
                app_name=app_name,
                name=task_name,
                environment_name=os.environ.get("ENV"),
            )
        except Exception as exc:
            last_error = exc

    if last_error is not None:
        raise last_error
    raise RuntimeError("Unable to resolve Modal function from known app names")


class DuckDbLakeHouseException(Exception):
    """Base class for exceptions in DuckDbLakeHouse."""


class FileDownloadException(DuckDbLakeHouseException):
    """Exception raised when a download operation fails."""


class ColumnAlreadyExists(DuckDbLakeHouseException):
    """Exception raised when column already exists."""


class ColumnDoesNotExist(DuckDbLakeHouseException):
    """Exception raised when column already exists."""


class SchemaMismatchOnColumnUpdate(DuckDbLakeHouseException):
    """Exception raised when column update schema is different than original schema."""


class DuckDbQueryExecutionError(DuckDbLakeHouseException):
    """Raised when a DuckDB query fails in local or remote execution."""

    def __init__(
        self,
        message: str,
        *,
        error_code: str = DUCKDB_QUERY_ERROR_CODE,
        query: str | None = None,
        error_type: str | None = None,
    ) -> None:
        super().__init__(message)
        self.error_code = error_code
        self.query = query
        self.error_type = error_type


def _coerce_duckdb_error_payload(value: object) -> DuckDbErrorPayload | None:
    """Try to normalize a returned value into a typed DuckDB error payload."""
    if isinstance(value, DuckDbErrorPayload):
        return value

    if isinstance(value, dict):
        try:
            return DuckDbErrorPayload.model_validate(value)
        except Exception:
            return None

    if isinstance(value, str):
        return parse_duckdb_error_payload(value)

    return None


class DataLakeHouse(Protocol):
    """A data lakehouse allows you to run SQL queries across your data. Right now (3/19/25) all the
    data is in parquet files.

    For each "project" there is one particular file that is considered the
    root file, which is a direct copy of the originally uploaded tabular data. Each new column in a
    project is a separate folder in the project directory and within it is a parquet file.

    Those parquet files have a particular strgucture, which is basically:
    _folio_internal_id, column_value, nr_of_tokens, etc.

    For all intents and purposes, parquet files are serialized "datasets". Right now (3/19/25)
    the only way to parse a dataset is to use the DatasetProcessor.
    """

    def run_sql(self, stmt, return_as_df=False): ...

    def generate_join_across_all_cols(
        self,
        _columns: str = "*",
        _sql_condition: str = "1=1",
        limit: str = "limit 10",
        ordered: bool = True,
    ): ...

    def generate_anti_join_for_specific_column(
        self,
        column_name: str,
        sql_condition: str = "1=1",
        limit: str = "limit 10",
        ordered: bool = True,
    ): ...

    def get_last_id(self): ...

    def claim_column(self, column_name: str): ...

    def add_data_to_colum_from_file(self, column_name: str, local_file_path: str): ...

    def add_data_to_column(self, column_name: str, data_array): ...

    def create_dataset_file(self, project_name: str, filepath: str): ...


class BaseDuckDbLakeHouse(ABC):
    prefix: str = None
    name_for_default_dataset: str = "_folio_data"
    gcs_helper: GoogleCloudStorageHelper = None

    def __init__(self, gcs_helper: GoogleCloudStorageHelper, project_name: str):
        self.prefix: str = project_name
        self.gcs_helper = gcs_helper

    @abstractmethod
    def run_sql(self, stmt, return_as_df=False):
        pass

    @abstractmethod
    def get_columns(self) -> list[str]:
        pass

    @abstractmethod
    def get_column_folders(self) -> list[str]:
        pass

    def get_user_columns(self) -> list[str]:
        """
        Get columns excluding folio-specific internal columns.
        Returns only the columns that are relevant for end users.
        """
        all_columns = self.get_columns()
        dataset_config = DatasetConfig()
        
        # Define columns to exclude
        excluded_columns = {
            dataset_config.PRIMARY_KEY_COLUMN,  # _folio_internal_id
            dataset_config.ROW_ORDER_COLUMN,    # _folio_row_order
            dataset_config.EXTERNAL_DATASYNC_ROW_COLUMN,  # external_data_row_id
        }
        
        # Filter out excluded columns and tokenized columns
        user_columns = []
        for col in all_columns:
            if col not in excluded_columns and not col.startswith(dataset_config.TOKENIZED_PREFIX):
                user_columns.append(col)
        
        return user_columns

    @abstractmethod
    def _add_column(self, column_name: str, column_files: list[str]) -> None:
        pass

    @abstractmethod
    def _update_column(self, column_name: str, column_files: list[str]) -> None:
        pass

    def generate_join_across_all_cols(
        self,
        _columns: str = "*",
        _sql_condition: str = "1=1",
        limit: str = "limit 10",
        ordered: bool = True,
    ):
        columns = self.get_column_folders()

        if ordered:
            order_by = f"ORDER BY {self.name_for_default_dataset}.{DatasetConfig.PRIMARY_KEY_COLUMN}"
        else:
            order_by = ""

        initial_query = f"""

    SELECT 
        {_columns}
    FROM
        {self.name_for_default_dataset}
    """

        join_clauses = []
        for key in columns:
            if key == self.name_for_default_dataset:
                # because we start with data above. we want the initial dataset to be the first predicate in the join because
                # all joins are done based on the "ids" from it (ie data).
                # TODO: This is actually the slowest way to do the join. The best is to go from the smallest dataset (with the fewest ids)
                continue
            quoted_key = f'"{key}"'  # Quote the alias to handle spaces
            join_clause = f"""
      LEFT JOIN
          {quoted_key} AS {quoted_key}
      ON
          {quoted_key}.{DatasetConfig.PRIMARY_KEY_COLUMN} = {self.name_for_default_dataset}.{DatasetConfig.PRIMARY_KEY_COLUMN}
      """
            join_clauses.append(join_clause)

        # Combine all parts
        initial_query += "\n".join(join_clauses)
        initial_query += f"""
    WHERE
        {_sql_condition}
    {order_by}
    {limit}
    """

        return initial_query

    ## Returns primary key column ids for a specific column. it returs the DatasetConfig.PRIMARY_KEY_COLUMN
    def generate_anti_join_for_specific_column(
        self,
        column_name: str,
        columns: str = "*",
        sql_condition: str = "1=1",
        limit: str = "limit 10",
        ordered: bool = True,
    ):

        columns = self.get_column_folders()
        if column_name not in columns:
            raise ColumnDoesNotExist(f"Column {column_name} does not exist")

        if ordered:
            order_by = f"ORDER BY {self.name_for_default_dataset}.{DatasetConfig.PRIMARY_KEY_COLUMN}"
        else:
            order_by = ""

        existing_select = f"""
        WITH existing as (
        SELECT
            {column_name}.{DatasetConfig.PRIMARY_KEY_COLUMN}
        FROM
            {self.name_for_default_dataset}
        WHERE
            {sql_condition}
        {order_by}
        {limit}
        ),
        """

        antijoin_select = self.generate_join_across_all_cols(
            columns, sql_condition, limit, ordered
        )

        antijoin_query = f"""
        {existing_select}
        new as (
            {antijoin_select}
        )
        Select new.*
        from new 
        anti join existing
        using ({DatasetConfig.PRIMARY_KEY_COLUMN})
        """

        return antijoin_query

    def _create_filename(self, prefix: str):
        # Fetch existing files from GCS to determine the next ID
        existing_ids = self.gcs_helper.list_existing_ids(prefix)
        if len(existing_ids) == 0:
            next_id = 1
        else:
            next_id = max(existing_ids) + 1 if existing_ids else 1

        # Generate the Parquet file name
        local_output_dir = os.getenv("MOUNT_PATH", "../local_tmp")
        os.makedirs(local_output_dir, exist_ok=True)

        guid = str(uuid.uuid4())

        local_parquet_file = os.path.join(local_output_dir, f"{guid}-{next_id}.parquet")
        destination_blob_name = f"{prefix}/{next_id}.parquet"
        return (local_parquet_file, destination_blob_name)

    def _create_filename_for_column(self, project_name: str, column_name: str):
        # Define today's date in the required format
        today_date = datetime.now().strftime("%Y-%m-%d")
        gcs_prefix = f"{project_name}/{column_name}/{today_date}"

        return self._create_filename(gcs_prefix)

    @abstractmethod
    def create_dataset_file(self, project_name: str, filepath: str):
        pass

    @abstractmethod
    def get_last_id(self):
        pass

    # the dict is a map between columns
    def _get_existing_files(
        self, gcs_helper: GoogleCloudStorageHelper
    ) -> dict[str, list[str]]:
        folder = self.prefix
        files = gcs_helper.list_files(folder)

        file_dict = {}

        filtered_to_only_files_in_folder = [
            element for element in files if folder in element
        ]

        pattern = rf"{folder}/([^/]+)/"
        for file in filtered_to_only_files_in_folder:
            match = re.match(pattern, file)
            if match:
                category = match.group(1)
                if category not in file_dict:
                    file_dict[category] = []
                file_dict[category].append(file)
            else:
                if self.name_for_default_dataset not in file_dict:
                    file_dict[self.name_for_default_dataset] = []
                file_dict[self.name_for_default_dataset].append(file)
                logger.debug(
                    "Root dataset files for project: %s, File: %s",
                    self.name_for_default_dataset,
                    file,
                )

        return file_dict

    def claim_column(self, column_name: str):
        """
        Export all rows to a single Parquet file and upload to GCS.

        Args:
            data_array: The data to export as a list of tuples.
            column_name: The column name for organizing files.
            gcs_helper: An instance of GoogleCloudStorageHelper.
            folder_name: The folder name to organize files in GCS. This is usually the convex project ID.
        """
        data_array = []
        folder_name = self.prefix

        if column_name in self.get_columns():
            raise ColumnAlreadyExists(f"Column {column_name} already exists")

        logger.info("Claiming column %s", column_name)

        local_parquet_file, destination_blob_name = self._create_filename_for_column(
            folder_name, column_name
        )

        TabularDataProcessor.create_parquet_file(
            data_array, column_name, local_parquet_file
        )

        self._add_column(column_name, [local_parquet_file])

        # TODO: Make sure this doesnt fail
        self.gcs_helper.upload_file(local_parquet_file, destination_blob_name)

        return (local_parquet_file, destination_blob_name)

    def add_data_to_colum_from_file(self, column_name: str, local_file_path: str):
        self._update_column(column_name, [local_file_path])
        _, destination_blob_name = self._create_filename_for_column(
            self.prefix, column_name
        )
        self.gcs_helper.upload_file(local_file_path, destination_blob_name)
        return (local_file_path, destination_blob_name)

    # only suports data of the type: (id, str)
    # NOTE: this is different from _update_column in that it adds the data array not the files
    def add_data_to_column(self, column_name: str, data_array):
        local_parquet_file, destination_blob_name = self._create_filename_for_column(
            self.prefix, column_name
        )

        TabularDataProcessor.create_parquet_file(
            data_array, column_name, local_parquet_file
        )

        # TODO: Make sure this doesnt fail
        self.gcs_helper.upload_file(local_parquet_file, destination_blob_name)

        self._update_column(column_name, [local_parquet_file])

        return (local_parquet_file, destination_blob_name)


class OutOfMemoryDuckDbLakeHouse(BaseDuckDbLakeHouse):
    def _run_sql(self, stmt, return_as_df=False):
        process_job = _modal_function_from_known_app_names("query")
        try:
            result = process_job.remote(stmt, return_as_df)
            payload = _coerce_duckdb_error_payload(result)
            if payload:
                raise DuckDbQueryExecutionError(
                    message=payload.message,
                    error_code=payload.error_code,
                    query=payload.query or stmt,
                    error_type=payload.error_type,
                )
            return result
        except Exception as exc:
            payload: DuckDbErrorPayload | None = parse_duckdb_error_payload(str(exc))
            if payload:
                raise DuckDbQueryExecutionError(
                    message=payload.message,
                    error_code=payload.error_code,
                    query=payload.query or stmt,
                    error_type=payload.error_type,
                ) from exc
            raise

    async def _run_sql_async(self, stmt, return_as_df=False):
        process_job = _modal_function_from_known_app_names("query")
        return await process_job.remote.aio(stmt, return_as_df)

    def get_last_id(self):
        files = self.gcs_helper.list_files(self.prefix)
        if len(files) == 0:
            return 0

        stmt = f"""
        WITH {self.name_for_default_dataset} AS (
            SELECT * FROM read_parquet('/mnt/{self.prefix}/*.parquet')
        )
        select MAX({DatasetConfig.PRIMARY_KEY_COLUMN}) from {self.name_for_default_dataset}
        """

        result = self._run_sql(stmt)

        if len(result) == 0:
            return 0

        return result[0][0]

    async def get_last_id_async(self):
        files = self.gcs_helper.list_files(self.prefix)
        if len(files) == 0:
            return 0

        stmt = f"""
        WITH {self.name_for_default_dataset} AS (
            SELECT * FROM read_parquet('/mnt/{self.prefix}/*.parquet')
        )
        select MAX({DatasetConfig.PRIMARY_KEY_COLUMN}) from {self.name_for_default_dataset}
        """

        result = await self._run_sql_async(stmt)

        if len(result) == 0:
            return 0

        return result[0][0]

    def run_sql(self, stmt, return_as_df=False):
        ## MODAL run_sql
        cols = [
            item
            for item in self.get_column_folders()
            if self.name_for_default_dataset not in item
        ]
        convex_project_id = self.prefix
        # Start with the initial data CTE
        initial = f"""
        WITH {self.name_for_default_dataset} AS (
            SELECT * FROM read_parquet('/mnt/{convex_project_id}/*.parquet')
        )
        """

        # Add additional CTEs for each column
        others = "\n"
        for col in cols:
            new_stmt = f"""
        , \"{col}\" AS (
            SELECT * FROM read_parquet('/mnt/{convex_project_id}/{col}/**/*.parquet')
        )
        """
            others += new_stmt

        final_stmt = initial + others + stmt

        result = self._run_sql(final_stmt, return_as_df)

        return result

    async def run_sql_async(self, stmt, return_as_df=False):
        cols = [
            item
            for item in self.get_column_folders()
            if self.name_for_default_dataset not in item
        ]
        convex_project_id = self.prefix
        initial = f"""
        WITH {self.name_for_default_dataset} AS (
            SELECT * FROM read_parquet('/mnt/{convex_project_id}/*.parquet')
        )
        """

        others = "\n"
        for col in cols:
            new_stmt = f"""
        , \"{col}\" AS (
            SELECT * FROM read_parquet('/mnt/{convex_project_id}/{col}/**/*.parquet')
        )
        """
            others += new_stmt

        final_stmt = initial + others + stmt
        return await self._run_sql_async(final_stmt, return_as_df)

    def get_column_folders(self) -> list[str]:
        initial_files: dict[str, list[str]] = self._get_existing_files(self.gcs_helper)
        cols = initial_files.keys()
        return list(cols)
        # get cached if exists (self.columns)
        ## MODAL get_columns_for project
        # cache (self.columns = columns)

    def get_columns(self):
        column_folders = [
            i for i in self.get_column_folders() if i != self.name_for_default_dataset
        ]

        process_job = _modal_function_from_known_app_names("query")

        stmt = f"""
        SELECT * FROM parquet_schema('/mnt/{self.prefix}/**/*.parquet');
        """

        result = process_job.remote(stmt)
        columns = list(set([row[1] for row in result]))
        if "schema" in columns:
            columns.remove("schema")

        return column_folders + columns

    async def get_columns_async(self):
        column_folders = [
            i for i in self.get_column_folders() if i != self.name_for_default_dataset
        ]

        stmt = f"""
        SELECT * FROM parquet_schema('/mnt/{self.prefix}/**/*.parquet');
        """
        result = await self._run_sql_async(stmt)
        columns = list(set([row[1] for row in result]))
        if "schema" in columns:
            columns.remove("schema")

        return column_folders + columns

    async def get_user_columns_async(self) -> list[str]:
        all_columns = await self.get_columns_async()
        dataset_config = DatasetConfig()

        excluded_columns = {
            dataset_config.PRIMARY_KEY_COLUMN,
            dataset_config.ROW_ORDER_COLUMN,
            dataset_config.EXTERNAL_DATASYNC_ROW_COLUMN,
        }

        return [
            col
            for col in all_columns
            if col not in excluded_columns
            and not col.startswith(dataset_config.TOKENIZED_PREFIX)
        ]

    def _add_column(self, column_name: str, column_files: list[str]):
        if column_name in self.get_columns():
            raise ColumnAlreadyExists(f"Column {column_name} already exists")

        # In theory should be
        ## MODAL 1. check if col exists (if so return ColumnAlreadyExists)
        ## MODAL 2. if not then add an empty file with just headers

        # if column_name in self.columns:
        #   raise ColumnAlreadyExists(f"Column {column_name} already exists")
        # create_col_stmt = f"""CREATE TABLE \"{column_name}\" AS SELECT distinct * FROM parquet_scan([{', '.join([f"'{path}'" for path in column_files])}]);"""
        # self.columns.append(column_name)
        # self.new_files[column_name] = column_files
        # self.conn.execute(create_col_stmt)

        # cache (self.columns = columns)

    def _update_column(self, column_name: str, column_files: list[str]):
        pass
        # In theory should be
        ## Validate that new files have the same schema
        ## Add more data to the column

    def create_dataset_file(self, project_name, filepath):
        _, destination_path = self._create_filename(project_name)
        # TODO: This is where we should be doing schema validation. If there is already a data file
        # we better to make sure that the schema is the same as the existing one.
        self.gcs_helper.upload_file(
            filepath,
            destination_path,
        )


class InMemoryDuckDbLakeHouse(BaseDuckDbLakeHouse):
    conn = None
    initial_files: dict[str, list[str]] = None
    new_files: dict[str, list[str]] = None
    columns: list[str] = None

    # project_name corresponds to the folder name inside the bucket. in other places its referred to as the prefix
    def __init__(self, gcs_helper: GoogleCloudStorageHelper, project_name: str):
        super().__init__(gcs_helper, project_name)

        # Create DuckDb Connection, Download Files Locally, Load Them Up Into DuckDB and Get List Of Columns
        self.conn = duckdb.connect()

        # a dictionary like <column_name, list[parquet_files_for_column]>
        self.initial_files: dict[str, list[str]] = self._get_existing_files(gcs_helper)
        # this downloads all the files in memory and creates the statement for creating the table
        (table_creation_statement, s3_url_to_local_file) = (
            self._load_all_files_into_duck_db(gcs_helper, self.initial_files)
        )
        # a dictionary like <column_name, list[local_files]>
        # new_files is used as a metdata store for all the duck_db files that are stored in memory
        self.new_files: dict[str, list[str]] = copy.deepcopy(self.initial_files)
        for key in self.new_files.keys():
            self.new_files[key] = [
                s3_url_to_local_file[s3_parquet_file]
                for s3_parquet_file in self.new_files[key]
            ]
        # there are several system columns: data has embeddings, convex_row_id has id, convex_row_id, row_order
        self.conn.execute(table_creation_statement)
        # TODO: This can probably be done based on the duckdb metadata as well
        self.columns: list[str] = list(self.initial_files.keys())

    def get_last_id(self):
        if len(self.initial_files) == 0:
            return 0

        stmt = f"""
        WITH {self.name_for_default_dataset} AS (
            SELECT * FROM {self.name_for_default_dataset}
        )
        select MAX({DatasetConfig.PRIMARY_KEY_COLUMN}) from {self.name_for_default_dataset} 
        """

        result = self.conn.execute(stmt).fetchall()

        if len(result) == 0:
            return 0

        return result[0][0]

    def run_sql(self, stmt, return_as_df=False):
        try:
            if return_as_df:
                result = self.conn.execute(stmt).df()
            else:
                result = self.conn.execute(stmt).fetchall()
            return result
        except duckdb.Error as exc:
            raise DuckDbQueryExecutionError(
                message=str(exc),
                error_code=DUCKDB_QUERY_ERROR_CODE,
                query=stmt,
                error_type=exc.__class__.__name__,
            ) from exc

    def get_column_folders(self):
        return self.columns

    def get_columns(self):
        try:
            data_filepath = self.new_files[self.name_for_default_dataset][0]
        except KeyError as e:
            raise Exception(
                f"Base dataset does not seem exist for project {self.prefix}."
            ) from e
        stmt = f"""
        DESCRIBE Select * from read_parquet('{data_filepath}')
        """

        result = self.conn.execute(stmt).fetchall()
        column_names = [row[0] for row in result]
        return self.get_column_folders() + column_names

    def _add_column(self, column_name: str, column_files: list[str]):
        if column_name in self.columns:
            raise ColumnAlreadyExists(f"Column {column_name} already exists")
        create_col_stmt = f"""CREATE TABLE \"{column_name}\" AS SELECT distinct * FROM parquet_scan([{', '.join([f"'{path}'" for path in column_files])}]);"""
        self.columns.append(column_name)
        self.new_files[column_name] = column_files
        self.conn.execute(create_col_stmt)

    def _update_column(
        self,
        column_name: str,
        column_files: list[str],
    ):
        if not column_name in self.columns:
            raise ValueError(f"Column {column_name} not found")

        comma_separated_columns_old = ", ".join(
            [f"'{path}'" for path in self.new_files[column_name]]
        )

        comma_separated_columns_new = ", ".join([f"'{path}'" for path in column_files])

        # check that schema is the same
        new_schema_query = f"""DESCRIBE Select * from parquet_scan([{comma_separated_columns_new}]) limit 1;"""
        new_schema_query_result = self.conn.execute(new_schema_query).fetchall()
        old_schema_query = f"""DESCRIBE Select * from parquet_scan([{comma_separated_columns_old}]) limit 1;"""
        old_schema_query_result = self.conn.execute(old_schema_query).fetchall()
        if new_schema_query_result != old_schema_query_result:
            raise SchemaMismatchOnColumnUpdate(
                f"Schema mismatch between old and new data. Old schema: {new_schema_query_result}, New schema: {old_schema_query_result}"
            )

        random_number = str(random.randint(100000, 999999))
        temp_table_name = "temp" + random_number + column_name
        # TODO: There is potential for schema mismatch here
        new_table_stmt = f"""
      CREATE TABLE "{temp_table_name}" AS
      SELECT * 
      FROM (
          -- Include rows from the new data
          SELECT {DatasetConfig.PRIMARY_KEY_COLUMN}, "{column_name}"
          FROM parquet_scan([{comma_separated_columns_new}])

          UNION ALL

          -- Include rows from the original table that are NOT in the new data
          SELECT {DatasetConfig.PRIMARY_KEY_COLUMN}, "{column_name}"
          FROM "{column_name}"
          WHERE {DatasetConfig.PRIMARY_KEY_COLUMN} NOT IN (
              SELECT {DatasetConfig.PRIMARY_KEY_COLUMN}
              FROM parquet_scan([{comma_separated_columns_old}])
          )
      ) combined_data;

      DROP TABLE \"{column_name}\";
      ALTER TABLE \"{temp_table_name}\" RENAME TO \"{column_name}\";

    """

        logger.debug(new_table_stmt)
        self.conn.execute(new_table_stmt)
        self.new_files[column_name].extend(column_files)

    def _load_all_files_into_duck_db(
        self, gcs_helper, initial_files: dict[str, list[str]]
    ):
        expanded_array_of_files = [
            item for sublist in initial_files.values() for item in sublist
        ]
        # downloaded files returns a tuple thats like (<temp_dir_name>, dict<s3_key, local_download_url>)
        downloaded_files = gcs_helper.download_files_in_parallel(
            expanded_array_of_files
        )
        s3_url_to_local_file = dict(downloaded_files[1])
        logger.info("%d files downloaded", len(downloaded_files[1]))

        stmts = ""
        for key in initial_files.keys():
            table_name = key  # this is really column name, because we consider each column a separate table.
            initial_parquet_files_dict = initial_files[table_name]
            try:
                _downloaded_files = [
                    s3_url_to_local_file[s3_parquet_file]
                    for s3_parquet_file in initial_parquet_files_dict
                ]
                duckdb_stmt = f"""CREATE TABLE '{table_name}' AS SELECT distinct * FROM parquet_scan([{', '.join([f"'{path}'" for path in _downloaded_files])}]);"""
                stmts += duckdb_stmt
            except KeyError as e:
                logger.debug("s3_url_to_local_file: %s", s3_url_to_local_file)
                raise FileDownloadException(
                    f"Failed to find a download for file: {e}"
                ) from e
        return (stmts, s3_url_to_local_file)

    def create_dataset_file(self, project_name, filepath):
        raise NotImplementedError(
            "create_dataset_file is not implemented for InMemoryDuckDbLakeHouse"
        )

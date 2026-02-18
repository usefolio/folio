from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple, Union
import uuid

import tiktoken
import logging
from bg_tasks.bg_tasks import start_processing_daemons_task
from folio.utils.cell_states.cell_states_helper import CellState, CellStates
from folio.utils.convex_client.convex_client import ConvexClient
from folio.utils.data_lakehouse.data_lakehouse import (
    ColumnAlreadyExists,
    DataLakeHouse,
)
import os
from folio.utils.job_executor.job_types import (
    EnrichmentParameters,
    ExternallySyncedJob,
    Job,
    JobParameters,
    JobProgress,
    JobState,
    JobTokenUsage,
    JobType,
)
from folio.utils.shared_types.shared_types import (
    SERVICE_PROVIDER,
    ConvexInfo,
    DataLakehouseInfo,
    DatasetConfig,
    LLMModelName,
    SheetTask,
    DataLakehouseOperationType,
    SheetTaskType,
    SructuredOrTextGenerationPromptModel,
    StructuredOutputPromptModel,
    TextGenerationPromptModel,
    get_prompt_text_from_structured,
    get_prompt_text_from_textgen,
)
from folio.utils.usage_cop import Plan, BillingService

NR_OF_CELLS = 100000

logger = logging.getLogger(__name__)


class ColumnDoesNotExist(Exception):
    """Trying to execute a prompt with a column that does not exist"""


class SyncIssue(Exception):
    """There was an issue with the synchronization process"""


class TooMuchDataToProcess(Exception):
    """There is too much data to process for this job"""


class NoCellsToProcess(Exception):
    """There are no cells to process for this job"""


def _get_limit():
    limit_nr = os.environ.get("RESULT_LIMIT", "")
    if limit_nr is None or limit_nr == "":
        return ""
    else:
        return f"LIMIT {limit_nr}"


def _resolve_llm_task_type(
    prompt: SructuredOrTextGenerationPromptModel,
) -> SheetTaskType:
    """Derive the SheetTaskType for an LLM job based on the selected model."""

    provider = LLMModelName.get_provider(prompt.model)

    if provider == "openai":
        return SheetTaskType.LLM_PROCESSING_WITH_OPENAI
    if provider == "google_gemini":
        return SheetTaskType.LLM_PROCESSING_WITH_GEMINI
    if provider == "anthropic":
        return SheetTaskType.LLM_PROCESSING_WITH_ANTHROPIC

    raise ValueError(f"Unsupported LLM provider: {provider}")


def _create_llm_job(
    total_items, prompt: SructuredOrTextGenerationPromptModel, sql_condition: str
):
    time_now = datetime.now(timezone.utc).isoformat()
    return Job(
        id=str(uuid.uuid4()),  # Generate a unique job ID
        type=JobType.ENRICHING_DATA,
        state=JobState.PENDING,
        createdBy="user123",
        createdAt=time_now,
        updatedAt=time_now,
        progress=JobProgress(completedCount=0, totalCount=total_items),
        parameters=JobParameters(
            enrichment=EnrichmentParameters(
                prompt=prompt.model_dump_json(),
                model=prompt.model,
                response_options=[],
                filter=sql_condition,
            )
        ),
        scheduledStartAt=time_now,
        expectedCompletionAt=time_now,
        tokenUsage=JobTokenUsage(totalTokens=0),
    )


def _create_document_processing_job(total_items, sql_condition):
    time_now = datetime.now(timezone.utc).isoformat()
    return Job(
        id=str(uuid.uuid4()),  # Generate a unique job ID
        type=JobType.ENRICHING_DATA,
        state=JobState.PENDING,
        createdBy="user123",
        createdAt=time_now,
        updatedAt=time_now,
        progress=JobProgress(completedCount=0, totalCount=total_items),
        parameters=JobParameters(enrichment=None),
        scheduledStartAt=time_now,
        expectedCompletionAt=time_now,
        tokenUsage=JobTokenUsage(totalTokens=0),
    )


def _build_sheet_tasks_for_llm_processing(
    external_project_id: str,
    external_column_id: str,
    column_name: str,
    prompt: SructuredOrTextGenerationPromptModel,
    job_id: str,
    workflow_id: Optional[str],
    callback_url: Optional[str],
    prompt_input_columns: List[str],
    sql_condition: str,
    data_lakehouse: DataLakeHouse,
    data_lakehouse_operation_type: DataLakehouseOperationType,
    api_keys: Dict[SERVICE_PROVIDER, str],
    customer_id: Optional[str] = None,
    task_type: SheetTaskType = SheetTaskType.LLM_PROCESSING_WITH_OPENAI,
) -> Tuple[ExternallySyncedJob, List[SheetTask]]:
    # TODO: Remove when prompt input columns becomes required
    values_to_insert_into_prompt = (
        ", ".join(f'"{col}"' for col in prompt_input_columns)
        if prompt_input_columns
        else "NULL as _____nothing"
    )

    # TODO: Pull this from metadata storage
    dataset_config = DatasetConfig()
    id_column_name = dataset_config.PRIMARY_KEY_COLUMN
    external_row_column_name = dataset_config.EXTERNAL_DATASYNC_ROW_COLUMN
    external_row_order_name = dataset_config.ROW_ORDER_COLUMN

    if data_lakehouse_operation_type == DataLakehouseOperationType.CREATE_COLUMN:
        query = data_lakehouse.generate_join_across_all_cols(
            f"""
            DISTINCT ON({external_row_order_name}) 
            ROW_NUMBER() OVER () - 1 AS row_index, 
            {data_lakehouse.name_for_default_dataset}.{id_column_name}, 
            {values_to_insert_into_prompt}, 
            {external_row_column_name}, 
            {external_row_order_name}
            """,
            sql_condition,
            _get_limit(),
        )
    elif data_lakehouse_operation_type == DataLakehouseOperationType.UPDATE_COLUMN:
        query = data_lakehouse.generate_anti_join_for_specific_column(
            column_name,
            f"""
            DISTINCT ON({external_row_order_name}) 
            ROW_NUMBER() OVER () - 1 AS row_index, 
            {data_lakehouse.name_for_default_dataset}.{id_column_name}, 
            {values_to_insert_into_prompt}, 
            {external_row_column_name}, 
            {external_row_order_name}
            """,
            sql_condition,
            _get_limit(),
        )
    else:
        raise ValueError(
            f"Unknown data lakehouse operation type: {data_lakehouse_operation_type}"
        )

    data_to_process = data_lakehouse.run_sql(query)

    # Assemble Sheet Tasks
    items: List[SheetTask] = []
    for item in data_to_process:
        columns = prompt_input_columns
        # TODO: Thisa assumes a certain way of setting up the original query
        input_data: Dict[str, str] = {
            # TODO: We serialize the data result here with str, probably should be more sophisticated.
            columns[i]: str(item[i + 2])
            for i in range(len(columns))
        }  # Shift index by 2 to match SQL order
        # TODO: Remove when prompt input columns becomes required

        if len(columns) == 0:
            input_data = {"input": item[2]}
            columns = [
                ""
            ]  # To account for the fact that we do "NULL as _____nothing" when there are no prompt input columns

        # TODO: Any time a new field is added to the fetch_data_from_modal sql query, this needs to be modified
        items.append(
            SheetTask(
                type=task_type,
                convex_info=ConvexInfo(
                    convex_project_id=external_project_id,
                    convex_column_id=external_column_id,
                    convex_row_id=item[len(item) - 2],
                    convex_row_order=item[len(item) - 1],
                ),
                datalakehouse_info=DataLakehouseInfo(
                    id=item[1], column_name=column_name
                ),
                input=input_data or {},
                prompt=prompt,
                workflow_id=workflow_id,
                api_keys=api_keys,
                customer_id=customer_id,
            )
        )

    # items = [("1","1") for i in range(20)]
    logger.info("Fetched %d items", len(items))

    # Validate number of items
    if len(items) > 100000:
        raise TooMuchDataToProcess(
            "There was too much data to process for this job. We support up to 100,000 rows per job."
        )

    if len(items) == 0:
        raise NoCellsToProcess("There are no cells to process for this job.")

    # Create Job object to keep track of job state. Make a request to the data sync client to insert the job
    # and persist the id for future reference.
    _job = _create_llm_job(len(items), prompt, sql_condition)

    return _job, items


def _build_sheet_tasks_for_media_transcription(
    external_project_id: str,
    external_column_id: str,
    input_column: str,
    column_name: str,
    job_id: str,
    workflow_id: Optional[str],
    callback_url: Optional[str],
    data_lakehouse: DataLakeHouse,
    sql_condition: str,
    task_type: SheetTaskType,
    data_lakehouse_operation_type: DataLakehouseOperationType = DataLakehouseOperationType.CREATE_COLUMN,
    api_keys: Dict[SERVICE_PROVIDER, str] = None,
    customer_id: Optional[str] = None,
):
    # TODO: Pull this from metadata storage
    dataset_config = DatasetConfig()
    id_column_name = dataset_config.PRIMARY_KEY_COLUMN
    external_row_column_name = dataset_config.EXTERNAL_DATASYNC_ROW_COLUMN
    external_row_order_name = dataset_config.ROW_ORDER_COLUMN

    if data_lakehouse_operation_type == DataLakehouseOperationType.CREATE_COLUMN:
        query = data_lakehouse.generate_join_across_all_cols(
            f"""
            DISTINCT ON({external_row_order_name}) 
            ROW_NUMBER() OVER () - 1 AS row_index, 
            {data_lakehouse.name_for_default_dataset}.{id_column_name}, 
            \"{input_column}\", 
            {external_row_column_name}, 
            {external_row_order_name}
            """,
            sql_condition,
            _get_limit(),
        )
    elif data_lakehouse_operation_type == DataLakehouseOperationType.UPDATE_COLUMN:
        query = data_lakehouse.generate_anti_join_for_specific_column(
            f"""
            DISTINCT ON({external_row_order_name}) 
            ROW_NUMBER() OVER () - 1 AS row_index, 
            {data_lakehouse.name_for_default_dataset}.{id_column_name}, 
            \"{input_column}\", 
            {external_row_column_name}, 
            {external_row_order_name}
            """,
            sql_condition,
            _get_limit(),
        )
    else:
        raise ValueError(
            f"Unknown data lakehouse operation type: {data_lakehouse_operation_type}"
        )

    data_to_process = data_lakehouse.run_sql(query)

    sheet_tasks = []
    for data in data_to_process:

        sheet_task = SheetTask(
            type=task_type,
            convex_info=ConvexInfo(
                convex_project_id=external_project_id,
                convex_column_id=external_column_id,
                convex_row_id=data[len(data) - 2],
                convex_row_order=data[len(data) - 1],
            ),
            datalakehouse_info=DataLakehouseInfo(id=data[1], column_name=column_name),
            file_path=data[2],
            content_type=(
                "application/pdf"
                if task_type == SheetTaskType.PDF_TRANSCRIPTION_WITH_MARKER
                else "application/xml"
            ),
            api_keys=api_keys or {},
            customer_id=customer_id,
        )
        sheet_tasks.append(sheet_task)

    return (
        _create_document_processing_job(
            len(data_to_process), sql_condition=sql_condition
        ),
        sheet_tasks,
    )


def run_column_action(
    data_lakehouse_operation_type: DataLakehouseOperationType,
    job_id: str,
    external_project_id: str,
    external_column_id: str,
    column_name: str,
    customer_id: str,
    plan: Plan,
    billing_service: BillingService,
    sql_condition: str,
    workflow_id: Optional[str],
    callback_url: Optional[str],
    input_columns: Optional[List[str]],
    ## LLM Specific Stuff
    output_name: str,
    prompt: SructuredOrTextGenerationPromptModel,
    ##
    data_lakehouse: DataLakeHouse,
    with_claim=True,
    task_type: Optional[SheetTaskType] = None,
    api_keys: Dict[SERVICE_PROVIDER, str] = None,
):
    ## validate column name
    existing_columns = data_lakehouse.get_columns()
    logger.info("Existing columns: %s", existing_columns)

    if input_columns is not None:
        for col in input_columns:
            # If the columns that serve as input to the prompt do not exist, raise an error
            if col not in existing_columns:
                raise ColumnDoesNotExist(f"Column {col} does not exist")

    if with_claim:
        try:
            data_lakehouse.claim_column(column_name=column_name)
            # Note: Usage events will be emitted in modal/main.py where actual work happens
        except ColumnAlreadyExists as e:
            query = data_lakehouse.generate_join_across_all_cols(
                f"""
                "{column_name}"
                """,
                sql_condition,
                limit="",
                ordered=False,
            )
            results = data_lakehouse.run_sql(query)
            logger.info("Length of Results for %s: %d", column_name, len(results))
            logger.debug("Results for %s: %s", column_name, results)

            non_null_found = any(col is not None for (col,) in results)
            # TODO: This may have to be rethought. Will not work on big data.
            if results and non_null_found and len(results) > 0:
                raise e

    if task_type is None:
        if prompt is None:
            raise ValueError("prompt is required for LLM processing tasks")
        task_type = _resolve_llm_task_type(prompt)

    if task_type in (
        SheetTaskType.LLM_PROCESSING_WITH_OPENAI,
        SheetTaskType.LLM_PROCESSING_WITH_GEMINI,
        SheetTaskType.LLM_PROCESSING_WITH_ANTHROPIC,
    ):

        # Fetch data
        # TODO: Really need to consider what happens here if there is an error with one of the fetches. For
        # example, imagine that one of the cells has a bad prompt..

        job, tasks = _build_sheet_tasks_for_llm_processing(
            external_project_id=external_project_id,
            external_column_id=external_column_id,
            column_name=column_name,
            prompt=prompt,
            job_id=job_id,
            workflow_id=workflow_id,
            callback_url=callback_url,
            prompt_input_columns=input_columns,
            sql_condition=sql_condition,
            data_lakehouse=data_lakehouse,
            data_lakehouse_operation_type=data_lakehouse_operation_type,
            api_keys=api_keys or {},
            customer_id=customer_id,
            task_type=task_type,
        )

        serialized_items = [item.model_dump() for item in tasks]

    elif (
        task_type == SheetTaskType.PDF_TRANSCRIPTION_WITH_MARKER
        or task_type == SheetTaskType.TRANSCRIPTION_WITH_FAL
    ):

        job, tasks = _build_sheet_tasks_for_media_transcription(
            external_project_id=external_project_id,
            external_column_id=external_column_id,
            # Assuming input_columns is a list with one element for PDF transcription
            input_column=input_columns[0],
            column_name=column_name,
            job_id=job_id,
            workflow_id=workflow_id,
            callback_url=callback_url,
            data_lakehouse=data_lakehouse,
            sql_condition=sql_condition,
            task_type=task_type,
            data_lakehouse_operation_type=data_lakehouse_operation_type,
            api_keys=api_keys or {},
            customer_id=customer_id,
        )

        serialized_items = [item.model_dump() for item in tasks]

    else:
        raise ValueError(f"Unknown task type: {task_type}")

    convex_client = ConvexClient(
        api_key=os.environ.get("CONVEX_HTTP_CLIENT_API_KEY"),
        environment=os.environ.get("ENV"),
        base_url_overwrite=callback_url,
    )

    job_creation_response = convex_client.insert_job(
        external_project_id,
        external_column_id,
        job.model_dump_json(),
    )

    if job_creation_response.status_code == 200:
        job_id = job_creation_response.json()["job"]

    job = ExternallySyncedJob(**job.model_dump())
    job.column_id = external_column_id
    job.project_id = external_project_id
    job.job_id = job_id

    try:
        start_processing_daemons_task.delay(
            job.model_dump(),
            serialized_items,
            output_name,
            callback_url,
        )
    except Exception as e:
        logger.exception("Error starting processing daemons")
        raise RuntimeError("Failed to start processing daemons") from e

    # RETURN CELL STATES
    cell_states = CellStates(NR_OF_CELLS)
    cell_states._initialize_state(NR_OF_CELLS, CellState.DEFAULT)
    list_of_cells_to_set_to_loading = [
        item.convex_info.convex_row_order for item in tasks
    ]
    cell_states.set_cells(list_of_cells_to_set_to_loading, CellState.LOADING)

    return len(tasks), cell_states.to_json()


def _get_tokens_from_string(text: str, encoding_name="cl100k_base") -> int:
    tokenizer = tiktoken.get_encoding(encoding_name)
    return len(tokenizer.encode(text))


def _estimate_cost(
    model_name: str, input_token_count: int, output_token_count: int
) -> float:
    """
    Calculate cost in USD for a given model and token usage,
    assuming rates are stored as cost per 1 million tokens.
    """
    model_pricing = LLMModelName.get_pricing()
    if model_name not in model_pricing:
        raise ValueError(f"Unknown model: {model_name}")

    # Extract the per-million-token rates:
    input_rate = model_pricing[model_name]["input_per_million_tokens"]
    output_rate = model_pricing[model_name]["output_per_million_tokens"]

    # Convert the token counts into "millions of tokens":
    cost_input = (input_token_count / 1_000_000) * input_rate
    cost_output = (output_token_count / 1_000_000) * output_rate

    # Return total cost:
    return cost_input + cost_output


def estimate_input_price(
    prompt: SructuredOrTextGenerationPromptModel,
    prompt_input_columns: List[str],
    sql_condition: str,
    data_lakehouse: DataLakeHouse,
) -> Tuple[int, float]:
    prompt_input_columns = prompt_input_columns or []

    dataset_config = DatasetConfig()
    if len(prompt_input_columns) == 0:
        ## no input token cost outside of the prompt
        logger.info("No input columns; limiting input cost to prompt only.")
        if isinstance(prompt, StructuredOutputPromptModel):
            prompt_text = get_prompt_text_from_structured(prompt)
        elif isinstance(prompt, TextGenerationPromptModel):
            prompt_text = get_prompt_text_from_textgen(prompt)
        else:
            raise ValueError(f"Unknown prompt model type: {type(prompt)}")
        prompt_text_tokens = _get_tokens_from_string(prompt_text)
        # Assume output tokens ~= input tokens.
        price = _estimate_cost(
            prompt.model,
            prompt_text_tokens,
            prompt_text_tokens,  # output tokens assumed equal to input
        )
        return prompt_text_tokens, price
    else:
        ## validate column names only when caller provided input columns
        existing_columns = data_lakehouse.get_columns()
        logger.info("Existing columns: %s", existing_columns)
        for col in prompt_input_columns:
            # If the columns that serve as input to the prompt do not exist, raise an error
            if col not in existing_columns:
                raise ColumnDoesNotExist(f"Column {col} does not exist")

        tokenized_column_prefix = dataset_config.TOKENIZED_PREFIX
        tokenized_columns = [
            f"{tokenized_column_prefix}_{col}" for col in prompt_input_columns
        ]
        for col in tokenized_columns:
            if col not in existing_columns:
                raise ColumnDoesNotExist(
                    f"Tried calculating size of column: {col.removeprefix(dataset_config.TOKENIZED_PREFIX)}, but it does not exist"
                )

        tokenize_sum_outer_sql_statement = " + ".join(
            f'SUM(sub."{col}")' for col in tokenized_columns
        )

        # This clause helps us out in making sure that we only count the tokens once per id. Otherwise the left join below would
        # list the token count for each row and vastly overestimate the token count.
        distinct_column_clause = ",".join(f'"{col}"' for col in tokenized_columns)
        distinct_column_clause = (
            f'DISTINCT {data_lakehouse.name_for_default_dataset}."{dataset_config.PRIMARY_KEY_COLUMN}", '
            + distinct_column_clause
        )

        query = data_lakehouse.generate_join_across_all_cols(
            f"""
            {distinct_column_clause}
            """,
            sql_condition,
            limit="",
            ordered=False,
        )

        final_stmt = (
            f"""SELECT {tokenize_sum_outer_sql_statement} FROM ({query}) as sub"""
        )

        logger.debug("[ESTIMATE_INPUT_PRICE] Query: %s", final_stmt)
        result = data_lakehouse.run_sql(final_stmt)

    input_text_tokens = result[0][0] if result and result[0][0] is not None else 0

    def extract_prompt_text(prompt: SructuredOrTextGenerationPromptModel) -> str:
        if isinstance(prompt, StructuredOutputPromptModel):
            return get_prompt_text_from_structured(prompt)
        elif isinstance(prompt, TextGenerationPromptModel):
            return get_prompt_text_from_textgen(prompt)
        else:
            raise ValueError(f"Unknown prompt model type: {type(prompt)}")

    prompt_text_tokens = _get_tokens_from_string(extract_prompt_text(prompt))

    total_tokens = input_text_tokens + prompt_text_tokens
    # Assume output tokens ~= input tokens.
    price = _estimate_cost(
        prompt.model,
        total_tokens,
        total_tokens,  # output tokens assumed equal to input
    )

    return total_tokens, price

from typing import List, Any, Dict
import modal
import os
import duckdb
import google.generativeai as genai
from anthropic import Anthropic
from folio.utils.task_processor.task_processor import (
    OpenAITaskProcessingBackend,
    GeminiTaskProcessingBackend,
    AnthropicTaskProcessingBackend,
    MP3ToTextTaskProcessingBackend,
    PDFToMarkdownTaskProcessingBackend,
    XMLToMarkdownTaskProcessingBackend,
)
from folio.utils.transcription_client.fal_client import FalTranscriptionClient
from folio.utils.shared_types.shared_types import (
    DatasetConfig,
    DuckDbErrorPayload,
    LLMProcessingResult,
    LLMProcessingTaskWithSingleColumnRequest,
    MP3ToTextRequest,
    ModalQueuePartition,
    PDFResult,
    PDFToMarkdownRequest,
    XMLToMarkdownRequest,
    SheetTask,
    SheetTaskType,
    TextGenerationPromptModel,
    StructuredOutputPromptModel,
    TranscriptionResult,
    Usage,
)
from folio.utils.marker_client.marker_client import MarkerClient
from folio.utils.usage_cop import (
    BillingService,
    ai_call_finalized_event,
    modal_function_invoked_event,
    fal_transcription_event,
    datalab_document_processing_event,
)
from folio.utils.usage_cop.models import (
    AiCallFinalizedEventData,
    ModalFunctionInvokedEventData,
    FalTranscriptionEventData,
    DatalabDocumentProcessingEventData,
)
import sys
import uuid
import logging
import json
import time

sys.path.append("/root/libs")

# Initialize logger for billing errors (without configuring basicConfig in modal)
logger = logging.getLogger(__name__)

def _build_duckdb_error_payload(
    exc: Exception, *, query_text: str
) -> DuckDbErrorPayload:
    """Create a structured, serializable DuckDB error payload."""
    return DuckDbErrorPayload(
        error_type=exc.__class__.__name__,
        message=str(exc),
        query=query_text,
    )


def _get_usage_cop_service(customer_id: str) -> BillingService:
    """Initialize billing service bound to a specific customer."""
    return BillingService(customer_id)


gcp_hmac_secret = modal.Secret.from_name(
    "googlecloud-secret",
    required_keys=[
        "GOOGLE_ACCESS_KEY_ID",
        "GOOGLE_ACCESS_KEY_SECRET",
        "BUCKET_NAME",
        "GOOGLE_SERVICE_ACCOUNT_JSON",
        "OPENAI_API_KEY",
        "MARKER_API_KEY",
        "FAL_KEY",
        "GEMINI_API_KEY",
        "ANTHROPIC_API_KEY",
    ],
)

image = (
    modal.Image.debian_slim()
    # this needs to include all the dependencies of the shared utils libs
    # TODO: Figure out a better way to manage this
    .pip_install(
        "duckdb==0.10.0",
        "pandas",
        "openai",
        "google-generativeai",
        "anthropic",
        "pydantic>=2.0,<3.0",
        "fal_client",
        "requests",
        "tenacity",
        "jinja2",
        "google-cloud-storage",
        "boto3",
    )
    .add_local_dir("../libs", "/root/libs")
    .add_local_python_source("folio.utils.task_processor")
    .add_local_python_source("folio.utils.shared_types")
    .add_local_python_source("folio.utils.marker_client")
    .add_local_python_source("folio.utils.transcription_client")
    .add_local_python_source("folio.utils.usage_cop")
)

app = modal.App(image=image, name="folio-sheet")


def _require_env_var(*names: str) -> str:
    for name in names:
        value = os.environ.get(name)
        if value:
            return value
    joined_names = ", ".join(names)
    raise ValueError(f"Missing required env var. Expected one of: {joined_names}")


BUCKET_NAME = _require_env_var("BUCKET_NAME")


@app.function(
    volumes={
        "/mnt": modal.CloudBucketMount(
            bucket_name=BUCKET_NAME,
            bucket_endpoint_url="https://storage.googleapis.com/",
            secret=gcp_hmac_secret,
        )
    },
    timeout=150,
    retries=modal.Retries(
        max_retries=2,
        backoff_coefficient=1.0,
        initial_delay=1.0,
    ),
    secrets=[gcp_hmac_secret],
)
def query(text, return_as_df=False):
    conn = None
    logger.debug("Executing query: %s", text)
    max_attempts = 5
    delay_seconds = 1.0

    for attempt in range(1, max_attempts + 1):
        try:
            # Connect to DuckDB (in-memory database or specify a file if needed)
            conn = duckdb.connect()
            if return_as_df:
                # Execute the query and fetch results
                return conn.execute(f"{text}").df()
            return conn.execute(f"{text}").fetchall()
        except duckdb.IOException as exc:
            message = str(exc)
            no_files_yet = "No files found that match the pattern" in message

            if not no_files_yet:
                return _build_duckdb_error_payload(exc, query_text=text)

            try:
                mnt_entries = sorted(os.listdir("/mnt"))[:30]
            except Exception as list_exc:
                mnt_entries = [f"<failed to list /mnt: {list_exc}>"]

            logger.error(
                "DuckDB parquet path miss in modal query | attempt=%s/%s bucket_resolved=%s env_BUCKET_NAME=%s mnt_exists=%s mnt_entries_sample=%s sql=%s err=%s",
                attempt,
                max_attempts,
                BUCKET_NAME,
                os.environ.get("BUCKET_NAME"),
                os.path.isdir("/mnt"),
                mnt_entries,
                text,
                exc,
            )

            if attempt == max_attempts:
                return _build_duckdb_error_payload(exc, query_text=text)

            time.sleep(delay_seconds)
            delay_seconds = min(delay_seconds * 2.0, 8.0)
        except duckdb.Error as exc:
            return _build_duckdb_error_payload(exc, query_text=text)
        finally:
            if conn is not None:
                conn.close()
                conn = None


@app.function(
    volumes={
        "/mnt": modal.CloudBucketMount(
            bucket_name=BUCKET_NAME,
            bucket_endpoint_url="https://storage.googleapis.com/",
            secret=gcp_hmac_secret,
        )
    },
    timeout=30,
    retries=modal.Retries(
        max_retries=2,
        backoff_coefficient=1.0,
        initial_delay=1.0,
    ),
    secrets=[gcp_hmac_secret],
)
def query_column(convex_project_id, column, sql_filter, query_params, limit="limit 10"):
    # TODO: right now we only support existing columns
    # TODO: validate column name
    # TODO: validate data format
    # TODO: even if category exists, the folder may not in the storage
    conn = None
    query_text = ""

    mount_dir = f"/mnt/{convex_project_id}/"

    exists = False
    # Check if the directory exists
    if os.path.isdir(mount_dir + column):
        exists = True

    # TODO: Pull this from metadata storage
    dataset_config = DatasetConfig()
    id_column_name = dataset_config.PRIMARY_KEY_COLUMN

    try:
        # Connect to DuckDB (in-memory database or specify a file if needed)
        conn = duckdb.connect()
        if exists:
            # still need to check whether the column exists in the original table (the data table(s) in parquet thats in the root location)
            # Query to check if the column exists
            query_if_column_exists_in_root_table = f"""
    	SELECT column_name
    	FROM information_schema.columns
    	WHERE table_name = 'data'
    	  AND column_name = '{column}';
    	"""

            # Execute the query
            column_exists_in_root_table = conn.execute(
                query_if_column_exists_in_root_table
            ).fetchall()

            condition_for_existence = (
                f"data.{column} is null and {column}.{column} is null"
            )
            if not column_exists_in_root_table:
                condition_for_existence = f"{column}.{column} is null"

            # Load the first file as one table and the second as another
            query_text = f"""
    	SELECT 
    	  {query_params}
    	FROM 
    		read_parquet('/mnt/{convex_project_id}/*.parquet') AS data
    	left JOIN 
    		read_parquet('/mnt/{convex_project_id}/{column}/**/*.parquet') AS {column}
    	ON 
    		{column}.{id_column_name} = data.{id_column_name}
    	where 
    		{sql_filter} and {condition_for_existence}
    	order by data.{id_column_name}
    	{limit}
    	"""

            # Execute the query and fetch results
            result = conn.execute(query_text).fetchall()
        else:
            query_text = f"""
    	SELECT 
    	  {query_params}
    	FROM 
    	  read_parquet('/mnt/{convex_project_id}/*.parquet') AS data
    	where 
    	  {sql_filter}
    	order by data.{id_column_name}
    	{limit}
    	"""
            # Execute the query and fetch results
            result = conn.execute(query_text).fetchall()
    except duckdb.Error as exc:
        return _build_duckdb_error_payload(exc, query_text=query_text)
    finally:
        if conn is not None:
            conn.close()

    return result


@app.function(
    volumes={
        "/mnt": modal.CloudBucketMount(
            bucket_name=BUCKET_NAME,
            bucket_endpoint_url="https://storage.googleapis.com/",
            secret=gcp_hmac_secret,
        )
    },
    secrets=[gcp_hmac_secret],
)
async def transcribe_audio(input: MP3ToTextRequest):
    error_queue = modal.Queue.from_name(
        f"{input.job_id}-errors",
        create_if_missing=True,
        environment_name=os.environ.get("ENV"),
    )
    # TODO: This is a huge issue we probably need to change
    my_queue = modal.Queue.from_name(
        f"{input.job_id}-successes",
        create_if_missing=True,
        environment_name=os.environ.get("ENV"),
    )

    try:
        file_id = input.file_path
        mount_dir = "/mnt/files"
        file_path = f"{mount_dir}/{file_id}"
        fal_client = FalTranscriptionClient()
        results = await fal_client.transcribe_files([(file_id, file_path)])
        logger.debug("Fal transcription finished for %s", file_id)

        # Send usage events to billing system
        try:
            usage_cop = _get_usage_cop_service(input.customer_id)
            trace_id = str(uuid.uuid4())

            # TEMP: Pause sending modal function invoked events from modal.
            # modal_event_data = ModalFunctionInvokedEventData(
            #     customer_id=input.customer_id,
            #     sheet_id=input.convex_info.convex_project_id,
            #     function="transcribe_audio",
            #     rows=1,
            # )
            # modal_event = modal_function_invoked_event(modal_event_data)
            # usage_cop.send_usage_batch([modal_event])

            # Extract duration from results and send Fal transcription event
            transcription_data = results[file_id]
            duration_seconds = (
                transcription_data.get("duration", 0.0)
                if isinstance(transcription_data, dict)
                else 0.0
            )

            fal_event_data = FalTranscriptionEventData(
                customer_id=input.customer_id,
                file_id=file_id,
                duration_seconds=duration_seconds,
                trace_id=trace_id,
            )
            fal_event = fal_transcription_event(fal_event_data)
            usage_cop.send_usage_batch([fal_event])

        except Exception as billing_error:
            # Log and continue (do not fail the main function)
            logger.exception(
                "[billing] transcribe_audio failed | cust=%s file=%s: %s",
                input.customer_id,
                file_id,
                billing_error,
            )

        result = TranscriptionResult(
            convex_info=input.convex_info,
            duck_db_id=input.datalakehouse_info.id,
            value=results[file_id],
        )
        my_queue.put(
            result,
            partition=str(ModalQueuePartition(input.datalakehouse_info.column_name)),
        )
        return result
    except Exception as e:
        exception_object = {
            "convex_project_id": input.convex_info.convex_project_id,
            "convex_column_id": input.convex_info.convex_column_id,
            "convex_row_id": input.convex_info.convex_row_id,
            "convex_row_order": input.convex_info.convex_row_order,
            "id": input.datalakehouse_info.id,
            "column": input.datalakehouse_info.column_name,
            "error": f"error {e}",
        }
        error_queue.put(
            json.dumps(exception_object),
            partition=str(ModalQueuePartition(input.datalakehouse_info.column_name)),
        )
        return exception_object


@app.function(
    volumes={
        "/mnt": modal.CloudBucketMount(
            bucket_name=BUCKET_NAME,
            bucket_endpoint_url="https://storage.googleapis.com/",
            secret=gcp_hmac_secret,
        )
    },
    secrets=[gcp_hmac_secret],
)
async def transcribe_pdf(input: PDFToMarkdownRequest):
    error_queue = modal.Queue.from_name(
        f"{input.job_id}-errors",
        create_if_missing=True,
        environment_name=os.environ.get("ENV"),
    )
    # TODO: This is a huge issue we probably need to change
    my_queue = modal.Queue.from_name(
        f"{input.job_id}-successes",
        create_if_missing=True,
        environment_name=os.environ.get("ENV"),
    )

    marker_client = MarkerClient(api_key=os.environ["MARKER_API_KEY"])
    logger.debug("transcribe_pdf input for file=%s", input.file_path)
    file_id = input.file_path
    mount_dir = "/mnt/files"
    file_path = f"{mount_dir}/{file_id}"
    try:
        result_data = marker_client.convert_file(
            file_path, output_format="markdown", content_type=input.content_type
        )
        val = result_data.get("total_cost") if isinstance(result_data, dict) else None
        total_cost = 0.0 if val is None else val

        # Send usage events to billing system
        try:
            usage_cop = _get_usage_cop_service(input.customer_id)
            trace_id = str(uuid.uuid4())

            # TEMP: Pause sending modal function invoked events from modal.
            # modal_event_data = ModalFunctionInvokedEventData(
            #     customer_id=input.customer_id,
            #     sheet_id=input.convex_info.convex_project_id,
            #     function="transcribe_pdf",
            #     rows=1,
            # )
            # modal_event = modal_function_invoked_event(modal_event_data)
            # usage_cop.send_usage_batch([modal_event])

            # Send Datalab document processing event
            pages_processed = (
                result_data.get("page_count", 0) if isinstance(result_data, dict) else 1
            )

            # Keep minimal logging; pages at debug level
            logger.debug(
                "pages_processed=%s | func=transcribe_pdf cust=%s file=%s",
                pages_processed,
                input.customer_id,
                file_id,
            )

            datalab_event_data = DatalabDocumentProcessingEventData(
                customer_id=input.customer_id,
                file_id=file_id,
                pages_processed=pages_processed,
                content_type=input.content_type,
                cost=total_cost,
                trace_id=trace_id,
            )
            datalab_event = datalab_document_processing_event(datalab_event_data)

            # Attempt to send; only log exceptions
            try:
                usage_cop.send_usage_batch([datalab_event])
            except Exception as e:
                logger.exception(
                    "[billing] datalab event send failed | func=transcribe_pdf cust=%s file=%s: %s",
                    input.customer_id,
                    file_id,
                    e,
                )

        except Exception as billing_error:
            # Log and continue
            logger.exception(
                "[billing] transcribe_pdf failed | cust=%s file=%s: %s",
                input.customer_id,
                file_id,
                billing_error,
            )

        # Package result
        marker_result = PDFResult(
            convex_info=input.convex_info,
            duck_db_id=input.datalakehouse_info.id,
            value=result_data["markdown"],
            usage=Usage(cost=total_cost),
        )

        # Put success into queue
        logger.debug("Marker conversion succeeded for %s", file_path)

        my_queue.put(
            marker_result,
            partition=str(ModalQueuePartition(input.datalakehouse_info.column_name)),
        )
        return marker_result

    except Exception as e:
        # On error, put into error queue
        exception_object = {
            "convex_project_id": input.convex_info.convex_project_id,
            "convex_column_id": input.convex_info.convex_column_id,
            "convex_row_id": input.convex_info.convex_row_id,
            "convex_row_order": input.convex_info.convex_row_order,
            "id": input.datalakehouse_info.id,
            "column": input.datalakehouse_info.column_name,
            "error": f"error {e}",
        }
        logger.error("Marker conversion failed for %s: %s", file_path, e)
        error_queue.put(
            json.dumps(exception_object),
            partition=str(ModalQueuePartition(input.datalakehouse_info.column_name)),
        )
        return exception_object


@app.function(
    volumes={
        "/mnt": modal.CloudBucketMount(
            bucket_name=BUCKET_NAME,
            bucket_endpoint_url="https://storage.googleapis.com/",
            secret=gcp_hmac_secret,
        )
    },
    secrets=[gcp_hmac_secret],
)
async def transcribe_xml(input: XMLToMarkdownRequest):
    os.environ["MARKER_API_KEY"] = "S8DUNOKeAWCNmdqDUgDFJvrWzgDGAuFuHqKBd7GCtuA"

    error_queue = modal.Queue.from_name(
        f"{input.job_id}-errors",
        create_if_missing=True,
        environment_name=os.environ.get("ENV"),
    )
    my_queue = modal.Queue.from_name(
        f"{input.job_id}-successes",
        create_if_missing=True,
        environment_name=os.environ.get("ENV"),
    )

    marker_client = MarkerClient(api_key=os.environ["MARKER_API_KEY"])
    file_id = input.file_path
    mount_dir = "/mnt/files"
    file_path = f"{mount_dir}/{file_id}"
    try:
        result_data = marker_client.convert_file(
            file_path, output_format="markdown", content_type=input.content_type
        )
        val = result_data.get("total_cost") if isinstance(result_data, dict) else None
        total_cost = 0.0 if val is None else val
        # Send usage events to billing system
        try:
            usage_cop = _get_usage_cop_service(input.customer_id)
            trace_id = str(uuid.uuid4())

            # TEMP: Pause sending modal function invoked events from modal.
            # modal_event_data = ModalFunctionInvokedEventData(
            #     customer_id=input.customer_id,
            #     sheet_id=input.convex_info.convex_project_id,
            #     function="transcribe_xml",
            #     rows=1,
            # )
            # modal_event = modal_function_invoked_event(modal_event_data)
            # usage_cop.send_usage_batch([modal_event])

            # Send Datalab document processing event
            pages_processed = (
                result_data.get("page_count", 1) if isinstance(result_data, dict) else 1
            )

            logger.debug(
                "pages_processed=%s | func=transcribe_xml cust=%s file=%s",
                pages_processed,
                input.customer_id,
                file_id,
            )

            datalab_event_data = DatalabDocumentProcessingEventData(
                customer_id=input.customer_id,
                file_id=file_id,
                pages_processed=pages_processed,
                content_type=input.content_type,
                cost=total_cost,
                trace_id=trace_id,
            )
            datalab_event = datalab_document_processing_event(datalab_event_data)

            try:
                usage_cop.send_usage_batch([datalab_event])
            except Exception as e:
                logger.exception(
                    "[billing] datalab event send failed | func=transcribe_xml cust=%s file=%s: %s",
                    input.customer_id,
                    file_id,
                    e,
                )

        except Exception as billing_error:
            logger.exception(
                "[billing] transcribe_xml failed | cust=%s file=%s: %s",
                input.customer_id,
                file_id,
                billing_error,
            )

        marker_result = PDFResult(
            convex_info=input.convex_info,
            duck_db_id=input.datalakehouse_info.id,
            value=result_data["markdown"],
            usage=Usage(cost=total_cost),
        )

        my_queue.put(
            marker_result,
            partition=str(ModalQueuePartition(input.datalakehouse_info.column_name)),
        )
        return marker_result

    except Exception as e:
        exception_object = {
            "convex_project_id": input.convex_info.convex_project_id,
            "convex_column_id": input.convex_info.convex_column_id,
            "convex_row_id": input.convex_info.convex_row_id,
            "convex_row_order": input.convex_info.convex_row_order,
            "id": input.datalakehouse_info.id,
            "column": input.datalakehouse_info.column_name,
            "error": f"error {e}",
        }
        error_queue.put(
            json.dumps(exception_object),
            partition=str(ModalQueuePartition(input.datalakehouse_info.column_name)),
        )
        return exception_object


@app.function(timeout=1200, secrets=[gcp_hmac_secret])
def spawn_processes_task(
    _job: dict,
    _items: List[dict],
    column_name: str,
    job_id: str,
    env: str,
    workflow_id: str,
):
    # deserialize the items
    items = [SheetTask(**item) for item in _items]
    results = []
    first_item = items[0]

    llm_task_mapping = {
        SheetTaskType.LLM_PROCESSING_WITH_OPENAI: (
            OpenAITaskProcessingBackend,
            process_with_openai,
            "process_with_openai",
        ),
        SheetTaskType.LLM_PROCESSING_WITH_GEMINI: (
            GeminiTaskProcessingBackend,
            process_with_gemini,
            "process_with_gemini",
        ),
        SheetTaskType.LLM_PROCESSING_WITH_ANTHROPIC: (
            AnthropicTaskProcessingBackend,
            process_with_anthropic,
            "process_with_anthropic",
        ),
    }

    if first_item.type in llm_task_mapping:
        backend_cls, process_fn, task_name = llm_task_mapping[first_item.type]

        if not first_item.prompt:
            raise ValueError("SheetTask must have a prompt for LLM processing")

        # Get the model name from the prompt
        if isinstance(first_item.prompt, TextGenerationPromptModel):
            model_name = first_item.prompt.model
        elif isinstance(first_item.prompt, StructuredOutputPromptModel):
            model_name = first_item.prompt.model
        else:
            raise ValueError(f"Unknown prompt type: {type(first_item.prompt)}")

        task_processing_backend = backend_cls(
            job_id=job_id,
            task_name=task_name,
            column_name=column_name,
            model_name=model_name,
        )
        results = process_fn.map(
            [
                task_processing_backend.convert_generic_sheet_task_to_specific_task(
                    item
                )
                for item in items
            ],
            return_exceptions=True,
            wrap_returned_exceptions=False,
        )
    elif first_item.type == SheetTaskType.PDF_TRANSCRIPTION_WITH_MARKER:
        task_processing_backend = PDFToMarkdownTaskProcessingBackend(
            job_id=job_id, task_name="transcribe_pdf", column_name=column_name
        )
        results = transcribe_pdf.map(
            [
                task_processing_backend.convert_generic_sheet_task_to_specific_task(
                    item
                )
                for item in items
            ],
            return_exceptions=True,
            wrap_returned_exceptions=False,
        )
    elif first_item.type == SheetTaskType.XML_TRANSCRIPTION_WITH_MARKER:
        task_processing_backend = XMLToMarkdownTaskProcessingBackend(
            job_id=job_id, task_name="transcribe_xml", column_name=column_name
        )
        results = transcribe_xml.map(
            [
                task_processing_backend.convert_generic_sheet_task_to_specific_task(
                    item
                )
                for item in items
            ],
            return_exceptions=True,
            wrap_returned_exceptions=False,
        )
    elif first_item.type == SheetTaskType.TRANSCRIPTION_WITH_FAL:
        task_processing_backend = MP3ToTextTaskProcessingBackend(
            job_id=job_id, task_name="transcribe_audio", column_name=column_name
        )
        results = transcribe_audio.map(
            [
                task_processing_backend.convert_generic_sheet_task_to_specific_task(
                    item
                )
                for item in items
            ],
            return_exceptions=True,
            wrap_returned_exceptions=False,
        )
    else:
        raise ValueError("Unknown task type")
    return list(results)


from openai import OpenAI
import json


@app.function(max_containers=100, secrets=[gcp_hmac_secret])
async def process_with_openai(input: LLMProcessingTaskWithSingleColumnRequest):
    error_queue = modal.Queue.from_name(
        f"{input.job_id}-errors",
        create_if_missing=True,
        environment_name=os.environ.get("ENV"),
    )
    # TODO: This is a huge issue we probably need to change
    my_queue = modal.Queue.from_name(
        f"{input.job_id}-successes",
        create_if_missing=True,
        environment_name=os.environ.get("ENV"),
    )

    try:
        client = OpenAI()

        # TODO: validate data before sending it away
        id = input.datalakehouse_info.id
        column = input.datalakehouse_info.column_name
        task_data = input.task

        response = client.chat.completions.create(**task_data)

        usage = getattr(response, "usage", None)
        input_tokens = getattr(usage, "prompt_tokens", 0) or 0
        output_tokens = getattr(usage, "completion_tokens", 0) or 0
        total_tokens = getattr(usage, "total_tokens", 0) or (
            input_tokens + output_tokens
        )

        trace_id = f"{input.job_id}:{id}"
        try:
            if not input.customer_id:
                raise ValueError("customer_id is required")

            usage_cop = _get_usage_cop_service(input.customer_id)

            # TEMP: Pause sending modal function invoked events from modal.
            # modal_event_data = ModalFunctionInvokedEventData(
            #     customer_id=input.customer_id,
            #     sheet_id=input.convex_info.convex_project_id,
            #     function="process_with_openai",
            #     rows=1,
            #     transaction_id=f"{trace_id}:invoke",
            # )
            # modal_event = modal_function_invoked_event(modal_event_data)

            # TEMP: Pause sending AI usage events from modal. Moved to QueueMonitor.
            # ai_event_data = AiCallFinalizedEventData(
            #     customer_id=input.customer_id,
            #     provider="openai",
            #     model=(
            #         task_data.get("model", "unknown")
            #         if isinstance(task_data, dict)
            #         else "unknown"
            #     ),
            #     input_tokens=input_tokens,
            #     output_tokens=output_tokens,
            #     total_tokens=total_tokens,
            #     trace_id=trace_id,
            # )
            # ai_event = ai_call_finalized_event(ai_event_data)

            # usage_cop.send_usage_batch([modal_event])
        except Exception as billing_error:
            # Log billing errors for troubleshooting but don't fail the main function
            logger.exception(
                "[billing] process_with_openai failed | cust=%s: %s",
                input.customer_id,
                billing_error,
            )

        result = LLMProcessingResult(
            convex_info=input.convex_info,
            duck_db_id=id,
            value=response,
            customer_id=input.customer_id,
        )

        # TODO: Handle 500s/ throttling
        my_queue.put(result, partition=str(ModalQueuePartition(column)))
        logger.debug("result %s", result)

    except Exception as e:
        logger.debug("partition key is %s", str(ModalQueuePartition(column)))
        exception_object = {
            "convex_project_id": input.convex_info.convex_project_id,
            "convex_column_id": input.convex_info.convex_column_id,
            "convex_row_id": input.convex_info.convex_row_id,
            "convex_row_order": input.convex_info.convex_row_order,
            "id": input.datalakehouse_info.id,
            "column": input.datalakehouse_info.column_name,
            "error": f"error {e}",
        }
        error_queue.put(
            json.dumps(exception_object), partition=str(ModalQueuePartition(column))
        )
        logger.exception("process_with_openai failed: %s", e)
        return

    return result


@app.function(max_containers=100, secrets=[gcp_hmac_secret])
async def process_with_gemini(input: LLMProcessingTaskWithSingleColumnRequest):
    error_queue = modal.Queue.from_name(
        f"{input.job_id}-errors",
        create_if_missing=True,
        environment_name=os.environ.get("ENV"),
    )
    success_queue = modal.Queue.from_name(
        f"{input.job_id}-successes",
        create_if_missing=True,
        environment_name=os.environ.get("ENV"),
    )

    column = input.datalakehouse_info.column_name

    try:
        api_key = (input.api_keys or {}).get("google_gemini")
        api_key = api_key or os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY is required for Gemini processing")

        genai.configure(api_key=api_key)

        task_payload = input.task
        if not isinstance(task_payload, dict):
            raise ValueError("Gemini task payload must be a dictionary")

        model_name = task_payload.get("model")
        if not model_name:
            raise ValueError("Gemini task payload missing model name")

        system_instruction = task_payload.get("system_instruction")
        raw_generation_config = task_payload.get("generation_config") or {}

        model_kwargs = {}
        if system_instruction:
            model_kwargs["system_instruction"] = system_instruction
        if raw_generation_config:
            model_kwargs["generation_config"] = dict(raw_generation_config)

        response_schema = task_payload.get("response_schema")
        response_mime_type = task_payload.get("response_mime_type")

        if response_schema or response_mime_type:
            generation_config = dict(model_kwargs.get("generation_config", {}))
            if response_schema is not None:
                generation_config["response_schema"] = response_schema
            if response_mime_type is not None:
                generation_config["response_mime_type"] = response_mime_type
            model_kwargs["generation_config"] = generation_config

        model = genai.GenerativeModel(model_name=model_name, **model_kwargs)

        contents = task_payload.get("contents") or []
        response = model.generate_content(contents=contents)

        usage_metadata = getattr(response, "usage_metadata", None)

        def _usage_value(*keys: str) -> int:
            if not usage_metadata:
                return 0
            for key in keys:
                value = getattr(usage_metadata, key, None)
                if value is not None:
                    try:
                        return int(value)
                    except (TypeError, ValueError):
                        continue
            return 0

        input_tokens = _usage_value("prompt_token_count", "input_token_count")
        output_tokens = _usage_value(
            "candidates_token_count",
            "output_token_count",
        )
        total_tokens = _usage_value("total_token_count")
        if not total_tokens:
            total_tokens = input_tokens + output_tokens

        response_text = getattr(response, "text", None)
        if not response_text and getattr(response, "candidates", None):
            parts = []
            first_candidate = response.candidates[0]
            content_obj = getattr(first_candidate, "content", None)
            candidate_parts = getattr(content_obj, "parts", None)
            if candidate_parts:
                for part in candidate_parts:
                    part_text = getattr(part, "text", None)
                    if isinstance(part_text, str):
                        parts.append(part_text)
            if parts:
                response_text = "\n".join(parts)

        serialized_response: dict[str, Any] = {
            "text": response_text,
            "usage": {
                "prompt_tokens": input_tokens,
                "completion_tokens": output_tokens,
                "total_tokens": total_tokens,
            },
        }

        candidates_serialized = []
        for candidate in getattr(response, "candidates", []) or []:
            candidate_content = getattr(candidate, "content", None)
            parts = getattr(candidate_content, "parts", None)
            if not parts:
                continue
            serialized_parts = []
            for part in parts:
                part_text = getattr(part, "text", None)
                if isinstance(part_text, str):
                    serialized_parts.append({"text": part_text})
            if serialized_parts:
                candidates_serialized.append({"parts": serialized_parts})

        if candidates_serialized:
            serialized_response["candidates"] = candidates_serialized

        result = LLMProcessingResult(
            convex_info=input.convex_info,
            duck_db_id=input.datalakehouse_info.id,
            value=serialized_response,
            customer_id=input.customer_id,
        )

        success_queue.put(result, partition=str(ModalQueuePartition(column)))

    except Exception as exc:  # pragma: no cover - modal runtime
        exception_object = {
            "convex_project_id": input.convex_info.convex_project_id,
            "convex_column_id": input.convex_info.convex_column_id,
            "convex_row_id": input.convex_info.convex_row_id,
            "convex_row_order": input.convex_info.convex_row_order,
            "id": input.datalakehouse_info.id,
            "column": column,
            "error": f"error {exc}",
        }
        error_queue.put(
            json.dumps(exception_object), partition=str(ModalQueuePartition(column))
        )
        logger.exception("process_with_gemini failed: %s", exc)
        return

    return result


@app.function(max_containers=100, secrets=[gcp_hmac_secret])
async def process_with_anthropic(input: LLMProcessingTaskWithSingleColumnRequest):
    error_queue = modal.Queue.from_name(
        f"{input.job_id}-errors",
        create_if_missing=True,
        environment_name=os.environ.get("ENV"),
    )
    success_queue = modal.Queue.from_name(
        f"{input.job_id}-successes",
        create_if_missing=True,
        environment_name=os.environ.get("ENV"),
    )

    column = input.datalakehouse_info.column_name

    try:
        api_key = (input.api_keys or {}).get("anthropic") or os.environ.get(
            "ANTHROPIC_API_KEY"
        )
        if not api_key:
            raise ValueError("ANTHROPIC_API_KEY is required for Anthropic processing")

        client = Anthropic(api_key=api_key)

        if not isinstance(input.task, dict):
            raise ValueError("Anthropic task payload must be a dictionary")

        task_payload: Dict[str, Any] = input.task
        model_name = task_payload.get("model")
        if not model_name:
            raise ValueError("Anthropic task payload missing model name")

        messages = task_payload.get("messages") or []
        max_output_tokens = task_payload.get("max_output_tokens", 1024)

        request_kwargs: Dict[str, Any] = {
            "model": model_name,
            "messages": messages,
            "max_output_tokens": max_output_tokens,
        }

        system_prompt = task_payload.get("system")
        if system_prompt:
            request_kwargs["system"] = system_prompt

        response_format = task_payload.get("response_format")
        if response_format:
            request_kwargs["response_format"] = response_format

        response = client.messages.create(**request_kwargs)

        usage = getattr(response, "usage", None)
        input_tokens = int(getattr(usage, "input_tokens", 0) or 0)
        output_tokens = int(getattr(usage, "output_tokens", 0) or 0)
        total_tokens = int(
            getattr(usage, "total_tokens", 0) or (input_tokens + output_tokens)
        )

        content_blocks: List[Dict[str, Any]] = []
        collected_texts: List[str] = []
        for block in getattr(response, "content", []) or []:
            block_type = getattr(block, "type", None)
            block_text = getattr(block, "text", None)
            if isinstance(block_text, str):
                collected_texts.append(block_text)
            if block_type == "text" and isinstance(block_text, str):
                content_blocks.append({"type": "text", "text": block_text})

        response_dict: Dict[str, Any] = {
            "content": content_blocks,
            "text": "\n".join(text for text in collected_texts if text),
            "usage": {
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "total_tokens": total_tokens,
            },
            "stop_reason": getattr(response, "stop_reason", None),
        }

        result = LLMProcessingResult(
            convex_info=input.convex_info,
            duck_db_id=input.datalakehouse_info.id,
            value=response_dict,
            customer_id=input.customer_id,
        )

        success_queue.put(result, partition=str(ModalQueuePartition(column)))

    except Exception as exc:  # pragma: no cover - modal runtime
        exception_object = {
            "convex_project_id": input.convex_info.convex_project_id,
            "convex_column_id": input.convex_info.convex_column_id,
            "convex_row_id": input.convex_info.convex_row_id,
            "convex_row_order": input.convex_info.convex_row_order,
            "id": input.datalakehouse_info.id,
            "column": column,
            "error": f"error {exc}",
        }
        error_queue.put(
            json.dumps(exception_object), partition=str(ModalQueuePartition(column))
        )
        logger.exception("process_with_anthropic failed: %s", exc)
        return

    return result

import gzip
import math
import os
import json
import time
import asyncio
from typing import Any, List, Optional

from celery import chain
from pydantic import BaseModel
import httpx

from bg_tasks.spawn_process_task import spawn_process_task_v2
from folio.utils.cell_states.cell_states_helper import CellStates
from folio.utils.convex_client import ConvexClient
from folio.utils.dataset_processor.dataset_processor import TabularDataProcessor
from folio.utils.job_executor.job_types import (
    ExternallySyncedJob,
    ExternallySyncedJobUpdate,
    JobState,
)
from folio.utils.shared_types.shared_types import (
    SheetTask,
    SheetTaskType,
    TaskResult,
    TimeoutExceptionWithData,
    LLMModelName,
)
from folio.utils.queue_monitor import QueueMonitor, QueueMonitorConfig
from folio.utils.task_processor.task_processor import (
    OpenAITaskProcessingBackend,
    GeminiTaskProcessingBackend,
    AnthropicTaskProcessingBackend,
    MP3ToTextTaskProcessingBackend,
    PDFToMarkdownTaskProcessingBackend,
    XMLToMarkdownTaskProcessingBackend,
)
from folio.utils.workflow_runner_client.workflow_runner_client import (
    PrefectWorkflowRunnerClient,
    WorkflowNotFound,
    WorkflowNotPaused,
)

from .app import celery_app


NR_OF_CELLS = 100000


def _resolve_runtime_env() -> str:
    return os.getenv("ENV", "dev")


def _get_convex_api_key() -> str:
    api_key = os.getenv("CONVEX_HTTP_CLIENT_API_KEY")
    if not api_key:
        raise ValueError("CONVEX_HTTP_CLIENT_API_KEY environment variable is not set")
    return api_key


def _build_convex_client(api_key: str, callback_url: Optional[str] = None) -> ConvexClient:
    environment = _resolve_runtime_env()
    if callback_url:
        return ConvexClient(
            api_key, environment=environment, base_url_overwrite=callback_url
        )
    return ConvexClient(api_key, environment=environment)


@celery_app.task
def create_relationships_task(parsed_data, callback_url):

    async def create_relationships():
        api_key = _get_convex_api_key()
        convex_client = _build_convex_client(api_key, callback_url)

        # Function to batch the data
        def batch_data(data, batch_size):
            for i in range(0, len(data), batch_size):
                yield data[i : i + batch_size]

        start_time = time.time()

        async def process():

            tasks = []
            # Async function to process a single batch

            def process_batch(batch, convex_client):
                payload = [
                    {"row_id": item[0], "sheet_id": item[1], "row_number": item[2]}
                    for item in batch
                ]
                # response = convex_client.mutation("relationships:insert", {"pairs": payload, "apiKey": api_key})
                response = convex_client.create_relationships(payload)

                return response

            # Main async function
            batch_size = 250
            for batch in batch_data(parsed_data, batch_size):
                tasks.append(asyncio.to_thread(process_batch, batch, convex_client))
            return await asyncio.gather(*tasks)

        await process()
        end_time = time.time()
        print(
            f"""Time taken to process {len(parsed_data)} items: {
              end_time - start_time} seconds"""
        )

    return asyncio.run(create_relationships())


async def _update_column_in_datalake(
    payload: dict, retries: int = 3, initial_delay: float = 1, backoff: float = 2
):
    """
    Attempts to call the FastAPI endpoint to update a column in the datalake
    with asynchronous HTTP requests that include retries and exponential backoff.

    :param payload: The dictionary payload for updating the column.
    :param retries: Total number of attempts.
    :param initial_delay: Initial delay before the first retry in seconds.
    :param backoff: Factor by which the delay increases after each failure.
    """

    class UpdateColumnInDataLakeRequest(BaseModel):
        convex_project_id: str
        column_name: str
        # TODO: For scalability / reliability purposes,
        # probably better that this is a list of files in the future.
        file: str

    # Validate and deserialize the payload into the Pydantic model.
    request_obj = UpdateColumnInDataLakeRequest(**payload)

    # Construct the URL based on the API port environment variable.
    port = os.getenv("API_PORT", "8000")
    url = f"http://localhost:{port}/update_column_in_datalake"

    delay = initial_delay
    async with httpx.AsyncClient(timeout=300.0) as client:
        for attempt in range(1, retries + 1):
            try:
                response = await client.post(url, json=request_obj.model_dump())
                response.raise_for_status()  # Raise an error for HTTP error responses.
                print(f"Successfully updated column: {response.json()}")
                return response.json()
            except httpx.HTTPError as e:
                print(f"Attempt {attempt} failed with error: {e}")
                if attempt == retries:
                    raise  # Re-raise exception if it's the last attempt.
                await asyncio.sleep(delay)
                delay *= backoff


# to_insert is currently the same shape as the output of


class ConvexClientNotifier:

    def __init__(self, original_task_count: int = 0):
        self.api_key = _get_convex_api_key()
        self.original_task_count = original_task_count

    async def update_column_with_retry(
        self, client: ConvexClient, payload, retries=3, initial_delay=1, backoff=2
    ):
        """
        Attempts to call client.update_column(payload) with retries and exponential backoff.

        :param client: The convex_client instance.
        :param payload: The payload to pass to update_column.
        :param retries: Total number of attempts.
        :param initial_delay: Delay before the first retry (in seconds).
        :param backoff: Factor by which the delay increases each retry.
        """
        delay = initial_delay
        for attempt in range(1, retries + 1):
            try:
                client.update_column(payload)
                print("update_column succeeded")
                return
            except Exception as e:
                print(f"Attempt {attempt} failed with error: {e}")
                if attempt == retries:
                    raise  # Re-raise exception if it's the last attempt
                await asyncio.sleep(delay)
                delay *= backoff

    def to_str_max_100kb(self, obj: Any) -> str:
        MAX_BYTES = 64 * 1024  # 64 KB
        raw = str(obj)
        b = raw.encode("utf-8")
        if len(b) <= MAX_BYTES:
            return raw
        # cut to 100 KB minus space for an ellipsis and ensure we end on a
        # full UTF-8 code point so decode never fails
        clipped = b[: MAX_BYTES - 3]
        clipped = clipped.decode("utf-8", errors="ignore")
        return clipped + "…"

    async def send_data(
        self,
        to_insert: List[TaskResult],
        cell_states: CellStates,
        callback_url: str,
        is_error: bool = False,
    ):
        """
        to_insert: List of LLMProcessingResult or SheetTask - a list can either be a set of LLMProcessingResult (in the happy case)
            or a set of SheetTask (in the error case). Basically if there is any error in the processing we send back the original.
            TODO: this is a bit of a hack, because an LLMProcesingResult should be able to have an error.
        """
        if len(to_insert) == 0:  # No results to send back
            return

        convex_client = _build_convex_client(self.api_key, callback_url)

        def batch_data(data, batch_size):
            for i in range(0, len(data), batch_size):
                yield data[i : i + batch_size]

        for batch in batch_data(to_insert, 250):
            rows = []
            cells = []

            if not is_error:
                for item in batch:
                    cells.append(
                        {
                            "column_id": item.convex_info.convex_column_id,
                            "value": self.to_str_max_100kb(item.value),
                            "state": "default",
                        }
                    )
                    rows.append(str(item.convex_info.convex_row_id))

            payload = {
                # TODO: We are again assuming that for each job, its only items from the same column
                "column": batch[0].convex_info.convex_column_id,
                "cell_state": cell_states.to_json(),
                "rows": rows,
                "cells": cells,
            }

            print(f"Sending {len(rows)} rows to convex")
            await self.update_column_with_retry(convex_client, payload)

    async def update_job_status(
        self,
        job_update: ExternallySyncedJobUpdate,
        callback_url: str,
    ) -> None:

        convex_client = _build_convex_client(self.api_key, callback_url)

        try:
            await convex_client.update_job(
                job_update.job_id, job_update.model_dump_json()
            )
            # your implementation goes here
        except Exception as e:
            # This is not a critical error so its ok to move on.
            # TODO: Retry request
            print(f"Error updating job status: {e}")

        if job_update.state == JobState.FAILURE:
            print(f"[JOB_FAILURE]: {job_update.model_dump_json()}")

        # convex_client.update_job(job.job_id, Job(**job.model_dump()))


@celery_app.task()
def check_on_queue_task(
    _job: dict,
    output_name: str,
    callback_url: str,
    column_name: str,
    convex_project_id: str,
    job_id: str,
    env: str,
    workflow_id: str,
    original_task_list_duck_db_ids: List[int],
    original_task_list_row_orders: List[int],
    task_list_type: str,
    model_name: Optional[LLMModelName] = None,
    is_final_batch: bool = True,
    total_task_list_count: int = 0,
):
    llm_task_mapping = {
        SheetTaskType.LLM_PROCESSING_WITH_OPENAI.value: (
            OpenAITaskProcessingBackend,
            "process_with_openai",
        ),
        SheetTaskType.LLM_PROCESSING_WITH_GEMINI.value: (
            GeminiTaskProcessingBackend,
            "process_with_gemini",
        ),
        SheetTaskType.LLM_PROCESSING_WITH_ANTHROPIC.value: (
            AnthropicTaskProcessingBackend,
            "process_with_anthropic",
        ),
    }

    if task_list_type in llm_task_mapping:
        backend_cls, task_name = llm_task_mapping[task_list_type]
        task_processing_backend = backend_cls(
            job_id=job_id,
            task_name=task_name,
            column_name=column_name,
            model_name=model_name,
        )
    elif task_list_type == SheetTaskType.PDF_TRANSCRIPTION_WITH_MARKER:
        task_processing_backend = PDFToMarkdownTaskProcessingBackend(
            job_id=job_id, task_name="transcribe_pdf", column_name=column_name
        )
    elif task_list_type == SheetTaskType.XML_TRANSCRIPTION_WITH_MARKER:
        task_processing_backend = XMLToMarkdownTaskProcessingBackend(
            job_id=job_id, task_name="transcribe_xml", column_name=column_name
        )
    elif task_list_type == SheetTaskType.TRANSCRIPTION_WITH_FAL:
        task_processing_backend = MP3ToTextTaskProcessingBackend(
            job_id=job_id, task_name="transcribe_audio", column_name=column_name
        )
    else:
        raise ValueError("Unknown task type")
    # task_processing_backend = LocalTaskProcessingBackend(
    #     job_id=job_id, env=env, tasks=original_task_list
    # )

    job = ExternallySyncedJob(**_job)

    queue_monitor_config = QueueMonitorConfig(
        job_id=job_id,
        column_name=column_name,
        convex_project_id=convex_project_id,
        total_cells=NR_OF_CELLS,
        callback_url=callback_url,
        output_name=output_name,
        original_task_list_duck_db_ids=original_task_list_duck_db_ids,
        original_task_list_external_row_orders=original_task_list_row_orders,
        is_final_batch=is_final_batch,
        total_task_list_count=total_task_list_count,
    )

    queue_monitor = QueueMonitor(
        job=job,
        task_processing_backend=task_processing_backend,
        config=queue_monitor_config,
        client_notifier=ConvexClientNotifier(
            original_task_count=len(original_task_list_duck_db_ids)
        ),
    )

    async def check_on_queue(_queue_monitor: QueueMonitor):
        await task_processing_backend.verify_queues(column_name)

        to_insert = []

        async def process_job():
            try:
                results = await _queue_monitor.monitor_queues(
                    len(original_task_list_duck_db_ids), is_final_batch
                )
                if results:
                    for result in results:
                        to_insert.append((result.duck_db_id, result.value))

            except TimeoutExceptionWithData as e:
                results = e.data
                if results:
                    for result in results:
                        to_insert.append((result.duck_db_id, result.value))

            except Exception as e:
                print(f"Error processing job: {e}")
                raise

        await process_job()

        if len(to_insert) > 0:
            # TODO: This is duplicate code from the data lakehouse and should be put in a ParquetHelper class
            mount_path = os.getenv("MOUNT_PATH", "../local_tmp")
            local_file = f"{mount_path}/{job_id}.parquet"
            print(f"Attempting to create parquet file and saving it to{local_file}")

            TabularDataProcessor.create_parquet_file(to_insert, column_name, local_file)

            payload = {
                "convex_project_id": convex_project_id,
                "column_name": column_name,
                "file": f"{job_id}.parquet",
            }
            await _update_column_in_datalake(payload)
            # os.remove(local_file)

            # at this point the column already exists (it gets claimed at the very beginning of the process)
            # (local_parquet_file, destination_blob_name) = data_lakehouse.add_data_to_column(column_name=column_name, data_array=to_insert)

            print(f"Saved locally: {local_file}")

        ## If there is a prefect workflow, for example, we want to notify it that the job is done
        ## If threre are multiple batches, we only want to notify on the last batch
        if is_final_batch:
            await notify_workflow_of_completion(
                len(original_task_list_duck_db_ids), to_insert, workflow_id, job_id
            )

        print(f"{len(to_insert)} items successfully processed")

        return _queue_monitor.job.model_dump()

    return asyncio.run(check_on_queue(queue_monitor))


# Helper to convert a single task signature to dict
def signature_to_dict(sig):
    return {
        "task": sig.task,
        "args": sig.args,
        "kwargs": sig.kwargs,
        "options": sig.options,
        "subtask_type": getattr(sig, "subtask_type", "task"),
    }


# Helper to serialize a chain of groups.
def serialize_chain(chain_obj):
    """
    Build a dict representing a Celery chain of signatures.
    """
    return {
        "type": "chain",
        "children": [signature_to_dict(sig) for sig in chain_obj.tasks],
    }


# Set your size threshold (in bytes); 5 MB in this example.
THRESHOLD_BYTES = 100 * 1024 * 1024


@celery_app.task()
def start_processing_daemons_task(
    _job: dict,
    _items: list,  # List[dict] – adjust as needed
    output_name: str,
    callback_url: str,
):
    print("starting start_processing_daemons_task")
    runtime_env = _resolve_runtime_env()

    # Convert the _job dict into your ExternallySyncedJob model
    job = ExternallySyncedJob(**_job)
    # Convert _items to your SheetTask model; assuming at least one item exists.
    item = SheetTask(**_items[0])

    # For convenience:
    original_job_id = job.job_id  # we'll append batch number here
    column_name = item.datalakehouse_info.column_name
    convex_project_id = item.convex_info.convex_project_id
    workflow_id = item.workflow_id

    batch_size = 2500

    def chunk_data(data, chunk_size=batch_size):
        """Yield successive 1000 chunks from data."""
        for i in range(0, len(data), chunk_size):
            yield data[i : i + chunk_size]

    all_signatures = []

    total_batches = math.ceil(len(_items) / batch_size)

    # Enumerate the chunks so we know the "batch_nr"
    for batch_nr, chunk in enumerate(chunk_data(_items, batch_size), start=1):
        duck_db_ids = [item["datalakehouse_info"]["id"] for item in chunk]
        row_orders = [item["convex_info"]["convex_row_order"] for item in chunk]
        task_type = chunk[0]["type"]

        new_job_id = f"{original_job_id}-{batch_nr}"

        start_time = time.time()
        spawn_process_task_v2(
            _job,  # pass the main _job dict (or update it if needed)
            chunk,
            column_name,
            new_job_id,  # updated job_id for this batch
            runtime_env,
            workflow_id,
        )
        end_time = time.time()
        print(
            f"Time taken to spawn processes for batch {batch_nr}: {end_time - start_time} seconds"
        )

        # Create a group with spawn_processes_task + check_on_queue_task in parallel
        if batch_nr == 1:
            all_signatures.append(
                    check_on_queue_task.si(
                        _job,
                        output_name,
                        callback_url,
                        column_name,
                    convex_project_id,
                    new_job_id,
                    runtime_env,
                    workflow_id,
                    duck_db_ids,
                    row_orders,
                    task_type,
                    model_name=(
                        item.prompt.model
                        if item.type
                        in (
                            SheetTaskType.LLM_PROCESSING_WITH_OPENAI,
                            SheetTaskType.LLM_PROCESSING_WITH_GEMINI,
                            SheetTaskType.LLM_PROCESSING_WITH_ANTHROPIC,
                        )
                        else None
                    ),
                    is_final_batch=(batch_nr == total_batches),
                    total_task_list_count=len(_items),  # total number of items
                )
            )
        else:
            all_signatures.append(
                check_on_queue_task.s(
                    # omitting job so that it is supplied by the previous signature
                    output_name,
                    callback_url,
                    column_name,
                    convex_project_id,
                    new_job_id,
                    runtime_env,
                    workflow_id,
                    duck_db_ids,
                    row_orders,
                    task_type,
                    model_name=(
                        item.prompt.model
                        if item.type
                        in (
                            SheetTaskType.LLM_PROCESSING_WITH_OPENAI,
                            SheetTaskType.LLM_PROCESSING_WITH_GEMINI,
                            SheetTaskType.LLM_PROCESSING_WITH_ANTHROPIC,
                        )
                        else None
                    ),
                    is_final_batch=(batch_nr == total_batches),
                    total_task_list_count=len(_items),  # total number of items
                )
            )

    print(f"Broke down into {len(all_signatures)} batches")

    if not all_signatures:
        print("No items to process in start_processing_daemons_task.")
        return "No items"

    # Build the master chain (each group will execute sequentially)
    master_chain = chain(*all_signatures)

    # Now, before dispatching, serialize the master_chain and check its size.
    try:
        chain_dict = serialize_chain(master_chain)
        serialized = json.dumps(chain_dict)
        # Compress to simulate what apply_async(compression='gzip') would do
        compressed = gzip.compress(serialized.encode("utf-8"))
        payload_size = len(compressed)
        print(f"Compressed payload size: {payload_size / (1024*1024):.2f} MB")
    except Exception as e:
        print("Error serializing chain:", e)
        raise

    if payload_size > THRESHOLD_BYTES:
        # Instead of letting Redis choke, give a friendly error.
        error_message = (
            f"Error: The task payload is too large ({payload_size / (1024*1024):.2f} MB). "
            "Please reduce the amount of data or store it externally and pass a reference instead."
        )
        print(error_message)
        raise ValueError(error_message)

    # If the payload size is acceptable, proceed to dispatch the chain.
    result = master_chain.apply_async(compression="gzip")
    return f"Spawned {len(all_signatures)} batch(es); chain result ID: {result.id}"


# Example of how to integrafte with the existing bg_tasks.py
async def notify_workflow_of_completion(
    original_task_list_length: int,
    to_insert: List[TaskResult],
    workflow_id: str = None,
    job_id: str = None,
):
    """
    Send results back to client and notify workflow orchestrator if needed.

    Args:
        to_insert: List of processing results
        cell_states: Current state of cells
        callback_url: URL to call back with results
        workflow_id: Optional ID of workflow to notify when processing is complete
    """

    # If workflow_id is provided, notify the workflow orchestrator
    if workflow_id:
        workflow_client = PrefectWorkflowRunnerClient(os.environ.get("PREFECT_API_URL"))

        try:
            # Verify the workflow exists and is paused
            if await workflow_client.exists(workflow_id):
                # Set metadata with results summary
                metadata = {
                    "initial_list_of_tasks_count": original_task_list_length,
                    "processed_count": len(to_insert),
                    "job_id": job_id,
                }
                # await workflow_client.set_metadata(workflow_id, metadata)

                # Check if the flow is paused and needs resuming
                if await workflow_client.is_paused(workflow_id):
                    # Resume the workflow
                    await workflow_client.resume(workflow_id)
                    print(f"Workflow {workflow_id} resumed successfully")
                else:
                    print(f"Workflow {workflow_id} is not paused, no need to resume")
            else:
                print(f"Workflow {workflow_id} does not exist, skipping notification")

        except (WorkflowNotFound, WorkflowNotPaused) as e:
            print(f"Workflow error: {e}")
        except Exception as e:
            print(f"Unexpected error notifying workflow: {e}")

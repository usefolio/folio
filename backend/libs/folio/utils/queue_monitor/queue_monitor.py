import copy
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
import json
import time
from typing import List, Optional, Protocol, Any, Tuple
import asyncio
import uuid


from folio.utils.cell_states import CellStates, CellState
from folio.utils.job_executor.job_types import (
    ExternallySyncedJob,
    ExternallySyncedJobUpdate,
    JobProgress,
    JobState,
    JobTokenUsage,
)
from folio.utils.random_access_flushable_queue import RandomAccessFlushableQueue
from folio.utils.shared_types.shared_types import (
    SheetTask,
    TaskResult,
    TimeoutExceptionWithData,
    ProcessingResult,
)
from folio.utils.task_processor.task_processor import TaskProcessingBackend
from folio.utils.usage_cop import BillingService, ai_call_finalized_event
from folio.utils.usage_cop.models import AiCallFinalizedEventData


class QueueMonitorException(Exception):
    """Base class for exceptions in DuckDbLakeHouse."""


class ErrorInFetchingQueue(QueueMonitorException):
    """Exception raised for errors in fetching queue. This is like a 500 error."""


class ErrorsInErrorQueue(QueueMonitorException):
    """Exception raised for errors in error queue."""


class Queue(Protocol):
    def len(self, partition: str = None) -> int: ...
    def get_many(
        self, n: int, partition: str = None, timeout: int = None
    ) -> List[Any]: ...


class ClientNotifier(Protocol):

    async def send_data(
        self,
        results: List[TaskResult] | List[SheetTask],
        cell_states: CellStates,
        callback_url: str,
        is_error: bool = False,
    ) -> None: ...

    async def update_job_status(
        self,
        job_update: ExternallySyncedJobUpdate,
        callback_url: str,
    ) -> None: ...


# Attempts to parse the results
class ResultParser(Protocol):
    def __call__(
        self, items: List[TaskResult], output_name: str
    ) -> Tuple[List[TaskResult], List[TaskResult]]: ...


class ErrorParser(Protocol):
    def __call__(self, items: SheetTask) -> List[TaskResult]: ...


@dataclass
class QueueMonitorConfig:
    job_id: str
    column_name: str
    convex_project_id: str
    total_cells: int
    callback_url: str
    output_name: str
    original_task_list_duck_db_ids: List[int]
    original_task_list_external_row_orders: List[int]
    is_final_batch: bool = False
    total_task_list_count: int = (
        0  ## This is the total number of tasks across all jobs from the same original task list
    )


class QueueMonitor:
    def __init__(
        self,
        job: ExternallySyncedJob,
        task_processing_backend: TaskProcessingBackend,
        config: QueueMonitorConfig,
        client_notifier: ClientNotifier,
    ):
        self.logger = logging.getLogger(__name__)
        self.job = job
        self.job_initial_task_count = (
            job.progress.completedCount
            if job.progress and job.progress.completedCount
            else 0
        )
        self.job_initial_token_usage = (
            job.tokenUsage.totalTokens
            if job.tokenUsage and job.tokenUsage.totalTokens
            else 0
        )
        self.job_initial_input_tokens = (
            job.tokenUsage.inputTokens
            if job.tokenUsage and job.tokenUsage.inputTokens
            else 0
        )
        self.job_initial_output_tokens = (
            job.tokenUsage.outputTokens
            if job.tokenUsage and job.tokenUsage.outputTokens
            else 0
        )
        self.task_processor = task_processing_backend
        self.provider: str = task_processing_backend.get_provider() or "openai"
        self.config = config
        self.client_notifier = client_notifier
        self.result_parser = task_processing_backend.get_result_parser()
        # TODO: Right now error parser does not do anything, but in the future we will be able to do stuff like
        # cell xyz had this specific error.
        self.error_parser = task_processing_backend.get_error_parser()
        self.cell_states = CellStates(config.total_cells)
        self.cell_states._initialize_state(config.total_cells, CellState.DEFAULT)
        self.list_of_row_orders = self.config.original_task_list_external_row_orders
        self.cell_states.set_cells(self.list_of_row_orders, CellState.LOADING)
        self.rafq = RandomAccessFlushableQueue()
        self.total_errors = 0
        self.total_input_tokens = 0
        self.total_output_tokens = 0
        self.total_tokens = 0

    async def _update_job_status(self, state, total_tasks_processed, error_reason=None):
        job_progress = JobProgress(
            completedCount=self.job_initial_task_count + total_tasks_processed,
            totalCount=self.config.total_task_list_count,
        )
        updated_at = datetime.now(timezone.utc).isoformat()

        # No need to get model name, it will be None for non-LLM tasks
        token_usage = JobTokenUsage(
            model_name=self.task_processor.get_model_name(),
            inputTokens=self.job_initial_input_tokens + self.total_input_tokens,
            outputTokens=self.job_initial_output_tokens + self.total_output_tokens,
            totalTokens=self.job_initial_token_usage + self.total_tokens,
        )

        job_update_kwargs = dict(
            job_id=self.job.job_id,
            state=state,
            updatedAt=updated_at,
            progress=job_progress,
            tokenUsage=token_usage,
        )

        if error_reason is not None:
            job_update_kwargs["errorReason"] = error_reason

        job_update: ExternallySyncedJobUpdate = ExternallySyncedJobUpdate(
            **job_update_kwargs
        )

        await self.client_notifier.update_job_status(
            job_update,
            self.config.callback_url,
        )

        self.job.state = state
        self.job.updatedAt = updated_at
        self.job.progress = job_progress
        self.job.tokenUsage = token_usage
        if error_reason:
            self.job.errorReason = error_reason

    async def process_success_queue(self) -> int:
        length = await self.task_processor.get_success_queue_length_async()

        if length == 0:
            return 0

        items = await self.task_processor.get_all_items_from_success_queue_async()

        for item in items:
            self.rafq.add_item(item.convex_info.convex_row_order, item, False)
        return length

    async def process_error_queue(self) -> Optional[str]:
        length = await self.task_processor.get_error_queue_length_async()

        if length == 0:
            return []

        errors = await self.task_processor.get_all_items_from_error_queue_async()
        errors_row_orders = [json.loads(error)["convex_row_order"] for error in errors]

        return errors_row_orders

    async def flush_and_notify(self, total_tasks: int):
        unflushed_count = self.rafq.get_total_items_unflushed()
        should_flush = (
            unflushed_count >= 3
            or self.rafq.get_total_items() == total_tasks - self.total_errors
        )

        if should_flush:
            convex_row_orders, flushed = self.rafq.flush_all_unflushed()
            self.cell_states.set_cells(convex_row_orders, CellState.DEFAULT)
            processing_result = self.result_parser(flushed, self.config.output_name)
            # Accumulate token usage from ProcessingResult totals
            self.total_input_tokens += processing_result.input_tokens
            self.total_output_tokens += processing_result.output_tokens
            self.total_tokens += processing_result.total_tokens
            cell_states_to_set_to_error = [
                i.convex_info.convex_row_order for i in processing_result.errors
            ]
            self.cell_states.set_cells(cell_states_to_set_to_error, CellState.ERROR)
            cell_states_copy = copy.deepcopy(self.cell_states)
            await self.client_notifier.send_data(
                processing_result.results, cell_states_copy, self.config.callback_url
            )

            # Emit AI usage events (OpenAI) upon flush, instead of in modal
            try:
                # We expect usage entries to align with results order for LLM tasks
                if processing_result.usage:
                    events_by_customer: dict[str, list] = {}
                    for res, usage in zip(processing_result.results, processing_result.usage):
                        customer_id = getattr(res, "customer_id", None)
                        if not customer_id:
                            continue

                        model_name = getattr(usage, "model_name", "")
                        input_tokens = int(getattr(usage, "input_tokens", 0) or 0)
                        output_tokens = int(getattr(usage, "output_tokens", 0) or 0)
                        total_tokens = int(getattr(usage, "total_tokens", input_tokens + output_tokens) or 0)

                        # Only emit for tokenized calls
                        if not model_name or total_tokens <= 0:
                            continue

                        trace_id = f"{self.config.job_id}:{res.duck_db_id}"
                        data = AiCallFinalizedEventData(
                            customer_id=customer_id,
                            provider=self.provider,
                            model=str(model_name),
                            input_tokens=input_tokens,
                            output_tokens=output_tokens,
                            total_tokens=total_tokens,
                            trace_id=trace_id,
                        )
                        event = ai_call_finalized_event(data)
                        events_by_customer.setdefault(customer_id, []).append(event)

                    for cust_id, events in events_by_customer.items():
                        try:
                            BillingService(cust_id).send_usage_batch(events)
                        except Exception as e:
                            self.logger.exception(
                                "[billing] Failed to send AI usage events | cust=%s: %s",
                                cust_id,
                                e,
                            )
            except Exception as e:
                # Do not fail the job on usage emission failures
                self.logger.exception("[billing] Unexpected error emitting AI usage events: %s", e)
            await self._update_job_status(
                JobState.IN_PROGRESS,
                self.rafq.get_total_items() + self.total_errors,
            )

    async def flush_errors(self, errors: List[str], completeFlush: bool = False):
        if completeFlush:
            errors = self.config.original_task_list_external_row_orders

        self.rafq.set_items_flushed(errors)
        self.cell_states.set_cells(errors, CellState.ERROR)
        cell_states_copy = copy.deepcopy(self.cell_states)
        to_send = []
        for i in self.config.original_task_list_external_row_orders:
            if i in errors:
                to_send.append(i)

        await self.client_notifier.send_data(
            [], cell_states_copy, self.config.callback_url, is_error=True
        )
        self.total_errors += len(errors)
        await self._update_job_status(
            JobState.IN_PROGRESS,
            self.rafq.get_total_items() + self.total_errors,
        )

    async def monitor_queues(
        self, total_tasks: int, is_last_batch: bool = False
    ) -> List[TaskResult]:
        """Main monitoring loop that processes queues and notifies client of updates"""

        await self._update_job_status(
            JobState.IN_PROGRESS,
            0,
        )

        start_time = time.time()
        tasks_pending_at_time = (total_tasks, start_time)
        while True:
            try:
                await self.process_success_queue()
            except Exception as exc:
                # TODO: These two calls are really unecessary, because if we have issues fetching the success queue, nothing
                # was in there to begin with. But its not excluded that we should probably get back row orders and not
                # send an error indiscrimenately here.
                await self.flush_and_notify(total_tasks)
                # TODO: Need to send *all* errors here
                await self.flush_errors([], completeFlush=True)
                raise ErrorInFetchingQueue(
                    "Error in fetching the success queue"
                ) from exc

            errors = await self.process_error_queue()
            if len(errors) > 0:
                await self.flush_errors(errors)
                # TODO: Differentiate between unexpected errors and errors in error queue

            await self.flush_and_notify(total_tasks)

            tasks_pending: int = self.rafq.get_total_items() - (
                total_tasks - self.total_errors
            )

            if tasks_pending == 0:
                break

            ## check if the number of tasks pending has not changed in the last 60 seconds
            if tasks_pending == tasks_pending_at_time[0]:
                if time.time() - tasks_pending_at_time[1] > 300:
                    processing_result = self.result_parser(
                        self.rafq.get_items(), self.config.output_name
                    )
                    # Accumulate token usage from ProcessingResult totals
                    self.total_input_tokens += processing_result.input_tokens
                    self.total_output_tokens += processing_result.output_tokens
                    self.total_tokens += processing_result.total_tokens

                    successful_duck_db_ids = []
                    successful_convex_row_orders = []
                    original_task_list_duck_db_ids = (
                        self.config.original_task_list_duck_db_ids
                    )
                    original_task_list_convex_row_orders = (
                        self.config.original_task_list_external_row_orders
                    )

                    if processing_result.results:
                        for result in processing_result.results:
                            successful_duck_db_ids.append(result.duck_db_id)
                            successful_convex_row_orders.append(
                                result.convex_info.convex_row_order
                            )

                    duckdb_id_diff = set(original_task_list_duck_db_ids) - set(
                        successful_duck_db_ids
                    )
                    convex_row_order_diff = set(
                        original_task_list_convex_row_orders
                    ) - set(successful_convex_row_orders)

                    await self.flush_errors(list(convex_row_order_diff))

                    await self._update_job_status(
                        JobState.FAILURE,
                        self.rafq.get_total_items() + self.total_errors,
                        error_reason=f"Job ID [{self.job.job_id}]: Processing timed out after 60 seconds due to no change in tasks pending after 60 seconds. Remaining tasks: {len(duckdb_id_diff)}.",
                    )

                    raise TimeoutExceptionWithData(
                        processing_result.results,
                        f"Processing timed out after 60 seconds due to no change in tasks pending after 60 seconds for the following duck_db_ids: {duckdb_id_diff}",
                    )
            else:
                tasks_pending_at_time = (tasks_pending, time.time())

            await asyncio.sleep(0.25)

        processing_result = self.result_parser(
            self.rafq.get_items(), self.config.output_name
        )  ## Here we don't need to increment the token count. this is simply for the final flush & getting to save data in parquet

        if is_last_batch:
            await self._update_job_status(
                JobState.SUCCESS,
                total_tasks,
            )
        return processing_result.results

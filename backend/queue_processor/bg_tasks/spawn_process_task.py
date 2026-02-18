import asyncio
import os
from typing import List

import concurrent

import modal
from folio.utils.shared_types.shared_types import (
    SheetTask,
    SheetTaskType,
    LLMModelName,
    TextGenerationPromptModel,
    StructuredOutputPromptModel,
)
from folio.utils.task_processor.task_processor import (
    OpenAITaskProcessingBackend,
    GeminiTaskProcessingBackend,
    AnthropicTaskProcessingBackend,
    MP3ToTextTaskProcessingBackend,
    PDFToMarkdownTaskProcessingBackend,
    XMLToMarkdownTaskProcessingBackend,
)

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


# TODO: Can call this with celery or modal or prefect or anything else really.
# @celery_app.task()
def spawn_processes_task(
    _job: dict,
    _items: List[dict],
    column_name: str,
    job_id: str,
    env: str,
    workflow_id: str,
):
    # concurrency stuff
    executor = concurrent.futures.ThreadPoolExecutor(max_workers=50)
    loop = asyncio.new_event_loop()

    # deserialize the items
    items = [SheetTask(**item) for item in _items]
    first_item = items[0]

    llm_task_mapping = {
        SheetTaskType.LLM_PROCESSING_WITH_OPENAI: (
            OpenAITaskProcessingBackend,
            "process_with_openai",
        ),
        SheetTaskType.LLM_PROCESSING_WITH_GEMINI: (
            GeminiTaskProcessingBackend,
            "process_with_gemini",
        ),
        SheetTaskType.LLM_PROCESSING_WITH_ANTHROPIC: (
            AnthropicTaskProcessingBackend,
            "process_with_anthropic",
        ),
    }

    if first_item.type in llm_task_mapping:
        backend_cls, task_name = llm_task_mapping[first_item.type]

        if not items[0].prompt:
            raise ValueError("SheetTask must have a prompt for LLM processing")
            
        # Get the model name from the prompt
        if isinstance(items[0].prompt, TextGenerationPromptModel):
            model_name = items[0].prompt.model
        elif isinstance(items[0].prompt, StructuredOutputPromptModel):
            model_name = items[0].prompt.model
        else:
            raise ValueError(f"Unknown prompt type: {type(items[0].prompt)}")

        task_processing_backend = backend_cls(
            job_id=job_id,
            task_name=task_name,
            column_name=column_name,
            model_name=model_name,
        )
    elif first_item.type == SheetTaskType.PDF_TRANSCRIPTION_WITH_MARKER:
        task_processing_backend = PDFToMarkdownTaskProcessingBackend(
            job_id=job_id, task_name="transcribe_pdf", column_name=column_name
        )
    elif first_item.type == SheetTaskType.XML_TRANSCRIPTION_WITH_MARKER:
        task_processing_backend = XMLToMarkdownTaskProcessingBackend(
            job_id=job_id, task_name="transcribe_xml", column_name=column_name
        )
    elif first_item.type == SheetTaskType.TRANSCRIPTION_WITH_FAL:
        task_processing_backend = MP3ToTextTaskProcessingBackend(
            job_id=job_id, task_name="transcribe_audio", column_name=column_name
        )
    else:
        raise ValueError("Unknown task type")

    # task_processing_backend = LocalTaskProcessingBackend(
    #     job_id=job_id, env=env, tasks=items
    # )

    async def spawn_processes():
        await task_processing_backend.verify_queues(column_name)

        process_job = task_processing_backend.get_process_job()

        try:
            # TODO dont just flush the queue like this. Items in the queue means something is seriously wrong
            if await task_processing_backend.get_success_queue_length_async() > 0:
                await task_processing_backend.get_all_items_from_success_queue_async()

        except Exception:
            # This is not really that important to handle. What it means is that there are somehow results in the success queue
            # which is not supposed to happen, BUT if it does happen we just need to log it, there isnt much the application can do
            # intelligently. The two methods above already to retry a few times, so if it fails here, there is more an issue with the
            # dependency for the queue itself.
            return

        async def process_items():
            tasks = []
            for idx, item in enumerate(items):
                task = asyncio.to_thread(
                    process_job.spawn,
                    task_processing_backend.convert_generic_sheet_task_to_specific_task(
                        item
                    ),
                )
                tasks.append(task)
            # Run all tasks concurrently
            await asyncio.gather(*tasks)

        await process_items()

    asyncio.set_event_loop(loop)
    # Pass our executor explicitly
    loop.set_default_executor(executor)
    return loop.run_until_complete(spawn_processes())


def spawn_process_task_v2(
    _job: dict,
    _items: List[dict],
    column_name: str,
    job_id: str,
    env: str,
    workflow_id: str,
):
    fn = _modal_function_from_known_app_names("spawn_processes_task")
    fn.spawn(
        _job,
        _items,
        column_name,
        job_id,
        env,
        workflow_id,
    )
    print("functions spawned through modal")

import asyncio
import copy
import json
import os
import re
from abc import ABC, abstractmethod
import random
import time
from typing import Dict, List, Any, Optional, Tuple, Union
from collections import deque
from jinja2 import Template
from pydantic import BaseModel
import logging

logger = logging.getLogger(__name__)


def neutralize_braces(value: str) -> str:
    """Wrap literal double braces with raw blocks so Jinja leaves them untouched."""
    return value.replace("{{", "{% raw %}{{{% endraw %}").replace(
        "}}", "{% raw %}}}{% endraw %}"
    )


def deneutralize_braces(value: str) -> str:
    """Restore literal braces after template rendering."""
    return value.replace("{% raw %}{{{% endraw %}", "{{").replace(
        "{% raw %}}}{% endraw %}", "}}"
    )


PLACEHOLDER_REGEX = re.compile(r"\{\{\s*([A-Za-z0-9_][A-Za-z0-9_\s\-]*)\s*\}\}")
SIMPLE_IDENTIFIER_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def convert_placeholders_to_dict_lookup(
    template: str, *, container: str = "data", only_when_needed: bool = False
) -> str:
    """Convert simple placeholders to dict lookups so keys with spaces stay valid."""

    def _replace(match: re.Match[str]) -> str:
        token = match.group(1).strip()
        if not token:
            return match.group(0)

        # Avoid double-wrapping placeholders that already target the container
        if token.startswith(f"{container}[") or token.startswith(f"{container}."):
            return match.group(0)

        if only_when_needed and SIMPLE_IDENTIFIER_RE.fullmatch(token):
            return match.group(0)

        escaped = token.replace('"', '\\"')
        return f"{{{{ {container}[\"{escaped}\"] }}}}"

    return PLACEHOLDER_REGEX.sub(_replace, template)

from folio.utils.shared_types.shared_types import (
    ContentItem,
    LLMProcessingResult,
    LLMProcessingTaskWithSingleColumnRequest,
    MP3ToTextRequest,
    Message,
    ModalQueuePartition,
    Usage,
    PDFToMarkdownRequest,
    XMLToMarkdownRequest,
    SheetTask,
    StructuredOutputPromptModel,
    TaskResult,
    TextGenerationPromptModel,
    convert_structured_output_to_openai_model,
    convert_text_generation_to_openai_model,
    ProcessingResult,
    LLMModelName,
    SERVICE_PROVIDER,
)


def _openai_payload_to_gemini(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Convert an OpenAI-style payload into a Gemini request payload."""

    system_instruction_parts: List[str] = []
    contents: List[Dict[str, Any]] = []

    role_map = {
        "assistant": "model",
        "user": "user",
    }

    for message in payload.get("messages", []):
        role = message.get("role")
        content_items = message.get("content", []) or []
        texts = [
            item.get("text")
            for item in content_items
            if isinstance(item, dict) and item.get("type") == "text"
        ]

        if role == "system":
            system_instruction_parts.extend(text for text in texts if text)
            continue

        mapped_role = role_map.get(role, role or "user")
        parts = [{"text": text} for text in texts if text]
        if parts:
            contents.append({"role": mapped_role, "parts": parts})

    gemini_payload: Dict[str, Any] = {
        "model": payload.get("model"),
        "contents": contents,
    }

    if system_instruction_parts:
        gemini_payload["system_instruction"] = "\n\n".join(system_instruction_parts)

    response_format = payload.get("response_format")
    if isinstance(response_format, dict):
        schema = response_format.get("json_schema")
        if schema:
            gemini_payload["response_schema"] = schema
            gemini_payload["response_mime_type"] = "application/json"

    return gemini_payload


def _openai_payload_to_anthropic(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Convert an OpenAI-style payload into an Anthropic request payload."""

    system_segments: List[str] = []
    messages: List[Dict[str, Any]] = []

    for message in payload.get("messages", []):
        role = message.get("role")
        content_items = message.get("content", []) or []
        texts = [
            item.get("text")
            for item in content_items
            if isinstance(item, dict) and item.get("type") == "text"
        ]
        text_body = "\n".join(filter(None, texts))

        if role == "system":
            if text_body:
                system_segments.append(text_body)
            continue

        anthropic_role = "user" if role != "assistant" else "assistant"
        parts = []
        if text_body:
            parts.append({"type": "text", "text": text_body})
        else:
            # Preserve empty message to avoid API errors when nothing to send
            parts.append({"type": "text", "text": ""})
        messages.append({"role": anthropic_role, "content": parts})

    system_prompt = "\n\n".join(system_segments).strip()

    request: Dict[str, Any] = {
        "model": payload.get("model"),
        "messages": messages,
        "max_output_tokens": payload.get("max_output_tokens")
        or payload.get("max_tokens")
        or 1024,
    }

    if system_prompt:
        request["system"] = system_prompt

    response_format = payload.get("response_format")
    if response_format:
        request["response_format"] = response_format

    return request


import modal

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


class ChatCompletionMessage(BaseModel):
    role: str
    content: Optional[str] = None
    # Sometimes the OpenAI response might contain a "refusal" field if a request can't be fulfilled.
    refusal: Optional[str] = None


class ChatCompletionChoice(BaseModel):
    index: int
    message: ChatCompletionMessage
    finish_reason: str
    # logprobs can be a dictionary or None, depending on your usage:
    logprobs: Optional[Any] = None


class ChatCompletion(BaseModel):
    id: str
    object: str
    created: int
    model: str
    choices: List[ChatCompletionChoice]


def generate_fake_chat_completion(num_choices: int = 1) -> ChatCompletion:
    """Generate a single ChatCompletion object with fake data."""
    return ChatCompletion(
        id="1",
        object="chat.completion",
        created=123,
        model=random.choice(["gpt-3.5-turbo", "gpt-3.5-turbo-16k", "gpt-4"]),
        choices=[
            ChatCompletionChoice(
                index=i,
                message=ChatCompletionMessage(
                    role=random.choice(["assistant", "user", "system"]),
                    content="hello",
                ),
                finish_reason=random.choice(["stop", "length", "function_call"]),
                logprobs=None,
            )
            for i in range(num_choices)
        ],
    )


class TaskProcessingBackend(ABC):
    @abstractmethod
    async def verify_queues(self, column_name):
        """
        Should verify that the queues are ready to be used.
        """

    @abstractmethod
    def get_process_job(self):
        """
        Should return an object that has a `spawn` method.
        Typically, for Modal, this will be `modal.Function`,
        but any object supporting `spawn(...)` is acceptable.
        """

    @abstractmethod
    def get_success_queue(self):
        """
        Should return a queue-like object with a `len()`, `get_many()`, etc.
        """

    @abstractmethod
    async def get_success_queue_length_async(self):
        """
        Should return the length of the success queue.
        """

    @abstractmethod
    async def get_all_items_from_success_queue_async(self):
        """
        Should return all items from the success queue.
        """

    @abstractmethod
    def get_error_queue(self):
        """
        Should return a queue-like object for errors,
        with the same queue-like interface.
        """

    @abstractmethod
    async def get_error_queue_length_async(self):
        """
        Should return the length of the error queue.
        """

    @abstractmethod
    async def get_all_items_from_error_queue_async(self):
        """
        Should return all items from the error queue.
        """

    @abstractmethod
    def get_result_parser(self):
        """
        Should return a parser for the results.
        """

    @abstractmethod
    def get_error_parser(self):
        """
        Should return a parser for the errors.
        """

    @abstractmethod
    def convert_generic_sheet_task_to_specific_task(self, sheet_task: SheetTask):
        """
        Should convert a generic SheetTask to a specific task.
        """

    def get_model_name(self) -> Optional[str]:
        """
        Returns the model name for token cost calculation.
        Default implementation returns None for non-LLM tasks.
        LLM-specific backends should override this.
        """
        return None

    def get_provider(self) -> Optional[SERVICE_PROVIDER]:
        """Return the underlying provider slug for the task backend."""

        return None


class ModalTaskProcessingBackend(TaskProcessingBackend):
    def __init__(self, job_id: str, task_name: str, column_name: str):
        """
        :param job_id: Some string identifying the current job,
                       used as the suffix for the queue names.
        """
        self.job_id = job_id
        self.column_name = column_name
        self.task_name = task_name

        # Acquire an existing Function from a deployed Modal app:
        self._process_job = _modal_function_from_known_app_names(task_name)

        # Acquire or create success/error queues:
        self._success_queue = modal.Queue.from_name(
            f"{job_id}-successes",
            create_if_missing=True,
            environment_name=os.environ.get("ENV"),
        )

        self._error_queue = modal.Queue.from_name(
            f"{job_id}-errors",
            create_if_missing=True,
            environment_name=os.environ.get("ENV"),
        )

    async def verify_queues(self, column_name):
        while True:
            try:
                await self._success_queue.len.aio(
                    partition=str(ModalQueuePartition(column_name))
                )
                await self._error_queue.len.aio(
                    partition=str(ModalQueuePartition(column_name))
                )
            except Exception:
                await asyncio.sleep(0.1)
                continue
            break

    def get_process_job(self):
        """
        Returns the modal Function object that can be used for .spawn()
        """
        return self._process_job

    def get_success_queue(self):
        """
        Returns the modal Queue object for successes
        """
        return self._success_queue

    async def get_success_queue_length_async(self):
        start_time = time.time()
        while True:
            if (time.time() - start_time) > 60:
                raise TimeoutError("Error queue length not found")
            try:
                return await self._success_queue.len.aio(
                    partition=str(ModalQueuePartition(self.column_name))
                )
            except Exception:
                continue

    async def get_all_items_from_success_queue_async(self):
        start_time = time.time()
        while True:
            if (time.time() - start_time) > 60:
                raise TimeoutError("Error queue length not found")
            try:
                queue_length = await self.get_success_queue_length_async()
                return await self._success_queue.get_many.aio(
                    queue_length,
                    partition=str(ModalQueuePartition(self.column_name)),
                    timeout=5,
                )
            except Exception:
                continue

    def get_error_queue(self):
        """
        Returns the modal Queue object for errors
        """
        return self._error_queue

    async def get_error_queue_length_async(self):
        start_time = time.time()
        while True:
            if (time.time() - start_time) > 60:
                raise TimeoutError("Error queue length not found")
            try:
                return await self._error_queue.len.aio(
                    partition=str(ModalQueuePartition(self.column_name))
                )
            except Exception:
                continue

    async def get_all_items_from_error_queue_async(self):
        start_time = time.time()
        while True:
            if (time.time() - start_time) > 60:
                raise TimeoutError("Error queue length not found")
            try:
                queue_length = await self.get_error_queue_length_async()
                return await self._error_queue.get_many.aio(
                    queue_length,
                    partition=str(ModalQueuePartition(self.column_name)),
                    timeout=5,
                )
            except Exception:
                continue

    def get_result_parser(self):
        def parse_processing_results(items: List[TaskResult], _) -> ProcessingResult:
            # No implementation. Just return the item as is.
            _items = []
            _usage: List[Usage] = []
            for item in items:
                _items.append(item)
            return ProcessingResult(
                input_tokens=0,
                output_tokens=0,
                total_tokens=0,
                results=_items,
                errors=[],
                usage=_usage,
            )

        return parse_processing_results

    def get_error_parser(self):
        def parse_error_results(items: List[SheetTask]) -> List[TaskResult]:
            to_insert = []

            for item in items:
                data = TaskResult(
                    convex_info=item.convex_info,
                    duck_db_id=item.datalakehouse_info.id,
                    value="",
                    is_error=True,
                )

                to_insert.append(data)

            return to_insert

        return parse_error_results


class LLMProcessingTaskProcessingBackend(ModalTaskProcessingBackend, ABC):
    PROVIDER: SERVICE_PROVIDER = "openai"
    def __init__(
        self,
        job_id: str,
        task_name: str,
        column_name: str,
        model_name: Union[LLMModelName, str],
    ):
        super().__init__(job_id, task_name, column_name)
        if not isinstance(model_name, LLMModelName):
            model_name = LLMModelName(model_name)
        self.model_name = model_name

    def get_model_name(self) -> Optional[LLMModelName]:
        """Override to return the model name for token cost calculation."""
        return self.model_name

    def get_provider(self) -> Optional[SERVICE_PROVIDER]:
        return self.PROVIDER

    @abstractmethod
    def _finalize_payload(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        ...

    @abstractmethod
    def _parse_results(
        self, items: List[TaskResult], output_name: str
    ) -> ProcessingResult:
        ...

    def get_result_parser(self):
        def parse_processing_results(
            items: List[TaskResult], output_name
        ) -> ProcessingResult:
            return self._parse_results(items, output_name)

        return parse_processing_results

    def get_error_parser(self):
        def parse_error_results(
            items: SheetTask,
        ) -> List[TaskResult]:

            to_insert = []

            for item in items:
                data = TaskResult(
                    convex_info=item.convex_info,
                    duck_db_id=item.datalakehouse_info.id,
                    value="",
                    is_error=True,
                    customer_id=item.customer_id,
                )

                to_insert.append(data)

            return to_insert

        return parse_error_results

    def _compile_prompt(
        self,
        input_dict: Dict[str, str],
        prompt_def: Union[StructuredOutputPromptModel, TextGenerationPromptModel],
    ):

        sanitized_input = {
            key: neutralize_braces(value) if isinstance(value, str) else value
            for key, value in input_dict.items()
        }

        if isinstance(prompt_def, StructuredOutputPromptModel):
            # If prompt_def is a StructuredOutputPromptModel:
            # We have `system_prompt`, `user_prompt_template`, `model`, `response_format`
            adjusted_template = convert_placeholders_to_dict_lookup(
                prompt_def.user_prompt_template, only_when_needed=True
            )
            user_template = Template(adjusted_template)
            compiled_user_template = deneutralize_braces(
                user_template.render(**sanitized_input, data=sanitized_input)
            )

            copy_of_prompt = copy.deepcopy(prompt_def)
            copy_of_prompt.user_prompt_template = compiled_user_template
            openai_model = convert_structured_output_to_openai_model(copy_of_prompt)

        elif isinstance(prompt_def, TextGenerationPromptModel):
            # If prompt_def is a TextGenerationPromptModel:
            # We have `model` and `messages` which contain roles and content items.
            # Here, you need to decide how you incorporate `input_dict`.
            # For example, let's say we add a user message using input_dict:
            messages: List[Message] = []
            for message in prompt_def.messages:
                if message.role == "system":
                    messages.append(message)
                elif message.role == "user":
                    # \{\{ matches {{
                    # \s* allows optional whitespace
                    # (.*?) lazily captures everything until the next
                    # \s*\}\} matches the }} (allowing optional whitespace before)
                    original_template = message.content[0].text
                    fixed_template = convert_placeholders_to_dict_lookup(
                        original_template
                    )
                    user_template = Template(fixed_template)

                    rendered_text = user_template.render(data=sanitized_input)
                    content_items = [
                        ContentItem(
                            type="text", text=deneutralize_braces(rendered_text)
                        )
                    ]
                    user_message = Message(role="user", content=content_items)
                    messages.append(user_message)

            copy_of_prompt = copy.deepcopy(prompt_def)
            copy_of_prompt.messages = messages
            openai_model = convert_text_generation_to_openai_model(copy_of_prompt)

        else:
            # If prompt_def is neither, raise an error or handle it
            raise ValueError("Invalid prompt definition model.")

        payload = openai_model.model_dump()

        return self._finalize_payload(payload)

    def convert_generic_sheet_task_to_specific_task(self, sheet_task):
        compiled_prompt = self._compile_prompt(sheet_task.input, sheet_task.prompt)

        # convert from SheetTask to LLMProcessingTaskWithSingleColumnRequest
        llm_processing_task_with_single_column = (
            LLMProcessingTaskWithSingleColumnRequest(
                convex_info=sheet_task.convex_info,
                datalakehouse_info=sheet_task.datalakehouse_info,
                task=compiled_prompt,
                job_id=self.job_id,
                customer_id=sheet_task.customer_id,
                api_keys=sheet_task.api_keys,
            )
        )
        return llm_processing_task_with_single_column


class OpenAITaskProcessingBackend(LLMProcessingTaskProcessingBackend):
    PROVIDER: SERVICE_PROVIDER = "openai"

    def _finalize_payload(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        return payload

    def _parse_results(
        self, items: List[TaskResult], output_name: str
    ) -> ProcessingResult:
        to_insert: List[LLMProcessingResult] = []
        errors: List[TaskResult] = []
        usage_array: List[Usage] = []

        total_input_tokens = 0
        total_output_tokens = 0
        total_tokens = 0

        for item in items:
            response = item.value
            try:
                usage_obj = getattr(response, "usage", None)
                input_tokens = int(getattr(usage_obj, "prompt_tokens", 0) or 0)
                output_tokens = int(getattr(usage_obj, "completion_tokens", 0) or 0)
                total_token_usage = int(
                    getattr(usage_obj, "total_tokens", 0)
                    or (input_tokens + output_tokens)
                )

                choice = response.choices[0]
                message = choice.message
                refusal = getattr(message, "refusal", None)
                content = getattr(message, "content", None)
            except Exception as exc:  # pragma: no cover - defensive logging
                logger.warning(
                    "Failed to parse OpenAI response: %s", exc
                )
                errors.append(item)
                continue

            total_input_tokens += input_tokens
            total_output_tokens += output_tokens
            total_tokens += total_token_usage

            if refusal:
                logger.info("Refusal detected; adding to errors.")
                errors.append(item)
                continue

            if not isinstance(content, str) or not content.strip():
                logger.info("No valid content returned; adding to errors.")
                errors.append(item)
                continue

            text_content = content.strip()

            try:
                parsed = json.loads(text_content)
                if isinstance(parsed, dict) and output_name in parsed:
                    extracted_value = parsed[output_name]
                else:
                    extracted_value = parsed
            except json.JSONDecodeError:
                extracted_value = text_content
            except Exception as exc:  # pragma: no cover - defensive guard
                logger.warning("Unexpected error during JSON parse: %s", exc)
                errors.append(item)
                continue

            data = LLMProcessingResult(
                convex_info=item.convex_info,
                duck_db_id=item.duck_db_id,
                value=extracted_value,
                customer_id=item.customer_id,
                usage=Usage(
                    model_name=self.model_name.value,
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    total_tokens=total_token_usage,
                ),
            )

            to_insert.append(data)
            usage_array.append(data.usage)

        return ProcessingResult(
            input_tokens=total_input_tokens,
            output_tokens=total_output_tokens,
            total_tokens=total_tokens,
            results=to_insert,
            errors=errors,
            usage=usage_array,
        )


class GeminiTaskProcessingBackend(LLMProcessingTaskProcessingBackend):
    PROVIDER: SERVICE_PROVIDER = "google_gemini"

    def _finalize_payload(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        return _openai_payload_to_gemini(payload)

    @staticmethod
    def _extract_usage_value(source: Dict[str, Any], *keys: str) -> int:
        for key in keys:
            value = source.get(key)
            if value is not None:
                try:
                    return int(value)
                except (TypeError, ValueError):
                    continue
        return 0

    def _parse_results(
        self, items: List[TaskResult], output_name: str
    ) -> ProcessingResult:
        to_insert: List[LLMProcessingResult] = []
        errors: List[TaskResult] = []
        usage_array: List[Usage] = []

        total_input_tokens = 0
        total_output_tokens = 0
        total_tokens = 0

        for item in items:
            response_data = item.value
            response: Dict[str, Any]
            if isinstance(response_data, str):
                try:
                    response = json.loads(response_data)
                except json.JSONDecodeError:
                    logger.warning(
                        "Gemini response payload is not valid JSON; adding to errors."
                    )
                    errors.append(item)
                    continue
            elif isinstance(response_data, dict):
                response = response_data
            else:
                logger.warning(
                    "Gemini response is of unsupported type %s; adding to errors.",
                    type(response_data),
                )
                errors.append(item)
                continue

            usage_data = response.get("usage", {})
            if not isinstance(usage_data, dict):
                usage_data = {}

            input_tokens = self._extract_usage_value(
                usage_data,
                "prompt_tokens",
                "input_tokens",
                "input_token_count",
            )
            output_tokens = self._extract_usage_value(
                usage_data,
                "completion_tokens",
                "output_tokens",
                "candidates_tokens",
                "output_token_count",
                "candidates_token_count",
            )
            total_token_usage = self._extract_usage_value(
                usage_data,
                "total_tokens",
                "total_token_count",
            )
            if not total_token_usage:
                total_token_usage = input_tokens + output_tokens

            total_input_tokens += input_tokens
            total_output_tokens += output_tokens
            total_tokens += total_token_usage

            refusal = response.get("refusal")
            if refusal:
                logger.info("Refusal detected; adding to errors.")
                errors.append(item)
                continue

            content = response.get("text")
            if not content and isinstance(response.get("candidates"), list):
                first_candidate = response["candidates"][0]
                parts = (
                    first_candidate.get("parts")
                    if isinstance(first_candidate, dict)
                    else None
                )
                if parts:
                    texts = [
                        part.get("text")
                        for part in parts
                        if isinstance(part, dict)
                        and isinstance(part.get("text"), str)
                    ]
                    content = "\n".join(texts)

            if not isinstance(content, str) or not content.strip():
                logger.info("No valid content returned; adding to errors.")
                errors.append(item)
                continue

            text_content = content.strip()

            try:
                parsed = json.loads(text_content)
                if isinstance(parsed, dict) and output_name in parsed:
                    extracted_value = parsed[output_name]
                else:
                    extracted_value = parsed
            except json.JSONDecodeError:
                extracted_value = text_content
            except Exception as exc:  # pragma: no cover - defensive guard
                logger.warning("Unexpected error during JSON parse: %s", exc)
                errors.append(item)
                continue

            data = LLMProcessingResult(
                convex_info=item.convex_info,
                duck_db_id=item.duck_db_id,
                value=extracted_value,
                customer_id=item.customer_id,
                usage=Usage(
                    model_name=self.model_name.value,
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    total_tokens=total_token_usage,
                ),
            )

            to_insert.append(data)
            usage_array.append(data.usage)

        return ProcessingResult(
            input_tokens=total_input_tokens,
            output_tokens=total_output_tokens,
            total_tokens=total_tokens,
            results=to_insert,
            errors=errors,
            usage=usage_array,
        )


class AnthropicTaskProcessingBackend(LLMProcessingTaskProcessingBackend):
    PROVIDER: SERVICE_PROVIDER = "anthropic"

    def _finalize_payload(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        return _openai_payload_to_anthropic(payload)

    @staticmethod
    def _extract_usage_value(source: Dict[str, Any], *keys: str) -> int:
        for key in keys:
            value = source.get(key)
            if value is not None:
                try:
                    return int(value)
                except (TypeError, ValueError):
                    continue
        return 0

    def _parse_results(
        self, items: List[TaskResult], output_name: str
    ) -> ProcessingResult:
        to_insert: List[LLMProcessingResult] = []
        errors: List[TaskResult] = []
        usage_array: List[Usage] = []

        total_input_tokens = 0
        total_output_tokens = 0
        total_tokens = 0

        for item in items:
            response_raw = item.value

            if isinstance(response_raw, str):
                try:
                    response = json.loads(response_raw)
                except json.JSONDecodeError:
                    logger.warning(
                        "Anthropic response payload is not valid JSON; adding to errors."
                    )
                    errors.append(item)
                    continue
            elif isinstance(response_raw, dict):
                response = response_raw
            else:
                logger.warning(
                    "Anthropic response is of unsupported type %s; adding to errors.",
                    type(response_raw),
                )
                errors.append(item)
                continue

            usage_data = response.get("usage", {})
            if not isinstance(usage_data, dict):
                usage_data = {}

            input_tokens = self._extract_usage_value(
                usage_data,
                "input_tokens",
                "prompt_tokens",
            )
            output_tokens = self._extract_usage_value(
                usage_data,
                "output_tokens",
                "completion_tokens",
            )
            total_token_usage = self._extract_usage_value(
                usage_data,
                "total_tokens",
            )
            if not total_token_usage:
                total_token_usage = input_tokens + output_tokens

            total_input_tokens += input_tokens
            total_output_tokens += output_tokens
            total_tokens += total_token_usage

            content_text = response.get("text")
            if not content_text and isinstance(response.get("content"), list):
                texts = []
                for block in response["content"]:
                    if isinstance(block, dict) and block.get("type") == "text":
                        value = block.get("text")
                        if isinstance(value, str):
                            texts.append(value)
                if texts:
                    content_text = "\n".join(texts)

            if not isinstance(content_text, str) or not content_text.strip():
                logger.info("No valid content returned from Anthropic; adding to errors.")
                errors.append(item)
                continue

            text_content = content_text.strip()

            try:
                parsed = json.loads(text_content)
                if isinstance(parsed, dict) and output_name in parsed:
                    extracted_value = parsed[output_name]
                else:
                    extracted_value = parsed
            except json.JSONDecodeError:
                extracted_value = text_content
            except Exception as exc:
                logger.warning("Unexpected error during JSON parse: %s", exc)
                errors.append(item)
                continue

            data = LLMProcessingResult(
                convex_info=item.convex_info,
                duck_db_id=item.duck_db_id,
                value=extracted_value,
                customer_id=item.customer_id,
                usage=Usage(
                    model_name=self.model_name.value,
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    total_tokens=total_token_usage,
                ),
            )

            to_insert.append(data)
            usage_array.append(data.usage)

        return ProcessingResult(
            input_tokens=total_input_tokens,
            output_tokens=total_output_tokens,
            total_tokens=total_tokens,
            results=to_insert,
            errors=errors,
            usage=usage_array,
        )


class PDFToMarkdownTaskProcessingBackend(ModalTaskProcessingBackend):
    def convert_generic_sheet_task_to_specific_task(self, sheet_task):
        if sheet_task.type != "PDF_TRANSCRIPTION_WITH_MARKER":
            raise ValueError("Invalid task type for PDF to Markdown conversion")
        if sheet_task.file_path is None:
            raise ValueError("File path is required for PDF to Markdown conversion")
        pdf_processing_task = PDFToMarkdownRequest(
            convex_info=sheet_task.convex_info,
            datalakehouse_info=sheet_task.datalakehouse_info,
            file_path=sheet_task.file_path,
            content_type=sheet_task.content_type or "application/pdf",
            job_id=self.job_id,
            customer_id=sheet_task.customer_id,
            api_keys=sheet_task.api_keys,
        )

        return pdf_processing_task


class XMLToMarkdownTaskProcessingBackend(ModalTaskProcessingBackend):
    def convert_generic_sheet_task_to_specific_task(self, sheet_task):
        if sheet_task.type != "XML_TRANSCRIPTION_WITH_MARKER":
            raise ValueError("Invalid task type for XML to Markdown conversion")
        if sheet_task.file_path is None:
            raise ValueError("File path is required for XML to Markdown conversion")
        xml_processing_task = XMLToMarkdownRequest(
            convex_info=sheet_task.convex_info,
            datalakehouse_info=sheet_task.datalakehouse_info,
            file_path=sheet_task.file_path,
            content_type=sheet_task.content_type or "application/xml",
            job_id=self.job_id,
            customer_id=sheet_task.customer_id,
            api_keys=sheet_task.api_keys,
        )

        return xml_processing_task


class MP3ToTextTaskProcessingBackend(ModalTaskProcessingBackend):

    def convert_generic_sheet_task_to_specific_task(self, sheet_task):
        if sheet_task.type != "TRANSCRIPTION_WITH_FAL":
            raise ValueError("Invalid task type for MP3 to Text conversion")
        if sheet_task.file_path is None:
            raise ValueError("File path is required for MP3 to Text conversion")
        mp3_processing_task = MP3ToTextRequest(
            convex_info=sheet_task.convex_info,
            datalakehouse_info=sheet_task.datalakehouse_info,
            file_path=sheet_task.file_path,
            job_id=self.job_id,
            customer_id=sheet_task.customer_id,
            api_keys=sheet_task.api_keys,
        )
        return mp3_processing_task


class LocalQueue:
    """
    Minimal in-memory queue-like class that mimics the necessary parts of
    Modal's Queue interface. It ignores partition keys.
    """

    def __init__(self):
        self._storage = deque()

    def put(self, item: Any, partition: Optional[str] = None):
        """
        Append an item to the queue (partition is ignored).
        """
        self._storage.append(item)

    def len(self, *, partition: Optional[str] = None, total: bool = False) -> int:
        """
        Return the number of items. (Partitions ignored)
        """
        return len(self._storage)

    def get_many(
        self,
        n_values: int,
        *,
        partition: Optional[str] = None,
        timeout: Optional[float] = None,
    ) -> list[Any]:
        """
        Pop up to n_values items from the queue and return them immediately.
        (Partitions and timeout are ignored.)
        """
        items = []
        for _ in range(n_values):
            if not self._storage:
                break
            items.append(self._storage.popleft())
        return items


class LocalProcessJob:
    """
    A local process object whose spawn(request) method:
      - Randomly enqueues the request to success_queue OR error_queue.
      - Returns a dummy "call ID".
    """

    def __init__(self, success_queue: LocalQueue, error_queue: LocalQueue):
        self._success_queue = success_queue
        self._error_queue = error_queue

    def spawn(self, request: LLMProcessingTaskWithSingleColumnRequest):
        """
        Randomly enqueue the request into success_queue or error_queue.
        Returns a dummy "FunctionCall" or call id.
        """
        # Simulate "work" by just randomly choosing success or error.
        if random.choice([True, False]):
            result = LLMProcessingResult(
                convex_info=request.convex_info,
                duck_db_id=request.datalakehouse_info.id,
                value=generate_fake_chat_completion(),
                customer_id=request.customer_id,
            )
            self._success_queue.put(result)
        else:
            exception_object = {
                "convex_project_id": request.convex_info.convex_project_id,
                "convex_column_id": request.convex_info.convex_column_id,
                "convex_row_id": request.convex_info.convex_row_id,
                "convex_row_order": request.convex_info.convex_row_order,
                "id": request.datalakehouse_info.id,
                "column": request.datalakehouse_info.column_name,
                "error": "error",
            }

            self._error_queue.put(exception_object)

        # Return a dummy call identifier or future handle
        return "LocalProcessCallID-" + request.job_id


class LocalTaskProcessingBackend(ModalTaskProcessingBackend):
    """
    A local, in-memory implementation of TaskProcessingBackend.
    - Ignores partitions entirely.
    - Immediately spawns tasks into success or error queue with 50/50 chance.
    - success_queue / error_queue are LocalQueue instances.
    """

    def __init__(
        self,
        job_id: str,
        column_name: str,
        tasks: list[SheetTask],
    ):
        self._success_queue = LocalQueue()
        self._error_queue = LocalQueue()
        self._process_job = LocalProcessJob(self._success_queue, self._error_queue)
        for idx, item in enumerate(tasks):
            # convert from SheetTask to LLMProcessingTaskWithSingleColumnRequest
            llm_processing_task_with_single_column = (
                LLMProcessingTaskWithSingleColumnRequest(
                    convex_info=item.convex_info,
                    datalakehouse_info=item.datalakehouse_info,
                    task="mock",
                    job_id=job_id,
                )
            )

            self._process_job.spawn(llm_processing_task_with_single_column)

    async def verify_queues(self, column_name):
        return

    def get_process_job(self):
        return self._process_job

    def get_success_queue(self):
        return self._success_queue

    async def get_success_queue_length_async(self):
        return self._success_queue.len()

    async def get_all_items_from_success_queue_async(self):
        queue_length = await self.get_success_queue_length_async()
        return self._success_queue.get_many(queue_length)

    def get_error_queue(self):
        return self._error_queue

    async def get_error_queue_length_async(self):
        return self._error_queue.len()

    async def get_all_items_from_error_queue_async(self):
        queue_length = await self.get_error_queue_length_async()
        return self._error_queue.get_many(queue_length)

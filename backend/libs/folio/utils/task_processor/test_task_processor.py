import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from folio.utils.task_processor.task_processor import (
    OpenAITaskProcessingBackend,
    GeminiTaskProcessingBackend,
    AnthropicTaskProcessingBackend,
)
from folio.utils.shared_types.shared_types import (
    ContentItem,
    ConvexInfo,
    DataLakehouseInfo,
    LLMProcessingResult,
    Message,
    ResponseFormatSchema,
    StructuredOutputPromptModel,
    TextGenerationPromptModel,
    LLMModelName,
)


def _backend_without_modal_dependencies(cls, model_name: LLMModelName):
    # Bypass __init__ so we do not create Modal handles during tests.
    backend = object.__new__(cls)
    backend.model_name = model_name
    backend.job_id = "test-job"
    backend.column_name = "test-column"
    backend.task_name = "task"
    return backend


def _gemini_backend_without_modal():
    return _backend_without_modal_dependencies(
        GeminiTaskProcessingBackend,
        LLMModelName.GEMINI_FLASH,
    )


def _anthropic_backend_without_modal():
    return _backend_without_modal_dependencies(
        AnthropicTaskProcessingBackend,
        LLMModelName.CLAUDE35_SONNET,
    )


def test_compile_prompt_preserves_literal_braces_structured():
    backend = _backend_without_modal_dependencies(
        OpenAITaskProcessingBackend,
        LLMModelName.GPT4O,
    )
    prompt = StructuredOutputPromptModel(
        model=LLMModelName.GPT4O,
        system_prompt="system",
        user_prompt_template=(
            "Ticket body:\n{{ Text }}\n\nChange summary: {{ biz logic changes for lead form }}"
        ),
        response_format=ResponseFormatSchema(
            type="json_schema",
            json_schema={"properties": {"category": {"type": "string"}}},
        ),
    )

    compiled = backend._compile_prompt(
        {
            "Text": "Example with {{ raw }} braces",
            "biz logic changes for lead form": "Add {{ new }} logic",
        },
        prompt,
    )

    user_message = compiled["messages"][1]["content"][0]["text"]
    assert "Example with {{ raw }} braces" in user_message
    assert "Add {{ new }} logic" in user_message
    assert "{% raw %}" not in user_message


def test_compile_prompt_preserves_literal_braces_text_generation():
    backend = _backend_without_modal_dependencies(
        OpenAITaskProcessingBackend,
        LLMModelName.GPT4O,
    )
    prompt = TextGenerationPromptModel(
        model=LLMModelName.GPT4O,
        messages=[
            Message(role="system", content=[ContentItem(type="text", text="sys")]),
            Message(
                role="user",
                content=[
                    ContentItem(
                        type="text",
                        text="Ticket: {{ Text }} | {{ biz logic changes for lead form }}",
                    )
                ],
            ),
        ],
    )

    compiled = backend._compile_prompt(
        {
            "Text": "Example with {{ raw }} braces",
            "biz logic changes for lead form": "Add {{ new }} logic",
        },
        prompt,
    )

    user_message = compiled["messages"][1]["content"][0]["text"]
    assert "Example with {{ raw }} braces" in user_message
    assert "Add {{ new }} logic" in user_message
    assert "{% raw %}" not in user_message


def test_compile_prompt_gemini_structured_output():
    backend = _backend_without_modal_dependencies(
        GeminiTaskProcessingBackend,
        LLMModelName.GEMINI_FLASH,
    )
    prompt = StructuredOutputPromptModel(
        model=LLMModelName.GEMINI_FLASH,
        system_prompt="system",
        user_prompt_template="Ticket body: {{ Text }}",
        response_format=ResponseFormatSchema(
            type="json_schema",
            json_schema={"type": "object", "properties": {"answer": {"type": "string"}}},
        ),
    )

    compiled = backend._compile_prompt({"Text": "Example"}, prompt)

    assert compiled["model"] == LLMModelName.GEMINI_FLASH.value
    assert compiled["system_instruction"] == "system"
    assert compiled["contents"][0]["parts"][0]["text"] == "Ticket body: Example"
    assert compiled["response_schema"] == prompt.response_format.json_schema
    assert compiled["response_mime_type"] == "application/json"


def test_compile_prompt_anthropic_structured_output():
    backend = _anthropic_backend_without_modal()
    prompt = StructuredOutputPromptModel(
        model=LLMModelName.CLAUDE35_SONNET,
        system_prompt="system context",
        user_prompt_template="Ticket body: {{ Text }}",
        response_format=ResponseFormatSchema(
            type="json_schema",
            json_schema={"type": "object", "properties": {"answer": {"type": "string"}}},
        ),
    )

    compiled = backend._compile_prompt({"Text": "Example"}, prompt)

    assert compiled["model"] == LLMModelName.CLAUDE35_SONNET.value
    assert compiled["system"] == "system context"
    assert compiled["messages"][0]["content"][0]["text"] == "Ticket body: Example"
    assert compiled["response_format"] == prompt.response_format.model_dump()
    assert compiled["max_output_tokens"] == 1024


def test_gemini_parse_results_with_structured_text_payload():
    backend = _gemini_backend_without_modal()

    raw_response = {
        "text": '{"summary": "Modal makes async compute simple."}',
        "usage": {
            "prompt_tokens": 21,
            "completion_tokens": 11,
            "total_tokens": 335,
        },
        "candidates": [
            {
                "parts": [
                    {"text": '{"summary": "Modal makes async compute simple."}'},
                ]
            }
        ],
    }

    result = LLMProcessingResult(
        convex_info=ConvexInfo(
            convex_project_id="playground-project",
            convex_column_id="col-001",
            convex_row_id="row-001",
            convex_row_order=0,
        ),
        duck_db_id=1,
        value=raw_response,
        customer_id="demo-customer",
    )

    processing_result = backend._parse_results([result], output_name="summary")

    assert processing_result.errors == []
    assert len(processing_result.results) == 1
    parsed_result = processing_result.results[0]
    assert parsed_result.value == "Modal makes async compute simple."
    assert parsed_result.usage is not None
    assert parsed_result.usage.input_tokens == 21
    assert parsed_result.usage.output_tokens == 11
    assert parsed_result.usage.total_tokens == 335


def test_anthropic_parse_results_with_structured_payload():
    backend = _anthropic_backend_without_modal()

    raw_response = {
        "text": '{"summary": "Modal makes async compute simple."}',
        "usage": {
            "input_tokens": 21,
            "output_tokens": 11,
            "total_tokens": 32,
        },
        "content": [
            {"type": "text", "text": '{"summary": "Modal makes async compute simple."}'}
        ],
    }

    result = LLMProcessingResult(
        convex_info=ConvexInfo(
            convex_project_id="playground-project",
            convex_column_id="col-001",
            convex_row_id="row-001",
            convex_row_order=0,
        ),
        duck_db_id=1,
        value=raw_response,
        customer_id="demo-customer",
    )

    processing_result = backend._parse_results([result], output_name="summary")

    assert processing_result.errors == []
    assert len(processing_result.results) == 1
    parsed_result = processing_result.results[0]
    assert parsed_result.value == "Modal makes async compute simple."
    assert parsed_result.usage is not None
    assert parsed_result.usage.input_tokens == 21
    assert parsed_result.usage.output_tokens == 11
    assert parsed_result.usage.total_tokens == 32

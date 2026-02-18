from dataclasses import dataclass, field
from enum import Enum
from pydantic import BaseModel, field_validator
from typing import Any, Dict, List, Literal, Optional, Union

# Central rate multiplier applied to base provider rates.
# Keep this as the single source of truth for rate scaling.
PRICE_MARGIN_MULTIPLIER: float = 1.0

# Pricing (in cents) for non-token-based services
# $6.00 per 1000 pages for ingestion/processing (document & datalab)
DOCUMENT_INGESTION_COST_PER_1000_PAGES_CENTS: int = 600
# Alias used for Datalab document processing (priced per processed page)
DATALAB_PROCESSING_COST_PER_1000_PAGES_CENTS: int = (
    DOCUMENT_INGESTION_COST_PER_1000_PAGES_CENTS
)

# Pricing placeholders for other services
FAL_TRANSCRIPTION_COST_PER_SECOND_CENTS: int = 0
COLUMN_CREATION_COST_PER_COLUMN_CENTS: int = 0
MODAL_FUNCTION_COST_PER_ROW_CENTS: int = 0
import json

SERVICE_PROVIDER = Literal["openai", "fal", "marker", "google_gemini", "anthropic"]
DUCKDB_QUERY_ERROR_CODE = "DUCKDB_QUERY_ERROR"


class TimeoutExceptionWithData(Exception):
    def __init__(self, data: list[object], message=None):
        """
        :param data: Any extra data you want to include
        :param message: A human-readable error message
        """
        super().__init__(message)
        self.data = data  # store extra data here


class DuckDbErrorPayload(BaseModel):
    """Typed payload for DuckDB query errors propagated between services."""

    error_code: str = DUCKDB_QUERY_ERROR_CODE
    error_type: str
    message: str
    query: Optional[str] = None


def parse_duckdb_error_payload(message: str) -> Optional[DuckDbErrorPayload]:
    """Parse a structured DuckDB error payload from exception text."""
    if not message:
        return None

    decoder = json.JSONDecoder()
    for index, char in enumerate(message):
        if char != "{":
            continue
        try:
            payload_obj, _ = decoder.raw_decode(message[index:])
        except json.JSONDecodeError:
            continue

        if not isinstance(payload_obj, dict):
            continue

        try:
            return DuckDbErrorPayload.model_validate(payload_obj)
        except Exception:
            continue

    return None


# Convert dataclasses to Pydantic models
@dataclass
class ConvexInfo:
    convex_project_id: str
    convex_column_id: str
    convex_row_id: str
    convex_row_order: int


@dataclass
class DataLakehouseInfo:
    id: int
    column_name: str


@dataclass
class BaseTaskRequest:
    convex_info: ConvexInfo
    datalakehouse_info: DataLakehouseInfo
    job_id: str
    customer_id: Optional[str]


@dataclass
class LLMProcessingTaskWithSingleColumnRequest(BaseTaskRequest):
    task: dict
    api_keys: Dict[SERVICE_PROVIDER, str] = field(default_factory=dict)


@dataclass
class PDFToMarkdownRequest(BaseTaskRequest):
    file_path: str
    content_type: str
    api_keys: Dict[SERVICE_PROVIDER, str] = field(default_factory=dict)


@dataclass
class XMLToMarkdownRequest(BaseTaskRequest):
    file_path: str
    content_type: str
    api_keys: Dict[SERVICE_PROVIDER, str] = field(default_factory=dict)


@dataclass
class MP3ToTextRequest(BaseTaskRequest):
    file_path: str
    api_keys: Dict[SERVICE_PROVIDER, str] = field(default_factory=dict)


@dataclass
class Usage:
    """Usage tracking information for billing and metrics.

    Depending on the service, usage may represent token counts or
    monetary cost. Token-based services populate the `input_tokens`,
    `output_tokens`, and `total_tokens` fields, while cost-based services
    populate the `cost` field.

    For LLM calls, `model_name` must be set to the LLM that produced the usage.
    For non-LLM services (e.g., PDF/XML transcription), `model_name` may be an
    empty string.
    """

    model_name: str = ""
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0
    cost: float = 0.0


@dataclass
class TaskResult:
    """Base class for all task processing results"""

    convex_info: ConvexInfo
    duck_db_id: int
    value: Any  # Will be converted to string in __post_init__
    is_error: bool = False
    customer_id: Optional[str] = None
    usage: Optional[Usage] = None

    def __post_init__(self):
        """
        After the dataclass fields are populated, ensure that dicts are jsonified
        """
        # JSONify if it's a dict or list/tuple
        if isinstance(self.value, dict) or isinstance(self.value, (list, tuple)):
            self.value = json.dumps(self.value)
        # # If it's anything else (bool, int, float, etc.) and not already a string,
        # # just convert to string:
        # elif not isinstance(self.value, str):
        #     self.value = str(self.value)


@dataclass
class LLMProcessingResult(TaskResult):
    """LLM task processing result"""


@dataclass
class TranscriptionResult(TaskResult):
    """Transcription task processing result"""


@dataclass
class PDFResult(TaskResult):
    """PDF parsing task processing result"""


# Keep your existing BaseModel classes as they are
class ContentItem(BaseModel):
    type: str
    text: str


class Message(BaseModel):
    role: str
    content: List[ContentItem]


class ModalQueuePartition:
    MAX_CHARS = 64  # also 64 bytes after _force_one_byte
    PLACEHOLDER = "_"  # single-byte ASCII replacement

    def __init__(self, value: str) -> None:
        self._raw = value  # keep the untouched source text

    @staticmethod
    def _force_one_byte(text: str, repl: str = "_") -> str:
        # ensures every code point encodes to exactly one UTF-8 byte
        if len(repl.encode("utf-8")) != 1:
            raise ValueError("replacement must be single-byte ASCII")
        return "".join(c if len(c.encode("utf-8")) == 1 else repl for c in text)

    def __str__(self) -> str:
        safe = self._force_one_byte(self._raw, self.PLACEHOLDER)
        return safe if len(safe) <= self.MAX_CHARS else safe[: self.MAX_CHARS]

    __repr__ = __str__

    @property
    def raw(self) -> str:
        return self._raw  # retrieve the full, original string


class LLMModelName(str, Enum):
    """Supported LLM models with their canonical names"""

    GPT41 = "gpt-4.1"
    GPT41_MINI = "gpt-4.1-mini"
    GPT41_NANO = "gpt-4.1-nano"
    GPT45_PREVIEW = "gpt-4.5-preview"
    GPT4O = "gpt-4o"
    GPT4O_MINI = "gpt-4o-mini"
    GPT4O_MINI_SEARCH = "gpt-4o-mini-search-preview"
    GPT35_TURBO = "gpt-3.5-turbo"
    GPT5 = "gpt-5"
    GPT5_MINI = "gpt-5-mini"
    GPT5_NANO = "gpt-5-nano"
    GEMINI_FLASH = "gemini-2.5-flash"
    CLAUDE35_SONNET = "claude-3-5-sonnet-20240620"

    _PROVIDER_MAP: Dict["LLMModelName", SERVICE_PROVIDER] = {
        GPT41: "openai",
        GPT41_MINI: "openai",
        GPT41_NANO: "openai",
        GPT45_PREVIEW: "openai",
        GPT4O: "openai",
        GPT4O_MINI: "openai",
        GPT4O_MINI_SEARCH: "openai",
        GPT35_TURBO: "openai",
        GPT5: "openai",
        GPT5_MINI: "openai",
        GPT5_NANO: "openai",
        GEMINI_FLASH: "google_gemini",
        CLAUDE35_SONNET: "anthropic",
    }

    @classmethod
    def get_provider(cls, model: Union["LLMModelName", str]) -> SERVICE_PROVIDER:
        """Return the provider slug for a given model."""

        if not isinstance(model, cls):
            model = cls(model)

        try:
            return _LLM_MODEL_PROVIDER_MAP[model]
        except KeyError as exc:
            raise ValueError(f"Unknown provider mapping for model: {model}") from exc

    @classmethod
    def get_pricing(cls) -> Dict[str, Dict[str, float]]:
        """Return model rates in $ per million tokens after scaling."""
        base = {
            cls.GPT41.value: {
                "input_per_million_tokens": 2.0,
                "output_per_million_tokens": 8.0,
            },
            cls.GPT41_MINI.value: {
                "input_per_million_tokens": 0.4,
                "output_per_million_tokens": 1.6,
            },
            cls.GPT41_NANO.value: {
                "input_per_million_tokens": 0.1,
                "output_per_million_tokens": 0.4,
            },
            cls.GPT45_PREVIEW.value: {
                "input_per_million_tokens": 75.0,
                "output_per_million_tokens": 150.0,
            },
            cls.GPT4O.value: {
                "input_per_million_tokens": 2.5,
                "output_per_million_tokens": 10.0,
            },
            cls.GPT4O_MINI.value: {
                "input_per_million_tokens": 0.15,
                "output_per_million_tokens": 0.6,
            },
            cls.GPT4O_MINI_SEARCH.value: {
                "input_per_million_tokens": 0.15,
                "output_per_million_tokens": 0.6,
            },
            cls.GPT35_TURBO.value: {
                "input_per_million_tokens": 0.5,
                "output_per_million_tokens": 1.5,
            },
            cls.GPT5.value: {
                "input_per_million_tokens": 1.25,
                "output_per_million_tokens": 10.0,
            },
            cls.GPT5_MINI.value: {
                "input_per_million_tokens": 0.25,
                "output_per_million_tokens": 2.0,
            },
            cls.GPT5_NANO.value: {
                "input_per_million_tokens": 0.05,
                "output_per_million_tokens": 0.4,
            },
            cls.GEMINI_FLASH.value: {
                "input_per_million_tokens": 0.3,
                "output_per_million_tokens": 2.5,
            },
            cls.CLAUDE35_SONNET.value: {
                "input_per_million_tokens": 3.0,
                "output_per_million_tokens": 15.0,
            },
        }
        return {
            model: {
                "input_per_million_tokens": round(
                    rates["input_per_million_tokens"] * PRICE_MARGIN_MULTIPLIER, 6
                ),
                "output_per_million_tokens": round(
                    rates["output_per_million_tokens"] * PRICE_MARGIN_MULTIPLIER, 6
                ),
            }
            for model, rates in base.items()
        }


_LLM_MODEL_PROVIDER_MAP: Dict[LLMModelName, SERVICE_PROVIDER] = {
    LLMModelName.GPT41: "openai",
    LLMModelName.GPT41_MINI: "openai",
    LLMModelName.GPT41_NANO: "openai",
    LLMModelName.GPT45_PREVIEW: "openai",
    LLMModelName.GPT4O: "openai",
    LLMModelName.GPT4O_MINI: "openai",
    LLMModelName.GPT4O_MINI_SEARCH: "openai",
    LLMModelName.GPT35_TURBO: "openai",
    LLMModelName.GPT5: "openai",
    LLMModelName.GPT5_MINI: "openai",
    LLMModelName.GPT5_NANO: "openai",
    LLMModelName.GEMINI_FLASH: "google_gemini",
}


class TextGenerationPromptModel(BaseModel):
    model: LLMModelName
    messages: List[Message]

    @field_validator("model")
    def validate_model(cls, v: LLMModelName) -> LLMModelName:
        if not isinstance(v, LLMModelName):
            raise ValueError(
                f"Invalid model name: {v}. Must be one of {[e.value for e in LLMModelName]}"
            )
        return v


def get_prompt_text_from_textgen(model: TextGenerationPromptModel) -> str:
    """
    Combine the content of all messages into a single text string for easier token counting.
    We'll include the role name (system/user/assistant) plus the text for each content item.
    """
    parts = []

    for msg in model.messages:
        role_line = f"Role: {msg.role}\n"
        content_lines = []
        for item in msg.content:
            content_lines.append(item.text)  # Each content item's text
        # Combine all text for this message
        message_text = role_line + "\n".join(content_lines)
        parts.append(message_text)

    # Join messages with a blank line in between
    combined_prompt_text = "\n\n".join(parts)
    return combined_prompt_text


class ResponseFormatSchema(BaseModel):
    type: str
    json_schema: Dict[str, Any]


class StructuredOutputPromptModel(BaseModel):
    model: LLMModelName
    system_prompt: str
    user_prompt_template: str
    response_format: ResponseFormatSchema

    @field_validator("model")
    def validate_model(cls, v: LLMModelName) -> LLMModelName:
        if not isinstance(v, LLMModelName):
            raise ValueError(
                f"Invalid model name: {v}. Must be one of {[e.value for e in LLMModelName]}"
            )
        return v


def get_prompt_text_from_structured(model: StructuredOutputPromptModel) -> str:
    """
    Combine system_prompt, user_prompt_template, and
    a JSON-like representation of response_format into one text string.
    """
    # Convert the response_format dict to JSON or some string:
    response_format_str = json.dumps(model.response_format.dict(), indent=2)

    # Combine them:
    combined_prompt_text = (
        f"{model.system_prompt}\n\n"
        f"{model.user_prompt_template}\n\n"
        f"Response Format:\n{response_format_str}"
    )
    return combined_prompt_text


class OpenAI_TextGenerationPromptModel(BaseModel):
    model: str
    messages: List[Message]


class OpenAI_StructuredOutputPromptModel(BaseModel):
    model: str
    messages: List[Message]
    response_format: ResponseFormatSchema


# Update the type aliases
SructuredOrTextGenerationPromptModel = Union[
    TextGenerationPromptModel, StructuredOutputPromptModel
]
OpenAI_SructuredOrTextGenerationPromptModel = Union[
    OpenAI_TextGenerationPromptModel, OpenAI_StructuredOutputPromptModel
]


class DataLakehouseOperationType(str, Enum):
    CREATE_COLUMN = "CREATE_COLUMN"
    UPDATE_COLUMN = "UPDATE_COLUMN"


class SheetTaskType(str, Enum):
    LLM_PROCESSING_WITH_OPENAI = "LLM_PROCESSING_WITH_OPENAI"
    LLM_PROCESSING_WITH_GEMINI = "LLM_PROCESSING_WITH_GEMINI"
    LLM_PROCESSING_WITH_ANTHROPIC = "LLM_PROCESSING_WITH_ANTHROPIC"
    TRANSCRIPTION_WITH_FAL = "TRANSCRIPTION_WITH_FAL"
    PDF_TRANSCRIPTION_WITH_MARKER = "PDF_TRANSCRIPTION_WITH_MARKER"
    XML_TRANSCRIPTION_WITH_MARKER = "XML_TRANSCRIPTION_WITH_MARKER"


# Convert SheetTask to a Pydantic model
class SheetTask(BaseModel):
    type: SheetTaskType
    convex_info: ConvexInfo
    datalakehouse_info: DataLakehouseInfo
    workflow_id: Optional[str] = None
    prompt: Optional[SructuredOrTextGenerationPromptModel] = None
    input: Optional[Dict[str, Optional[str]]] = None
    file_path: Optional[str] = None
    content_type: Optional[str] = None
    api_keys: Dict[str, str] = {}
    customer_id: Optional[str] = None


# Define the conversion function
def convert_structured_output_to_openai_model(
    structured_model: StructuredOutputPromptModel,
) -> OpenAI_StructuredOutputPromptModel:
    # Create the system message
    system_content_item = ContentItem(type="text", text=structured_model.system_prompt)
    system_message = Message(role="system", content=[system_content_item])

    # Create the user message
    user_content_item = ContentItem(
        type="text", text=structured_model.user_prompt_template
    )
    user_message = Message(role="user", content=[user_content_item])

    # Combine into the OpenAI model
    openai_model = OpenAI_StructuredOutputPromptModel(
        model=structured_model.model,
        messages=[system_message, user_message],
        response_format=structured_model.response_format,
    )
    return openai_model


# Define the conversion function
def convert_text_generation_to_openai_model(
    text_generation_model: TextGenerationPromptModel,
) -> OpenAI_TextGenerationPromptModel:
    # Combine into the OpenAI model
    openai_model = OpenAI_TextGenerationPromptModel(
        model=text_generation_model.model, messages=text_generation_model.messages
    )
    return openai_model


class DatasetConfig:
    """Configuration for dataset processing."""

    PRIMARY_KEY_COLUMN = "_folio_internal_id"
    ROW_ORDER_COLUMN = "_folio_row_order"
    EXTERNAL_DATASYNC_ROW_COLUMN = "external_data_row_id"
    TOKENIZED_PREFIX = "_folio_tokenized"

    def __init__(self, validation_rules: Dict[str, Any] = {}):
        self.primary_key_column = self.PRIMARY_KEY_COLUMN
        self.validation_rules = validation_rules

        # Initialize disallowed_column_names if not present
        if "disallowed_column_names" not in self.validation_rules:
            self.validation_rules["disallowed_column_names"] = []

        # Always ensure PRIMARY_KEY_COLUMN is in disallowed_column_names
        if (
            self.PRIMARY_KEY_COLUMN
            not in self.validation_rules["disallowed_column_names"]
        ):
            self.validation_rules["disallowed_column_names"].append(
                self.PRIMARY_KEY_COLUMN
            )
            self.validation_rules["disallowed_column_names"].append(
                self.ROW_ORDER_COLUMN
            )


@dataclass
class ProcessingResult:
    """Container for processing results including token counts"""

    input_tokens: int
    output_tokens: int
    total_tokens: int
    results: List[TaskResult]
    errors: List[TaskResult]
    usage: List[Usage]

    @classmethod
    def empty(cls) -> "ProcessingResult":
        return cls(0, 0, 0, [], [], [])

    def add(self, other: "ProcessingResult") -> "ProcessingResult":
        return ProcessingResult(
            input_tokens=self.input_tokens + other.input_tokens,
            output_tokens=self.output_tokens + other.output_tokens,
            total_tokens=self.total_tokens + other.total_tokens,
            results=self.results + other.results,
            errors=self.errors + other.errors,
        )


class DataProcessingWorkflowType(str, Enum):
    """Enum for different types of data processing workflows.

    A template is a pre-defined workflow that has jinja template
    placeholders for dynamic content, while a literal is a static
    workflow that does not contain any placeholders.

    """

    TEMPLATE = "template"
    LITERAL = "literal"


@dataclass
class DataProcessingWorkflowParams:
    """Parameters for launching a data processing workflow deployment."""

    template: str
    base_url: str  # what is the url of the originating API server
    workflow_type: DataProcessingWorkflowType = DataProcessingWorkflowType.TEMPLATE
    user_id: Optional[str] = None
    convex_url: Optional[str] = None
    # file_path: Optional[str] = None

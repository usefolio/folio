from __future__ import annotations

from datetime import datetime, timezone
from typing import Dict, Optional, Any, List
from enum import Enum

from pydantic import BaseModel, Field
from folio.utils.shared_types.shared_types import (
    DATALAB_PROCESSING_COST_PER_1000_PAGES_CENTS,
)


class UserBillingNotSetupError(Exception):
    """Exception raised when a user exists but billing has not been set up."""
    
    def __init__(self, customer_id: str, message: Optional[str] = None):
        self.customer_id = customer_id
        if message is None:
            message = f"Billing not set up for user with ID '{customer_id}'"
        self.message = message
        super().__init__(self.message)


class UserHasNoUsageError(Exception):
    """Exception raised when a user exists but has no usage events."""
    
    def __init__(self, customer_id: str, message: Optional[str] = None):
        self.customer_id = customer_id
        if message is None:
            message = f"No usage events found for user with ID '{customer_id}'"
        self.message = message
        super().__init__(self.message)


class InsufficientCreditsError(Exception):
    """Exception raised when a customer lacks sufficient credits."""

    def __init__(self, message: Optional[str] = None):
        self.message = message or "Insufficient credits"
        super().__init__(self.message)


class UsageEventType(str, Enum):
    """Enum for usage event types."""
    COLUMN_CREATED = "column_created"
    MODAL_FUNCTION_INVOKED = "modal_function_invoked"
    DOCUMENT_INGESTED = "document_ingested"
    AI_CALL_FINALIZED = "ai_call_finalized"
    FAL_TRANSCRIPTION_COMPLETED = "fal_transcription_completed"
    DATALAB_DOCUMENT_PROCESSED = "datalab_document_processed"


class UsageEvent(BaseModel):
    """Pydantic model representing a usage event for billing tracking."""

    transaction_id: str
    customer_id: str
    timestamp: str
    event_type: UsageEventType
    properties: Dict[str, Any] = Field(default_factory=dict)


class Plan(str, Enum):
    BASIC = "basic"
    PREMIUM = "premium"
    PRO = "pro"
    UNKNOWN = "unknown"


class BillingInfo(BaseModel):
    customer_id: str
    plan: Plan = Plan.UNKNOWN
    credits_remaining: float = 0.0
    # Optional ISO8601 start timestamp for the user's current plan cycle anchor
    # Used to compute billing windows (e.g., monthly cycles)
    plan_start: Optional[str] = None
    # Optional ISO8601 timestamp describing when the plan expires. When set,
    # billing checks should consider the membership inactive once this
    # timestamp is in the past.
    plan_expires_at: Optional[str] = None
    # When a demo plan is issued we stamp this for simple idempotency checks.
    demo_plan_activated_at: Optional[str] = None


# Event Type Models
class ColumnCreatedEventData(BaseModel):
    """Typed model for column creation event parameters."""
    customer_id: str
    sheet_id: str
    column_id: str
    plan: str
    qty: int = 1
    transaction_id: Optional[str] = None


class ModalFunctionInvokedEventData(BaseModel):
    """Typed model for modal function invocation event parameters."""
    customer_id: str
    sheet_id: str
    function: str
    rows: int
    transaction_id: Optional[str] = None


class DocumentIngestedEventData(BaseModel):
    """Typed model for document ingestion event parameters."""
    customer_id: str
    source: str
    pages: int
    transaction_id: Optional[str] = None


class AiCallFinalizedEventData(BaseModel):
    """Typed model for AI call finalization event parameters."""
    customer_id: str
    provider: str
    model: str
    input_tokens: int
    output_tokens: int
    total_tokens: int
    trace_id: str
    transaction_id: Optional[str] = None


class FalTranscriptionEventData(BaseModel):
    """Typed model for Fal transcription event parameters."""
    customer_id: str
    file_id: str
    duration_seconds: float
    model: str = "whisper-large-v3"
    trace_id: str
    transaction_id: Optional[str] = None


class DatalabDocumentProcessingEventData(BaseModel):
    """Typed model for Datalab document processing event parameters."""
    customer_id: str
    file_id: str
    pages_processed: int
    content_type: str
    cost: float = 0.0
    service: str = "marker"
    trace_id: str
    transaction_id: Optional[str] = None


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def column_created_event(data: ColumnCreatedEventData) -> UsageEvent:
    transaction_id = data.transaction_id or f"{data.sheet_id}:{data.column_id}"
    return UsageEvent(
        transaction_id=transaction_id,
        customer_id=data.customer_id,
        timestamp=_now(),
        event_type=UsageEventType.COLUMN_CREATED,
        properties=data.model_dump(),
    )


def modal_function_invoked_event(data: ModalFunctionInvokedEventData) -> UsageEvent:
    transaction_id = data.transaction_id or f"{data.sheet_id}:{data.function}:{data.rows}"
    return UsageEvent(
        transaction_id=transaction_id,
        customer_id=data.customer_id,
        timestamp=_now(),
        event_type=UsageEventType.MODAL_FUNCTION_INVOKED,
        properties=data.model_dump(),
    )


def document_ingested_event(data: DocumentIngestedEventData) -> UsageEvent:
    transaction_id = data.transaction_id or f"{data.source}:{data.pages}:{_now()}"
    return UsageEvent(
        transaction_id=transaction_id,
        customer_id=data.customer_id,
        timestamp=_now(),
        event_type=UsageEventType.DOCUMENT_INGESTED,
        properties=data.model_dump(),
    )


def ai_call_finalized_event(data: AiCallFinalizedEventData) -> UsageEvent:
    transaction_id = data.transaction_id or data.trace_id
    return UsageEvent(
        transaction_id=transaction_id,
        customer_id=data.customer_id,
        timestamp=_now(),
        event_type=UsageEventType.AI_CALL_FINALIZED,
        properties=data.model_dump(),
    )


def fal_transcription_event(data: FalTranscriptionEventData) -> UsageEvent:
    """Create a usage event for Fal audio transcription."""
    transaction_id = data.transaction_id or data.trace_id
    return UsageEvent(
        transaction_id=transaction_id,
        customer_id=data.customer_id,
        timestamp=_now(),
        event_type=UsageEventType.FAL_TRANSCRIPTION_COMPLETED,
        properties=data.model_dump(),
    )


def datalab_document_processing_event(data: DatalabDocumentProcessingEventData) -> UsageEvent:
    """Create a usage event for Datalab document processing (Marker)."""
    transaction_id = data.transaction_id or data.trace_id
    return UsageEvent(
        transaction_id=transaction_id,
        customer_id=data.customer_id,
        timestamp=_now(),
        event_type=UsageEventType.DATALAB_DOCUMENT_PROCESSED,
        properties=data.model_dump(),
    )


# Event Aggregation Models
class AiCallAggregation(BaseModel):
    """Aggregation model for AI call events grouped by provider and model."""
    provider: str
    model: str
    total_input_tokens: int = 0
    total_output_tokens: int = 0
    total_tokens: int = 0
    call_count: int = 0


class FalTranscriptionAggregation(BaseModel):
    """Aggregation model for Fal transcription events."""
    total_duration_seconds: float = 0.0
    transcription_count: int = 0


class DatalabDocumentAggregation(BaseModel):
    """Aggregation model for Datalab document processing events."""
    total_pages_processed: int = 0
    document_count: int = 0
    total_cost: float = 0.0


class ColumnCreatedAggregation(BaseModel):
    """Aggregation model for column creation events."""
    total_columns: int = 0


class ModalFunctionAggregation(BaseModel):
    """Aggregation model for modal function invocations."""
    total_rows_processed: int = 0
    invocation_count: int = 0


class DocumentIngestedAggregation(BaseModel):
    """Aggregation model for document ingestion events."""
    total_pages: int = 0
    document_count: int = 0


class EventAggregationSummary(BaseModel):
    """Summary of all event aggregations for a customer."""
    customer_id: str
    ai_calls: List[AiCallAggregation] = Field(default_factory=list)
    fal_transcriptions: FalTranscriptionAggregation = Field(default_factory=FalTranscriptionAggregation)
    datalab_processing: DatalabDocumentAggregation = Field(default_factory=DatalabDocumentAggregation)
    column_creations: ColumnCreatedAggregation = Field(default_factory=ColumnCreatedAggregation)
    modal_functions: ModalFunctionAggregation = Field(default_factory=ModalFunctionAggregation)
    document_ingestions: DocumentIngestedAggregation = Field(default_factory=DocumentIngestedAggregation)

    @property
    def pretty_print(self) -> str:
        """Return a formatted ASCII table of usage statistics."""
        lines = []
        lines.append(f"Usage Summary for Customer: {self.customer_id}")
        lines.append("=" * 60)
        lines.append("")

        # AI Calls Table
        if self.ai_calls:
            lines.append("AI CALLS")
            lines.append("-" * 60)
            lines.append(f"{'Provider':<15} {'Model':<20} {'Input':<8} {'Output':<8} {'Total':<8} {'Calls':<6}")
            lines.append("-" * 60)
            for call in self.ai_calls:
                lines.append(
                    f"{call.provider:<15} {call.model:<20} "
                    f"{call.total_input_tokens:<8} {call.total_output_tokens:<8} "
                    f"{call.total_tokens:<8} {call.call_count:<6}"
                )
            lines.append("")

        # Transcriptions
        if self.fal_transcriptions.transcription_count > 0:
            lines.append("FAL TRANSCRIPTIONS")
            lines.append("-" * 40)
            lines.append(f"Total Duration: {self.fal_transcriptions.total_duration_seconds:.2f} seconds")
            lines.append(f"Total Transcriptions: {self.fal_transcriptions.transcription_count}")
            lines.append("")

        # Document Processing
        if self.datalab_processing.document_count > 0:
            lines.append("DATALAB DOCUMENT PROCESSING")
            lines.append("-" * 40)
            lines.append(f"Total Pages Processed: {self.datalab_processing.total_pages_processed}")
            lines.append(f"Total Documents: {self.datalab_processing.document_count}")
            lines.append(
                f"Total Cost: ${self.datalab_processing.total_cost:.4f}"
            )
            lines.append("")

        # Column Creations
        if self.column_creations.total_columns > 0:
            lines.append("COLUMN CREATIONS")
            lines.append("-" * 40)
            lines.append(f"Total Columns Created: {self.column_creations.total_columns}")
            lines.append("")

        # Modal Functions
        if self.modal_functions.invocation_count > 0:
            lines.append("MODAL FUNCTION INVOCATIONS")
            lines.append("-" * 40)
            lines.append(f"Total Rows Processed: {self.modal_functions.total_rows_processed}")
            lines.append(f"Total Invocations: {self.modal_functions.invocation_count}")
            lines.append("")

        # Document Ingestions
        if self.document_ingestions.document_count > 0:
            lines.append("DOCUMENT INGESTIONS")
            lines.append("-" * 40)
            lines.append(f"Total Pages Ingested: {self.document_ingestions.total_pages}")
            lines.append(f"Total Documents: {self.document_ingestions.document_count}")
            lines.append("")

        if len(lines) == 3:  # Only header lines, no data
            lines.append("No usage data found.")

        return "\n".join(lines)


class EventAggregator:
    """Class to aggregate usage events from database queries."""
    
    @staticmethod
    def aggregate_events(customer_id: str, events: List[UsageEvent]) -> EventAggregationSummary:
        """Aggregate a list of usage events into summary statistics."""
        summary = EventAggregationSummary(customer_id=customer_id)
        
        for event in events:
            if event.event_type == UsageEventType.AI_CALL_FINALIZED:
                EventAggregator._aggregate_ai_call(summary, event)
            elif event.event_type == UsageEventType.FAL_TRANSCRIPTION_COMPLETED:
                EventAggregator._aggregate_fal_transcription(summary, event)
            elif event.event_type == UsageEventType.DATALAB_DOCUMENT_PROCESSED:
                EventAggregator._aggregate_datalab_processing(summary, event)
            elif event.event_type == UsageEventType.COLUMN_CREATED:
                EventAggregator._aggregate_column_creation(summary, event)
            elif event.event_type == UsageEventType.MODAL_FUNCTION_INVOKED:
                EventAggregator._aggregate_modal_function(summary, event)
            elif event.event_type == UsageEventType.DOCUMENT_INGESTED:
                EventAggregator._aggregate_document_ingestion(summary, event)
                
        return summary
    
    @staticmethod
    def _aggregate_ai_call(summary: EventAggregationSummary, event: UsageEvent) -> None:
        """Aggregate AI call events by provider and model."""
        props = event.properties
        provider = props.get("provider", "")
        model = props.get("model", "")
        
        # Find existing aggregation for this provider/model combination
        existing = next(
            (agg for agg in summary.ai_calls if agg.provider == provider and agg.model == model),
            None
        )
        
        if existing:
            existing.total_input_tokens += props.get("input_tokens", 0)
            existing.total_output_tokens += props.get("output_tokens", 0)
            existing.total_tokens += props.get("total_tokens", 0)
            existing.call_count += 1
        else:
            summary.ai_calls.append(AiCallAggregation(
                provider=provider,
                model=model,
                total_input_tokens=props.get("input_tokens", 0),
                total_output_tokens=props.get("output_tokens", 0),
                total_tokens=props.get("total_tokens", 0),
                call_count=1
            ))
    
    @staticmethod
    def _aggregate_fal_transcription(summary: EventAggregationSummary, event: UsageEvent) -> None:
        """Aggregate Fal transcription events."""
        props = event.properties
        summary.fal_transcriptions.total_duration_seconds += props.get("duration_seconds", 0.0)
        summary.fal_transcriptions.transcription_count += 1
    
    @staticmethod
    def _aggregate_datalab_processing(summary: EventAggregationSummary, event: UsageEvent) -> None:
        """Aggregate Datalab document processing events.

        Cost is derived purely from pages processed using centralized pricing
        (no reliance on event-provided cost fields).
        """
        props = event.properties
        pages = int(props.get("pages_processed", 0) or 0)
        summary.datalab_processing.total_pages_processed += pages
        summary.datalab_processing.document_count += 1
        # Convert cents-per-1000-pages to USD and apply per-event pages
        per_thousand_usd = DATALAB_PROCESSING_COST_PER_1000_PAGES_CENTS / 100.0
        increment_usd = (pages / 1000.0) * per_thousand_usd
        summary.datalab_processing.total_cost += float(increment_usd)
    
    @staticmethod
    def _aggregate_column_creation(summary: EventAggregationSummary, event: UsageEvent) -> None:
        """Aggregate column creation events."""
        props = event.properties
        summary.column_creations.total_columns += props.get("qty", 1)
    
    @staticmethod
    def _aggregate_modal_function(summary: EventAggregationSummary, event: UsageEvent) -> None:
        """Aggregate modal function invocation events."""
        props = event.properties
        summary.modal_functions.total_rows_processed += props.get("rows", 0)
        summary.modal_functions.invocation_count += 1
    
    @staticmethod
    def _aggregate_document_ingestion(summary: EventAggregationSummary, event: UsageEvent) -> None:
        """Aggregate document ingestion events."""
        props = event.properties
        summary.document_ingestions.total_pages += props.get("pages", 0)
        summary.document_ingestions.document_count += 1

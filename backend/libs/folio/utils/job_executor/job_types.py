from typing import List, Optional, ClassVar, Dict, Any
from enum import Enum
from pydantic import BaseModel, ConfigDict, computed_field
from folio.utils.shared_types.shared_types import LLMModelName


# JobState Enum
class JobState(str, Enum):
    SCHEDULED = "SCHEDULED"
    PENDING = "PENDING"
    IN_PROGRESS = "IN_PROGRESS"
    SUCCESS = "SUCCESS"
    PARTIAL_SUCCESS = "PARTIAL_SUCCESS"
    FAILURE = "FAILURE"
    CANCELED = "CANCELED"


# JobType Enum
class JobType(str, Enum):
    ENRICHING_DATA = "ENRICHING_DATA"
    FILTERING_DATA = "FILTERING_DATA"


# Enrichment Parameters
class EnrichmentParameters(BaseModel):
    prompt: Optional[str] = None
    model: Optional[str] = None
    response_options: Optional[List[str]] = None
    filter: Optional[str] = None


# Data Filtering Parameters
class DataFilteringParameters(BaseModel):
    filter: Optional[str] = None


# Union Type for Parameters (Pydantic 2.0+ allows this)
class JobParameters(BaseModel):
    enrichment: Optional[EnrichmentParameters] = None
    filtering: Optional[DataFilteringParameters] = None


# Partial Errors
class PartialError(BaseModel):
    rowId: Optional[str] = None
    error: Optional[str] = None


# Job Log
class JobLog(BaseModel):
    timestamp: str  # ISO 8601 date string
    message: str
    partialErrors: Optional[List[PartialError]] = None


# Job Progress
class JobProgress(BaseModel):
    completedCount: Optional[int] = None
    totalCount: Optional[int] = None


# Job Token Usage
class JobTokenUsage(BaseModel):

    model_name: Optional[LLMModelName] = (
        None  # Keep as string for backward compatibility
    )
    inputTokens: Optional[int] = 0
    outputTokens: Optional[int] = 0
    totalTokens: int

    @computed_field
    @property
    def totalCost(self) -> float:
        """Calculate total cost in USD based on token usage and model pricing."""
        model_pricing = LLMModelName.get_pricing()

        if not self.model_name:
            return 0.0  # No cost for non-LLM tasks

        if self.model_name not in model_pricing:
            raise ValueError(f"Unknown model: {self.model_name}")

        pricing = model_pricing[self.model_name]
        input_rate = pricing["input_per_million_tokens"]
        output_rate = pricing["output_per_million_tokens"]

        cost_input = (self.inputTokens / 1_000_000) * input_rate
        cost_output = (self.outputTokens / 1_000_000) * output_rate

        if cost_input is None or cost_output is None:
            return 0.0

        return cost_input + cost_output


# Job Model
class Job(BaseModel):
    id: str  # Unique job identifier (GUID)
    type: JobType
    state: JobState
    createdBy: str
    createdAt: str  # ISO 8601 date string
    updatedAt: str  # ISO 8601 date string
    progress: Optional[JobProgress] = None
    logs: Optional[List[JobLog]] = None
    errorReason: Optional[str] = None
    cancellationReason: Optional[str] = None
    parameters: Optional[JobParameters] = (
        None  # ✅ Union of both parameter types, optional
    )
    scheduledStartAt: Optional[str] = None
    expectedCompletionAt: Optional[str] = None
    tokenUsage: Optional[JobTokenUsage] = None


class JobUpdate(BaseModel):
    state: Optional[JobState] = None
    updatedAt: Optional[str] = None
    progress: Optional[JobProgress] = None
    logs: Optional[List[JobLog]] = None
    errorReason: Optional[str] = None
    cancellationReason: Optional[str] = None
    parameters: Optional[JobParameters] = None
    scheduledStartAt: Optional[str] = None
    expectedCompletionAt: Optional[str] = None
    tokenUsage: Optional[JobTokenUsage] = None


### Types for jobs that need to be synced with Convex


class ExternallySyncedJob(Job):
    job_id: Optional[str] = None
    project_id: Optional[str] = None
    column_id: Optional[str] = None
    sheet_id: Optional[str] = None


class ExternallySyncedJobUpdate(JobUpdate):
    job_id: Optional[str] = None
    project_id: Optional[str] = None
    column_id: Optional[str] = None
    sheet_id: Optional[str] = None

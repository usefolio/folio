from dataclasses import dataclass
from datetime import datetime, timezone
import json
from unittest.mock import Mock, AsyncMock, call, patch
import uuid
from folio.utils.cell_states.cell_states_helper import CellState
from folio.utils.job_executor.job_types import (
    EnrichmentParameters,
    ExternallySyncedJob,
    Job,
    JobLog,
    JobParameters,
    JobProgress,
    JobState,
    JobTokenUsage,
    JobType,
)
import pytest
from folio.utils.shared_types.shared_types import (
    ConvexInfo,
    DataLakehouseInfo,
    LLMModelName,
    ProcessingResult,
    Usage,
    SheetTask,
    SheetTaskType,
    TaskResult,
    TextGenerationPromptModel,
    TimeoutExceptionWithData,
)
from folio.utils.task_processor.task_processor import (
    ModalTaskProcessingBackend,
    TaskProcessingBackend,
)
from folio.utils.queue_monitor import ClientNotifier, QueueMonitor, QueueMonitorConfig


@dataclass
class ConvexInfoMock:
    convex_row_order: int


@dataclass
class DataLakehouseInfoMock:
    id: int


@dataclass
class MockResult:
    convex_info: ConvexInfo
    duck_db_id: int
    value: str


JOB = ExternallySyncedJob(
    id=str(uuid.uuid4()),  # Generate a unique job ID
    job_id=str(uuid.uuid4()),  # this is the job id in the external system
    type=JobType.ENRICHING_DATA,
    state=JobState.SCHEDULED,
    createdBy="user123",
    createdAt=datetime.now(timezone.utc).isoformat(),
    updatedAt=datetime.now(timezone.utc).isoformat(),
    progress=JobProgress(completedCount=0, totalCount=100),
    logs=[
        JobLog(
            timestamp=datetime.now(timezone.utc).isoformat(),
            message="Job scheduled successfully",
            partialErrors=None,
        )
    ],
    parameters=JobParameters(
        enrichment=EnrichmentParameters(
            prompt="Summarize the following text.",
            model="gpt-4",
            response_options=["summary", "key points"],
            filter=None,
        )
    ),
    scheduledStartAt=datetime.now(timezone.utc).isoformat(),
    expectedCompletionAt=datetime.now(timezone.utc).isoformat(),
    tokenUsage=JobTokenUsage(totalTokens=0),
)


@pytest.fixture
def config():
    original_task_list = []
    for i in range(10):
        new_sheet_task = SheetTask(
            type=SheetTaskType.LLM_PROCESSING_WITH_OPENAI,
            workflow_id="test-workflow",
            datalakehouse_info=DataLakehouseInfo(id=i, column_name="test-column"),
            input={f"input_{i}": f"value_{i}"},
            prompt=TextGenerationPromptModel(
                model=LLMModelName.GPT41_NANO.value,
                messages=[
                    {
                        "role": "test-role",
                        "content": [{"type": "test-type", "text": f"test-text_{i}"}],
                    }
                ],
            ),
            convex_info=ConvexInfo(
                convex_project_id="test-project",
                convex_column_id="test-column",
                convex_row_id="0",
                convex_row_order=i,
            ),
        )
        original_task_list.append(new_sheet_task)

    duck_db_ids = [item.datalakehouse_info.id for item in original_task_list]
    row_orders = [item.convex_info.convex_row_order for item in original_task_list]

    return QueueMonitorConfig(
        job_id="test-job",
        column_name="test-column",
        convex_project_id="test-project",
        total_cells=10,
        callback_url="http://test.com",
        output_name="test-output",
        original_task_list_duck_db_ids=duck_db_ids,
        original_task_list_external_row_orders=row_orders,
        is_final_batch=True,
        total_task_list_count=len(original_task_list),
    )


@pytest.fixture
def mock_task_processor():
    mock_task_processor = Mock()

    # Success queue mock setup - returns 5 batches of 2 items each
    success_results = [
        [
            MockResult(ConvexInfoMock(i), i, f"value_{i}") for i in range(0, 2)
        ],  # First batch: items 0,1
        [
            MockResult(ConvexInfoMock(i), i, f"value_{i}") for i in range(2, 4)
        ],  # Second batch: items 2,3
        [
            MockResult(ConvexInfoMock(i), i, f"value_{i}") for i in range(4, 6)
        ],  # Third batch: items 4,5
        [
            MockResult(ConvexInfoMock(i), i, f"value_{i}") for i in range(6, 8)
        ],  # Fourth batch: items 6,7
        [
            MockResult(ConvexInfoMock(i), i, f"value_{i}") for i in range(8, 10)
        ],  # Fifth batch: items 8,9
    ]
    # Queue returns 2 items 5 times, then empty
    mock_task_processor.get_success_queue_length_async = AsyncMock(
        side_effect=[0, 2, 2, 2, 2, 2]
    )
    mock_task_processor.get_all_items_from_success_queue_async = AsyncMock(
        side_effect=success_results
    )

    # Error queue mock setup - always empty
    mock_task_processor.get_error_queue_length_async = AsyncMock(return_value=0)

    mock_task_processor.get_model_name.return_value = LLMModelName.GPT41_NANO.value
    mock_task_processor.get_provider.return_value = "openai"

    return mock_task_processor


@pytest.fixture
def mock_client_notifier():
    return AsyncMock()


@pytest.fixture
def mock_result_parser():
    def mock_parse(items, output_name):
        print(
            f"mock_parse called with {len(items)} items and output_name={output_name}"
        )
        # Print the first item to see its structure
        if items:
            print(f"First item type: {type(items[0])}")
            print(f"First item attributes: {vars(items[0])}")

        processing_result = ProcessingResult(
            input_tokens=0,
            output_tokens=-0,
            total_tokens=0,
            results=items,
            errors=[],
            usage=[],
        )

        return processing_result

    # Return the function directly, not a Mock with side_effect
    return mock_parse


@pytest.fixture
def mock_error_parser():
    def mock_parse(items):
        # Convert each item to a TaskResult with is_error=True
        return [
            TaskResult(
                convex_info=item.convex_info,
                duck_db_id=item.datalakehouse_info.id,
                value="",
                is_error=True,
            )
            for item in items
        ]

    # Return the function directly, not a Mock with side_effect
    return mock_parse


@pytest.mark.asyncio
async def test_complete_workflow(
    config,
    mock_task_processor,
    mock_client_notifier,
    mock_result_parser,
    mock_error_parser,
):

    mock_task_processor.get_result_parser.return_value = mock_result_parser
    mock_task_processor.get_error_parser.return_value = mock_error_parser

    monitor = QueueMonitor(
        job=JOB,
        task_processing_backend=mock_task_processor,
        config=config,
        client_notifier=mock_client_notifier,
    )

    # All cells should be LOADING
    for i in range(10):
        assert monitor.cell_states.get_cell(i) == CellState.LOADING

    _ = await monitor.monitor_queues(10)

    actual_calls = mock_client_notifier.send_data.call_args_list
    assert len(actual_calls) == 3

    # After first batch (0-3)
    first_batch_items = actual_calls[0][0]
    assert [r.convex_info.convex_row_order for r in first_batch_items[0]] == [
        0,
        1,
        2,
        3,
    ]
    # # Check cells 0-3 are DEFAULT, rest are LOADING
    for i in range(10):
        expected_state = CellState.DEFAULT if i <= 3 else CellState.LOADING
        assert first_batch_items[1].get_cell(i) == expected_state
        print(f"Cell state is {first_batch_items[1].get_cell(i)}")

    # After second batch (4-7)
    second_batch_items = actual_calls[1][0]
    assert [r.convex_info.convex_row_order for r in second_batch_items[0]] == [
        4,
        5,
        6,
        7,
    ]
    # Check cells 0-7 are DEFAULT, rest are LOADING
    for i in range(10):
        expected_state = CellState.DEFAULT if i <= 7 else CellState.LOADING
        assert second_batch_items[1].get_cell(i) == expected_state

    # # After final batch (8-9)
    third_batch_items = actual_calls[2][0]
    assert [r.convex_info.convex_row_order for r in third_batch_items[0]] == [8, 9]
    # All cells should be DEFAULT
    for i in range(10):
        assert third_batch_items[1].get_cell(i) == CellState.DEFAULT


@pytest.mark.asyncio
async def test_error_workflow(
    config, mock_client_notifier, mock_result_parser, mock_error_parser
):
    # Setup success queue to process 4 items before error
    success_queue = Mock()
    success_results = [
        [MockResult(ConvexInfoMock(i), i, f"value_{i}") for i in range(0, 4)],
        [MockResult(ConvexInfoMock(i), i, f"value_{i}") for i in range(4, 8)],
        [MockResult(ConvexInfoMock(9), 9, f"value_{9}")],
    ]

    mock_task_processor = Mock()

    mock_task_processor.get_result_parser.return_value = mock_result_parser
    mock_task_processor.get_error_parser.return_value = mock_error_parser

    mock_task_processor.get_success_queue_length_async = AsyncMock(
        side_effect=[
            0,
            4,
            4,
            1,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
        ]
    )
    mock_task_processor.get_all_items_from_success_queue_async = AsyncMock(
        side_effect=success_results
    )

    # Setup error queue to error after 4 successful items
    mock_task_processor.get_error_queue_length_async = AsyncMock(
        side_effect=[
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            0,
            0,
        ]
    )
    mock_task_processor.get_all_items_from_error_queue_async = AsyncMock(
        return_value=[
            json.dumps(
                {
                    "convex_project_id": "1",
                    "convex_column_id": "1",
                    "convex_row_id": "1",
                    "convex_row_order": 9,  # corresponding to the 9th cell which is the 4th call in the error_queue side effect
                    "id": 9,
                    "column": "test",
                    "error": "error",
                }
            )
        ]
    )
    mock_task_processor.get_model_name.return_value = LLMModelName.GPT41_NANO.value
    mock_task_processor.get_provider.return_value = "openai"

    monitor = QueueMonitor(
        job=JOB,
        task_processing_backend=mock_task_processor,
        config=config,
        client_notifier=mock_client_notifier,
    )

    await monitor.monitor_queues(10)

    # Verify items before error were processed
    assert (
        mock_client_notifier.send_data.call_count == 4
    )  # One notification for items 0-3

    # Verify cells for processed items are DEFAULT
    for i in range(8):
        assert monitor.cell_states.get_cell(i) == CellState.DEFAULT

    assert monitor.cell_states.get_cell(9) == CellState.ERROR


@pytest.mark.asyncio
async def test_timeout_exception(
    config, mock_client_notifier, mock_result_parser, mock_error_parser
):
    # Setup success queue to process only 5 out of 10 items
    mock_task_processor = Mock()
    success_results = [
        [MockResult(ConvexInfoMock(i), i, f"value_{i}") for i in range(0, 5)],
    ]

    mock_task_processor.get_result_parser.return_value = mock_result_parser
    mock_task_processor.get_error_parser.return_value = mock_error_parser

    # Queue returns 5 items once, then empty to simulate stall
    mock_task_processor.get_success_queue_length_async = AsyncMock(
        side_effect=[0] + [5] + [0] * 300
    )
    # First element for verify queue. Many zeros to ensure timeout
    mock_task_processor.get_all_items_from_success_queue_async = AsyncMock(
        side_effect=success_results
    )

    # Error queue stays empty
    mock_task_processor.get_error_queue_length_async = AsyncMock(return_value=0)

    monitor = QueueMonitor(
        job=JOB,
        task_processing_backend=mock_task_processor,
        config=config,
        client_notifier=mock_client_notifier,
    )

    mock_task_processor.get_model_name.return_value = LLMModelName.GPT41_NANO.value
    mock_task_processor.get_provider.return_value = "openai"

    # Mock time.time() to simulate passage of time
    time_values = [1000]  # Start time

    def mock_time():
        # Each call adds 20 seconds
        time_values[0] += 20
        return time_values[0]

    with patch("time.time", mock_time):
        # We expect TimeoutExceptionWithData to be raised
        with pytest.raises(TimeoutExceptionWithData) as exc_info:
            await monitor.monitor_queues(10)

        # Verify the exception contains the processed results
        assert len(exc_info.value.data) == 5
        for i, result in enumerate(exc_info.value.data):
            assert result.convex_info.convex_row_order == i
            assert result.value == f"value_{i}"

    # Verify client notifications were made for the processed items
    assert (
        mock_client_notifier.send_data.call_count == 2
    )  # One for error and one for successses

    # Verify cell states
    for i in range(10):
        if i < 5:
            assert monitor.cell_states.get_cell(i) == CellState.DEFAULT
        else:
            assert monitor.cell_states.get_cell(i) == CellState.ERROR

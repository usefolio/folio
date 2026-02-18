#!/usr/bin/env python3
"""
Unit tests for usage event aggregation functionality.
"""

import unittest
from unittest.mock import Mock, MagicMock, patch
from datetime import datetime, timezone
from folio.utils.usage_cop.models import (
    UsageEvent,
    UsageEventType,
    AiCallFinalizedEventData,
    ai_call_finalized_event,
    FalTranscriptionEventData,
    fal_transcription_event,
    DatalabDocumentProcessingEventData,
    datalab_document_processing_event,
    ColumnCreatedEventData,
    column_created_event,
    ModalFunctionInvokedEventData,
    modal_function_invoked_event,
    DocumentIngestedEventData,
    document_ingested_event,
    EventAggregator,
    EventAggregationSummary,
    UserBillingNotSetupError,
    UserHasNoUsageError,
    BillingInfo,
    Plan,
)
from folio.utils.usage_cop.billing_service import BillingService
from folio.utils.usage_cop.providers.storage_backend_provider import StorageBackendProvider
from folio.utils.shared_types.shared_types import LLMModelName


class TestUsageEventAggregation(unittest.TestCase):
    """Test usage event aggregation functionality."""

    def setUp(self):
        """Set up test data."""
        self.customer_id = "test_customer_123"
        self.tz = timezone.utc

    def _iso(self, dt: datetime) -> str:
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=self.tz)
        return dt.isoformat()

    def test_ai_call_aggregation(self):
        """Test AI call event aggregation."""
        # Create multiple AI call events
        events = []
        
        # OpenAI GPT-4 events
        for i in range(3):
            event_data = AiCallFinalizedEventData(
                customer_id=self.customer_id,
                provider="openai",
                model="gpt-4",
                input_tokens=1000 + i * 100,
                output_tokens=500 + i * 50,
                total_tokens=1500 + i * 150,
                trace_id=f"trace_{i}",
            )
            events.append(ai_call_finalized_event(event_data))

        # Anthropic Claude events
        for i in range(2):
            event_data = AiCallFinalizedEventData(
                customer_id=self.customer_id,
                provider="anthropic",
                model="claude-3-opus",
                input_tokens=800 + i * 100,
                output_tokens=400 + i * 50,
                total_tokens=1200 + i * 150,
                trace_id=f"claude_trace_{i}",
            )
            events.append(ai_call_finalized_event(event_data))

        # Aggregate events
        summary = EventAggregator.aggregate_events(self.customer_id, events)

        # Verify aggregation
        self.assertEqual(len(summary.ai_calls), 2)  # 2 provider/model combinations
        
        # Find OpenAI aggregation
        openai_agg = next(
            (agg for agg in summary.ai_calls if agg.provider == "openai"),
            None
        )
        self.assertIsNotNone(openai_agg)
        self.assertEqual(openai_agg.model, "gpt-4")
        self.assertEqual(openai_agg.call_count, 3)
        self.assertEqual(openai_agg.total_input_tokens, 1000 + 1100 + 1200)  # 3300
        self.assertEqual(openai_agg.total_output_tokens, 500 + 550 + 600)    # 1650
        self.assertEqual(openai_agg.total_tokens, 1500 + 1650 + 1800)        # 4950

        # Find Anthropic aggregation
        anthropic_agg = next(
            (agg for agg in summary.ai_calls if agg.provider == "anthropic"),
            None
        )
        self.assertIsNotNone(anthropic_agg)
        self.assertEqual(anthropic_agg.model, "claude-3-opus")
        self.assertEqual(anthropic_agg.call_count, 2)
        self.assertEqual(anthropic_agg.total_input_tokens, 800 + 900)   # 1700
        self.assertEqual(anthropic_agg.total_output_tokens, 400 + 450)  # 850
        self.assertEqual(anthropic_agg.total_tokens, 1200 + 1350)       # 2550

    def test_fal_transcription_aggregation(self):
        """Test Fal transcription event aggregation."""
        events = []
        
        # Create multiple transcription events
        durations = [120.5, 45.2, 300.7]
        for i, duration in enumerate(durations):
            event_data = FalTranscriptionEventData(
                customer_id=self.customer_id,
                file_id=f"file_{i}",
                duration_seconds=duration,
                model="whisper-large-v3",
                trace_id=f"fal_trace_{i}",
            )
            events.append(fal_transcription_event(event_data))

        summary = EventAggregator.aggregate_events(self.customer_id, events)
        
        self.assertEqual(summary.fal_transcriptions.transcription_count, 3)
        self.assertAlmostEqual(
            summary.fal_transcriptions.total_duration_seconds, 
            sum(durations),
            places=1
        )

    def test_datalab_processing_aggregation(self):
        """Test Datalab document processing aggregation."""
        events = []
        
        # Create multiple document processing events
        page_counts = [10, 25, 5, 40]
        costs = [1.0, 2.5, 0.5, 4.0]
        for i, (pages, cost) in enumerate(zip(page_counts, costs)):
            event_data = DatalabDocumentProcessingEventData(
                customer_id=self.customer_id,
                file_id=f"doc_{i}",
                pages_processed=pages,
                content_type="pdf",
                service="marker",
                cost=cost,
                trace_id=f"datalab_trace_{i}",
            )
            events.append(datalab_document_processing_event(event_data))

        summary = EventAggregator.aggregate_events(self.customer_id, events)

        self.assertEqual(summary.datalab_processing.document_count, 4)
        self.assertEqual(summary.datalab_processing.total_pages_processed, sum(page_counts))
        # Cost now derived from pages only at $6 per 1000 pages
        expected_cost = (sum(page_counts) / 1000.0) * 6.0
        self.assertAlmostEqual(summary.datalab_processing.total_cost, expected_cost)

        pretty_output = summary.pretty_print
        self.assertIn(f"Total Cost: ${expected_cost:.4f}", pretty_output)

    def test_datalab_event_includes_cost_property(self):
        """Ensure Datalab events include cost property."""
        event_data = DatalabDocumentProcessingEventData(
            customer_id=self.customer_id,
            file_id="doc_test",
            pages_processed=2,
            content_type="pdf",
            cost=1.23,
            trace_id="trace_cost",
        )
        event = datalab_document_processing_event(event_data)
        self.assertEqual(event.properties["cost"], 1.23)

    def test_datalab_processing_default_cost_when_missing(self):
        """When cost is not provided on events, apply default $6 per 1000 docs."""
        events = []
        # Create 6 events without an explicit cost
        for i in range(6):
            event = datalab_document_processing_event(
                DatalabDocumentProcessingEventData(
                    customer_id=self.customer_id,
                    file_id=f"doc_{i}",
                    pages_processed=10 + i,  # arbitrary page counts
                    content_type="pdf",
                    trace_id=f"trace_{i}",
                )
            )
            events.append(event)

        summary = EventAggregator.aggregate_events(self.customer_id, events)
        # Expected cost = total pages * ($6 / 1000)
        total_pages = sum(10 + i for i in range(6))  # 10..15 -> 75 pages
        expected_cost = (total_pages / 1000.0) * 6.0
        self.assertAlmostEqual(summary.datalab_processing.total_cost, expected_cost, places=6)
        pretty_output = summary.pretty_print
        self.assertIn(f"Total Cost: ${expected_cost:.4f}", pretty_output)

    def test_mixed_events_aggregation(self):
        """Test aggregation with mixed event types."""
        events = []
        
        # Add various event types
        
        # AI calls
        ai_data = AiCallFinalizedEventData(
            customer_id=self.customer_id,
            provider="openai",
            model="gpt-3.5-turbo",
            input_tokens=500,
            output_tokens=300,
            total_tokens=800,
            trace_id="ai_trace",
        )
        events.append(ai_call_finalized_event(ai_data))
        
        # Transcription
        transcription_data = FalTranscriptionEventData(
            customer_id=self.customer_id,
            file_id="audio_file",
            duration_seconds=60.5,
            trace_id="transcription_trace",
        )
        events.append(fal_transcription_event(transcription_data))
        
        # Column creation
        column_data = ColumnCreatedEventData(
            customer_id=self.customer_id,
            sheet_id="sheet_123",
            column_id="col_456",
            plan="premium",
            qty=3,
        )
        events.append(column_created_event(column_data))
        
        # Document ingestion
        doc_data = DocumentIngestedEventData(
            customer_id=self.customer_id,
            source="uploaded_file.pdf",
            pages=15,
        )
        events.append(document_ingested_event(doc_data))

        summary = EventAggregator.aggregate_events(self.customer_id, events)
        
        # Verify all event types were aggregated
        self.assertEqual(len(summary.ai_calls), 1)
        self.assertEqual(summary.ai_calls[0].call_count, 1)
        self.assertEqual(summary.ai_calls[0].total_tokens, 800)
        
        self.assertEqual(summary.fal_transcriptions.transcription_count, 1)
        self.assertAlmostEqual(summary.fal_transcriptions.total_duration_seconds, 60.5)
        
        self.assertEqual(summary.column_creations.total_columns, 3)
        
        self.assertEqual(summary.document_ingestions.document_count, 1)
        self.assertEqual(summary.document_ingestions.total_pages, 15)

    def test_pretty_print_output(self):
        """Test the pretty print functionality."""
        events = []
        
        # Add some AI events
        ai_data = AiCallFinalizedEventData(
            customer_id=self.customer_id,
            provider="openai",
            model="gpt-4",
            input_tokens=1500,
            output_tokens=800,
            total_tokens=2300,
            trace_id="test_trace",
        )
        events.append(ai_call_finalized_event(ai_data))

        summary = EventAggregator.aggregate_events(self.customer_id, events)
        pretty_output = summary.pretty_print
        
        # Verify output contains expected sections
        self.assertIn("Usage Summary for Customer:", pretty_output)
        self.assertIn(self.customer_id, pretty_output)
        self.assertIn("AI CALLS", pretty_output)
        self.assertIn("openai", pretty_output)
        self.assertIn("gpt-4", pretty_output)
        self.assertIn("1500", pretty_output)  # input tokens
        self.assertIn("800", pretty_output)   # output tokens
        self.assertIn("2300", pretty_output)  # total tokens

    def test_empty_events_aggregation(self):
        """Test aggregation with no events."""
        summary = EventAggregator.aggregate_events(self.customer_id, [])
        
        self.assertEqual(len(summary.ai_calls), 0)
        self.assertEqual(summary.fal_transcriptions.transcription_count, 0)
        self.assertEqual(summary.datalab_processing.document_count, 0)
        self.assertEqual(summary.datalab_processing.total_cost, 0)
        self.assertEqual(summary.column_creations.total_columns, 0)
        
        pretty_output = summary.pretty_print
        self.assertIn("No usage data found", pretty_output)

    def test_cost_calculation_for_ai_and_documents(self):
        """Ensure BillingService calculates costs for AI tokens and document ingestion."""
        events = []

        # AI call event (gpt-4o-mini)
        ai_event = ai_call_finalized_event(
            AiCallFinalizedEventData(
                customer_id=self.customer_id,
                provider="openai",
                model=LLMModelName.GPT4O_MINI.value,
                input_tokens=1000,
                output_tokens=2000,
                total_tokens=3000,
                trace_id="cost_trace",
            )
        )
        events.append(ai_event)

        # Document ingestion event (500 pages at $6 per 1000 pages)
        doc_event = document_ingested_event(
            DocumentIngestedEventData(
                customer_id=self.customer_id,
                source="upload.pdf",
                pages=500,
            )
        )
        events.append(doc_event)

        agg = EventAggregator.aggregate_events(self.customer_id, events)
        info = BillingInfo(customer_id=self.customer_id, plan=Plan.BASIC, credits_remaining=0.0)
        billing = BillingService(self.customer_id, storage_provider=Mock(get_billing_info=Mock(return_value=info)))
        cost_cents = billing.calculate_aggregation_cost_cents(agg)

        rates = LLMModelName.get_pricing()[LLMModelName.GPT4O_MINI.value]
        expected_ai_cents = int(round(((1000 / 1_000_000) * rates["input_per_million_tokens"] + (2000 / 1_000_000) * rates["output_per_million_tokens"]) * 100.0))
        expected_doc_cents = int(round((500 / 1_000) * 6.0 * 100.0))
        self.assertEqual(cost_cents, expected_ai_cents + expected_doc_cents)

    def test_cost_calculation_includes_all_event_types(self):
        """Verify cost calculation covers transcription, columns and modal events."""
        events = []

        # AI event
        events.append(
            ai_call_finalized_event(
                AiCallFinalizedEventData(
                    customer_id=self.customer_id,
                    provider="openai",
                    model=LLMModelName.GPT4O_MINI.value,
                    input_tokens=2000,
                    output_tokens=1000,
                    total_tokens=3000,
                    trace_id="ai_all_cost",
                )
            )
        )

        # Document ingestion (100 pages)
        events.append(
            document_ingested_event(
                DocumentIngestedEventData(
                    customer_id=self.customer_id,
                    source="file.pdf",
                    pages=100,
                )
            )
        )

        # Transcription event (30 seconds)
        events.append(
            fal_transcription_event(
                FalTranscriptionEventData(
                    customer_id=self.customer_id,
                    file_id="audio",
                    duration_seconds=30,
                    model="whisper",  # model optional
                    trace_id="fal_cost",
                )
            )
        )

        # Column creation (2 columns)
        events.append(
            column_created_event(
                ColumnCreatedEventData(
                    customer_id=self.customer_id,
                    sheet_id="s1",
                    column_id="c1",
                    plan="pro",
                    qty=2,
                )
            )
        )

        # Modal function invocation (10 rows)
        events.append(
            modal_function_invoked_event(
                ModalFunctionInvokedEventData(
                    customer_id=self.customer_id,
                    sheet_id="s1",
                    function="mod",
                    rows=10,
                )
            )
        )

        # Datalab processing cost
        events.append(
            datalab_document_processing_event(
                DatalabDocumentProcessingEventData(
                    customer_id=self.customer_id,
                    file_id="doc",
                    pages_processed=5,
                    content_type="pdf",
                    service="marker",
                    cost=2.5,
                    trace_id="datalab_cost",
                )
            )
        )

        agg = EventAggregator.aggregate_events(self.customer_id, events)

        with patch("folio.utils.usage_cop.billing_service.FAL_TRANSCRIPTION_COST_PER_SECOND_CENTS", 10), \
            patch("folio.utils.usage_cop.billing_service.COLUMN_CREATION_COST_PER_COLUMN_CENTS", 50), \
            patch("folio.utils.usage_cop.billing_service.MODAL_FUNCTION_COST_PER_ROW_CENTS", 1):
            info = BillingInfo(customer_id=self.customer_id, plan=Plan.BASIC, credits_remaining=0.0)
            billing = BillingService(self.customer_id, storage_provider=Mock(get_billing_info=Mock(return_value=info)))
            total_cost_cents = billing.calculate_aggregation_cost_cents(agg)

        rates2 = LLMModelName.get_pricing()[LLMModelName.GPT4O_MINI.value]
        expected_ai_cents = int(round(((2000 / 1_000_000) * rates2["input_per_million_tokens"] + (1000 / 1_000_000) * rates2["output_per_million_tokens"]) * 100.0))
        expected_doc_cents = int(round((100 / 1_000) * 6.0 * 100.0))
        expected_fal_cents = 30 * 10
        expected_column_cents = 2 * 50
        expected_modal_cents = 10 * 1
        # Datalab cost derived from pages (5 pages @ $6/1000 = $0.03)
        expected_datalab_cents = int(round((5 / 1_000) * 6.0 * 100.0))
        self.assertEqual(
            total_cost_cents,
            expected_ai_cents + expected_doc_cents + expected_fal_cents + expected_column_cents + expected_modal_cents + expected_datalab_cents,
        )

    def test_billing_service_round_trip_integration(self):
        """Test sending events through BillingService and retrieving via aggregation."""
        # Create storage for events by customer
        events_by_customer = {}
        
        # Create a mock storage backend with all required methods
        mock_storage_backend = Mock()
        
        def mock_get_obj(table, customer_id):
            if table == "billing_info":
                # Return a default BASIC plan for the test customer
                return {
                    "plan": Plan.BASIC.value,
                    "credits_remaining": 0,
                    "plan_start": datetime(datetime.now(self.tz).year, datetime.now(self.tz).month, 1, tzinfo=self.tz).isoformat(),
                }
            if table == "usage_events" and customer_id in events_by_customer:
                return {
                    "customer_id": customer_id,
                    "events": [event.model_dump() for event in events_by_customer[customer_id]],
                    "total_events": len(events_by_customer[customer_id])
                }
            raise KeyError("Not found")
            
        def mock_obj_exists(table, customer_id):
            return table == "usage_events" and customer_id in events_by_customer
            
        def mock_insert_obj(table, customer_id, data):
            if table == "usage_events":
                # Extract events from the batch data
                event_dicts = data.get("events", [])
                events = []
                for event_dict in event_dicts:
                    event = UsageEvent(**event_dict)
                    events.append(event)
                events_by_customer[customer_id] = events
                
        def mock_patch_obj(table, customer_id, data):
            mock_insert_obj(table, customer_id, data)
            
        mock_storage_backend.get_obj = mock_get_obj
        mock_storage_backend.obj_exists = mock_obj_exists
        mock_storage_backend.insert_obj = mock_insert_obj  
        mock_storage_backend.patch_obj = mock_patch_obj
        
        # Create a storage provider with the mock backend
        storage_provider = StorageBackendProvider(mock_storage_backend)
        
        # Create billing service bound to the test customer
        billing_service = BillingService(self.customer_id, storage_provider=storage_provider)
        
        # Create test events
        ai_event_data = AiCallFinalizedEventData(
            customer_id=self.customer_id,
            provider="openai",
            model="gpt-4",
            input_tokens=1000,
            output_tokens=500,
            total_tokens=1500,
            trace_id="test_trace_1",
        )
        ai_event = ai_call_finalized_event(ai_event_data)
        
        transcription_event_data = FalTranscriptionEventData(
            customer_id=self.customer_id,
            file_id="test_file.mp3",
            duration_seconds=120.5,
            trace_id="test_trace_2",
        )
        transcription_event = fal_transcription_event(transcription_event_data)
        
        modal_event_data = ModalFunctionInvokedEventData(
            customer_id=self.customer_id,
            sheet_id="sheet_123",
            function="test_function",
            rows=5,
        )
        modal_event = modal_function_invoked_event(modal_event_data)
        
        # Send events through billing service
        billing_service.send_usage_batch([ai_event, transcription_event, modal_event])
        
        # Verify events were stored
        self.assertIn(self.customer_id, events_by_customer)
        self.assertEqual(len(events_by_customer[self.customer_id]), 3)
        
        # Retrieve aggregation through billing service
        aggregation = billing_service.get_current_period_usage()
        
        # Verify aggregation results
        self.assertEqual(len(aggregation.ai_calls), 1)
        self.assertEqual(aggregation.ai_calls[0].provider, "openai")
        self.assertEqual(aggregation.ai_calls[0].model, "gpt-4")
        self.assertEqual(aggregation.ai_calls[0].total_input_tokens, 1000)
        self.assertEqual(aggregation.ai_calls[0].total_output_tokens, 500)
        self.assertEqual(aggregation.ai_calls[0].total_tokens, 1500)
        self.assertEqual(aggregation.ai_calls[0].call_count, 1)
        
        self.assertEqual(aggregation.fal_transcriptions.transcription_count, 1)
        self.assertAlmostEqual(aggregation.fal_transcriptions.total_duration_seconds, 120.5)
        
        self.assertEqual(aggregation.modal_functions.invocation_count, 1)
        self.assertEqual(aggregation.modal_functions.total_rows_processed, 5)
        
        # Test pretty print output includes our data
        pretty_output = aggregation.pretty_print
        self.assertIn("openai", pretty_output)
        self.assertIn("gpt-4", pretty_output)
        self.assertIn("1000", pretty_output)  # input tokens
        self.assertIn("500", pretty_output)   # output tokens
        self.assertIn("1500", pretty_output)  # total tokens
        self.assertIn("120.5", pretty_output) # transcription duration

    def test_time_windowed_aggregation_and_cost(self):
        """Aggregate events within a monthly window anchored to plan_start and compute cost."""
        # Arrange mock storage backend with events across months
        events_by_customer = {}

        mock_storage_backend = Mock()

        def mock_get_obj(table, customer_id):
            if table == "billing_info":
                return {
                    "plan": Plan.BASIC.value,
                    "credits_remaining": 0,
                    "plan_start": plan_start.isoformat(),
                }
            if table == "usage_events" and customer_id in events_by_customer:
                return {
                    "customer_id": customer_id,
                    "events": [e.model_dump() for e in events_by_customer[customer_id]],
                    "total_events": len(events_by_customer[customer_id]),
                }
            raise KeyError("Not found")

        def mock_obj_exists(table, customer_id):
            return table == "usage_events" and customer_id in events_by_customer

        # Plan start at Jan 15 UTC
        plan_start = datetime(2025, 1, 15, 0, 0, 0, tzinfo=self.tz)

        mock_storage_backend.get_obj = mock_get_obj
        mock_storage_backend.obj_exists = mock_obj_exists

        storage_provider = StorageBackendProvider(mock_storage_backend)
        billing = BillingService(self.customer_id, storage_provider=storage_provider)

        # Create two AI call events: one inside Feb 15-Mar 15 window, one outside
        inside_dt = datetime(2025, 2, 20, 12, 0, 0, tzinfo=self.tz)
        outside_dt = datetime(2025, 3, 20, 12, 0, 0, tzinfo=self.tz)

        inside = ai_call_finalized_event(
            AiCallFinalizedEventData(
                customer_id=self.customer_id,
                provider="openai",
                model=LLMModelName.GPT41.value,
                input_tokens=1_000_000,  # 1M
                output_tokens=500_000,
                total_tokens=1_500_000,
                trace_id="trace_in",
            )
        )
        # Patch timestamp
        inside.timestamp = self._iso(inside_dt)

        outside = ai_call_finalized_event(
            AiCallFinalizedEventData(
                customer_id=self.customer_id,
                provider="openai",
                model=LLMModelName.GPT41.value,
                input_tokens=2_000_000,
                output_tokens=1_000_000,
                total_tokens=3_000_000,
                trace_id="trace_out",
            )
        )
        outside.timestamp = self._iso(outside_dt)

        events_by_customer[self.customer_id] = [inside, outside]

        # Build billing info with plan_start
        info = BillingInfo(
            customer_id=self.customer_id,
            plan=Plan.BASIC,
            credits_remaining=100.0,
            plan_start=self._iso(plan_start),
        )

        # Target window: Feb 15 to Mar 15
        now = datetime(2025, 3, 1, tzinfo=self.tz)
        # Override cached plan_start to ensure window boundaries
        billing.set_billing_info(info)
        start, end = billing.get_current_billing_window(now=now)
        agg = billing.get_current_period_usage(now=now)

        # Only inside event should count
        self.assertEqual(len(agg.ai_calls), 1)
        self.assertEqual(agg.ai_calls[0].call_count, 1)
        self.assertEqual(agg.ai_calls[0].total_input_tokens, 1_000_000)
        self.assertEqual(agg.ai_calls[0].total_output_tokens, 500_000)

        # Cost based on current pricing for GPT-4.1
        period_cost = billing.calculate_aggregation_cost_usd(agg)
        rates3 = LLMModelName.get_pricing()[LLMModelName.GPT41.value]
        expected_usd = 1.0 * rates3["input_per_million_tokens"] + 0.5 * rates3["output_per_million_tokens"]
        self.assertAlmostEqual(period_cost, expected_usd, places=3)

    def test_billing_service_user_billing_not_setup_error(self):
        """Test that BillingService throws UserBillingNotSetupError when billing info doesn't exist."""
        # Create storage for events by customer (no billing info)
        events_by_customer = {}
        
        # Create a mock storage backend
        mock_storage_backend = Mock()
        
        def mock_get_obj(table, customer_id):
            if table == "billing_info":
                raise KeyError("Billing info not found")
            if table == "usage_events" and customer_id in events_by_customer:
                return {
                    "customer_id": customer_id,
                    "events": [event.model_dump() for event in events_by_customer[customer_id]],
                    "total_events": len(events_by_customer[customer_id])
                }
            raise KeyError("Not found")
            
        def mock_obj_exists(table, customer_id):
            if table == "billing_info":
                return False
            if table == "usage_events":
                return customer_id in events_by_customer
            return False
            
        mock_storage_backend.get_obj = mock_get_obj
        mock_storage_backend.obj_exists = mock_obj_exists
        
        # Create storage provider and billing service (bypass prefetch for non-bound tests)
        storage_provider = StorageBackendProvider(mock_storage_backend)
        billing_service = BillingService("irrelevant", storage_provider=storage_provider, prefetch_plan=False)
        
        # Test: No billing info, no usage events -> UserBillingNotSetupError
        with self.assertRaises(UserBillingNotSetupError) as context:
            billing_service.get_billing_info("nonexistent_user")
        self.assertEqual(context.exception.customer_id, "nonexistent_user")
        
        # Test: Add usage events but no billing info -> UserBillingNotSetupError  
        ai_event_data = AiCallFinalizedEventData(
            customer_id="user_with_usage",
            provider="openai",
            model="gpt-4",
            input_tokens=1000,
            output_tokens=500,
            total_tokens=1500,
            trace_id="test_trace",
        )
        events_by_customer["user_with_usage"] = [ai_call_finalized_event(ai_event_data)]
        
        with self.assertRaises(UserBillingNotSetupError) as context:
            billing_service.get_billing_info("user_with_usage")
        self.assertEqual(context.exception.customer_id, "user_with_usage")

    def test_usage_aggregation_handles_no_usage_gracefully(self):
        """Test that get_usage_aggregation returns empty aggregation for users with no usage."""
        # Create mock storage backend with no usage events
        mock_storage_backend = Mock()
        
        def mock_get_obj(table, customer_id):
            raise KeyError("Not found")
            
        def mock_obj_exists(table, customer_id):
            return False
            
        mock_storage_backend.get_obj = mock_get_obj
        mock_storage_backend.obj_exists = mock_obj_exists
        
        # Create storage provider and billing service (bypass prefetch)
        storage_provider = StorageBackendProvider(mock_storage_backend)
        billing_service = BillingService("user_no_usage", storage_provider=storage_provider, prefetch_plan=False)
        
        # Should return empty aggregation, not throw exception
        info = BillingInfo(
            customer_id="user_no_usage",
            plan=Plan.BASIC,
            credits_remaining=0,
            plan_start=datetime(2025, 1, 1, tzinfo=self.tz).isoformat(),
        )
        billing_service.set_billing_info(info)
        aggregation = billing_service.get_current_period_usage()

        self.assertEqual(aggregation.customer_id, "user_no_usage")
        self.assertEqual(len(aggregation.ai_calls), 0)
        self.assertEqual(aggregation.fal_transcriptions.transcription_count, 0)
        self.assertEqual(aggregation.datalab_processing.document_count, 0)
        self.assertEqual(aggregation.datalab_processing.total_cost, 0)
        self.assertEqual(aggregation.column_creations.total_columns, 0)

    def test_storage_provider_throws_user_has_no_usage_error(self):
        """Test that StorageBackendProvider throws UserHasNoUsageError when no usage events exist."""
        # Create mock storage backend with no usage events
        mock_storage_backend = Mock()
        
        def mock_get_obj(table, customer_id):
            raise KeyError("Not found")
            
        mock_storage_backend.get_obj = mock_get_obj
        
        # Create storage provider
        storage_provider = StorageBackendProvider(mock_storage_backend)
        
        # Should throw UserHasNoUsageError
        with self.assertRaises(UserHasNoUsageError) as context:
            storage_provider.get_usage_events_for_customer("user_no_usage")
        self.assertEqual(context.exception.customer_id, "user_no_usage")


if __name__ == "__main__":
    unittest.main()

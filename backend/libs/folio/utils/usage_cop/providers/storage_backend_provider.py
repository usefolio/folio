from __future__ import annotations

import json
from typing import List, Dict, Any
from datetime import datetime, timezone
import logging

from .provider_interface import UsageProvider
from ..models import UsageEvent, BillingInfo, Plan, EventAggregator, EventAggregationSummary, UserBillingNotSetupError, UserHasNoUsageError
from folio.utils.storage_backend import StorageBackend

# Storage table/container names
USAGE_EVENTS_TABLE = "usage_events"
BILLING_INFO_TABLE = "billing_info"


class StorageBackendProvider(UsageProvider):
    """Storage backend provider for usage tracking using existing storage utilities."""

    def __init__(self, storage_backend: StorageBackend):
        """Initialize the storage backend provider.

        Args:
            storage_backend: The storage backend instance to use (e.g., GCSStorageBackend)
        """
        self.storage_backend = storage_backend
        self._logger = logging.getLogger(__name__)

    def send_usage_batch(self, events: List[UsageEvent]) -> None:
        """Store a batch of usage events using the storage backend."""
        if not events:
            return

        try:
            # Group events by customer_id for efficient storage
            events_by_customer = {}
            for event in events:
                customer_id = event.customer_id
                if customer_id not in events_by_customer:
                    events_by_customer[customer_id] = []
                events_by_customer[customer_id].append(event.model_dump())

            # Store events for each customer using customer_id as the key
            for customer_id, customer_events in events_by_customer.items():
                timestamp = datetime.now(timezone.utc).isoformat()

                # Get existing events for this customer (append to existing data)
                try:
                    existing_data = self.storage_backend.get_obj(
                        USAGE_EVENTS_TABLE, customer_id
                    )
                    existing_events = existing_data.get("events", [])
                    exists = True
                except KeyError:
                    existing_events = []
                    exists = False

                # Append new events to existing ones
                all_events = existing_events + customer_events

                # Store updated events with customer_id as key
                batch_data = {
                    "customer_id": customer_id,
                    "last_updated": timestamp,
                    "events": all_events,
                    "total_events": len(all_events),
                }

                # Upsert: patch if exists, insert if not
                if exists or self.storage_backend.obj_exists(
                    USAGE_EVENTS_TABLE, customer_id
                ):
                    self.storage_backend.patch_obj(
                        USAGE_EVENTS_TABLE, customer_id, batch_data
                    )
                else:
                    self.storage_backend.insert_obj(
                        USAGE_EVENTS_TABLE, customer_id, batch_data
                    )

            self._logger.info(
                "[STORAGE BACKEND] Stored %d usage events in %d batches",
                len(events),
                len(events_by_customer),
            )

        except Exception as e:
            self._logger.warning(
                "[STORAGE BACKEND ERROR] Failed to store usage events: %s", e
            )
            raise

    def get_billing_info(self, customer_id: str) -> BillingInfo:
        """Retrieve cached billing information for a customer."""
        try:
            # Try to get cached billing info
            billing_data = self.storage_backend.get_obj(BILLING_INFO_TABLE, customer_id)
            return BillingInfo(
                customer_id=customer_id,
                plan=Plan(billing_data.get("plan", Plan.UNKNOWN.value)),
                credits_remaining=billing_data.get("credits_remaining", 0.0),
                plan_start=billing_data.get("plan_start"),
                plan_expires_at=billing_data.get("plan_expires_at"),
                demo_plan_activated_at=billing_data.get("demo_plan_activated_at"),
            )
        except KeyError:
            # Billing info doesn't exist - billing not set up
            raise UserBillingNotSetupError(customer_id)
        except Exception as e:
            self._logger.warning(
                "[STORAGE BACKEND ERROR] Failed to retrieve billing info: %s", e
            )
            # Return default on error
            return BillingInfo(
                customer_id=customer_id, plan=Plan.UNKNOWN, credits_remaining=0.0
            )

    def get_credit_balance(self, customer_id: str) -> float:
        """Return the cached credit balance for a customer with usage aggregation."""
        billing_info = self.get_billing_info(customer_id)
        return billing_info.credits_remaining
    
    def get_usage_aggregation(self, customer_id: str, start: str | None = None, end: str | None = None) -> EventAggregationSummary:
        """Get aggregated usage statistics for a customer.

        Args:
            customer_id: The ID of the customer
            start: Optional ISO8601 timestamp (inclusive) to filter events
            end: Optional ISO8601 timestamp (exclusive) to filter events
        """
        try:
            events = self.get_usage_events_for_customer(customer_id, start=start, end=end)
            return EventAggregator.aggregate_events(customer_id, events)
        except UserHasNoUsageError:
            # Return empty aggregation for users with no usage events
            return EventAggregationSummary(customer_id=customer_id)

    def cache_billing_info(self, billing_info: BillingInfo) -> None:
        """Cache billing information for faster access."""
        try:
            billing_data = {
                "customer_id": billing_info.customer_id,
                "plan": billing_info.plan.value,
                "credits_remaining": billing_info.credits_remaining,
                "plan_start": billing_info.plan_start,
                "plan_expires_at": billing_info.plan_expires_at,
                "demo_plan_activated_at": billing_info.demo_plan_activated_at,
                "last_updated": datetime.now(timezone.utc).isoformat(),
            }

            self.storage_backend.insert_obj(
                BILLING_INFO_TABLE, billing_info.customer_id, billing_data
            )

        except Exception as e:
            self._logger.warning(
                "[STORAGE BACKEND ERROR] Failed to cache billing info: %s", e
            )
            # Upsert billing info: patch if exists, insert if not
            if self.storage_backend.obj_exists(
                BILLING_INFO_TABLE, billing_info.customer_id
            ):
                self.storage_backend.patch_obj(
                    BILLING_INFO_TABLE, billing_info.customer_id, billing_data
                )
            else:
                self.storage_backend.insert_obj(
                    BILLING_INFO_TABLE, billing_info.customer_id, billing_data
                )

        except Exception as e:
            print(f"[STORAGE BACKEND ERROR] Failed to cache billing info: {e}")

    def get_usage_events_for_customer(self, customer_id: str, start: str | None = None, end: str | None = None) -> List[UsageEvent]:
        """Get stored usage events for a customer, optionally filtered by time window.

        Args:
            customer_id: The ID of the customer
            start: Optional ISO8601 timestamp (inclusive)
            end: Optional ISO8601 timestamp (exclusive)
        """
        try:
            # Get customer's usage events using customer_id as key
            data = self.storage_backend.get_obj(USAGE_EVENTS_TABLE, customer_id)
            events_data = data.get("events", [])

            # Convert back to UsageEvent objects
            events = []
            start_dt = None
            end_dt = None
            try:
                if start:
                    start_dt = datetime.fromisoformat(start)
                if end:
                    end_dt = datetime.fromisoformat(end)
            except Exception:
                # If parsing fails, ignore filters
                start_dt = None
                end_dt = None
            for event_dict in events_data:
                event = UsageEvent(
                    transaction_id=event_dict["transaction_id"],
                    customer_id=event_dict["customer_id"],
                    timestamp=event_dict["timestamp"],
                    event_type=event_dict["event_type"],
                    properties=event_dict["properties"],
                )
                # Filter by time window if provided
                if start_dt or end_dt:
                    try:
                        evt_dt = datetime.fromisoformat(event.timestamp)
                    except Exception:
                        evt_dt = None
                    if evt_dt is None:
                        continue
                    if start_dt and evt_dt < start_dt:
                        continue
                    if end_dt and evt_dt >= end_dt:
                        continue
                events.append(event)
            self._logger.info(
                "[STORAGE BACKEND] Retrieved %d usage events for customer %s",
                len(events),
                customer_id,
            )
            return events
        except KeyError:
            # No events found for this customer
            self._logger.info(
                "[STORAGE BACKEND] No usage events found for customer %s",
                customer_id,
            )
            raise UserHasNoUsageError(customer_id)
        except Exception as e:
            self._logger.warning(
                "[STORAGE BACKEND ERROR] Failed to query usage events: %s", e
            )
            return []

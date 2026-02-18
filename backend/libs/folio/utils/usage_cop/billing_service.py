from __future__ import annotations

from typing import List, Optional, Tuple
import logging
import os
from datetime import datetime, timezone

from .models import (
    UsageEvent,
    BillingInfo,
    Plan,
    EventAggregationSummary,
    UserBillingNotSetupError,
    InsufficientCreditsError,
)

try:
    # Pricing used to compute USD costs from token aggregations
    from folio.utils.shared_types.shared_types import LLMModelName
except Exception:  # pragma: no cover - defensive import
    LLMModelName = None

try:
    # Pricing used to compute USD costs from token aggregations
    from folio.utils.shared_types.shared_types import LLMModelName
except Exception:  # pragma: no cover - defensive import
    LLMModelName = None

logger = logging.getLogger(__name__)

# Central pricing constants (sourced from shared_types)
from folio.utils.shared_types.shared_types import (
    DOCUMENT_INGESTION_COST_PER_1000_PAGES_CENTS,
    FAL_TRANSCRIPTION_COST_PER_SECOND_CENTS,
    COLUMN_CREATION_COST_PER_COLUMN_CENTS,
    MODAL_FUNCTION_COST_PER_ROW_CENTS,
)


class BillingService:
    """Centralized billing service that handles both billing info and usage tracking.

    Design invariants:
    - Instances are always bound to a specific `customer_id`.
    - A valid billing plan MUST exist for that `customer_id` prior to use.
    - The bound user's BillingInfo is fetched once and cached for the lifetime
      of the instance (unless explicitly refreshed/overridden).
    """

    def __init__(
        self,
        customer_id: str,
        *,
        storage_provider=None,
        external_provider=None,
        prefetch_plan: bool = True,
    ):
        """Initialize billing service bound to a specific customer.

        Args:
            customer_id: Required customer id this instance operates on.
            storage_provider: Optional storage provider to use (injected for tests)
            external_provider: Optional external billing provider
            prefetch_plan: When true, fetch and cache BillingInfo at creation time
                           and raise if no plan is set up.
        """
        if not isinstance(customer_id, str) or not customer_id.strip():
            raise ValueError("customer_id is required to construct BillingService")

        self.customer_id = customer_id
        self._external_provider = external_provider
        self._storage_provider = storage_provider
        self._billing_info_cache: Optional[BillingInfo] = None
        self._billing_info_overridden: bool = False

        # Optionally verify plan existence at construction time.
        if prefetch_plan:
            info = self.get_billing_info(self.customer_id)
            # Treat UNKNOWN plan as not configured
            if info is None or getattr(info, "plan", Plan.UNKNOWN) == Plan.UNKNOWN:
                raise UserBillingNotSetupError(self.customer_id)
            self._billing_info_cache = info

    def _is_truthy(self, value: Optional[str]) -> bool:
        return str(value or "").strip().lower() in ("1", "true", "yes", "on")

    def _get_billing_info(self) -> BillingInfo:
        """Private, centralized, cached accessor for bound user's BillingInfo."""
        if self._billing_info_cache is not None:
            return self._billing_info_cache
        info = self.get_billing_info(self.customer_id)
        if info is None or getattr(info, "plan", Plan.UNKNOWN) == Plan.UNKNOWN:
            # Enforce that a plan must be set up
            raise UserBillingNotSetupError(self.customer_id)
        self._billing_info_cache = info
        return self._billing_info_cache

    def _get_external_provider(self):
        """Get external provider if one was set."""
        return self._external_provider

    def set_external_provider(self, provider):
        """Set an external provider (e.g., MetronomeProvider)."""
        self._external_provider = provider

    def _get_storage_provider(self):
        """Lazy load storage provider (GCS)."""
        if self._storage_provider is None:
            try:
                import os
                from google.oauth2 import service_account
                from .providers.storage_backend_provider import StorageBackendProvider
                from folio.utils.storage_backend import GCSStorageBackend
                from folio.utils.storage_helper import GoogleCloudStorageHelper

                gcs_helper = GoogleCloudStorageHelper()
                storage_backend = GCSStorageBackend(gcs_helper)
                self._storage_provider = StorageBackendProvider(storage_backend)
            except Exception as e:
                logger.error(f"Failed to initialize storage provider: {e}")
                self._storage_provider = None
        return self._storage_provider

    @staticmethod
    def _parse_timestamp(value: Optional[str]) -> Optional[datetime]:
        """Parse ISO8601 timestamps and ensure they are timezone-aware."""
        if not value:
            return None
        try:
            dt = datetime.fromisoformat(value)
        except Exception:
            return None
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt

    @staticmethod
    def _build_default_storage_provider():
        try:
            from .providers.storage_backend_provider import StorageBackendProvider
            from folio.utils.storage_backend import GCSStorageBackend
            from folio.utils.storage_helper import GoogleCloudStorageHelper

            gcs_helper = GoogleCloudStorageHelper()
            storage_backend = GCSStorageBackend(gcs_helper)
            return StorageBackendProvider(storage_backend)
        except Exception as e:  # pragma: no cover - defensive
            logger.warning(f"Failed to initialize default storage provider: {e}")
            return None

    def get_plan_expiration(self, info: Optional[BillingInfo] = None) -> Optional[datetime]:
        """Return the plan expiration datetime if present."""
        info = info or self._get_billing_info()
        return self._parse_timestamp(info.plan_expires_at)

    def is_membership_active(
        self,
        now: Optional[datetime] = None,
        info: Optional[BillingInfo] = None,
    ) -> bool:
        """Return True when the user has an active, non-expired plan."""
        info = info or self._get_billing_info()
        if info.plan == Plan.UNKNOWN:
            return False
        expires_at = self.get_plan_expiration(info=info)
        reference = now or datetime.now(timezone.utc)
        if expires_at and expires_at <= reference:
            return False
        return True

    def get_billing_info(self, customer_id: str) -> BillingInfo:
        """Get billing information (from external, fallback to storage).

        Raises UserBillingNotSetupError when a plan is not configured for the
        requested customer.
        """
        # Try external provider first (Metronome)
        external = self._get_external_provider()
        if external:
            try:
                info = external.get_billing_info(customer_id)
                # Cache in storage for fast access
                storage = self._get_storage_provider()
                if storage and hasattr(storage, "cache_billing_info"):
                    try:
                        storage.cache_billing_info(info)
                    except Exception as e:
                        logger.debug(f"Failed to cache billing info: {e}")
                return info
            except Exception as e:
                logger.warning(f"External billing provider failed: {e}")

        # Fallback to storage
        storage = self._get_storage_provider()
        if storage:
            try:
                info = storage.get_billing_info(customer_id)
                return info
            except UserBillingNotSetupError:
                # Let this exception bubble up - don't catch it
                raise
            except Exception as e:
                logger.warning(f"Storage provider failed: {e}")
        # No providers available or both failed in unexpected ways
        raise UserBillingNotSetupError(customer_id)

    def get_current_period_usage(
        self, now: Optional[datetime] = None
    ) -> EventAggregationSummary:
        """Aggregate usage for the current billing period for the active user.

        Requires that this instance is bound to a valid ``customer_id`` with an
        active plan. Optionally accepts ``now``
        for window anchoring (primarily for tests).

        Returns:
            EventAggregationSummary for the current period.
        """
        # Ensure a plan exists; also validates instance is properly bound
        info = self._get_billing_info()
        start_dt, end_dt = self.get_current_billing_window(now=now)
        storage = self._get_storage_provider()
        if storage and hasattr(storage, "get_usage_aggregation"):
            try:
                return storage.get_usage_aggregation(
                    info.customer_id,
                    start=start_dt.isoformat(),
                    end=end_dt.isoformat(),
                )
            except Exception as e:
                logger.warning(f"Failed to get usage aggregation: {e}")

        # Return empty aggregation if no storage provider or error
        return EventAggregationSummary(customer_id=info.customer_id)

    def get_current_period_spend_usd(self, now: Optional[datetime] = None) -> float:
        """Spend in USD for the current billing period."""
        return self.get_current_period_spend_cents(now=now) / 100.0

    def get_current_period_spend_cents(self, now: Optional[datetime] = None) -> int:
        """One-liner: spend in cents for the current billing period."""
        agg = self.get_current_period_usage(now=now)
        return self.calculate_aggregation_cost_cents(agg)

    def get_current_period_spend_credits(self, now: Optional[datetime] = None) -> int:
        """Spend in credits for the current billing period.

        Currently credits are treated as cents, but this helper makes the
        distinction explicit in case they diverge in the future.
        """
        return self.get_current_period_spend_cents(now=now)

    def get_current_period_remaining_credits(
        self, now: Optional[datetime] = None
    ) -> int:
        """One-liner: credits (cents) remaining for the current billing period."""
        info = self._get_billing_info()
        if not self.is_membership_active(now=now, info=info):
            return 0
        spend_cents = self.get_current_period_spend_cents(now=now)
        return max(int(info.credits_remaining) - int(spend_cents), 0)

    def get_current_period_remaining_usd(self, now: Optional[datetime] = None) -> float:
        """Remaining credits expressed in USD for the current billing period."""
        return self.get_current_period_remaining_credits(now=now) / 100.0

    # -------- Billing windows & cost helpers --------
    def _add_months(self, dt: datetime, months: int) -> datetime:
        """Add months to a datetime, clamping the day to the last valid day.

        This avoids external dependencies (like dateutil) and accounts for
        different month lengths.
        """
        year = dt.year + (dt.month - 1 + months) // 12
        month = (dt.month - 1 + months) % 12 + 1
        day = dt.day

        # Try clamped day candidates to handle different month lengths
        for candidate in (31, 30, 29, 28):
            clamped_day = candidate if day > candidate else day
            try:
                return dt.replace(year=year, month=month, day=clamped_day)
            except ValueError:
                continue
        # Fallback (shouldn't reach)
        return dt.replace(year=year, month=month, day=1)

    def get_current_billing_window(
        self, now: Optional[datetime] = None
    ) -> Tuple[datetime, datetime]:
        """Compute current monthly billing window [start, end) anchored at plan_start.

        Args:
            now: Optional datetime anchor (testing/diagnostics)

        - If plan_start is set (ISO8601), cycles begin at that timestamp monthly
        - If not set, default anchor is the first day of the current month at 00:00 UTC
        """
        info = self._get_billing_info()

        now = now or datetime.now(timezone.utc)
        # Parse plan_start if present
        anchor: Optional[datetime] = None
        if info.plan_start:
            try:
                anchor = datetime.fromisoformat(info.plan_start)
                if anchor.tzinfo is None:
                    anchor = anchor.replace(tzinfo=timezone.utc)
            except Exception:
                anchor = None
        if anchor is None:
            anchor = datetime(now.year, now.month, 1, tzinfo=timezone.utc)

        # Walk months forward from anchor until next > now
        start = anchor
        # Guard against anchors in the future
        if start > now:
            end = self._add_months(start, 1)
            return start, end
        while True:
            next_start = self._add_months(start, 1)
            if next_start > now:
                return start, next_start
            start = next_start

    def _calculate_ai_calls_cost_cents(
        self, aggregation: EventAggregationSummary
    ) -> int:
        """Compute cost (cents) for AI calls from an EventAggregationSummary."""
        if LLMModelName is None:
            return 0
        pricing = LLMModelName.get_pricing()
        total_cents = 0
        for agg in aggregation.ai_calls:
            model = agg.model
            if model not in pricing:
                continue
            rates = pricing[model]
            in_rate_usd = rates.get("input_per_million_tokens", 0.0)
            out_rate_usd = rates.get("output_per_million_tokens", 0.0)
            in_cents = (agg.total_input_tokens / 1_000_000.0) * in_rate_usd * 100.0
            out_cents = (agg.total_output_tokens / 1_000_000.0) * out_rate_usd * 100.0
            total_cents += int(round(in_cents + out_cents))
        return total_cents

    def _calculate_document_ingestion_cost_cents(
        self, aggregation: EventAggregationSummary
    ) -> int:
        """Compute cost (cents) for document ingestion based on pages processed."""
        pages = aggregation.document_ingestions.total_pages
        return int(
            round((pages / 1_000.0) * DOCUMENT_INGESTION_COST_PER_1000_PAGES_CENTS)
        )

    def _calculate_fal_transcription_cost_cents(
        self, aggregation: EventAggregationSummary
    ) -> int:
        """Compute cost (cents) for Fal transcriptions."""
        seconds = aggregation.fal_transcriptions.total_duration_seconds
        return int(round(seconds * FAL_TRANSCRIPTION_COST_PER_SECOND_CENTS))

    def _calculate_column_creation_cost_cents(
        self, aggregation: EventAggregationSummary
    ) -> int:
        """Compute cost (cents) for column creations."""
        cols = aggregation.column_creations.total_columns
        return int(cols * COLUMN_CREATION_COST_PER_COLUMN_CENTS)

    def _calculate_modal_function_cost_cents(
        self, aggregation: EventAggregationSummary
    ) -> int:
        """Compute cost (cents) for modal function invocations."""
        rows = aggregation.modal_functions.total_rows_processed
        return int(rows * MODAL_FUNCTION_COST_PER_ROW_CENTS)

    def calculate_aggregation_cost_cents(
        self, aggregation: EventAggregationSummary
    ) -> int:
        """Compute total cost in cents derived from aggregation."""
        ai_cents = self._calculate_ai_calls_cost_cents(aggregation)
        # Datalab processing may expose total_cost in USD
        datalab_cents = 0
        if hasattr(aggregation.datalab_processing, "total_cost_cents"):
            try:
                datalab_cents = int(
                    aggregation.datalab_processing.total_cost_cents or 0
                )
            except (ValueError, TypeError):
                datalab_cents = 0
        elif hasattr(aggregation.datalab_processing, "total_cost"):
            try:
                datalab_cents = int(
                    round(
                        float(aggregation.datalab_processing.total_cost or 0.0) * 100.0
                    )
                )
            except (ValueError, TypeError):
                datalab_cents = 0
        ingestion_cents = self._calculate_document_ingestion_cost_cents(aggregation)
        fal_cents = self._calculate_fal_transcription_cost_cents(aggregation)
        column_cents = self._calculate_column_creation_cost_cents(aggregation)
        modal_cents = self._calculate_modal_function_cost_cents(aggregation)
        return int(
            ai_cents
            + datalab_cents
            + ingestion_cents
            + fal_cents
            + column_cents
            + modal_cents
        )

    def calculate_aggregation_cost_usd(
        self, aggregation: EventAggregationSummary
    ) -> float:
        """Convenience: total cost in USD derived from aggregation."""
        return self.calculate_aggregation_cost_cents(aggregation) / 100.0

    def _get_period_spend_cents(self, customer_id: str, start: str, end: str) -> int:
        """Internal helper: spend in cents for a period [start, end)."""
        storage = self._get_storage_provider()
        if storage and hasattr(storage, "get_usage_aggregation"):
            try:
                agg = storage.get_usage_aggregation(customer_id, start=start, end=end)
                return self.calculate_aggregation_cost_cents(agg)
            except Exception as e:
                logger.warning(f"Failed to compute period spend: {e}")
        return 0

    def get_period_credit_details(self) -> Tuple[int, int, str]:
        """Compute total and remaining credits (cents) for the current billing period."""
        info = self._get_billing_info()
        start, end = self.get_current_billing_window()
        agg = self.get_current_period_usage()
        period_spend_cents = self.calculate_aggregation_cost_cents(agg)
        credits_total = int(info.credits_remaining)
        if not self.is_membership_active(info=info):
            expires_at = info.plan_expires_at or end.isoformat()
            return credits_total, 0, expires_at
        credits_remaining = max(credits_total - period_spend_cents, 0)
        return credits_total, credits_remaining, end.isoformat()

    def ensure_sufficient_credits(self, cost_cents: int) -> None:
        """Raise InsufficientCreditsError if the user lacks funds for `cost_cents`.

        When ENABLE_BILLING_CHECKS is truthy, this aggregates spend for the
        current billing window and compares it to the plan credits. Otherwise it
        falls back to checking the remaining credit balance directly.
        """
        # Ensure we have a plan and bound user
        info = self._get_billing_info()
        if not self.is_membership_active(info=info):
            raise InsufficientCreditsError("Membership inactive or expired")

        enable_billing_checks = str(
            os.environ.get("ENABLE_BILLING_CHECKS", "")
        ).lower() in (
            "1",
            "true",
            "yes",
            "on",
        )

        if enable_billing_checks:
            try:
                agg = self.get_current_period_usage()
                period_spend = self.calculate_aggregation_cost_cents(agg)
                if (period_spend + int(cost_cents)) > int(info.credits_remaining):
                    raise InsufficientCreditsError(
                        "Insufficient credits for this billing period"
                    )
                return
            except InsufficientCreditsError:
                raise
            except Exception as e:  # pragma: no cover - defensive fallback
                logger.warning("Billing enforcement check failed: %s", e)

        # In fallback mode, prefer explicitly overridden billing info (tests),
        # otherwise fetch fresh from providers to avoid stale cache.
        if (
            getattr(self, "_billing_info_overridden", False)
            and self._billing_info_cache is not None
        ):
            info = self._billing_info_cache
        else:
            info = self.get_billing_info(self.customer_id)
        balance = int(info.credits_remaining)
        if balance is not None and int(cost_cents) > balance:
            raise InsufficientCreditsError()

    def send_usage_event(self, event: UsageEvent) -> None:
        """Send usage event (dual-write to external + storage)."""
        self.send_usage_batch([event])

    def send_usage_batch(self, events: List[UsageEvent]) -> None:
        """Send batch of usage events (dual-write to external + storage).

        Enforces that all events belong to this instance's `customer_id` and
        that a billing plan exists for the user.
        """
        if not events:
            return

        # Validate binding and plan presence
        info = self._get_billing_info()
        for e in events:
            if e.customer_id != info.customer_id:
                raise ValueError(
                    f"Usage event customer_id '{e.customer_id}' does not match bound customer '{info.customer_id}'"
                )

        # Always persist locally first (most important)
        storage = self._get_storage_provider()
        if storage:
            try:
                storage.send_usage_batch(events)
            except Exception as e:
                logger.error(
                    f"CRITICAL: Failed to persist {len(events)} usage events locally: {e}",
                    extra={
                        "event_count": len(events),
                        "customer_ids": list(set(e.customer_id for e in events)),
                        "event_types": list(set(e.event_type for e in events)),
                    },
                )

        # Then send to external provider (Metronome for billing)
        external = self._get_external_provider()
        if external:
            try:
                external.send_usage_batch(events)
            except Exception as e:
                logger.error(
                    f"Failed to send {len(events)} usage events to external billing: {e}",
                    extra={
                        "event_count": len(events),
                        "customer_ids": list(set(e.customer_id for e in events)),
                        "event_types": list(set(e.event_type for e in events)),
                    },
                )

    # Convenience methods that use the stored user_id
    @property
    def billing_info(self) -> BillingInfo:
        """Get billing information for the current user."""
        return self._get_billing_info()

    @property
    def credit_balance(self) -> int:
        """Get credit balance (cents) for the current user."""
        return int(self._get_billing_info().credits_remaining)

    def get_remaining_credits(self) -> int:
        """Compute remaining credits for the current billing period.

        This subtracts the aggregated spend for the active billing window
        from the user's total credits.

        Returns:
            The remaining credits for the period. If spend exceeds the
            available credits, returns ``0.0``.
        """
        info = self._get_billing_info()
        start, end = self.get_current_billing_window()
        agg = self.get_current_period_usage()
        period_spend = self.calculate_aggregation_cost_cents(agg)
        return max(int(info.credits_remaining) - period_spend, 0)

    def setup_user_plan(self, info: BillingInfo) -> None:
        """Configure billing information for a user.

        This is primarily intended for development and testing workflows
        where billing data needs to be seeded manually.

        Args:
            info: Billing information to persist.
        """
        provider = self._get_storage_provider()
        if not provider or not hasattr(provider, "cache_billing_info"):
            raise RuntimeError("Storage provider not configured")
        provider.cache_billing_info(info)

    @classmethod
    def setup_plan(cls, info: BillingInfo, *, storage_provider=None) -> None:
        """Static-like helper for admins to set up a user's plan.

        Persists the BillingInfo using the provided storage provider or the
        default storage backend provider.
        """
        provider = storage_provider or cls._build_default_storage_provider()
        if not provider or not hasattr(provider, "cache_billing_info"):
            raise RuntimeError("Storage provider not configured")
        provider.cache_billing_info(info)

    def set_billing_info(self, info: BillingInfo) -> None:
        """Override the cached BillingInfo for this instance.

        Useful in tests where you want to adjust credits without hitting
        the underlying provider.
        """
        if info.customer_id != self.customer_id:
            raise ValueError("BillingInfo.customer_id must match bound customer_id")
        self._billing_info_cache = info
        self._billing_info_overridden = True

    def refresh_billing_info(self) -> BillingInfo:
        """Clear the cache and re-fetch BillingInfo from providers."""
        self._billing_info_cache = None
        return self._get_billing_info()

    def top_up_credits(self, customer_id: str, credits: int) -> int:
        """Increase a user's credit balance (in cents) and return the updated amount (in cents)."""
        provider = self._get_storage_provider()
        if not provider or not hasattr(provider, "get_billing_info"):
            raise RuntimeError("Storage provider not configured")
        info = provider.get_billing_info(customer_id)
        # Ensure credits_remaining is treated as int (cents)
        updated_info = BillingInfo(
            customer_id=info.customer_id,
            plan=info.plan,
            credits_remaining=int(info.credits_remaining) + credits,
            plan_start=info.plan_start,
            plan_expires_at=info.plan_expires_at,
            demo_plan_activated_at=info.demo_plan_activated_at,
        )
        provider.cache_billing_info(updated_info)
        return int(updated_info.credits_remaining)

    @classmethod
    def create_for_user(cls, user_id: str) -> "BillingService":
        """Create a billing service bound to a user and pre-cache their BillingInfo."""
        return cls(customer_id=user_id)

    # Note: No bind_* methods. Callers should set `user_id` directly and/or
    # stub `get_billing_info` for testing, or persist via the storage provider.

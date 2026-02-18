from datetime import datetime, timezone, timedelta
from unittest.mock import MagicMock

import pytest

from folio.utils.usage_cop import BillingService, BillingInfo, Plan
from folio.utils.usage_cop.models import InsufficientCreditsError, EventAggregationSummary


class _FakeProvider:
    def __init__(self, info: BillingInfo | None = None):
        self._info = info
        self.cached = None

    def get_billing_info(self, customer_id: str):
        if self._info and self._info.customer_id == customer_id:
            return self._info
        raise Exception("not found")

    def cache_billing_info(self, billing_info):
        self.cached = billing_info

    def get_usage_aggregation(self, customer_id: str, start: str | None = None, end: str | None = None):
        return EventAggregationSummary(customer_id=customer_id)


def test_billing_info_parses_legacy_payload_with_unknown_fields():
    payload = {
        "customer_id": "user_2saUr1LKqL3ALYrqniITo1OXqSB",
        "plan": "basic",
        "credits_remaining": 300.0,
        "plan_start": None,
        "last_updated": "2025-09-10T14:53:09.354733+00:00",
    }

    info = BillingInfo(**payload)

    assert info.customer_id == payload["customer_id"]
    assert info.plan == Plan.BASIC
    assert info.credits_remaining == payload["credits_remaining"]
    assert info.plan_start is None
    assert "last_updated" not in info.model_dump()


def test_billing_info_parses_payload_with_new_optional_fields():
    payload = {
        "customer_id": "user_2saUr1LKqL3ALYrqniITo1OXqSB",
        "plan": "basic",
        "credits_remaining": 300.0,
        "plan_start": "2025-09-01T00:00:00+00:00",
        "plan_expires_at": "2025-09-30T23:59:59+00:00",
        "demo_plan_activated_at": "2025-09-01T00:00:00+00:00",
        "last_updated": "2025-09-10T14:53:09.354733+00:00",
    }

    info = BillingInfo(**payload)

    assert info.plan_start == payload["plan_start"]
    assert info.plan_expires_at == payload["plan_expires_at"]
    assert info.demo_plan_activated_at == payload["demo_plan_activated_at"]
    assert info.plan == Plan.BASIC
    assert "last_updated" not in info.model_dump()


def _mock_billing_service():
    info = BillingInfo(
        customer_id="cust1",
        plan=Plan.BASIC,
        credits_remaining=500,  # cents
        plan_start=datetime(2025, 1, 1, tzinfo=timezone.utc).isoformat(),
    )
    svc = BillingService("cust1", storage_provider=_FakeProvider(info))
    svc.get_current_billing_window = MagicMock(
        return_value=(
            datetime(2025, 1, 1, tzinfo=timezone.utc),
            datetime(2025, 2, 1, tzinfo=timezone.utc),
        )
    )
    # For most tests we will mock cost via calculate_aggregation_cost_cents
    svc.get_current_period_usage = MagicMock(return_value=EventAggregationSummary(customer_id="cust1"))
    svc.calculate_aggregation_cost_cents = MagicMock(return_value=300)
    return svc


def test_ensure_sufficient_credits_enforces_window(monkeypatch):
    billing = _mock_billing_service()
    monkeypatch.setenv("ENABLE_BILLING_CHECKS", "true")
    billing.ensure_sufficient_credits(100)
    with pytest.raises(InsufficientCreditsError):
        billing.ensure_sufficient_credits(300)


def test_ensure_sufficient_credits_falls_back_to_balance(monkeypatch):
    billing = _mock_billing_service()
    monkeypatch.setenv("ENABLE_BILLING_CHECKS", "false")
    # Fallback uses billing info directly
    billing.get_billing_info = MagicMock(
        return_value=BillingInfo(
            customer_id="cust1",
            plan=Plan.BASIC,
            credits_remaining=200,
            plan_start=datetime(2025, 1, 1, tzinfo=timezone.utc).isoformat(),
        )
    )
    billing.ensure_sufficient_credits(100)
    with pytest.raises(InsufficientCreditsError):
        billing.ensure_sufficient_credits(300)


def test_get_current_billing_window_handles_february():
    info = BillingInfo(
        customer_id="c1",
        plan=Plan.BASIC,
        credits_remaining=0,
        plan_start=datetime(2025, 1, 31, tzinfo=timezone.utc).isoformat(),
    )
    svc = BillingService("c1", storage_provider=_FakeProvider(info))
    start, end = svc.get_current_billing_window(now=datetime(2025, 2, 15, tzinfo=timezone.utc))
    assert start == datetime(2025, 1, 31, tzinfo=timezone.utc)
    assert end == datetime(2025, 2, 28, tzinfo=timezone.utc)


def test_get_current_billing_window_leap_year():
    info = BillingInfo(
        customer_id="c1",
        plan=Plan.BASIC,
        credits_remaining=0,
        plan_start=datetime(2024, 1, 31, tzinfo=timezone.utc).isoformat(),
    )
    svc = BillingService("c1", storage_provider=_FakeProvider(info))
    start, end = svc.get_current_billing_window(now=datetime(2024, 2, 15, tzinfo=timezone.utc))
    assert start == datetime(2024, 1, 31, tzinfo=timezone.utc)
    assert end == datetime(2024, 2, 29, tzinfo=timezone.utc)


def test_get_current_billing_window_midnight_boundary():
    info = BillingInfo(
        customer_id="c1",
        plan=Plan.BASIC,
        credits_remaining=0,
        plan_start=datetime(2025, 1, 1, tzinfo=timezone.utc).isoformat(),
    )
    now = datetime(2025, 2, 1, tzinfo=timezone.utc)
    svc = BillingService("c1", storage_provider=_FakeProvider(info))
    start, end = svc.get_current_billing_window(now=now)
    assert start == now
    assert end == datetime(2025, 3, 1, tzinfo=timezone.utc)


def test_get_current_billing_window_no_args_uses_bound_user():
    info = BillingInfo(
        customer_id="c1",
        plan=Plan.BASIC,
        credits_remaining=0,
        plan_start=datetime(2025, 1, 31, tzinfo=timezone.utc).isoformat(),
    )
    svc = BillingService("c1", storage_provider=_FakeProvider(info))
    start, end = svc.get_current_billing_window(now=datetime(2025, 2, 15, tzinfo=timezone.utc))
    assert start == datetime(2025, 1, 31, tzinfo=timezone.utc)
    assert end == datetime(2025, 2, 28, tzinfo=timezone.utc)


def test_ensure_sufficient_credits_allows_exact_window_spend(monkeypatch):
    billing = _mock_billing_service()
    monkeypatch.setenv("ENABLE_BILLING_CHECKS", "true")
    billing.calculate_aggregation_cost_cents = MagicMock(return_value=400)
    billing.ensure_sufficient_credits(100)
    with pytest.raises(InsufficientCreditsError):
        billing.ensure_sufficient_credits(101)


def test_ensure_sufficient_credits_allows_exact_balance(monkeypatch):
    billing = _mock_billing_service()
    monkeypatch.setenv("ENABLE_BILLING_CHECKS", "false")
    billing.set_billing_info(
        BillingInfo(
            customer_id="cust1",
            plan=Plan.BASIC,
            credits_remaining=200,
            plan_start=datetime(2025, 1, 1, tzinfo=timezone.utc).isoformat(),
        )
    )
    billing.ensure_sufficient_credits(200)
    with pytest.raises(InsufficientCreditsError):
        billing.ensure_sufficient_credits(201)


def test_get_remaining_credits():
    billing = _mock_billing_service()
    # For remaining credits, mock current period spend to 300c
    remaining = billing.get_remaining_credits()
    assert remaining == 200


def test_get_current_period_spend_and_remaining():
    billing = _mock_billing_service()
    assert billing.get_current_period_spend_cents() == 300
    assert billing.get_current_period_spend_usd() == 3.0
    assert billing.get_current_period_spend_credits() == 300
    # credits_remaining=500c from _mock_billing_service
    assert billing.get_current_period_remaining_credits() == 200
    assert billing.get_current_period_remaining_usd() == 2.0


def test_setup_user_plan_calls_provider():
    info = BillingInfo(customer_id="cust1", plan=Plan.PRO, credits_remaining=1000)
    provider = _FakeProvider(info)
    svc = BillingService("cust1", storage_provider=provider)
    new_info = BillingInfo(customer_id="cust1", plan=Plan.PRO, credits_remaining=2000)
    svc.setup_user_plan(new_info)
    assert provider.cached == new_info


def test_membership_inactive_when_plan_expired():
    now = datetime(2025, 1, 10, tzinfo=timezone.utc)
    info = BillingInfo(
        customer_id="cust1",
        plan=Plan.BASIC,
        credits_remaining=500,
        plan_start=datetime(2024, 12, 1, tzinfo=timezone.utc).isoformat(),
        plan_expires_at=(now - timedelta(days=1)).isoformat(),
        demo_plan_activated_at=(now - timedelta(days=14)).isoformat(),
    )
    provider = _FakeProvider(info)
    svc = BillingService("cust1", storage_provider=provider)
    assert svc.is_membership_active(now=now) is False
    assert svc.get_current_period_remaining_credits(now=now) == 0
    with pytest.raises(InsufficientCreditsError):
        svc.ensure_sufficient_credits(1)

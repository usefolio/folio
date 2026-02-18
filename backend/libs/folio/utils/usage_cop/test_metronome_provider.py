import pytest

from folio.utils.usage_cop.models import BillingInfo, Plan, UsageEvent, UsageEventType
from folio.utils.usage_cop.providers.metronome_provider import MetronomeProvider


class _FakeResponse:
    def __init__(self, payload=None):
        self.payload = payload or {}
        self.raise_called = False

    def raise_for_status(self):
        self.raise_called = True

    def json(self):
        return self.payload


class _FakeClient:
    def __init__(self):
        self.posts = []
        self.gets = []
        self.post_response = _FakeResponse()
        self.get_response = _FakeResponse()

    def post(self, url, headers=None, json=None):
        self.posts.append({"url": url, "headers": headers, "json": json})
        return self.post_response

    def get(self, url, headers=None):
        self.gets.append({"url": url, "headers": headers})
        return self.get_response


def _event():
    return UsageEvent(
        transaction_id="tx",
        customer_id="cust1",
        timestamp="2025-01-01T00:00:00+00:00",
        event_type=UsageEventType.AI_CALL_FINALIZED,
        properties={"model": "gpt-4o-mini", "input_tokens": 1, "output_tokens": 1},
    )


def test_init_requires_api_token(monkeypatch):
    monkeypatch.delenv("METRONOME_API_TOKEN", raising=False)
    with pytest.raises(EnvironmentError, match="METRONOME_API_TOKEN"):
        MetronomeProvider(api_token=None)


def test_send_usage_batch_stubs_when_test_token(monkeypatch):
    fake_client = _FakeClient()
    monkeypatch.setattr(
        "folio.utils.usage_cop.providers.metronome_provider.httpx.Client",
        lambda timeout: fake_client,
    )

    provider = MetronomeProvider(api_token="test_token")
    provider.send_usage_batch([_event()])

    assert fake_client.posts == []


def test_send_usage_batch_posts_payload(monkeypatch):
    fake_client = _FakeClient()
    monkeypatch.setattr(
        "folio.utils.usage_cop.providers.metronome_provider.httpx.Client",
        lambda timeout: fake_client,
    )

    provider = MetronomeProvider(api_token="live_token", base_url="https://meter.example/")
    provider.send_usage_batch([_event()])

    assert len(fake_client.posts) == 1
    req = fake_client.posts[0]
    assert req["url"] == "https://meter.example/v1/ingest"
    assert req["headers"]["Authorization"] == "Bearer live_token"
    assert req["json"][0]["transaction_id"] == "tx"
    assert fake_client.post_response.raise_called is True


def test_send_usage_batch_no_events_noop(monkeypatch):
    fake_client = _FakeClient()
    monkeypatch.setattr(
        "folio.utils.usage_cop.providers.metronome_provider.httpx.Client",
        lambda timeout: fake_client,
    )
    provider = MetronomeProvider(api_token="live_token")

    provider.send_usage_batch([])

    assert fake_client.posts == []


def test_get_plan_for_customer_uses_stub_for_test_token(monkeypatch):
    fake_client = _FakeClient()
    monkeypatch.setattr(
        "folio.utils.usage_cop.providers.metronome_provider.httpx.Client",
        lambda timeout: fake_client,
    )
    provider = MetronomeProvider(api_token="test_token")

    assert provider.get_plan_for_customer("cust1") == Plan.BASIC


def test_get_plan_for_customer_fetches_plan(monkeypatch):
    fake_client = _FakeClient()
    fake_client.get_response = _FakeResponse({"plan": "pro"})
    monkeypatch.setattr(
        "folio.utils.usage_cop.providers.metronome_provider.httpx.Client",
        lambda timeout: fake_client,
    )
    provider = MetronomeProvider(api_token="live_token", base_url="https://meter.example")

    plan = provider.get_plan_for_customer("cust1")

    assert plan == Plan.PRO
    assert fake_client.gets[0]["url"] == "https://meter.example/v1/customers/cust1"
    assert fake_client.get_response.raise_called is True


def test_get_credit_balance_stub_and_fallback(monkeypatch):
    fake_client = _FakeClient()
    monkeypatch.setattr(
        "folio.utils.usage_cop.providers.metronome_provider.httpx.Client",
        lambda timeout: fake_client,
    )
    stub_provider = MetronomeProvider(api_token="test_token")
    assert stub_provider.get_credit_balance("cust1") == 100.0

    fake_client_2 = _FakeClient()
    fake_client_2.post_response = _FakeResponse({"data": []})
    monkeypatch.setattr(
        "folio.utils.usage_cop.providers.metronome_provider.httpx.Client",
        lambda timeout: fake_client_2,
    )
    provider = MetronomeProvider(api_token="live_token")

    assert provider.get_credit_balance("cust1") == 0.0


def test_get_credit_balance_parses_response(monkeypatch):
    fake_client = _FakeClient()
    fake_client.post_response = _FakeResponse(
        {"data": [{"balances": [{"remaining": "42.75"}]}]}
    )
    monkeypatch.setattr(
        "folio.utils.usage_cop.providers.metronome_provider.httpx.Client",
        lambda timeout: fake_client,
    )
    provider = MetronomeProvider(api_token="live_token")

    assert provider.get_credit_balance("cust1") == 42.75
    assert fake_client.post_response.raise_called is True


def test_get_billing_info_combines_plan_and_balance(monkeypatch):
    fake_client = _FakeClient()
    monkeypatch.setattr(
        "folio.utils.usage_cop.providers.metronome_provider.httpx.Client",
        lambda timeout: fake_client,
    )
    provider = MetronomeProvider(api_token="live_token")

    provider.get_plan_for_customer = lambda customer_id: Plan.PREMIUM
    provider.get_credit_balance = lambda customer_id: 321.0

    info = provider.get_billing_info("cust1")

    assert isinstance(info, BillingInfo)
    assert info.customer_id == "cust1"
    assert info.plan == Plan.PREMIUM
    assert info.credits_remaining == 321.0

import sys
import types

import pytest

from folio.utils.usage_cop.models import BillingInfo, Plan, UsageEvent, UsageEventType
from folio.utils.usage_cop.usage_cop import UsageCop


class _Provider:
    def __init__(self, billing_info=None, credit_balance=0.0, raise_on_send=False, raise_on_get=False):
        self.billing_info = billing_info
        self.credit_balance = credit_balance
        self.raise_on_send = raise_on_send
        self.raise_on_get = raise_on_get
        self.sent_batches = []

    def send_usage_batch(self, events):
        if self.raise_on_send:
            raise RuntimeError("send failed")
        self.sent_batches.append(events)

    def get_billing_info(self, customer_id):
        if self.raise_on_get:
            raise RuntimeError("billing failed")
        return self.billing_info

    def get_credit_balance(self, customer_id):
        if self.raise_on_get:
            raise RuntimeError("credits failed")
        return self.credit_balance


def _event(customer_id="cust1"):
    return UsageEvent(
        transaction_id="tx1",
        customer_id=customer_id,
        timestamp="2025-01-01T00:00:00+00:00",
        event_type=UsageEventType.COLUMN_CREATED,
        properties={"qty": 1},
    )


def _install_create_default_modules(
    monkeypatch,
    *,
    metronome_cls,
    storage_provider_cls,
    gcs_storage_cls,
    gcs_helper_cls,
):
    met_mod = types.ModuleType("folio.utils.usage_cop.providers.metronome_provider")
    met_mod.MetronomeProvider = metronome_cls
    monkeypatch.setitem(sys.modules, met_mod.__name__, met_mod)

    storage_provider_mod = types.ModuleType(
        "folio.utils.usage_cop.providers.storage_backend_provider"
    )
    storage_provider_mod.StorageBackendProvider = storage_provider_cls
    monkeypatch.setitem(sys.modules, storage_provider_mod.__name__, storage_provider_mod)

    storage_mod = types.ModuleType("folio.utils.storage_backend")
    storage_mod.GCSStorageBackend = gcs_storage_cls
    monkeypatch.setitem(sys.modules, storage_mod.__name__, storage_mod)

    helper_mod = types.ModuleType("folio.utils.storage_helper")
    helper_mod.GoogleCloudStorageHelper = gcs_helper_cls
    monkeypatch.setitem(sys.modules, helper_mod.__name__, helper_mod)


def test_usage_cop_requires_at_least_one_provider():
    with pytest.raises(ValueError):
        UsageCop([])


def test_send_usage_batch_sends_to_all_providers_and_continues_on_error():
    ok_provider = _Provider()
    failing_provider = _Provider(raise_on_send=True)
    cop = UsageCop([ok_provider, failing_provider])

    evt = _event()
    cop.send_usage_batch([evt])

    assert len(ok_provider.sent_batches) == 1
    assert ok_provider.sent_batches[0][0].transaction_id == "tx1"


def test_send_usage_event_wraps_single_event_batch():
    provider = _Provider()
    cop = UsageCop([provider])

    cop.send_usage_event(_event())

    assert len(provider.sent_batches) == 1
    assert len(provider.sent_batches[0]) == 1


def test_send_usage_batch_ignores_empty_input():
    provider = _Provider()
    cop = UsageCop([provider])

    cop.send_usage_batch([])

    assert provider.sent_batches == []


def test_get_billing_info_returns_provider_value():
    expected = BillingInfo(customer_id="cust1", plan=Plan.BASIC, credits_remaining=120)
    provider = _Provider(billing_info=expected)
    cop = UsageCop([provider])

    info = cop.get_billing_info("cust1")

    assert info == expected


def test_get_billing_info_returns_default_when_provider_raises():
    provider = _Provider(raise_on_get=True)
    cop = UsageCop([provider])

    info = cop.get_billing_info("cust1")

    assert info.customer_id == "cust1"
    assert info.plan == Plan.UNKNOWN
    assert info.credits_remaining == 0.0


def test_get_billing_info_invalid_index_raises():
    cop = UsageCop([_Provider()])
    with pytest.raises(ValueError, match="out of range"):
        cop.get_billing_info("cust1", provider_index=2)


def test_get_credit_balance_returns_provider_value_and_fallback():
    ok_provider = _Provider(credit_balance=33.5)
    failing_provider = _Provider(raise_on_get=True)
    cop_ok = UsageCop([ok_provider])
    cop_fail = UsageCop([failing_provider])

    assert cop_ok.get_credit_balance("cust1") == 33.5
    assert cop_fail.get_credit_balance("cust1") == 0.0


def test_get_credit_balance_invalid_index_raises():
    cop = UsageCop([_Provider()])
    with pytest.raises(ValueError, match="out of range"):
        cop.get_credit_balance("cust1", provider_index=5)


def test_create_default_builds_metronome_and_storage_provider(monkeypatch):
    class FakeMetronomeProvider:
        pass

    class FakeGoogleCloudStorageHelper:
        pass

    class FakeGCSStorageBackend:
        def __init__(self, helper):
            self.helper = helper

    class FakeStorageBackendProvider:
        def __init__(self, backend):
            self.backend = backend

    _install_create_default_modules(
        monkeypatch,
        metronome_cls=FakeMetronomeProvider,
        storage_provider_cls=FakeStorageBackendProvider,
        gcs_storage_cls=FakeGCSStorageBackend,
        gcs_helper_cls=FakeGoogleCloudStorageHelper,
    )

    cop = UsageCop.create_default()

    assert len(cop.providers) == 2
    assert isinstance(cop.providers[0], FakeMetronomeProvider)
    assert isinstance(cop.providers[1], FakeStorageBackendProvider)


def test_create_default_works_when_metronome_fails(monkeypatch):
    class FailingMetronomeProvider:
        def __init__(self):
            raise RuntimeError("boom")

    class FakeGoogleCloudStorageHelper:
        pass

    class FakeGCSStorageBackend:
        def __init__(self, helper):
            self.helper = helper

    class FakeStorageBackendProvider:
        def __init__(self, backend):
            self.backend = backend

    _install_create_default_modules(
        monkeypatch,
        metronome_cls=FailingMetronomeProvider,
        storage_provider_cls=FakeStorageBackendProvider,
        gcs_storage_cls=FakeGCSStorageBackend,
        gcs_helper_cls=FakeGoogleCloudStorageHelper,
    )

    cop = UsageCop.create_default()

    assert len(cop.providers) == 1
    assert isinstance(cop.providers[0], FakeStorageBackendProvider)


def test_create_default_raises_when_no_provider_initializes(monkeypatch):
    class FailingMetronomeProvider:
        def __init__(self):
            raise RuntimeError("no metronome")

    class FakeGoogleCloudStorageHelper:
        def __init__(self):
            raise RuntimeError("no helper")

    class FakeGCSStorageBackend:
        def __init__(self, helper):
            self.helper = helper

    class FakeStorageBackendProvider:
        def __init__(self, backend):
            self.backend = backend

    _install_create_default_modules(
        monkeypatch,
        metronome_cls=FailingMetronomeProvider,
        storage_provider_cls=FakeStorageBackendProvider,
        gcs_storage_cls=FakeGCSStorageBackend,
        gcs_helper_cls=FakeGoogleCloudStorageHelper,
    )

    with pytest.raises(RuntimeError, match="Failed to initialize any usage providers"):
        UsageCop.create_default()

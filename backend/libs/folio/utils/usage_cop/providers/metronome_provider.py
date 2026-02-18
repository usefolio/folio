from __future__ import annotations

import os
from typing import List, Optional
import logging

import httpx

from .provider_interface import UsageProvider
from ..models import UsageEvent, BillingInfo, Plan


class MetronomeProvider(UsageProvider):
    """Metronome-specific implementation of usage tracking provider."""

    def __init__(
        self,
        api_token: Optional[str] = None,
        base_url: str = "https://api.metronome.com",
    ) -> None:
        self.api_token = api_token or os.environ.get("METRONOME_API_TOKEN")
        if not self.api_token:
            raise EnvironmentError("METRONOME_API_TOKEN not set")
        self.base_url = base_url.rstrip("/")
        self._client = httpx.Client(timeout=10.0)
        self._logger = logging.getLogger(__name__)

    def send_usage_batch(self, events: List[UsageEvent]) -> None:
        """Send a batch of usage events to Metronome."""
        if not events:
            return
            
        # Stub out API calls during onboarding period
        if self.api_token == "test_token":
            self._logger.info(
                "[METRONOME STUB] Would send %d usage events:", len(events)
            )
            for event in events:
                self._logger.info(
                    "  - %s for customer %s", event.event_type, event.customer_id
                )
            return
            
        payload = [event.model_dump() for event in events]
        response = self._client.post(
            f"{self.base_url}/v1/ingest",
            headers={
                "Authorization": f"Bearer {self.api_token}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
        response.raise_for_status()

    def get_plan_for_customer(self, customer_id: str) -> Plan:
        """Fetch the plan associated with a Metronome customer."""
        # Stub out API calls during onboarding period
        if self.api_token == "test_token":
            self._logger.info(
                "[METRONOME STUB] Would get plan for customer %s, returning BASIC",
                customer_id,
            )
            return Plan.BASIC
            
        response = self._client.get(
            f"{self.base_url}/v1/customers/{customer_id}",
            headers={"Authorization": f"Bearer {self.api_token}"},
        )
        response.raise_for_status()
        data = response.json()
        return Plan(data.get("plan", Plan.UNKNOWN.value))

    def get_credit_balance(self, customer_id: str) -> float:
        """Return the remaining credit balance for a customer."""
        # Stub out API calls during onboarding period
        if self.api_token == "test_token":
            self._logger.info(
                "[METRONOME STUB] Would get credit balance for customer %s, returning 100.0",
                customer_id,
            )
            return 100.0
            
        response = self._client.post(
            f"{self.base_url}/v1/contracts/customerBalances/list",
            headers={
                "Authorization": f"Bearer {self.api_token}",
                "Content-Type": "application/json",
            },
            json={
                "customer_id": customer_id,
                "include_balance": True,
                "include_contracts_balances": True,
            },
        )
        response.raise_for_status()
        data = response.json()
        # The response structure may vary; default to 0 if not found
        try:
            return float(
                data["data"][0]["balances"][0]["remaining"]
            )
        except Exception:
            return 0.0

    def get_billing_info(self, customer_id: str) -> BillingInfo:
        """Retrieve plan and credit balance for a customer."""
        plan = self.get_plan_for_customer(customer_id)
        credits = self.get_credit_balance(customer_id)
        return BillingInfo(customer_id=customer_id, plan=plan, credits_remaining=credits)

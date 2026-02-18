from __future__ import annotations

from abc import ABC, abstractmethod
from typing import List

from ..models import UsageEvent, BillingInfo


class UsageProvider(ABC):
    """Abstract interface for usage tracking providers."""
    
    @abstractmethod
    def send_usage_batch(self, events: List[UsageEvent]) -> None:
        """Send a batch of usage events to the provider."""
        pass
    
    @abstractmethod
    def get_billing_info(self, customer_id: str) -> BillingInfo:
        """Retrieve billing information for a customer."""
        pass
    
    @abstractmethod
    def get_credit_balance(self, customer_id: str) -> float:
        """Return the remaining credit balance for a customer."""
        pass
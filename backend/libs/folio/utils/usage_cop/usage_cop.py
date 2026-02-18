from __future__ import annotations

from typing import List, Optional
import logging

from .providers.provider_interface import UsageProvider
from .models import UsageEvent, BillingInfo

logger = logging.getLogger(__name__)


class UsageCop:
    """Generic usage tracking and billing management system."""
    
    def __init__(self, providers: List[UsageProvider]):
        """Initialize UsageCop with one or more providers.
        
        Args:
            providers: List of providers to send usage events to (e.g., Metronome, local DB)
        """
        if not providers:
            raise ValueError("At least one provider must be specified")
        self.providers = providers
    
    @classmethod
    def create_default(cls) -> 'UsageCop':
        """Create a UsageCop instance with default providers.
        
        Tries to initialize with both Metronome and storage backend providers.
        Falls back to Metronome-only if storage backend fails.
        """
        from .providers.metronome_provider import MetronomeProvider
        
        providers = []
        
        # Always add Metronome provider
        try:
            providers.append(MetronomeProvider())
        except Exception as e:
            logger.warning(f"Failed to initialize Metronome provider: {e}")
        
        # Try to add storage backend provider
        try:
            from .providers.storage_backend_provider import StorageBackendProvider
            from folio.utils.storage_backend import GCSStorageBackend
            from folio.utils.storage_helper import GoogleCloudStorageHelper
            
            gcs_helper = GoogleCloudStorageHelper()
            storage_backend = GCSStorageBackend(gcs_helper)
            storage_provider = StorageBackendProvider(storage_backend)
            providers.append(storage_provider)
        except Exception as e:
            logger.warning(f"Failed to initialize storage backend provider: {e}")
        
        if not providers:
            raise RuntimeError("Failed to initialize any usage providers")
        
        return cls(providers)
    
    def send_usage_batch(self, events: List[UsageEvent]) -> None:
        """Send a batch of usage events to all configured providers."""
        if not events:
            return
        
        for provider in self.providers:
            try:
                provider.send_usage_batch(events)
            except Exception as e:
                # Log error but don't fail the entire operation
                provider_name = provider.__class__.__name__
                logger.error(
                    f"Failed to send {len(events)} usage events to {provider_name}: {e}",
                    exc_info=True,
                    extra={
                        "provider": provider_name,
                        "event_count": len(events),
                        "customer_ids": list(set(event.customer_id for event in events)),
                        "event_types": list(set(event.event_type for event in events)),
                    }
                )
    
    def send_usage_event(self, event: UsageEvent) -> None:
        """Send a single usage event to all configured providers."""
        self.send_usage_batch([event])
    
    def get_billing_info(self, customer_id: str, provider_index: int = 0) -> BillingInfo:
        """Get billing info from the specified provider (defaults to first provider)."""
        if provider_index >= len(self.providers):
            raise ValueError(f"Provider index {provider_index} out of range")
        
        try:
            return self.providers[provider_index].get_billing_info(customer_id)
        except Exception as e:
            provider_name = self.providers[provider_index].__class__.__name__
            logger.error(
                f"Failed to get billing info from {provider_name} for customer {customer_id}: {e}",
                exc_info=True
            )
            # Return default billing info if primary provider fails
            from .models import Plan
            return BillingInfo(customer_id=customer_id, plan=Plan.UNKNOWN, credits_remaining=0.0)
    
    def get_credit_balance(self, customer_id: str, provider_index: int = 0) -> float:
        """Get credit balance from the specified provider (defaults to first provider)."""
        if provider_index >= len(self.providers):
            raise ValueError(f"Provider index {provider_index} out of range")
        
        try:
            return self.providers[provider_index].get_credit_balance(customer_id)
        except Exception as e:
            provider_name = self.providers[provider_index].__class__.__name__
            logger.error(
                f"Failed to get credit balance from {provider_name} for customer {customer_id}: {e}",
                exc_info=True
            )
            return 0.0
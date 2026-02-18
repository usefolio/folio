# UsageCop - Usage Tracking & Billing

Provider-agnostic library for tracking usage events and managing billing.

## Quick Start

BillingService must always be created for a specific `customer_id` and a plan must exist for that customer beforehand.

```python
from folio.utils.usage_cop import BillingService, BillingInfo, Plan

# 1) Admin: set up plan for a user (one-time)
BillingService.setup_plan(BillingInfo(
    customer_id="user_123",
    plan=Plan.BASIC,
    credits_remaining=50_00,  # cents
))

# 2) App code: create service bound to that user
billing = BillingService("user_123")

# Check credits for estimated cost
remaining_cents = billing.get_current_period_remaining_credits()
if remaining_cents < 100:  # e.g., 100 cents
    raise Exception("Insufficient credits")

# Track usage
billing.send_usage_event(usage_event)
```

## Core Components

- **BillingService** - Main interface for billing operations
- **UsageEvent** - Event model for tracking usage
- **BillingInfo** - Customer billing information

## Usage Events

```python
from folio.utils.usage_cop import ai_call_finalized_event

event = ai_call_finalized_event(
    customer_id="user_123",
    provider="openai", 
    model="gpt-4",
    input_tokens=100,
    output_tokens=50,
    total_tokens=150,
    trace_id="trace_456"
)
billing.send_usage_event(event)
```

## Architecture

- **Dual-write**: Events sent to both external billing provider (Metronome) and local storage (GCS)
- **Provider pattern**: Swappable billing providers  
- **Automatic fallback**: Uses local storage if external provider fails

## Convenience APIs

- Current period usage aggregation (based on plan_start):
  - `agg = billing.get_current_period_usage()`
- Current period spend (cents):
  - `cents = billing.get_current_period_spend_cents()`
- Current period spend (USD):
  - `usd = billing.get_current_period_spend_cents() / 100.0` or `billing.calculate_aggregation_cost_usd(agg)`
- Current period remaining credits (cents):
  - `remaining_cents = billing.get_current_period_remaining_credits()`
- Credit details in one call:
  - `total, remaining, renews_or_expires_at = billing.get_period_credit_details()`

Testing helpers:
- Override cached plan info without hitting providers: `billing.set_billing_info(info)`
- Force refetch plan from providers: `billing.refresh_billing_info()`

## Environment Variables

For testing UsageCop in notebooks or local development, you'll need to set the following environment variables:

### Required for Metronome Provider
```bash
export METRONOME_API_TOKEN="your_metronome_api_token"
# Or use "test_token" for stubbed/development mode
```
### Required for Storage Backend Dependencies
```bash
# GCS S3-compatible access credentials (used by boto client in storage_helper)
export GOOGLE_ACCESS_KEY_ID="your_google_access_key_id"
export GOOGLE_ACCESS_KEY_SECRET="your_google_access_key_secret"
export BUCKET_NAME="bucket_name"
# GCS Service Account credentials (JSON format, required for native GCS client)
export GOOGLE_SERVICE_ACCOUNT_JSON='{"type":"service_account","project_id":"your-project","private_key_id":"...","private_key":"<redacted>","client_email":"...@your-project.iam.gserviceaccount.com",...}'
```

### Example Setup for Testing
```python
import os
os.environ["METRONOME_API_TOKEN"] = "test_token"  # Uses stub mode
os.environ["GOOGLE_ACCESS_KEY_ID"] = "your_access_key_id"
os.environ["GOOGLE_ACCESS_KEY_SECRET"] = "your_access_key_secret"
os.environ["GOOGLE_SERVICE_ACCOUNT_JSON"] = "{..}"
os.environ["BUCKET_NAME"] = "bucket name"

from folio.utils.usage_cop import BillingService, BillingInfo, Plan
BillingService.setup_plan(BillingInfo(customer_id="user_123", plan=Plan.BASIC, credits_remaining=10_00))
billing = BillingService("user_123")
```

## Notes

- Instances are per-user; constructing `BillingService` without a plan will raise `UserBillingNotSetupError`.
- Fetching BillingInfo can be expensive; the instance caches it for its lifetime. Use `refresh_billing_info()` to refetch.

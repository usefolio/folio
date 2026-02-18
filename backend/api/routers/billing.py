from typing import Dict, Optional, TypedDict, cast
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from dependencies import get_billing_service, verify_api_key, verify_token
from folio.utils.usage_cop import (
    BillingInfo,
    BillingService,
    Plan,
    UserBillingNotSetupError,
)

router = APIRouter(prefix="/billing", tags=["billing"])


class PlanMeta(TypedDict, total=False):
    plan_id: str
    plan_name: str
    monthly_cost_cents: int
    credits_included: int


# Plan metadata used for summary/check responses
PLAN_DETAILS: Dict[Plan, PlanMeta] = {
    Plan.BASIC: {
        "plan_id": "basic-monthly",
        "plan_name": "Basic",
        "monthly_cost_cents": 0,
        "credits_included": 0,
    },
    Plan.PRO: {
        "plan_id": "pro-monthly",
        "plan_name": "Pro",
        "monthly_cost_cents": 24900,
        "credits_included": 24900,
    },
    Plan.PREMIUM: {
        "plan_id": "premium-monthly",
        "plan_name": "Premium",
        "monthly_cost_cents": 2900,
        "credits_included": 2900,
    },
}

DEMO_PLAN_DURATION_DAYS = 14
DEMO_PLAN_MIN_CREDITS_CENTS = 1000


def _plan_meta(plan: Plan) -> PlanMeta:
    if plan not in PLAN_DETAILS:
        raise HTTPException(status_code=400, detail=f"Unknown plan: {plan}")
    return PLAN_DETAILS[plan]


class BillingSummaryResponse(BaseModel):
    plan_id: Optional[str]
    plan_name: Plan
    renews_at: Optional[str]
    plan_expires_at: Optional[str] = None
    membership_active: bool
    monthly_cost_usd: float
    credits_included: int
    usd_spend: float
    usd_remaining: float


def _build_summary(billing: BillingService) -> BillingSummaryResponse:
    info = billing.billing_info
    meta = _plan_meta(info.plan)
    usd_spend = billing.get_current_period_spend_usd()
    usd_remaining = billing.get_current_period_remaining_usd()
    _, end = billing.get_current_billing_window()
    renews_at = info.plan_expires_at or end.isoformat()
    return BillingSummaryResponse(
        plan_id=meta.get("plan_id"),
        plan_name=info.plan,
        renews_at=renews_at,
        plan_expires_at=info.plan_expires_at,
        membership_active=billing.is_membership_active(info=info),
        monthly_cost_usd=float(meta.get("monthly_cost_cents", 0)) / 100.0,
        credits_included=meta.get("credits_included", 0),
        usd_spend=usd_spend,
        usd_remaining=usd_remaining,
    )


@router.get("/summary", response_model=BillingSummaryResponse)
async def get_billing_summary(
    authorized: bool = Depends(verify_token),
    billing: BillingService = Depends(get_billing_service),
) -> BillingSummaryResponse:
    if not authorized:
        raise HTTPException(status_code=401, detail="Unauthorized")

    return _build_summary(billing)


class BillingCheckRequest(BaseModel):
    required_credits: int = Field(..., ge=0)


class BillingCheckResponse(BaseModel):
    membership_active: bool
    plan_id: Optional[str] = None
    plan_name: Optional[str] = None
    renews_at: Optional[str] = None
    credits_remaining: Optional[int] = None
    required_credits: int
    has_enough: bool
    next_available_at: Optional[str] = None
    reason: Optional[str] = None


@router.post("/check", response_model=BillingCheckResponse)
async def check_billing(
    req: BillingCheckRequest,
    authorized: bool = Depends(verify_token),
    billing: BillingService = Depends(get_billing_service),
) -> BillingCheckResponse:
    if not authorized:
        raise HTTPException(status_code=401, detail="Unauthorized")

    info = billing.billing_info
    if info.plan == Plan.UNKNOWN:
        return BillingCheckResponse(
            membership_active=False,
            credits_remaining=None,
            required_credits=req.required_credits,
            has_enough=False,
            next_available_at=None,
            reason="no_membership",
        )

    meta = _plan_meta(info.plan)
    membership_active = billing.is_membership_active(info=info)
    if not membership_active:
        return BillingCheckResponse(
            membership_active=False,
            plan_id=meta.get("plan_id"),
            plan_name=meta.get("plan_name"),
            renews_at=info.plan_expires_at,
            credits_remaining=0,
            required_credits=req.required_credits,
            has_enough=False,
            next_available_at=None,
            reason="membership_inactive",
        )
    # Compute remaining via the one-liner and window end via helper
    credits_remaining = billing.get_current_period_remaining_credits()
    _, end = billing.get_current_billing_window()
    renews_at = info.plan_expires_at or end.isoformat()
    has_enough = credits_remaining >= req.required_credits
    next_available_at: Optional[str] = None
    reason: Optional[str] = None
    if not has_enough:
        reason = "insufficient_credits"
        if info.plan == Plan.BASIC:
            next_available_at = info.plan_expires_at or renews_at

    return BillingCheckResponse(
        membership_active=membership_active,
        plan_id=meta.get("plan_id"),
        plan_name=meta.get("plan_name"),
        renews_at=renews_at,
        credits_remaining=credits_remaining,
        required_credits=req.required_credits,
        has_enough=has_enough,
        next_available_at=next_available_at,
        reason=reason,
    )


@router.post("/demo", response_model=BillingSummaryResponse)
async def setup_demo_plan(
    request: Request,
    authorized: bool = Depends(verify_token),
) -> BillingSummaryResponse:
    if not authorized:
        raise HTTPException(status_code=401, detail="Unauthorized")

    user_id = cast(Optional[str], getattr(request.state, "user_id", None))
    if not user_id:
        raise HTTPException(status_code=400, detail="Missing user id")

    try:
        # NOTE: We avoid Depends(get_billing_service) here because that dependency
        # eagerly preloads (or even seeds) billing info. The demo bootstrap needs
        # to inspect storage without creating credits yet, so we construct the
        # service manually with prefetch disabled.
        billing = BillingService(user_id, prefetch_plan=False)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    existing_info: Optional[BillingInfo]
    try:
        existing_info = billing.get_billing_info(user_id)
    except UserBillingNotSetupError:
        existing_info = None
    except RuntimeError:
        raise HTTPException(status_code=500, detail="Storage provider not configured")

    if existing_info and existing_info.plan != Plan.UNKNOWN:
        if existing_info.demo_plan_activated_at:
            try:
                summary_service = BillingService(user_id)
            except (UserBillingNotSetupError, RuntimeError):
                billing.set_billing_info(existing_info)
                summary_service = billing
            return _build_summary(summary_service)
        raise HTTPException(status_code=409, detail="plan_already_configured")

    now = datetime.now(timezone.utc)
    expiration = now + timedelta(days=DEMO_PLAN_DURATION_DAYS)
    basic_meta = PLAN_DETAILS.get(Plan.BASIC, {})
    default_basic_credits = int(basic_meta.get("credits_included", 0))
    credits = max(default_basic_credits, DEMO_PLAN_MIN_CREDITS_CENTS)

    demo_info = BillingInfo(
        customer_id=user_id,
        plan=Plan.BASIC,
        credits_remaining=credits,
        plan_start=now.isoformat(),
        plan_expires_at=expiration.isoformat(),
        demo_plan_activated_at=now.isoformat(),
    )

    try:
        BillingService.setup_plan(demo_info)
    except RuntimeError:
        raise HTTPException(status_code=500, detail="Storage provider not configured")

    try:
        summary_service = BillingService(user_id)
    except UserBillingNotSetupError as exc:
        raise HTTPException(status_code=500, detail="billing_not_setup") from exc

    return _build_summary(summary_service)


class SetupPlanRequest(BaseModel):
    customer_id: str
    plan: Plan
    credits: Optional[int] = Field(default=None, ge=0)
    plan_start: Optional[str] = None


@router.post("/admin/plan")
async def setup_plan(
    req: SetupPlanRequest,
    authorized: bool = Depends(verify_api_key),
):
    if not authorized:
        raise HTTPException(status_code=401, detail="Unauthorized")
    # Default plan_start to current UTC time if not provided
    _plan_start = req.plan_start or datetime.now(timezone.utc).isoformat()
    # Determine default credits from plan metadata when not provided
    meta = _plan_meta(req.plan)
    default_credits = int(meta.get("credits_included", 0))
    credits_remaining = int(req.credits) if req.credits is not None else default_credits
    info = BillingInfo(
        customer_id=req.customer_id,
        plan=req.plan,
        credits_remaining=credits_remaining,
        plan_start=_plan_start,
    )
    try:
        BillingService.setup_plan(info)
    except RuntimeError:
        raise HTTPException(status_code=500, detail="Storage provider not configured")
    return {"status": "ok"}


class TopUpRequest(BaseModel):
    customer_id: str
    credits: int = Field(..., ge=0)


@router.post("/admin/topup")
async def top_up(
    req: TopUpRequest,
    authorized: bool = Depends(verify_api_key),
    billing: BillingService = Depends(get_billing_service),
):
    if not authorized:
        raise HTTPException(status_code=401, detail="Unauthorized")
    try:
        credits_remaining = billing.top_up_credits(req.customer_id, req.credits)
    except UserBillingNotSetupError:
        raise HTTPException(status_code=404, detail="billing_not_setup")
    except RuntimeError:
        raise HTTPException(status_code=500, detail="Storage provider not configured")
    return {"credits_remaining": credits_remaining}

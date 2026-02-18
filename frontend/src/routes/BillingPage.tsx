import React, { useEffect, useMemo, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Info, AlertTriangle, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useBillingBalance } from "@/hooks/useBillingBalance";
import { useDemoAccountStatus } from "@/hooks/useDemoAccountStatus";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { BillingPlanId } from "@/types/types";
import { normalizeBillingPlan } from "@/types/types";
import Tag from "@/components/tags/tag";

const BillingPage: React.FC = () => {
  const { t } = useTranslation();
  const [selectedPlan, setSelectedPlan] = useState<BillingPlanId | undefined>(
    undefined,
  );
  const [selectedCredits, setSelectedCredits] = useState("20");
  const [couponCode, setCouponCode] = useState("");
  const [notificationThreshold, setNotificationThreshold] = useState("");
  const { summary, monthlyCostUsd, error, loading, isForbidden, refresh } = useBillingBalance();
  const { demoAccountCreated } = useDemoAccountStatus();
  const showTrialInfo = !demoAccountCreated && isForbidden;

  const planName = useMemo(() => {
    const id = normalizeBillingPlan((summary?.plan_name || "").toLowerCase());
    if (id === "basic" || id === "premium" || id === "pro")
      return t(`billing.plans.${id}` as const);
    return summary?.plan_name || t("billing.plans.pro");
  }, [summary?.plan_name, t]);

  const dollarsUsed = summary?.usd_spend ?? 0;
  const dollarsRemaining = summary?.usd_remaining ?? 0;

  useEffect(() => {
    const normalized = normalizeBillingPlan(summary?.plan_name);
    if (normalized) {
      setSelectedPlan(normalized);
    }
  }, [summary?.plan_name]);

  // When trial provisioning finishes on the Billing page, refresh the balance/summary once
  const prevShowTrialInfo = React.useRef<boolean>(showTrialInfo);
  useEffect(() => {
    if (prevShowTrialInfo.current && !showTrialInfo) {
      refresh();
    }
    prevShowTrialInfo.current = showTrialInfo;
  }, [showTrialInfo, refresh]);

  const plans: { id: BillingPlanId; name: string; price: number; pages?: number; unlimited?: boolean }[] = [
    { id: "basic", name: t("billing.plans.basic"), price: 10, pages: 500 },
    { id: "premium", name: t("billing.plans.premium"), price: 29, pages: 2500 },
    { id: "pro", name: t("billing.plans.pro"), price: 249, unlimited: true },
  ];

  const creditOptions = [
    { value: "10", price: 10, deepSearches: 4 },
    { value: "20", price: 20, deepSearches: 8 },
    { value: "50", price: 50, deepSearches: 20 },
    { value: "custom", price: 0 },
  ];

  return (
    <div className="h-full overflow-auto bg-gray-50 p-6 scrollbar-thin">
      <div className="mx-auto">
        <h1 className="text-2xl font-semibold mb-2">{t("billing.title")}</h1>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column */}
          <div className="space-y-6">
            {/* Current Subscription */}
            <Card className="rounded-md">
              <CardHeader className="p-4 pb-2 flex flex-row items-center gap-2 space-y-0">
                <CardTitle className="text-base">
                  {t("billing.current_subscription.title")}
                </CardTitle>
                {showTrialInfo && (
                  <Tag tag={t("billing.trial_account.plan_name")} colorName="lightGray">
                    {t("billing.trial_account.plan_name")}
                  </Tag>
                )}
                {error && !showTrialInfo && (
                  <div className="ml-2 flex items-center gap-1 text-destructive text-xs">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    <span>{t("billing.current_subscription.error_message")}</span>
                  </div>
                )}
              </CardHeader>
              <CardContent className="p-4 pt-0 space-y-4">
                {showTrialInfo && (
                  <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                    <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    <div className="space-y-0.5">
                      <p className="font-medium">{t("billing.trial_account.title")}</p>
                      <p>{t("billing.trial_account.description")}</p>
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">
                      {t("billing.current_subscription.current_plan")}
                    </div>
                    <div className="text-lg font-medium flex items-center gap-1">
                      {loading ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      ) : showTrialInfo ? (
                        t("billing.trial_account.plan_name")
                      ) : error ? (
                        "N/A"
                      ) : (
                        planName
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">
                      {t("billing.current_subscription.monthly_cost")}
                    </div>
                    <div className="text-lg font-medium flex items-center gap-1">
                      {loading ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      ) : (
                        `$${(monthlyCostUsd ?? 0).toFixed(2)}`
                      )}
                      {!loading && error && !showTrialInfo && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex items-center text-destructive">
                                <AlertTriangle className="h-4 w-4" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">
                              {t("sidebar.balance.error_tooltip")}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">
                      {t("billing.current_subscription.usd_used")}
                    </div>
                    <div className="text-lg font-medium flex items-center gap-1">
                      {loading ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      ) : (
                        `$${dollarsUsed.toFixed(2)}`
                      )}
                      {!loading && error && !showTrialInfo && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex items-center text-destructive">
                                <AlertTriangle className="h-4 w-4" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">
                              {t("sidebar.balance.error_tooltip")}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">
                      {t("billing.current_subscription.usd_remaining")}
                    </div>
                    <div className="text-lg font-medium flex items-center gap-1">
                      {loading ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      ) : (
                        `$${dollarsRemaining.toFixed(2)}`
                      )}
                      {!loading && error && !showTrialInfo && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex items-center text-destructive">
                                <AlertTriangle className="h-4 w-4" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">
                              {t("sidebar.balance.error_tooltip")}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                  </div>
                </div>
                <Separator />
                <div>
                  <div className="flex items-center gap-2 text-primary mb-1">
                    <Info className="h-4 w-4" />
                    <span className="text-xs font-medium">
                      {t("billing.current_subscription.usage_notification")}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">
                    {t("billing.current_subscription.usage_notification_desc")}
                  </p>
                  <div className="flex gap-2 items-center">
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-semibold text-muted-foreground">
                        {t("global.currency_symbol")}
                      </span>
                      <Input
                        type="number"
                        placeholder="0"
                        value={notificationThreshold}
                        onChange={(e) => setNotificationThreshold(e.target.value)}
                        className="w-20 h-8 text-xs rounded-md"
                      />
                    </div>
                    <Button
                      size="compact"
                      shape="square"
                      variant="outline"
                      disabled
                    >
                      {t("global.set")}
                    </Button>
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 h-8 text-xs rounded-md"
                    disabled
                  >
                    {t("billing.current_subscription.view_usage")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 h-8 text-xs rounded-md"
                    disabled
                  >
                    {t("billing.current_subscription.view_charges")}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Subscription Plans */}
            <Card className="rounded-md">
              <CardHeader className="p-4 pb-2 flex flex-row items-center gap-2 space-y-0">
                <CardTitle className="text-base">
                  {t("billing.subscription_plans.title")}
                </CardTitle>
                {showTrialInfo && (
                  <Tag tag={t("billing.trial_account.plan_name")} colorName="lightGray">
                    {t("billing.trial_account.plan_name")}
                  </Tag>
                )}
                {error && !showTrialInfo && (
                  <div className="ml-2  flex items-center gap-1 text-destructive text-xs">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    <span>{t("billing.subscription_plans.error_message")}</span>
                  </div>
                )}
              </CardHeader>
              <CardContent className="p-4 pt-0 space-y-4">
                {showTrialInfo && (
                  <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                    <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    <div className="space-y-0.5">
                      <p className="font-medium">{t("billing.trial_account.title")}</p>
                      <p>{t("billing.trial_account.description")}</p>
                    </div>
                  </div>
                )}
                <RadioGroup
                  value={selectedPlan}
                  onValueChange={(v) => setSelectedPlan(v as BillingPlanId)}
                  className="space-y-2"
                >
                  {plans.map((plan) => (
                    <Label /* one big click-target */
                      key={plan.id}
                      htmlFor={`plan-${plan.id}`}
                      className={`flex items-center justify-between rounded-md border border-border border-px cursor-pointer hover:bg-accent hover:text-accent-foreground has-[button[data-state=checked]]:border-primary p-3 ${error ? "pointer-events-none opacity-50" : ""}`}
                    >
                      <RadioGroupItem
                        value={plan.id}
                        id={`plan-${plan.id}`}
                        disabled={loading || error}
                        className="mr-3 h-4 w-4 shrink-0 rounded-full border border-muted-foreground flex items-center justify-center text-primary data-[state=checked]:border-primary"
                      />
                      <div className="flex items-center space-x-3 flex-1">
                        <div>
                          <p className="font-medium text-sm">{plan.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {plan.unlimited
                              ? t("billing.subscription_plans.unlimited_pages")
                              : t("billing.subscription_plans.pages_per_month", {
                                  pages: plan.pages,
                                })}
                          </p>
                        </div>
                      </div>

                      <span className="font-semibold text-sm">
                        {t("billing.subscription_plans.price_currency", {
                          price: plan.price,
                        })}
                      </span>
                    </Label>
                  ))}
                </RadioGroup>
                <Button size="compact" shape="square" className="w-full hover:bg-orange-600" disabled>
                  {t("billing.subscription_plans.update_btn")}
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            {/* Add Credits */}
            <Card className="rounded-md">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-base">
                  {t("billing.credits.title")}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0 space-y-4">
                <RadioGroup
                  value={selectedCredits}
                  onValueChange={setSelectedCredits}
                  className="space-y-2"
                >
                  {creditOptions.map((option) => (
                    <Label
                      key={option.value}
                      htmlFor={`credit-${option.value}`}
                      className="flex items-center gap-3 rounded-md border p-3 hover:bg-accent hover:text-accent-foreground has-[button[data-state=checked]]:border-primary"
                    >
                      <RadioGroupItem
                        value={option.value}
                        id={`credit-${option.value}`}
                        className="shrink-0 h-4 w-4 rounded-full border border-muted-foreground flex items-center justify-center text-primary data-[state=checked]:border-primary"
                      />

                      <div>
                        <span className="font-medium text-sm">
                          {option.value === "custom"
                            ? t("billing.credits.option.custom")
                            : t("billing.credits.option.price_currency", {
                                price: option.price,
                              })}
                        </span>
                        <p className="text-xs text-muted-foreground">
                          {option.value === "custom"
                            ? t("billing.credits.option.custom_desc")
                            : t("billing.credits.option.approx_deep_searches", {
                                count: option.deepSearches,
                              })}
                        </p>
                      </div>
                    </Label>
                  ))}
                </RadioGroup>
                <div className="flex gap-2 pt-1">
                <Button size="compact" shape="square" className="hover:bg-orange-600" disabled>
                  {t("billing.credits.buy_btn", {
                    amount:
                      selectedCredits === "custom" ? "0" : selectedCredits,
                  })}
                </Button>
                  <Input
                    placeholder="Enter coupon code"
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value)}
                    className="h-8 text-xs rounded-md"
                  />
                  <Button size="compact" shape="square" className="px-4 hover:bg-orange-600" disabled>
                    {t("billing.credits.redeem_btn")}
                  </Button>
                </div>
                <Separator />
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">
                      {t("billing.automated_top_ups.title")}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 px-2 text-xs rounded-md"
                      disabled
                    >
                      {t("billing.automated_top_ups.adjust_btn")}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t("billing.automated_top_ups.description")}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Payment Methods */}
            <Card className="rounded-md">
              <CardHeader className="flex flex-row items-center justify-between p-4">
                <CardTitle className="text-base">
                  {t("billing.payment_methods.title")}
                </CardTitle>
                <Button size="compact" shape="square" className="hover:bg-orange-600" disabled>
                  {t("billing.payment_methods.add_btn")}
                </Button>
              </CardHeader>
              {/* <CardContent>
                <div className="flex items-center justify-between p-2 border rounded-md">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-5 bg-blue-600 text-white text-[10px] flex items-center justify-center font-bold">
                      VISA
                    </div>
                    <div>
                      <div className="text-sm font-medium">
                        {t("billing.payment_methods.visa_mask", {
                          digits: "0288",
                        })}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {t("billing.payment_methods.visa_expires", {
                          date: "3/2030",
                        })}
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="iconXs"
                    shape="square"
                    className="p-1 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent> */}
            </Card>

            {/* This Month */}
            {/* <Card className="rounded-md">
              <CardHeader>
                <CardTitle className="text-base">
                  {t("billing.this_month.title")}h
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">
                      {t("billing.this_month.enrichments")}
                    </div>
                    <div className="text-lg font-medium">156</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">
                      {t("billing.this_month.success_rate")}
                    </div>
                    <div className="text-lg font-medium">94%</div>
                  </div>
                </div>
              </CardContent>
            </Card> */}

            {/* Recent Activity */}
            {/* <Card className="rounded-md">
              <CardHeader>
                <CardTitle className="text-base">
                  {t("billing.recent_activity.title")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <p>{t("billing.recent_activity.token_purchase")}</p>
                  <p className="text-muted-foreground">$20.00</p>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <p>{t("billing.recent_activity.monthly_subscription")}</p>
                  <p className="text-muted-foreground">$29.00</p>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <p>{t("billing.recent_activity.token_usage")}</p>
                  <p className="text-muted-foreground">7,250 tokens</p>
                </div>
              </CardContent>
            </Card> */}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BillingPage;

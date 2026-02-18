export interface BillingSummary {
  plan_id?: string | null;
  plan_name?: string | null;
  renews_at?: string | null;
  plan_expires_at?: string | null;
  membership_active?: boolean;
  monthly_cost_usd: number;
  credits_included: number;
  usd_spend: number;
  usd_remaining: number;
}

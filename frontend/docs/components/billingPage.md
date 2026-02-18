# Billing Page

Renders the main Billing view with current plan details, subscription plans, credits, and payment methods.

- Path: `src/routes/BillingPage.tsx`
- Hooks: `useBillingBalance`, `useDemoAccountStatus`

Behavior highlights:
- Current Subscription and Subscription Plans sections both surface a non-error informational
  state during first-login demo-plan provisioning. When billing returns `403` and the user’s
  Clerk metadata indicates the demo plan hasn’t finished provisioning, we:
  - Show an info callout with `billing.trial_account.title` and `billing.trial_account.description`.
  - Render a Tag next to the card titles with `billing.trial_account.plan_name` (e.g., “Free Trial”).
- Once the demo plan is provisioned, the informational callouts/Tag are removed. Any remaining
  billing errors are shown using the standard error UI.
- Because billing is outside the project workspace surface, routing to `/billing` now clears
  the active project selection so returning to `/` triggers the same default most recent project
  auto-selection used on first load.

See also: `docs/components/billingBalance.md` for the sidebar balance behavior during trial provisioning.

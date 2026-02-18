# BillingBalance Component

Displays the user's remaining USD balance in the sidebar footer.

- Path: `src/components/sidebar/BillingBalance.tsx`
- Hooks: `src/hooks/useBillingBalance.ts` (uses `useBackendClient.getBillingSummary()`) and
  `src/hooks/useDemoAccountStatus.ts` (reads Clerk onboarding metadata to detect whether the
  user's demo billing plan has finished provisioning).

The component shows a muted label and the current credits amount. A refresh
button uses the shared `IconButton` component to provide a borderless square ghost style with an orange hover state, allowing manual updates while the value automatically refreshes every 5 minutes. When placed in the sidebar footer, it is separated from the user controls above by an inset divider.

Implementation details:
- The `useBillingBalance` hook delegates fetching to the centralized backend client via `useBackendClient.getBillingSummary()`.
- The backend client calls the processing backend endpoint `GET /billing/summary` and returns `usd_remaining` as the displayed value.
- The amount is formatted with a leading `$` and two decimal places (e.g., `$12.34`).
- If fetching fails, a red warning triangle appears next to the amount with a tooltip ("Unable to retrieve billing balance").
- Special-case trial provisioning: when billing returns a 403 and Clerk metadata still reports
  the demo account as incomplete, the component hides the warning icon and refresh control and
  instead shows a Tag (`src/components/tags/tag.tsx`) with the text
  `t("billing.trial_account.badge")` in an info color. While the Tag is visible, the `$` amount is
  intentionally hidden. Once the provisioning finishes and the Tag disappears, the component
  triggers a one-time balance refresh to fetch the latest value. During this immediate refresh,
  a small skeleton line loader is shown in place of the dollar amount.
- The hook exposes a `loading` state. While loading, the refresh control is replaced by a small spinner in the same position; once the request completes, the refresh button reappears.
- Failures are handled gracefully in the hook by falling back to `0`.

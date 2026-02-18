# `AfterSignIn` Onboarding Flow

The `src/components/ui/postLogin.tsx` component runs immediately after Clerk confirms a user session. It now coordinates the entire first-login bootstrap sequence and persists progress in Clerk's user-level `unsafeMetadata` storage.

## Persisted Metadata

Progress is stored under `unsafeMetadata.onboarding` with the following shape (see `src/services/onboardingService.ts`):

- `workspaceCreated`: set once the Convex mutation creates or returns the user's default workspace.
- `demoPlanInitialized`: flips once the processing backend confirms the `/billing/demo`
  bootstrap for a free Basic trial plan.
- `presentationCompleted`: marks the onboarding tour/presentation as complete. For now the logic assumes success.
- `completed`: flipped on when all prior steps succeed to prevent repeated work on future logins.
- `completedAt`: ISO timestamp for when onboarding finished.

The legacy `unsafeMetadata.onboarded` flag is still written for compatibility.

## Backend Integrations

The onboarding sequence relies on `useOnboardingService` from
`src/services/onboardingService.ts`, which wraps `useBackendClient` so the flow can
reuse the centralized billing client helpers:

- `setupDemoPlan` calls the processing backend's `/billing/demo` endpoint via the
  shared client. A `409 plan_already_configured` response is treated as a success and
  followed by a summary fetch so the onboarding flag still flips. Unauthorized
  responses bubble up as a `demo_plan_unauthorized` error for the caller to handle.
- `markOnboardingPresentationComplete` writes the presentation milestone directly
  into Clerk's `unsafeMetadata` store for the active session user. No processing
  backend roundtrip is required, but the helper still logs idempotent updates for
  observability.

# Folio Frontend

## General Architecture

We are using **Convex.dev** for the frontend database, **Vite + React** for the frontend app and **FastAPI** for the backend and **DuckDB** for the backend database and **Modal.com** for running processing functions.

- **Convex.dev**: Convex is a real-time database platform designed for frontend applications. It provides convenient hooks that allow us to seamlessly stream data from the backend into the frontend. Essentially, Convex acts as a "frontend state database," simplifying how we manage and sync state between the client and server. To understand more about convex see https://stack.convex.dev/how-convex-works.
- **GlideApps Grid**: We are using the [GlideApps Grid](https://grid.glideapps.com/), a highly customizable and performant data grid component. It enables us to display large datasets efficiently while providing rich features such as column resizing, sorting, and virtualization.

- **Vercel AI SDK**: We use the Vercel AI sdk for the chat experience that is essentially the data analyst sidebar.

- **DuckDB** (to be continued)

- **Modal** (to be continued)

- **Jamosocket** (to be continued)
---

## Table of Contents

1. [Overview](#overview)
2. [Getting Started](#getting-started)
3. [Deployment & Naming (Folio)](#deployment--naming-folio)
4. [Managed Fork Playbook](#managed-fork-playbook)
5. [Project Structure](#project-structure)
6. [Usage](#usage)
7. [DataChat Flow](docs/datachat.md)
8. [UI Buttons](docs/components/button.md)
9. [Mention Textarea](docs/components/mentionTextarea.md)
10. [Header View Switcher](docs/components/header.md)

---

## Overview

This repository implements a modern web application with real-time data streaming, powered by **Convex.dev** and a highly interactive frontend built using **Vite + React**. The application leverages the **GlideApps Grid** for rendering tabular data efficiently and intuitively.

---

## Getting Started

Follow this sequence for hosted setup. The order matters.

### Hosted Setup Sequence (Vercel + Clerk + Convex)

1. **Create a Vercel account and import this frontend project**
   - Root directory should be this folder (`frontend`).
   - Set build command and deploy/output settings for this Vite app.
   - Initial build/deploy is expected to fail before env vars are configured.

2. **Create and push a `dev` branch first**
   - Use `dev` branch for the first preview deployment setup.
   - This makes preview environment configuration easier before production.

3. **Set up Clerk**
   - Create Clerk app.
   - Collect:
     - `CLERK_SECRET_KEY`
     - `CLERK_PUBLISHABLE_KEY` (set this as `VITE_CLERK_PUBLISHABLE_KEY` in frontend env vars)

4. **Create Clerk JWT template for Convex**
   - In Clerk: `Configure -> Sessions -> JWT Template`
   - Create template named `convex`
   - Use claims:

```json
{
  "id": "{{user.id}}",
  "aud": "convex",
  "name": "{{user.full_name}}",
  "email": "{{user.primary_email_address}}",
  "picture": "{{user.image_url}}",
  "nickname": "{{user.username}}",
  "given_name": "{{user.first_name}}",
  "updated_at": "{{user.updated_at}}",
  "family_name": "{{user.last_name}}",
  "phone_number": "{{user.primary_phone_number}}",
  "email_verified": "{{user.email_verified}}",
  "phone_number_verified": "{{user.phone_number_verified}}"
}
```

5. **Set up Convex**
   - Create Convex project.
   - Generate a **preview deployment key** and store it as `CONVEX_DEPLOY_KEY`.
   - In Convex preview environment/project settings, set:
     - `CLERK_JWT_ISSUER_DOMAIN` = Clerk **Frontend API URL**
   - If this is missing, first deploy fails with:
     - `Environment variable CLERK_JWT_ISSUER_DOMAIN is used in auth config file but its value was not set.`

6. **Configure preview environment vars**
   - Set at least:
     - `VITE_CLERK_PUBLISHABLE_KEY`
     - `CONVEX_DEPLOY_KEY`
     - `CLERK_JWT_ISSUER_DOMAIN` (Convex-side, from Clerk Frontend API URL)

7. **Create Convex ingestion API key**
   - Create an API key named `IMPORT_DATA_API_KEY` for ingestion endpoints.
   - In Convex, add `IMPORT_DATA_API_KEY` to **Default Environment Variables** with that key value.

8. **Wire frontend to backend**
   - Add backend URL in Vercel:
     - `VITE_URL_PROCESSING_BACKEND`
   - Without backend setup, sign-in may work but product features remain non-functional.

9. **Later add additional project-level keys**
   - `EXA_AI_KEY`
   - `OPENAI_API_KEY`

### Local Frontend Development

```bash
cd /frontend
npm install --legacy-peer-deps
cp .env.example .env.local
# Optional: import a local Convex snapshot file before starting dev.
# npx convex import /path/to/snapshot.zip
npx convex dev
npm run dev
```

---

## Deployment & Naming (Folio)

Use this deployment checklist:

1. **Vercel project naming**
   - Rename the Vercel project display name to `folio` (or create a new project with that name).
   - If you want a new production URL, update the Vercel project slug/domain mapping in Vercel.
2. **Convex deployment binding**
   - Frontend naming changes do not automatically rename Convex deployments.
   - Keep `VITE_CONVEX_URL` pointed to your intended Convex deployment (`.convex.cloud` URL) for each environment.
3. **Jamsocket service naming**
   - Configure `VITE_JAMSOCKET_SERVICE` to the service id expected by your backend environment.
   - If not set, the frontend defaults to `folio-jamsocket-service`.
4. **Build/deploy verification**
   - Run `npm run build` before deployment to confirm TypeScript + Vite pass.
   - Deploy the generated `dist/` output (Vercel does this automatically for Vite projects).

---

## Managed Fork Playbook

If you run a private managed offering while keeping this repo open source, use the managed fork setup guide: [docs/managed-fork.md](docs/managed-fork.md).

Quick commands (run in the managed/private repo clone):

```bash
# One-time: configure the OSS upstream remote
npm run fork:setup-upstream -- git@github.com:<org>/<oss-repo>.git

# Ongoing: merge upstream/main into your current managed branch
npm run fork:sync
```

---

## Project Structure

The repository is organized as follows:

### Root Directory

- **`README.md`**: This file, providing an overview of the repository.
- **`.gitignore`**: Specifies files to be ignored by Git.

#### `/convex`

Convex-related files for backend database and state synchronization.

- **`_generated/`**: This is code generated by convex. DO NOT TOUCH.
- **`schema.ts`**: Defines the database schema for Convex.
- **`columns.ts,rows.ts,sheets.ts`**: These are tables in the convex DB.
- **`http.ts`**: These are exposed HTTP API endpoints for interacting with convex from outside the React client app.
- **`middleware.ts`**: This contains middleware for the queries/mutations in convex. As of 12/2/2024 the only middleware we have is for API-key based authorization.

#### `/node_modules, /public`

React node modules and the generic react project folders...

#### `src/`

Contains the React app code ie. all the frontend application code.

- `src/components/sidebar/BillingBalance.tsx`: shows the user's remaining billing
  USD balance with a manual refresh option and an inline loading spinner while refreshing,
  separated from profile and settings by an inset divider
  (docs/components/billingBalance.md). The value is fetched via the centralized backend
  client (`useBackendClient.getBillingSummary`), which requests `GET /billing/summary`
  and displays `usd_remaining` formatted as `$0.00`.
  - Trial provisioning: when billing returns 403 and the demo plan hasn't finished provisioning,
    the component uses `useDemoAccountStatus` to suppress the error state, hide the refresh button,
    and display a Tag (`t("billing.trial_account.badge")`, e.g., "Setting up trial account...") in
    place of the dollar amount. When the Tag disappears (provisioning completes), it triggers a
    one-time refresh to fetch the latest balance.
- `src/components/ui/postLogin.tsx`: runs immediately after Clerk establishes a user session
  and now orchestrates the first-login onboarding flow. It provisions the default
  workspace (via Convex), calls the demo plan provisioning helper (which reaches
  the processing backend's `/billing/demo` endpoint), and marks the presentation as
  complete. Progress for each step is persisted inside `unsafeMetadata.onboarding`
  so follow-up logins remain idempotent.
- `src/components/ui/button.tsx`: standardizes all button variants on the medium
  radius (`rounded-md`), even when components previously requested `rounded-none`
  or `shape="square"`, so the UI keeps consistent corners. Outline buttons use
  the shared light-mode `border-shadow` utility from `src/index.css` instead of
  a visible border (dark mode keeps `border-input`) and transition their
  box-shadow for hover depth.
- `src/components/ui/switch.tsx`: applies the same light-mode `border-shadow`
  treatment on the track for depth, while dark mode falls back to the input
  border and keeps the existing focus ring and animation behavior.
- `src/components/ui/dropdown-menu.tsx`: aligns dropdown content, items, and
  triggers with the same medium radius so menus match button styling.
- `src/components/Header.tsx`: renders the view switcher described in
  docs/components/header.md, using softly rounded `Tabs` to toggle between the
  Workflow and Grid routes and keep a disabled Notepad tab in place while the
  rest of the header controls share the medium radius. The active state now
  comes from each trigger (no sliding pill), which keeps the highlight fully
  constrained without any box-shadow artifacts under neighbouring controls.
- `src/components/ui/mentionTextarea.tsx`: exposes a mirrored-overlay textarea that
  highlights tokens (e.g., `@alice`, `#triage`, `{user:123}`) using regexes while the
  real input stays native for caret, IME, and accessibility. The overlay scrolls in
  lock-step with the textarea and can raise `onTrigger` callbacks with caret rects for
  suggestion popovers (docs/components/mentionTextarea.md).
- `src/components/jobs/compactJobCard.tsx`: displays a condensed summary of long-running
  jobs with status badges, progress, metrics, and optional prompt/filter details. The
  attribution chip (`"triggered by …"`) is currently hidden while design settles, so
  only timestamps show in the header until we bring the label back in a future pass.
- `src/components/modalConfig/columnModalConfig/structuredPromptConfig.tsx`: the
  schema tag textarea now compares comma- and newline-delimited input and uses the
  split that yields the most tags, preserving quoted values, and adds an inline
  copy button (visible in the read-only "view prompt" mode) so the normalized list
  is easy to copy with its detected delimiter.
- `src/components/modalConfig/columnModalConfig.tsx`: exposes a
  `PROMPT_VARIANT_MODEL_MAP` that drives which LLM models appear for Ask, Summarize,
  Extract, and related prompt presets. Keep this mapping in sync when adding new
  models or prompt types (see docs/components/columnModalConfig.md).
- `src/components/ModalManager.tsx`: new-project uploads now mark each file as
  completed only after the signed-URL upload resolves, then trigger dataset
  ingestion. Dataset ingestion calls (`/upload_dataset/with_id` and
  `/upload_dataset/with_ids`) run with a short retry backoff on transient
  storage-propagation errors (for example, temporary "not found"/"no such key"
  responses immediately after upload).
- `src/routes/LoginPage.tsx`: wraps Clerk's `<SignIn />` experience in the full-screen
  neutral background used across unauthenticated views and routes users to `/signup`
  when they request a new account.
- `src/routes/SignUpPage.tsx`: mirrors the login styling while wrapping Clerk's
  `<SignUp />` component, and links back to `/login` for returning users.
- `src/services/onboardingService.ts`: exports `useOnboardingService`, which wraps
  the centralized backend client to talk to the billing API (including the
  `/billing/demo` bootstrap), defines the shared onboarding metadata shape used by
  `postLogin.tsx`, and persists the presentation-completion milestone back into the
  active Clerk user when requested.

- `src/routes/BillingPage.tsx`: renders the Billing page. The "Current Subscription" widget
  is powered by `useBillingBalance` and displays plan name, monthly cost (monthly_cost_usd), dollars used,
  and dollars remaining from `GET /billing/summary`. All primary actions in the other
  widgets (plans, credits, payment methods) are currently disabled.
  While data is loading, each field in the Current Subscription widget displays a small spinner.
  The Subscription Plans radio group uses the backend plan id (`basic`, `premium`, `pro`) to select the active plan.
  While loading, the plan radios are disabled and no option is selected; once the billing summary loads, the correct plan is selected automatically.
  For now, secondary outline actions in Current Subscription (e.g., View Usage, View Charges, Set threshold, Adjust top-ups) are also disabled.
  The plans section shows page estimates instead of tokens: Basic ~500 pages/month, Premium ~2500 pages/month, Pro is unlimited.
  The credits section shows deep-search equivalents (e.g., $10 ≈ 4 deep searches, $20 ≈ 8, $50 ≈ 20).
  The usage threshold input shows a muted, semibold `$` symbol with tighter spacing next to the field.
  Error handling: If billing details fail to load, the Current Subscription shows N/A for the plan, and displays a red warning icon (with the same tooltip as the sidebar) next to monthly cost, dollars used, and dollars remaining. The Subscription Plans widget shows an inline error note and the whole widget appears disabled (no selection, radios disabled). During first-login provisioning (detected with `useDemoAccountStatus` + a 403 from billing), both cards switch to an informational callout that says "You are currently on a free trial account," the plan label temporarily reads "Free Trial," and the red error affordances remain hidden until billing is fully configured.
  Spacing: Reduced the page title’s bottom margin, tightened card header-to-content spacing, and halved the gap between widget titles and inline error notes.
  Types: Billing plan validation uses a shared type guard `isBillingPlanId` (see `src/types/types.ts`) instead of inline string comparisons.
  Navigation note: navigating to `/billing` clears any active project selection so
  returning to the workspace rehydrates the default most recent project instead
  of keeping a stale selection. The sidebar logo is now decorative only and no
  longer doubles as a navigation shortcut back to the default project view.
- `src/components/visualQueryBuilder/visualQueryBuilder.tsx`: the AND/OR controls and parenthesis badges reuse the "No filter applied" chip styling with a blue-on-blue palette, and condition chips sit on an orange-50 badge with darker orange operators so the builder UI mirrors the rendered summary. The selection controls for AND/OR/( ) reuse the exact badge classes so in-flight chips and rendered chips are visually identical, pulling their class names from the shared `src/components/visualQueryBuilder/badgeStyles.ts` helper.
- `src/components/visualQueryBuilder/filterDisplay.tsx`: mirrors the badge styling update so saved filter chips show blue badges for AND/OR connectors and orange badges for the condition rows with emphasized operators.

---

# External Dependencies

Here’s an example of how Convex and the GlideApps Grid are used in the application:

### Streaming Data with Convex

We use the `useStreamingData` hook to subscribe to real-time data from the backend:

```javascript
import { useStreamingData } from "./hooks/useStreamingData";

const data = useStreamingData("items");
console.log(data); // Logs the real-time data synced from Convex.
```

### Displaying Data with GlideApps Grid

The `DataGrid` component leverages the GlideApps Grid for rendering tables:

```javascript
import { DataGrid } from "./components/DataGrid";

function App() {
  const rows = [
    { id: 1, name: "Item 1", value: 100 },
    { id: 2, name: "Item 2", value: 200 },
  ];

  const columns = [
    { key: "id", name: "ID" },
    { key: "name", name: "Name" },
    { key: "value", name: "Value" },
  ];

  return <DataGrid rows={rows} columns={columns} />;
}
```

---

### Column Processing Status

- `DataContext` now derives `loadingColumnsSet` from the most recent job per column. Any column whose latest job is `SCHEDULED`, `PENDING`, or `IN_PROGRESS` is flagged as in-flight.
- Prompt pickers, logical filters, and Deep Dive actions consume `loadingColumnsSet` to block user interaction until processing finishes. This replaces the previous cell-state heuristic that checked for loading rows.
- `DataContext` remembers the last project a user opened and restores it when returning from other routes, instead of always snapping back to the first project in the list.
- When adding new column-scope jobs, ensure they set `column_id` so the UI can detect the in-flight state; otherwise the column will appear as ready immediately after dispatch.
- `DataContext` also surfaces `failedColumnsSet` containing any column whose newest job ended in `FAILURE`. The grid swaps the spinner for a muted gray error chip inside affected cells and shows a softened, rounded warning badge in the header until the latest run succeeds.

New Project Uploads (CSV/Parquet/PDF/Audio/XML)

- Invalid file types: When a user drops an unsupported file type into the New Project modal, the file now appears in the file table marked as invalid, and an error message shows: “Invalid file type {{type}}. Please upload a CSV, Parquet, Audio, PDF or XML file.” The message includes the extension detected for quick feedback. This keeps the file table authoritative, even for rejected files.
- Drag-and-drop target: The dropzone now uses a 2px dotted border and renders the `public/file_upload_img.png` illustration as a low-opacity background with a subtle blur at roughly 240px so the upload affordance is clear while keeping the instructions legible without extra iconography.
- Other types: CSV and Parquet use single-file processing; XML and other supported types use multi-ID processing.
- Ask/Summarize flows reuse the column configuration surface and now expose Google Gemini’s `gemini-2.5-flash` model (provider id `google_gemini`) alongside the existing GPT options whenever the prompt type is text generation.

See docs/components/newProjectModal.md for details.

### System Prompt Defaults

The global default system prompt, used when no project- or workflow-specific override is provided, lives in `src/constants.ts`. It now instructs agents to operate in the matrix-based research workspace with strict sourcing, formatting, and failure-handling rules:

```
You are an agent operating inside a matrix-based research workspace. Your job is to help a user or workflow achieve a concrete goal over large, mixed-format corpora while preserving provenance, minimizing hallucinations, and respecting cost/latency constraints. Responses must be succinct, render-able inside a grid cell, and use minimal formatting. Do not use Markdown unless explicitly requested. Do not add prefaces, headings, emojis, or extra whitespace.

Ground all outputs in the provided sources. When you cite or reference, include precise, verifiable anchors (file/URL IDs plus page/time/line ranges) and never fabricate them. If a required fact is missing, do not guess; return "N/A" or null and state what is missing in one short sentence.

Quantify uncertainty and separate facts from hypotheses. Mark inferences as "Inference:" and keep them distinct from sourced facts. Never invent data, quotes, or statistics.

Be frugal with tokens. Compress prompts, reuse caches/embeddings, and restrict context to the smallest necessary spans. Prefer retrieve-then-read over large context stuffing. Avoid reprocessing identical or near-duplicate chunks.

Match the requested format exactly. If structured data is requested, return only well-formed JSON that validates against the given schema; use stable key order, explicit types, and nulls instead of placeholders. Otherwise, write one to three compact sentences. For numeric answers, show the calculation inline with units. When producing code, include a minimal runnable example and state assumptions in one line.

Be strict about output content. Return only what was asked for-no extra commentary. If the user asks for a single token or label (e.g., "yes" or "no"), return only that token. If asked for a list length k, return exactly k items.

Failure handling: if the task cannot be completed with current inputs, say "Insufficient input:" followed by the smallest additional input needed, then stop. Do not propose multiple alternatives unless requested.

Style defaults: clear, specific, terse. Use plain language. Keep internal reasoning private.
```

### Exa Search CSV Naming
Project names and CSV filenames generated from Exa search results are first passed through a stubbed AI helper that will eventually summarize the query, search type, and action type into a concise project name. The base name is sanitized with `sanitizeProjectName`, and the final file name is further normalized with `sanitizeFileName` to ensure safe storage:

- Allowed: letters, numbers, `_`, `-`, `.`
- Disallowed characters (e.g., `< > : " / \ | ? *`) are replaced with `_`
- Collapses repeated `_`, trims leading/trailing `.`, `_`, and spaces
- Preserves a short known extension like `.csv`, and ensures it is the only `.` in the filename
- Removes URL schemes and tokens like `http`, `https` from the name

See `src/utils/projectNameUtils.ts` and `src/utils/fileNameUtils.ts`.

### New Project Modal: Exa Search Controls
- Default tab: The modal opens with the Upload tab selected so teams can immediately add files when creating a new project.
- Primary action button: The footer action switches from **Create** to **Search** whenever the Search tab is active. Pressing **Search** kicks off the Exa request, converts the response to a CSV, and automatically advances into the creation workflow. The inline search button inside the query panel has been removed to keep a single entry point.
- Searching feedback: While Exa is running, the controls show a subtle spinner with "Searching..." and the progress tracker includes a "Searching" step before upload that reports how many results were returned.
- Upload create flow: Clicking **Create** on the Upload tab immediately locks the button into its loading state while the project token request runs, preventing accidental double submissions.
- Search pipeline: The Search tab routes through its own handler before the upload/data warehouse switch, so the upload flow only executes for tabs that actually submit files.
- Number of Results: The number input is constrained to 1–100 (controlled by `EXA_MIN_RESULTS` and `EXA_MAX_RESULTS` constants in `src/components/modalConfig/newProjectModalConfig.tsx`). Using the built‑in stepper buttons or entering a valid number updates the underlying state immediately so searches use the latest value. If the field is temporarily invalid (empty, 0, >100) while typing, the value is clamped back into range on blur.
- Date Range: When the search type is News Article, a date range picker appears; otherwise it is hidden and the range is cleared when switching away from this type.
- Error handling: Convex surface errors from `projects.searchExa` show a full-width warning banner. 4xx responses render the localized "We're working on this as quickly as possible." message, while 5xx responses keep the "There has been an error during the search. Please try again." wording. The raw stack is still logged to the console for debugging.

### User Uploads: Filenames
- All files uploaded via the New Project modal have their filenames sanitized with `sanitizeFileName` before requesting signed upload URLs. This applies to CSV, Parquet, PDF, images, audio, etc.
- CSV/Parquet are recognized as structured data using a robust extension helper that supports multiple dots (e.g., `my.data.snapshot.csv`) and are routed to the structured upload path accordingly.
- This mirrors the Exa-generated filename behavior to avoid invalid object keys and inconsistent download names.

Upload signing/header behavior:
- For CSV/Parquet, the pre-signed upload URL is requested without a content type and the client avoids sending a `Content-Type` header. To prevent the browser from auto-attaching one, the client sends a new `Blob` with an empty type. This avoids signature mismatches on S3/GCS-compatible uploads.

Relevant code:
- `src/components/ModalManager.tsx`: upload flow selects structured path using `getFileExtension` and passes sanitized names to the backend (for both structured and non-structured uploads’ logs/messages).
- `src/hooks/useBackendClient.ts`: signed URL requests always use sanitized filenames; CSV/Parquet checks are case-insensitive.

### Agentic Data Analysis Flow
one of the things that we have in the chat analysis experience is a data analysis agent that actually thinks of and returns a particular step by step workflow to the user that they will have the ability to approve to get startde. once the worflow gets started there is a progress bar that tracks how far the workflow is along.

The way to explain this, is we have several functions that are being used by users in order to transform/analyze their data:
1. add column - where the user creates a particular enrichment
2. add a view - which is creating a filter to limit analsysis to a particular subset of the rows.

basically between these 2 operations is how we're helping the embedded data analyst agent do any and all analysis.

for example, imagine a task for taking 1000s of rows of data and splitting it up into categories. what a data analyst may do is try to do a first pass on all the different categories that they think the data may have and a category called other. the data analysts task is to create the enrichment, then create a view for other, then try and categorize all the further down and then repeat this process until other becomes a very small subset.

now before the agent does that, it needs to show the user what they're going to do and then the user needs to approve it.

the reason its important is twofold - making sure that the user can intervene and correct the process - and then make sure that it is not too costly.

### Processing Flow:

![Diagram 1](diagrams/rendered/diagram_processing/new.png)

## DataChat Flow

The DataChat component streams analysis requests to the `/chat` endpoint using the Vercel AI SDK. A dropdown in the chat UI lets you choose the model (default `gpt-5`), and the selected value is passed through `ChatContext` to the backend. For a detailed overview, see [docs/datachat.md](docs/datachat.md).
If `OPENAI_API_KEY` is not configured in Convex, DataChat input is disabled and the UI shows a warning alert instead.

The footer still shows the Auto Report button so the layout stays consistent with future plans, but the control is now permanently disabled to signal that automated report generation is not available yet.

---

## UI Buttons

We use a shared Button component with variants, sizes, and shape to avoid repeating inline Tailwind across the app. On top of this, we expose two wrappers for consistent actions across modals and the Workflow page:
- PrimaryActionButton: filled brand button (compact, square)
- SecondaryIconButton: outline button with a leading icon (compact, square)

See docs/components/button.md for examples and migration tips.

## Workflow Builder

- The **Export** control now skips the preview modal and immediately downloads the workflow JSON to the browser's downloads folder using a timestamped filename. This keeps the flow fast—no more copy/paste steps before saving the file locally.
- The **Run Views** and **Export Views** actions are temporarily hidden in the UI while the underlying view-specific execution/export flows are revisited.

## Troubleshooting & Performance

- Export Modal: If you notice heavy re-rendering or repeated fetches when opening the Export modal, ensure Convex `useAction` functions are not directly used in `useEffect` dependency arrays. Their identity can change and retrigger effects. We stabilize the action with a ref in `src/components/modalConfig/exportModalConfig.tsx` to prevent re-fetch loops. See `docs/exportModalConfig.md`.
- Grid Scrolling: Avoid pushing high-frequency scroll data (`visibleRegion`) into React state. The grid now tracks it in a ref and performs edge detection (row/column paging) in the scroll callback to prevent full re-renders while scrolling. See `docs/grid.md`.
- Grid Reducer: `useGridReducer` memoizes its returned `actions` so the `Grid` prop reference stays stable and `React.memo` can avoid unnecessary renders.
- Grid Popup UX: Popups now open below the cell when possible (otherwise above), respect a 250px min width and a minimum height, reset to default size on each new cell click, and linkify plain-text URLs. The copy button is icon-only until clicked (shows “Copied!”). See `docs/grid.md`.
- Media Sidebar PDF Previews: When a PDF cell opens the media sidebar, we render a dedicated skeleton while waiting for the download URL and while the iframe finishes loading. This avoids a blank panel during large downloads and keeps layout space consistent. See `src/components/sidebar/SidebarManager.tsx`.
- Mentions Component: The `MentionsComponent` now renders its overlay in a single escaped pass right inside the input handler. This removed the earlier optimistic/slow double render, which eliminated flicker after large pastes and blocks script injection from untrusted text. Dropdown positioning is still event-driven and the read-only prompt view keeps the copy-to-clipboard control. See `docs/components/mentionsComponent.md`.
- Settings Modal: Bring-your-own OpenAI/Fal/Marker API key inputs are temporarily disabled. The previous provider management UI remains commented in `src/components/modalConfig/settingsModalConfig.tsx` for future reactivation; the tabbed navigation is hidden and only the System Prompt configuration is currently rendered.
- Vitest + i18next: When mocking `react-i18next` in unit tests, preserve the real exports (especially `initReactI18next`) by using `importOriginal` and spreading the actual module, then override only `useTranslation`. Example:
  ```ts
  vi.mock("react-i18next", async (importOriginal) => {
    const actual = await importOriginal<typeof import("react-i18next")>();
    return { ...actual, useTranslation: () => ({ t: (k: string) => k }) };
  });
  ```

### Grid Loading/Empty-State UX

To avoid a brief flicker of the empty-state overlay between the skeleton and the fully rendered grid, the row pagination hook exposes granular loading flags:

- `initialLoading`: true until the first page for the current sheet resolves.
- `pageLoading`: true only while additional pages beyond the first are being fetched.
- `loading`: convenience flag (`initialLoading || pageLoading`).

`SheetHandler` now shows the skeleton only during `initialLoading` (or when the sheet row counter is unknown/positive with no rows yet). It does not show the skeleton again while scrolling/paginating. The empty-sheet overlay appears only after the initial load completes and the server-side counter is 0.

### Exa Search
    Number of Results: The numeric input is constrained to 1–100, governed by EXA_MIN_RESULTS and EXA_MAX_RESULTS constants in src/components/modalConfig/newProjectModalConfig.tsx. When users click the built‑in stepper buttons (or type a valid number), the underlying state updates immediately so the search uses the current value. If the entry is temporarily invalid (empty, 0, >100) during typing, it is clamped back into range on blur.
    Search Type: Select between categories like Company, News Article, GitHub, etc. The selected type is used by the server when fetching results.
    Date Range: Visible only for News Article. Changing to another type clears the selected range. Future dates are disabled.
    Clear: Resets the query or URL and clears validation errors.
    Run Search: Disabled if the input is invalid (e.g., empty query or invalid URL) or a search is already running.
    Error handling: Convex error payloads from `projects.searchExa` surface a localized banner that spans the full content width. 4xx responses use the "We're working on this as quickly as possible." copy, and 5xx responses keep the "There has been an error during the search. Please try again." wording. The detailed stack trace still logs to the console for debugging.



# New Project Modal — Upload Flow

Path: `src/components/modalConfig/newProjectModalConfig.tsx`

- Supported types: `.csv`, `.parquet`, `.pdf`, audio (e.g., `.mp3`), and `.xml`.
- File table: The file table shows both accepted and rejected files. Rejected files are displayed with an invalid state and a short reason.
- Dropzone treatment: The drag-and-drop surface now uses a 2px dotted border and layers the `file_upload_img.png` asset (served from `public/`) behind the upload instructions at roughly 240px with a subtle blur so the illustration reads as branding without competing with status changes or error states. The foreground relies solely on copy links (no upload icon) to keep the surface clean.
- The Template selector is currently hidden for all users.

File limits by plan (per upload session)
- Upload selection is constrained by the user's subscription for how many files can be uploaded to a project at a time:
  - Basic/Free: up to 2 files
  - Premium: up to 10 files
  - Pro: unlimited
- If you exceed the allowance, extra files are not dropped — they appear in the list marked as “Over plan limit,” and an orange inline banner explains the per‑plan limit. Remove files to continue.
- Unsupported types are still listed and highlighted independently of the plan limit.

Behavior:

- Invalid file type handling
  - Dropped files with unsupported types are appended to the table as invalid with reason `wrong type`.
  - A localized inline error appears above the dropzone. If a single unsupported type is detected: `Invalid file type {{type}}...`; for multiple, they are listed: `Unsupported file types: {{types}}...`.
  - The file table automatically opens to surface the issue.

- Validation errors style
  - Validation errors in this modal use the same visual treatment as the cost estimation info banner, but in warning orange tones to match the file table’s palette.
  - Implemented via `Alert` + `AlertDescription` from `@/components/ui/alert` with `AlertTriangle` from `lucide-react`, using `border-[#F2C14B]`, `bg-[#FFFBED]`, and icon color `#E9A13B`.

- Upload/processing steps
  - Step 1 — Create Project
    - The step is marked `loading` immediately when submission starts (before token/preflight calls), so the progress tracker does not show an initial pending flash.
    - The loading spinner now animates immediately on mount (no delayed spin class), and while `isLoading` is true the tracker renders directly from live reducer `stepsStatus` to avoid stale pending frames.
  - Step 2 — Upload File(s)
  - Step 3 — Process Data
    - CSV/Parquet use single-file processing.
    - Other supported types use multi-ID processing.
    - For multi-file uploads, each file is marked `completed` only after its signed-URL upload call resolves. Dataset ingestion starts after that upload phase completes.
    - Dataset ingestion retries transient storage-propagation failures (for example temporary `not found` / `no such key` responses) with short backoff delays: 0ms, 500ms, 1000ms, 2000ms.
  - Step 4 — Create Default View
  - Internally each entry is stored as a `Step` with a stable `kind` key (`search`, `createProject`, `upload`, `processData`, or
    `createView`). The reducer uses that key to slot search-driven flows ahead of upload actions while keeping localized labels
    intact.

Implementation notes

- Rejected files are propagated into modal state as `FileWithProgress` with `isInvalid = true` and `invalidReason = "invalid-file-type"` so the file table can render them consistently with other validation errors.
- Text-generation prompts (Ask/Summarize) surface a `Model` select that now includes Google Gemini’s `gemini-2.5-flash` option in addition to the GPT defaults; the choice is respected by both `/process` and `/process/estimate_cost` payloads.
- Progress tracker success states use a higher-contrast emerald gradient check badge with minimal shadow for clearer completion feedback, while preserving the existing `w-5 h-5` icon footprint.
- The loading spinner now renders inside a fixed `w-5 h-5` wrapper and spins with explicit center transform origin to prevent wobble during rotation.

- Localized strings live in `src/locales/en.json` under `modal_manager.new_project_modal_config` and `modal_manager.main`.
- The modal reducer keeps track of `creationFlowType` ("search" vs. "upload") and `searchResultsCount` so downstream consumers
  like adapters and stories can reflect automated search runs without re-implementing state scaffolding.
- New-project reducer state is initialized once per modal entry. While the modal remains open, unrelated context updates (for example saved prompt refreshes) no longer re-run `clearSelection`, which prevents tab flicker back to Search and unexpected clearing of in-progress search input.

Any time an env variable is added, please see to it that a couple of things happen:
1. the env var is checked at startup to see if it is provided. 
2. if the env var is necessary for one of the apps (ie queue_processor, api or workflow_runner), it is also added to the cloudbuild file.

For creating new re-usable libraries, see the cookiecutter_lib folder for templates.

If adding or removing functionality from any of those libraries, please make sure the unit tests are updated. Unit tests usually sit within the module directory.

When adding items to requirements.txt, also make sure to add them to requirements.local.txt.

## Adding a new LLM model provider
When introducing another model provider (for example, Google Gemini) make sure the following areas are covered before shipping:

1. **Model catalogue and pricing** – Extend `LLMModelName` with the new models and update `get_pricing()` so cost estimation keeps working. Both APIs rely on that table when creating jobs and calculating usage (`api/services/create_column.py`, `libs/folio/utils/job_executor/job_types.py`, and `libs/folio/utils/usage_cop/billing_service.py`).【F:libs/folio/utils/shared_types/shared_types.py†L206-L275】【F:api/services/create_column.py†L338-L386】【F:libs/folio/utils/job_executor/job_types.py†L75-L87】 If the provider exposes different input/output billing units, document the conversion in the pricing entry.
2. **Provider identifiers and API keys** – Add the provider slug to `SERVICE_PROVIDER` so API keys can be passed end-to-end, and update any secrets or config blocks that explicitly list `OPENAI_API_KEY` (e.g., the Modal secret definition).【F:libs/folio/utils/shared_types/shared_types.py†L9-L46】【F:modal/main.py†L45-L76】 Make sure new env vars are checked at startup per the guidelines above.
3. **Task typing and prompt compilation** – Introduce a new `SheetTaskType` (or generalize the existing OpenAI one) and make sure every switch that currently routes on `LLM_PROCESSING_WITH_OPENAI` handles the new value (`queue_processor/bg_tasks/*.py`, `modal/main.py`).【F:libs/folio/utils/shared_types/shared_types.py†L347-L376】【F:queue_processor/bg_tasks/spawn_process_task.py†L33-L87】【F:queue_processor/bg_tasks/bg_tasks.py†L288-L344】【F:modal/main.py†L568-L611】 If the provider needs a different request payload, implement a dedicated compiler instead of `convert_*_to_openai_model` and plug it into `LLMProcessingTaskProcessingBackend._compile_prompt`.
4. **Modal execution path** – Add a new Modal function alongside `process_with_openai`, install the provider SDK in the image, and wire it into the backend’s `task_name`. Respect provider throughput by configuring the decorator (`max_containers`, `timeout`, retries) and any rate-limiting logic.
5. **Response parsing and usage accounting** – `LLMProcessingTaskProcessingBackend.get_result_parser()` currently assumes OpenAI’s response schema (`choices[0].message.content`, `usage.prompt_tokens`, etc.). Either extend it to branch on provider or supply a provider-specific parser so we continue emitting `Usage` objects with correct token totals.【F:libs/folio/utils/task_processor/task_processor.py†L360-L455】 Update downstream billing/monitoring if the provider reports different metrics.
6. **Queue monitor & billing events** – `QueueMonitor.flush_and_notify()` stamps provider="openai" when emitting AI usage events. Adjust this so events reflect the new provider and still send correct token counts via `BillingService`.【F:libs/folio/utils/queue_monitor/queue_monitor.py†L231-L287】
7. **Testing & observability** – Mirror or add unit/integration tests for the new provider path (task conversion, parser, billing) and validate logging/alerts reference the correct provider names.

Track these items in code review so future providers can reuse the same checklist.

## What is folio?
folio is an application that builds living, queryable knowledge bases by running parallel research pipelines that continuously retrieve, enrich, verify, and schedule updates across the web and your private sources. more broadly, folio is part of the matrix-based deep/structured research (research ops) market segment, that is defined by a table/matrix ux for parallel retrieval and enrichment, per-value provenance, and always-on monitors that keep artifacts fresh and structured, and caters to the need of ai power users that need repeatable, auditable research over large, fragmented corpora with outputs they can plug into bi, crms, and internal tools. folio helps avoid context length issues, the needle-in-the-haystack problem and stale context and source drift which make using traditional ai chat apps difficult for analyst teams working across huge, ever-changing document sets.

## Architecture of the application
The application consists of 2 backends that have to be kept in sync:
1. The Convex Backend - this is a backend built on top of the Convex DB (convex.dev)
The Convex Backend stores all of the information that is being served up to the customer in the frontend. Because of the streaming/reactive nature of the database, we treat the database as if it's literally sitting on the customer's browser. For example, this is where we store the contents of the spreadsheet.
2. The fastapi backend - this is a backend that right now uses google cloud storage buckets for persisting state.
The fastapi backend is really the engine behind the scenes which receives instructions on what tasks should be sent to a processing backend. The api ingests the instructions for which items should be inputs to tasks by looking at a sql query that comes from the client. Then the api tosses them on a celery queue that fans tasks out and then fans the results in and persists them in a parquet file.

## Libs
The libs are meant to be completely independent from each other. In general, we dont want any circular dependencies and we want to be able to import each libaries independently into jupyter notebooks and playing with them. 

## Conceptual Process
Conceptually, we do a fan-out and then a fan-in of a bunch of tasks. Tasks can be openai processing, pdf document parsing, audio transcription, etc. As of 6/16/25 the backend for actually computing the tasks is modal.

## Integration Tests
### Workflow async e2e with Prefect
`workflow_async_e2e.test.ts` triggers a Prefect deployment that runs outside your local machine. Because of that, the flow cannot call `http://localhost:8000` for `/process` and other API callbacks.

When running this test locally:
1. Expose the local API via localtunnel.
2. Set `API_BASE_URL` in `api/.env.local` to the tunnel URL (for example `https://ready-comics-switch.loca.lt`).
3. Keep `integ_tests/.env` `API_BASE_URL` on `http://localhost:8000` so the test runner still talks directly to your local API.

If this is not set, Prefect flow runs will fail with `ConnectError: [Errno 111] Connection refused`.

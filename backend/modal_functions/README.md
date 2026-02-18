# Modal Playground

This folder contains utilities and notebooks for iterating on the Modal deployment. The snippets below show how to invoke `process_with_gemini` directly and how to peek into the success queue where worker results land.

## Quick Gemini invocation

Save the following snippet as `modal/run_gemini_once.py` (or run it inline with `python - <<'PY' ... PY`). Make sure your `MODAL_TOKEN_ID` / `MODAL_TOKEN_SECRET` are exported, and provide a Gemini API key via `GEMINI_API_KEY` or hard‑code it in the request dict. (For Anthropic calls, swap the function import for `process_with_anthropic`, use `AnthropicTaskProcessingBackend` in the job mapping, and set `ANTHROPIC_API_KEY` instead.)

```python
import os
import modal
from folio.utils.shared_types.shared_types import (
    ConvexInfo,
    DataLakehouseInfo,
    LLMProcessingTaskWithSingleColumnRequest,
)

process_with_gemini = modal.Function.from_name(
    "folio-sheet",
    "process_with_gemini",
    environment_name=os.environ.get("ENV", "dev"),
)

request = LLMProcessingTaskWithSingleColumnRequest(
    convex_info=ConvexInfo(
        convex_project_id="playground-project",
        convex_column_id="col-001",
        convex_row_id="row-001",
        convex_row_order=0,
    ),
    datalakehouse_info=DataLakehouseInfo(
        id=1,
        column_name="gemini_output",
    ),
    job_id="gemini-playground",
    customer_id="demo-customer",
    task={
        "model": "gemini-1.5-flash",
        "system_instruction": "You are a precise analyst.",
        "contents": [
            {
                "role": "user",
                "parts": [
                    {"text": "Summarize this sentence in five words: Modal makes async compute easy."}
                ],
            }
        ],
        # Drop response_schema / response_mime_type if you just want free-form text
        "response_schema": {
            "type": "object",
            "properties": {"summary": {"type": "string"}},
            "required": ["summary"],
        },
        "response_mime_type": "application/json",
    },
    api_keys={
        "google_gemini": os.environ["GEMINI_API_KEY"],
    },
)

result = process_with_gemini.call(request)
print("Gemini response:", result.value)
```

Run it with Modal:

```bash
ENV=dev GEMINI_API_KEY=your-key-here modal run modal_functions/run_gemini_once.py
```

The call returns an `LLMProcessingResult`; `result.value` contains the parsed content (either the JSON that matches the response schema or the raw text fallback).

## Inspecting the success queue

Whenever Modal workers finish processing a row they push an `LLMProcessingResult` onto the job-specific success queue (`{job_id}-successes`). You can inspect it directly without going through the queue monitor:

```python
import os
import modal

ENV_NAME = os.environ.get("ENV", "dev")
JOB_ID = "gemini-playground"  # must match the job id used when spawning work
COLUMN_NAME = "gemini_output"  # partition key is the column name

success_queue = modal.Queue.from_name(
    f"{JOB_ID}-successes",
    create_if_missing=True,
    environment_name=ENV_NAME,
)

partition = COLUMN_NAME
available = success_queue.len(partition=partition)
print(f"Items pending in success queue: {available}")

if available:
    items = success_queue.get_many(available, partition=partition, timeout=5)
    for item in items:
        print("DuckDB id:", item.duck_db_id)
        print("Value:", item.value)
        print("Usage:", item.usage)
        print("---")
```

Handy tips:

- The queue stores real `LLMProcessingResult` instances, so you get both the parsed cell value and the billing metadata (`usage`).
- Use the same `JOB_ID`/`column_name` that the queue processor uses when spawning work. For ad‑hoc calls via `process_with_gemini.call(...)`, the job id is whatever you set on the request object.
- Running this inside `modal shell --env=dev` lets you inspect queues in the same environment the workers use.

## Additional notes

- If you omit `api_keys` in the request, the function falls back to the `GEMINI_API_KEY` secret attached to the Modal app. Passing it inline makes local testing easier without touching secrets.
- Adjust `system_instruction`, `contents`, or the `response_schema` to mirror the prompts sent from the API so the end-to-end conversion matches what the backend compiles.
- For quick iterations, `modal shell` gives you an interactive REPL in the deployed image:

```bash
modal shell --env=dev
>>> from run_gemini_once import request, process_with_gemini
>>> process_with_gemini.call(request)
```

This mirrors exactly what `process_with_gemini` sees in production, letting you confirm payload structure and usage accounting.

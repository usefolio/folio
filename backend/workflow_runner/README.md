## Prefect Setup (Cloud)

This workflow runner is deployed to Prefect Cloud and currently uses:
- deployment name: `data_processing_workflow/workflow_processing_worker`
- work pool: `default-work-pool` (managed)
- code source: GitHub repo `usefolio/folio`, branch `dev` (configured in `deploy.yaml` pull steps)

### 1. Install local tooling

From `backend/workflow_runner` (relative to repo root):

```bash
python3.12 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 2. Authenticate to Prefect Cloud

Use your Prefect API key:

```bash
uvx prefect-cloud login
# or
uvx prefect-cloud login --key <your_prefect_api_key>
```

Confirm workspace:

```bash
uvx prefect-cloud whoami
```

### 3. Connect Prefect Cloud to GitHub repo

The deployment pull step needs Prefect Cloud GitHub access to `usefolio/folio`.

```bash
uvx prefect-cloud github setup
uvx prefect-cloud github ls
uvx prefect-cloud github token usefolio/folio
```

If the token command fails, Prefect Cloud does not yet have access to that repo.

### 4. Deploy workflow runner

From repo root, extract only the required keys from `backend/api/.env.local`, then deploy:

```bash
FOLIO_API_KEY=$(awk -F= '/^FOLIO_API_KEY=/{print $2}' backend/api/.env.local)
CONVEX_HTTP_CLIENT_API_KEY=$(awk -F= '/^CONVEX_HTTP_CLIENT_API_KEY=/{print $2}' backend/api/.env.local)
cd backend/workflow_runner
prefect deploy --prefect-file deploy.yaml \
  --job-variable "{\"env\":{\"FOLIO_API_KEY\":\"$FOLIO_API_KEY\",\"CONVEX_HTTP_CLIENT_API_KEY\":\"$CONVEX_HTTP_CLIENT_API_KEY\"}}"
```

Verify deployment:

```bash
prefect deployment inspect data_processing_workflow/workflow_processing_worker
```

### 5. Run and verify

```bash
prefect deployment run data_processing_workflow/workflow_processing_worker --watch
prefect flow-run ls
```

If a run crashes during pull/setup, inspect logs:

```bash
prefect flow-run logs <flow_run_id>
```

### 6. Point API to deployed workflow

The API chooses Prefect deployment by `PREFECT_DEPLOYMENT_ID` (not by worker name).

Update:
- local: `backend/api/.env.local`

Then restart/redeploy the API so the new env var is applied.

## Runtime model

- `deploy.yaml` is deployment metadata.
- In managed pools, each flow run starts in a remote runtime image.
- `pull_steps` fetch code and set working directory before loading `entrypoint`.
- Do not use machine-specific absolute paths in managed pool pull steps.

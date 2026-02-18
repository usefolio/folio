## Module Coverage Summary

| Module | Coverage Badge | Description |
|--------|---------------|-------------|
| data_lakehouse | ![Coverage](./coverage/data_lakehouse/badge.svg) | Data warehouse for querying custom parquet files|
| queue_monitor | ![Coverage](./coverage/queue_monitor/badge.svg) | Monitoring system for functions results (ie after invoking a Faas backend) |
| dataset_processor | ![Coverage](./coverage/dataset_processor/badge.svg) | System for creating datasets that get persisted in parquet (queried with data_lakehouse) |
| cell_states | ![Coverage](./coverage/cell_states/badge.svg) | Module for communicating the state of a bunch of cells in a spreadsheet in a very efficient way (ie binary arrays) |
| usage_cop | ![Coverage](./coverage/usage_cop/badge.svg) | Usage tracking and billing system with event aggregation for billing calculations |



## Setup

python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install tools for local dev
```
pip install honcho cookiecutter
```

### locally you run
```
cd api && pip install -r requirements.local.txt
cd queue_processor && pip install -r requirements.local.txt
```

You may ask why, and that is because the requirements.txt file is being used by the cloudbuild.yaml file to install the dependencies in the cloud.
More specifically, we are using buildpacks to build the image and buildpacks is not able to look up dependencies like ../libs. It's a security feature.
So when building the project, we copy ../libs into the api folder and then run the buildpacks pack command in there with the requirements.txt file referencing the ./libs folder.
On the other hand, locally we have to use ../libs because thats the directory structure.

### setting up local .env
Copy the sample environment file and fill in your values:
```bash
cp .env.sample api/.env.local
cp .env.sample queue_processor/.env.local
```

Then edit both files to add your actual keys and values. You can also get the complete environment from:
```
gcloud secrets versions access latest --secret=folio-sheet-server-local-env
```

### Configure GCS bucket CORS (required for browser uploads)
Set CORS on your storage bucket before running hosted flows that upload directly from the frontend.

```bash
gsutil cors set cors_config_prod.json gs://<name_of_your_bucket>
```

For non-production/local testing against preview domains, you can use:

```bash
gsutil cors set cors_config_dev.json gs://<name_of_your_bucket>
```

### Running the API
When running the api you want to do run:
```
cd api
honcho start --env .env.local
```

where .env.local is a file that contains the following:
```
CLERK_SECRET_KEY=<clerk_secret_key>
FOLIO_API_KEY=system_key
MODAL_TOKEN_ID=token_id
MODAL_TOKEN_SECRET=token_secret
CONVEX_HTTP_CLIENT_API_KEY=xxx
# For background tasks
REDIS_URL=redis://127.0.0.1:6379/0
PORT=8000
TEST_FOLIO_SHEET_CONFIG={...} # this is the google cloud config for the storage bucket
FLOWER_UNAUTHENTICATED_API=true
PYTHONPATH="${PYTHONPATH}:../libs:../queue_processor"
```

Requests can bypass Clerk authentication by including an `X-System-Key` header
whose value matches `FOLIO_API_KEY`.

### Running the Queue Processor

#### First and foremost install redis
1. Run the setup script to install Redis:
   ```bash
   chmod +x setup.sh
   ./setup.sh


#### Running the application
When running the queue processor you want to do run:
```
cd queue_processor
pip install -r requirements.local.txt
```

then you want to make sure redis is running:
```   
redis-server --daemonize yes
```

then you want to run the queue processor:
```
honcho start --env .env.local
```

finally, for the env file you want something similar to the above.

### Running with Docker
You can build and run the API using Docker. First create an environment file (e.g. `api/.env.local`) with the variables listed above. Then build and run the image:

```bash
docker build -f Dockerfile.api -t folio-sheet-api .
docker run --env-file api/.env.local -p 8000:8000 folio-sheet-api
```

Alternatively, use Docker Compose to run the API alongside Redis:

```bash
docker-compose up --build
```

## Running integration tests

The integration tests live in `./integ_tests` and are executed automatically in
GitHub Actions for pull requests targeting `main`. The workflow sets the
following environment variables so the tests run against the development
environment:

```
TEST_USER_TOKEN=<dev token>
TEST_USER_ID=<dev user id>
CONVEX_URL=https://rapid-egret-993.convex.site
CONVEX_HTTP_CLIENT_API_KEY=<convex_http_client_api_key>
FOLIO_API_KEY=<system-level-api-key>
API_BASE_URL=http://localhost:8000
```

To run them locally:
```
cd integ_tests/
npm install
export TEST_USER_TOKEN=...     # as above
export TEST_USER_ID=...
export CONVEX_URL=https://rapid-egret-993.convex.site
export CONVEX_HTTP_CLIENT_API_KEY=<convex_http_client_api_key>
export FOLIO_API_KEY=...
export API_BASE_URL=http://localhost:8000
npx jest <test>
```

## Running unit tests
The `run_tests.sh` script creates an isolated virtual environment
(`test-venv`) on the first run and installs the test dependencies for each
module. Simply execute:
```
./run_tests.sh all
```

### Deploying changes to modal
Any time files inside `backend/modal_functions` change, deploy from that directory with:

```bash
PYTHONPATH=${PYTHONPATH}:../libs modal deploy main.py --env=prod --name="folio-sheet"
```

Before deploying, make sure the following are available:
- Modal access env vars are exported in your shell: `MODAL_TOKEN_ID` and `MODAL_TOKEN_SECRET`.
- Modal secret `googlecloud-secret` exists in the target Modal environment (`prod`) with the required keys from `main.py`: `GOOGLE_ACCESS_KEY_ID`, `GOOGLE_ACCESS_KEY_SECRET`, `BUCKET_NAME`, `GOOGLE_SERVICE_ACCOUNT_JSON`, `OPENAI_API_KEY`, `MARKER_API_KEY`, `FAL_KEY`, `GEMINI_API_KEY`, and `ANTHROPIC_API_KEY`.
- Keep `--name="folio-sheet"` unchanged, since backend invocations look up functions by that app name.

### Naming during deploy (folio migration)
- Public app name is `folio` and the Modal app name is `folio-sheet`.
- API auth expects `FOLIO_API_KEY`.
- Cloud Build passes `FOLIO_API_KEY` to the deployed services.
- Modal clients in the backend use `folio-sheet`.

### Validating the build script
to validate the cloudbuild.yaml file locally:
gcloud components install cloud-build-local
cloud-build-local --config=cloudbuild.yaml --dryrun=false .

OR 
gcloud builds submit --config=cloudbuild.yaml --dry-run

### Bootstrap storage prerequisites (required before trigger creation)

```bash
cp backend/scripts/cloudbuild.trigger.vars.example /tmp/cloudbuild.trigger.vars

python3 backend/scripts/bootstrap_storage.py \
  --project sget-ai \
  --bucket your-private-bucket-name \
  --location us-central1 \
  --vars-file /tmp/cloudbuild.trigger.vars
```

The storage bootstrap script does all of this before the trigger is created:
- creates the bucket if needed and enforces private access (`uniform bucket-level access` + `public access prevention=enforced`)
- creates/uses a service account for bucket access
- creates a new HMAC access key + secret for `GOOGLE_ACCESS_KEY_ID/GOOGLE_ACCESS_KEY_SECRET`
- creates a new service account JSON key, base64-encodes it, and writes `_GOOGLE_SERVICE_ACCOUNT_JSON`

After that, edit `/tmp/cloudbuild.trigger.vars` and fill remaining `replace_me` values.
Typical remaining values are:
- `_CLERK_SECRET_KEY`
- `_CONVEX_HTTP_CLIENT_API_KEY`
- `_FAL_KEY`
- `_FOLIO_API_KEY`
- `_METRONOME_API_TOKEN`
- `_MODAL_TOKEN_ID`
- `_MODAL_TOKEN_SECRET`
- `_PREFECT_API_KEY`
- `_PREFECT_API_URL`
- `_PREFECT_DEPLOYMENT_ID`

### Create/update Cloud Build trigger (CLI, no UI)


```bash
python3 backend/scripts/deploy_cloudbuild_trigger.py --project sget-ai --vars-file /tmp/cloudbuild.trigger.vars
```

Prerequisites:
- Cloud Build API enabled in your GCP project
- GitHub repository mapping connected for that project/repo
- If your org enforces BYOSA for Cloud Build, pass `--service-account ...`

### Deployment TODOs (manual for now)
- TODO: bucket/bootstrap is not done by `backend/cloudbuild.yaml` yet. Storage bucket creation + storage credentials bootstrap is still a manual pre-step via `backend/scripts/bootstrap_storage.py`.
- TODO: Prefect resources provisioning is not automated yet (workspace resources/blocks/deployment prerequisites are still manual setup).
- TODO: Prefect deployment updates are still manual. Run `uvx prefect-cloud deploy ...` when workflow definitions change.

## Creating new modules in lib

```
pip install cookiecutter
cookiecutter cookiecutter_lib --output-dir libs/folio/utils
```


### Architecture

## Data Lakehouse
The data lakehouse is supposed to be class that helps with giving duckdb enough context to query parquet files. the in memory data lakehouse is there in case we have all the parquet files loaded up in memory. the out of memory data lakehouse is there in case we need to query files located remotely (using remote functions like modal). files are all stored in google cloud storage and here is one way to query them in modal(first mounting the dir):

```python
@app.function(
    volumes={
        "/mnt": modal.CloudBucketMount(
            bucket_name=f"foliosheet{os.environ['MODAL_ENVIRONMENT']}",
            bucket_endpoint_url="https://storage.googleapis.com/",
            secret=gcp_hmac_secret,
        )
    }
)
def query(convex_project_id, text):
    mount_dir = "/mnt/{convex_project_id}/"

    # Connect to DuckDB (in-memory database or specify a file if needed)
    conn = duckdb.connect()
    result = conn.execute(f"{text}").fetchall()
    return result
```

The primary use of the data lakehouse is to garner all the context relevant for a query. for example, when a user wants to run a query against all the parquet files in a certain "project" then the data lakehouse knows how to pull the items given the internal structure (ie project_id/column_name/date/*.parquet). If the files are all loaded up into memory, it basically keeps track of which file has and has not been loaded into memory. 

## Misc

### Adding ENV vars
Any time an env var is added, we actually need to make sure that a couple of things are happening:
1. ENV var must be marked as required in api/dependencies.py - if it is indeed required
2. It must be added to cloudbuild.yaml if these need to be passed along to the binaries/containers
3. ENV vars must be added to Google Cloud Build Triggers so that they are replaced during the build process (both dev and prod env)
4. ENV vars must be provided as secrets for the Github Workflows that are building the app and then running integ tests against it.

### Installing uv
```
curl -LsSf https://astral.sh/uv/install.sh | sh
```

### Login to Prefect
```
uvx prefect-cloud login 
```

which will return something like
```
prefect cloud login --key pnu_Jxxxxxxxxxxxx
```

but you have to run it like
```
uvx prefect-cloud login --key pnu_Jxxxxxxxxxxxx
```

### Authorizing to pull from github
```
uvx prefect-cloud github setup
```

### Deploying to prefect (manual for now)
```
uvx prefect-cloud deploy workflow_runner/test_flow.py:data_processing_workflow \
--name pause_resume_demo \
--from https://github.com/usefolio/folio
```

### Running flow
```
uvx prefect-cloud run data_processing_workflow/pause_resume_demo
```

## Docker Alternative Setup

If you prefer to run the application using Docker, you can use the containerized setup which runs both the API server and background queue processor together.

### Environment Setup for Docker
Create a Docker-compatible environment file:
```bash
# Run the setup script to create .env.docker
./setup-docker-env.sh

# Edit .env.docker and replace placeholder values with your actual credentials
```

### Running with Docker Compose
```bash
# Build and start all services (API + Queue Processor + Redis)
docker compose up --build -d

# Check that services are running
docker ps

# View logs
docker compose logs -f

# Stop services
docker compose down
```

This starts:
- **API Server**: http://localhost:8000 
- **Queue Processor**: Background Celery worker 
- **Flower UI**: http://localhost:5555 (Celery monitoring)
- **Redis**: localhost:6379

### Running Integration Tests Against Docker
```bash
cd integ_tests
export $(cat .env | xargs)
npm test
```

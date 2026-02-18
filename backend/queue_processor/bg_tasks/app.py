import os
from celery import Celery

# Required GCS credentials for usage_cop and storage backend access
REQUIRED_ENV_VARS = [
    "GOOGLE_SERVICE_ACCOUNT_JSON",
    "GOOGLE_ACCESS_KEY_ID",
    "GOOGLE_ACCESS_KEY_SECRET",
]


def _require_env_vars():
    missing = [k for k in REQUIRED_ENV_VARS if not os.getenv(k)]
    if missing:
        # Fail fast so misconfigurations are visible at startup
        raise RuntimeError(
            "Missing required environment variables for queue_processor: "
            + ", ".join(missing)
        )


# Validate env at import/startup
_require_env_vars()

# Queue processor doesn't need METRONOME_API_TOKEN – usage tracking happens in modal/monitor

# Use REDIS_URL environment variable or fallback to localhost
redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")

# Replace 'your_project_name' with your app name
celery_app = Celery(
    "folio-sheet-server",
    broker=redis_url,
    backend=redis_url,
)

# Configure additional Celery settings
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    result_backend_transport_options={
        "socket_timeout": 30,
        "socket_connect_timeout": 30,
        "retry_on_timeout": True,
        "max_connections": 20,
    },
)

celery_app.conf.broker_transport_options = {
    "socket_timeout": 10,
    "socket_connect_timeout": 10, 
    "retry_on_timeout": True,
    "max_connections": 10,  # Limit broker connections
}

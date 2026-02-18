from fastapi.middleware.cors import CORSMiddleware
from fastapi import FastAPI, Request, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
import logging
from folio.utils.data_lakehouse.data_lakehouse import DuckDbQueryExecutionError

from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

from routers.process_data import router as process_data_router
from routers.create_view import router as create_view_router
from routers.compact import router as compact_router
from routers.upload_dataset import router as upload_dataset_router
from routers.update_column_in_datalake import (
    router as update_column_in_datalake_router,
)
from routers.asset_storage import router as asset_storage_router
from routers.export_dataset import router as export_dataset_router
from routers.run_workflow import router as run_workflow_router
from routers.columns import router as columns_router
from routers.billing import router as billing_router

from dependencies import startup_event, shutdown_event

logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI()
FastAPIInstrumentor.instrument_app(app)

app.include_router(process_data_router)
app.include_router(create_view_router)
app.include_router(compact_router)
app.include_router(upload_dataset_router)
app.include_router(update_column_in_datalake_router)
app.include_router(asset_storage_router)
app.include_router(export_dataset_router)
app.include_router(run_workflow_router)
app.include_router(columns_router)
app.include_router(billing_router)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register startup and shutdown events
app.add_event_handler("startup", startup_event(app))
app.add_event_handler("shutdown", shutdown_event(app))


@app.exception_handler(Exception)
async def custom_exception_handler(request: Request, exc: Exception):
    logger.exception("Inbound error on %s", request.url.path)
    return JSONResponse(
        status_code=500,
        content={
            "error": exc.__class__.__name__,
            "detail": str(exc),
        },
        headers={
            # Replace with specific origins in production
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "*",
            "Access-Control-Allow-Headers": "*",
        },
    )


@app.exception_handler(DuckDbQueryExecutionError)
async def duckdb_query_exception_handler(
    request: Request, exc: DuckDbQueryExecutionError
):
    logger.error("Inbound DuckDB error on %s: %s", request.url.path, exc)
    detail = {
        "code": exc.error_code,
        "message": str(exc),
    }
    if exc.error_type:
        detail["duckdb_error_type"] = exc.error_type

    return JSONResponse(
        status_code=500,
        content={
            "error": exc.__class__.__name__,
            "detail": detail,
        },
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "*",
            "Access-Control-Allow-Headers": "*",
            "X-Error-Code": exc.error_code,
        },
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    logger.error("Inbound HTTP error on %s: %s", request.url.path, exc.detail)
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": exc.__class__.__name__,
            "detail": exc.detail,
        },
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "*",
            "Access-Control-Allow-Headers": "*",
            **(exc.headers or {}),
        },
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    logger.error("Inbound validation error on %s: %s", request.url.path, exc.errors())
    return JSONResponse(
        status_code=422,
        content={
            "error": exc.__class__.__name__,
            "detail": exc.errors(),
        },
    )


@app.get("/")
async def root():
    return {"message": "Hello World"}


@app.get("/health")
async def health_check():
    return {"status": "ok"}

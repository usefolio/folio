import os
import json
from typing import List, Dict, Any, Optional

from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel, ValidationError

from dependencies import (
    WORKFLOW_ID_HEADER,
    _resolve_workflow_user_id,
    verify_token,
    get_storage_helper,
)
from folio.utils.workflow_tools import (
    parse_json_file_to_literal_workflow,
    load_workflow_template_from_json,
    WorkflowTemplateWithPlaceholderRef,
)
from folio.utils.storage_backend.storage_backend import GCSStorageBackend
from folio.utils.storage_helper.gcs_helper import GoogleCloudStorageHelper
from folio.utils.shared_types.shared_types import (
    DataProcessingWorkflowParams,
    DataProcessingWorkflowType,
)
from services.workflow_service import (
    get_workflow_auth_context,
    store_workflow_auth_context,
)
from prefect.deployments import run_deployment
from routers.create_view import ViewCreationRequest
from routers.process_data import ProcessRequest

router = APIRouter(prefix="/run_workflow", tags=["workflow"])


class RequestItem(BaseModel):
    timestamp: str
    path: str
    request_data: Dict[str, Any]


class WorkflowInput(BaseModel):
    requests: List[RequestItem]
    workflow_type: DataProcessingWorkflowType  # "literal" or "template"
    callback_url: Optional[str] = None  # Optional, used for lower environments


class WorkflowRunResponse(BaseModel):
    workflow_id: str
    step_results: List[Dict[str, Any]]


def _validate_requests(requests: List[RequestItem]) -> None:
    """Validate each request item against the actual route models."""
    for idx, req in enumerate(requests):
        path = req.path or ""
        data = req.request_data

        try:
            if "/create_view" in path:
                ViewCreationRequest.model_validate(data)
            elif "/process" in path:
                ProcessRequest.model_validate(data)
            else:
                raise ValueError(f"Unknown path: {path}")
        except ValidationError as e:
            raise ValueError(
                f"Validation error for request #{idx + 1} (path: '{path}'): {e}"
            ) from e


@router.post("", response_model=WorkflowRunResponse)
async def run_workflow(
    body: WorkflowInput,
    request: Request,
    authorized: bool = Depends(verify_token),
    gcs_helper: GoogleCloudStorageHelper = Depends(get_storage_helper),
) -> WorkflowRunResponse:
    """Execute a workflow consisting of /create_view and /process calls."""
    if not authorized:
        raise HTTPException(status_code=401, detail="Unauthorized")

    initiating_user_id = getattr(request.state, "user_id", None)
    workflow_storage = GCSStorageBackend(gcs_helper)

    if initiating_user_id == "system_api_key":
        initiating_user_id = _resolve_workflow_user_id(request)
        if not initiating_user_id:
            raise HTTPException(
                status_code=401,
                detail=(
                    "System-key workflow calls must resolve to a user from "
                    "workflow auth context."
                ),
            )

    if not initiating_user_id:
        raise HTTPException(status_code=401, detail="Unable to resolve workflow user")

    authorization_header = request.headers.get("Authorization")
    if not authorization_header:
        parent_workflow_id = request.headers.get(WORKFLOW_ID_HEADER)
        if parent_workflow_id:
            parent_auth_context = get_workflow_auth_context(
                parent_workflow_id, workflow_storage
            )
            if parent_auth_context:
                authorization_header = parent_auth_context.get("authorization_header")

    if not authorization_header:
        raise HTTPException(
            status_code=401,
            detail=(
                "Missing Authorization header for workflow run. "
                "Workflow execution requires bearer auth context."
            ),
        )

    json_obj = json.dumps({"requests": [r.model_dump() for r in body.requests]})

    try:
        if body.workflow_type == DataProcessingWorkflowType.LITERAL:
            parse_json_file_to_literal_workflow(json_obj)
        elif body.workflow_type == DataProcessingWorkflowType.TEMPLATE:
            load_workflow_template_from_json(
                json_obj, WorkflowTemplateWithPlaceholderRef
            )
        else:
            raise ValueError("Invalid workflow type provided")
        _validate_requests(body.requests)
    except ValueError as e:
        # Couldnt convert JSON to literal workflow
        raise HTTPException(status_code=400, detail=str(e)) from e

    params = DataProcessingWorkflowParams(
        template=json_obj,
        base_url=os.environ.get("API_BASE_URL", "http://127.0.0.1:8000"),
        workflow_type=body.workflow_type,
        user_id=initiating_user_id,
        convex_url=body.callback_url,
    )

    flow_run = await run_deployment(
        os.environ.get("PREFECT_DEPLOYMENT_ID"),
        parameters={**params.__dict__},
        tags=[body.workflow_type],
        timeout=0,
    )

    store_workflow_auth_context(
        workflow_id=str(flow_run.id),
        user_id=initiating_user_id,
        authorization_header=authorization_header,
        storage_backend=workflow_storage,
    )

    return WorkflowRunResponse(workflow_id=str(flow_run.id), step_results=[])

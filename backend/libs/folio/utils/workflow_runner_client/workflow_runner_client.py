from abc import ABC, abstractmethod
from typing import Dict, Any


from prefect import get_client
from prefect.client.schemas import StateCreate, StateType


class WorkflowRunnerException(Exception):
    """Base exception for workflow runner errors."""


class WorkflowNotFound(WorkflowRunnerException):
    """Exception raised when a workflow ID doesn't exist."""


class WorkflowNotPaused(WorkflowRunnerException):
    """Exception raised when attempting to resume a workflow that isn't paused."""


class WorkflowRunnerClient(ABC):
    """Interface for workflow orchestration system clients."""

    @abstractmethod
    async def exists(self, workflow_id: str) -> bool:
        """
        Check if a workflow with the given ID exists.

        Args:
            workflow_id: The ID of the workflow to check

        Returns:
            bool: True if the workflow exists, False otherwise
        """

    @abstractmethod
    async def is_paused(self, workflow_id: str) -> bool:
        """
        Check if a workflow is in a paused state.

        Args:
            workflow_id: The ID of the workflow to check

        Returns:
            bool: True if the workflow is paused, False otherwise

        Raises:
            WorkflowNotFound: If the workflow doesn't exist
        """

    @abstractmethod
    async def resume(self, workflow_id: str) -> bool:
        """
        Resume a paused workflow.

        Args:
            workflow_id: The ID of the workflow to resume

        Returns:
            bool: True if the workflow was successfully resumed

        Raises:
            WorkflowNotFound: If the workflow doesn't exist
            WorkflowNotPaused: If the workflow is not in a paused state
        """

    @abstractmethod
    async def set_failed(self, workflow_id: str, error_message: str = None) -> bool:
        """
        Mark a workflow as failed.

        Args:
            workflow_id: The ID of the workflow to fail
            error_message: Optional error message explaining the failure

        Returns:
            bool: True if the workflow was successfully marked as failed

        Raises:
            WorkflowNotFound: If the workflow doesn't exist
        """

    @abstractmethod
    async def set_metadata(self, workflow_id: str, metadata: Dict[str, Any]) -> bool:
        """
        Set metadata on a workflow.

        Args:
            workflow_id: The ID of the workflow
            metadata: Dictionary of metadata to set

        Returns:
            bool: True if the metadata was successfully set

        Raises:
            WorkflowNotFound: If the workflow doesn't exist
        """


class PrefectWorkflowRunnerClient(WorkflowRunnerClient):
    """Implementation of WorkflowRunnerClient using the official Prefect client."""

    def __init__(self, prefect_api_url: str):
        """
        Initialize the Prefect client. Expects PREFECT_API_URL to be set in the environment.

        Args:
            prefect_api_url: Optional URL for the Prefect API. If None, uses the PREFECT_API_URL env var.
        """

        if prefect_api_url is None:
            raise ValueError("prefect_api_url cannot be None")

    async def exists(self, workflow_id: str) -> bool:
        """
        Check if a flow run exists.

        Args:
            workflow_id: Flow run ID

        Returns:
            bool: True if the flow run exists, False otherwise
        """
        try:
            async with get_client() as client:
                await client.read_flow_run(workflow_id)
                return True
        except Exception:
            return False

    async def is_paused(self, workflow_id: str) -> bool:
        """
        Check if a flow run is in a paused state.

        Args:
            workflow_id: Flow run ID

        Returns:
            bool: True if the flow run is paused, False otherwise

        Raises:
            WorkflowNotFound: If the flow run doesn't exist
        """
        try:
            async with get_client() as client:
                flow_run = await client.read_flow_run(workflow_id)
                # Check if the state type is PAUSED
                return flow_run.state.type == StateType.PAUSED
        except Exception as e:
            raise WorkflowNotFound(f"Flow run not found: {workflow_id}") from e

    async def resume(self, workflow_id: str) -> bool:
        """
        Resume a paused flow run.

        Args:
            workflow_id: Flow run ID

        Returns:
            bool: True if the flow run was successfully resumed

        Raises:
            WorkflowNotFound: If the flow run doesn't exist
            WorkflowNotPaused: If the flow run is not in a paused state
        """
        try:
            # First check if the flow run is paused
            if not await self.is_paused(workflow_id):
                raise WorkflowNotPaused(
                    f"Flow run {workflow_id} is not in a paused state"
                )

            async with get_client() as client:
                await client.resume_flow_run(flow_run_id=workflow_id)
                return True
        except WorkflowNotFound:
            raise
        except WorkflowNotPaused:
            raise
        except Exception as e:
            raise WorkflowRunnerException(f"Failed to resume flow run: {e}") from e

    async def set_failed(self, workflow_id: str, error_message: str = None) -> bool:
        """
        Mark a flow run as failed.

        Args:
            workflow_id: Flow run ID
            error_message: Optional error message

        Returns:
            bool: True if the flow run was successfully marked as failed

        Raises:
            WorkflowNotFound: If the flow run doesn't exist
        """
        try:
            async with get_client() as client:
                # Create a failed state
                state = StateCreate(
                    type=StateType.FAILED,
                    message=error_message
                    or "Flow run failed due to an upstream task failure",
                )

                # Set the flow run state
                await client.set_flow_run_state(flow_run_id=workflow_id, state=state)
                return True
        except Exception as e:
            if "flow run not found" in str(e).lower():
                raise WorkflowNotFound(f"Flow run not found: {workflow_id}") from e
            raise WorkflowRunnerException(f"Failed to set flow run state: {e}") from e

    async def set_metadata(self, workflow_id: str, metadata: Dict[str, Any]) -> bool:
        """
        Set metadata on a flow run.

        Args:
            workflow_id: Flow run ID
            metadata: Dictionary of metadata to set

        Returns:
            bool: True if the metadata was successfully set

        Raises:
            WorkflowNotFound: If the flow run doesn't exist
        """
        try:
            async with get_client() as client:
                # Read the current flow run
                flow_run = await client.read_flow_run(workflow_id)

                update_data = {}

                # Handle other metadata
                if metadata:
                    # If the flow run already has metadata, merge with new metadata
                    existing_metadata = flow_run.metadata or {}
                    update_data["metadata"] = {**existing_metadata, **metadata}

                # Update the flow run if we have data to update
                if update_data:
                    await client.update_flow_run(flow_run_id=workflow_id, **update_data)

                return True
        except Exception as e:
            if "flow run not found" in str(e).lower():
                raise WorkflowNotFound(f"Flow run not found: {workflow_id}") from e
            raise WorkflowRunnerException(f"Failed to set metadata: {e}") from e

from prefect import flow, task
import httpx
import logging

logger = logging.getLogger(__name__)

# Suppose you already have this placeholder-based workflow object
# (e.g. loaded from JSON or returned by some function).
# It's of type WorkflowTemplateWithPlaceholderRef and includes one or more steps
# where fields like 'convex_project_id' are placeholders instead of literal strings.
placeholder_workflow = ...  # e.g. from load_workflow_template_from_json_file(...)


@task
def substitute_placeholder_values(placeholder_wf, subs):
    """
    Turns a placeholder-ref workflow into a literal workflow
    by injecting the real IDs or tokens into the designated fields.
    """
    from your_module import convert_placeholder_wf_to_literal

    literal_wf = convert_placeholder_wf_to_literal(placeholder_wf, subs)
    logger.info("Substituted placeholders -> literal workflow: %s", literal_wf)
    return literal_wf


@task
def execute_workflow_steps(literal_wf):
    """
    Given a 'literal' workflow with no placeholders,
    execute each step by posting to the relevant endpoint.
    """
    for step in literal_wf.steps:
        if step.action == "create_view":
            endpoint_url = "https://your-endpoint/create_view"
        else:  # step.action == "process"
            endpoint_url = "https://your-endpoint/process"

        # step.payload is a Pydantic object; convert it to dict for httpx
        data = step.payload.model_dump()
        resp = httpx.post(endpoint_url, json=data)
        resp.raise_for_status()
        logger.info(
            "Executed step %s => %s with status %s",
            step.id,
            endpoint_url,
            resp.status_code,
        )


@flow
def run_placeholder_workflow():
    """
    Main flow:
    1) Provide real IDs to fill placeholders
    2) Execute the resulting literal steps
    """

    # You might compute or fetch these IDs at runtime
    real_values = {
        "convex_project_id": "my-actual-project-id",
        "convex_sheet_id": "sheet-123",
        "convex_column_id": "col-987",
    }

    # 1) Substitute placeholders with real values
    literal_wf = substitute_placeholder_values(placeholder_workflow, real_values)

    # 2) Execute each step in the newly resolved workflow
    execute_workflow_steps(literal_wf)


if __name__ == "__main__":
    run_placeholder_workflow()

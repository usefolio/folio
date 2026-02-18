from typing import Any, Dict, List, Optional, Union, TypeVar, Type
from pydantic import (
    BaseModel,
    Field,
    model_validator,
    model_serializer,
    ValidationError,
)
from enum import Enum
import re
import json
from pathlib import Path
import logging

logger = logging.getLogger(__name__)
import uuid
from jinja2 import Template


# Re-use existing FastAPI models
# TODO: Import these from the real place
class ViewCreationRequest(BaseModel):
    convex_project_id: str
    convex_sheet_id: str
    sql_filter: str
    callback_url: Optional[str] = None


class ProcessRequest(BaseModel):
    convex_project_id: str
    convex_column_id: str
    column_name: str
    # For brevity, just a dict – you might have your real prompt model
    prompt: dict
    sql_condition: Optional[str] = None
    output_name: str
    prompt_input_columns: Optional[List[str]] = Field(default=[])
    workflow_id: Optional[str] = None
    callback_url: Optional[str] = None


class StepAction(str, Enum):
    CREATE_VIEW = "create_view"
    PROCESS = "process"


class WorkflowStepWithLiteralStrings(BaseModel):
    """
    A step that uses literal strings for the payload
    (the same shape as existing /create_view and /process http requests).

    This is contrast to WorkflowStepWithPlaceholderRef which usese jinja
    replaceable variables.
    """

    id: str
    action: StepAction
    payload: Union[ViewCreationRequest, ProcessRequest]
    title: Optional[str] = None
    description: Optional[str] = None
    depends_on: List[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def check_payload_matches_action(self):
        # Validate that if action == create_view, payload is a ViewCreationRequest, etc.
        if self.action == StepAction.CREATE_VIEW and not isinstance(
            self.payload, ViewCreationRequest
        ):
            raise ValueError("payload must be ViewCreationRequest for create_view")
        if self.action == StepAction.PROCESS and not isinstance(
            self.payload, ProcessRequest
        ):
            raise ValueError("payload must be ProcessRequest for process")
        return self


class WorkflowTemplateWithLiteralStrings(BaseModel):
    """
    This is what you get after parsing all.http
    (example file name only; create/provide the .http file before parsing)
    (no placeholders in these fields).
    """

    workflow_id: Optional[str]
    name: str
    description: Optional[str] = None
    steps: List[WorkflowStepWithLiteralStrings]


PLACEHOLDER_REGEX = re.compile(r"^\{\{\s*(.*?)\s*\}\}$")


class PlaceholderRef(BaseModel):
    """
    Instead of showing {"placeholder_name": "..."},
    we'll serialize it as a string "{{ placeholder_name }}".
    """

    placeholder_name: str

    @model_serializer(mode="plain")
    def serialize_as_jinja_string(self):
        """
        Return a literal string of the form '{{ placeholder_name }}'
        whenever this model is dumped to a dictionary or JSON.
        """
        return f"{{{{ {self.placeholder_name} }}}}"

    def __str__(self) -> str:
        """
        When str(...) is called on PlaceholderRef, return the same Jinja-style string.
        """
        return f"{{{{ {self.placeholder_name} }}}}"


def parse_placeholder_or_literal(value: str) -> Union[PlaceholderRef, str]:
    """
    If the value matches {{ something }}, return PlaceholderRef(something).
    Otherwise, return the raw string.
    """
    match = PLACEHOLDER_REGEX.match(value)
    if match:
        return PlaceholderRef(placeholder_name=match.group(1))
    else:
        return value


class ViewCreationRequestWithPlaceholderRef(BaseModel):
    convex_project_id: Union[PlaceholderRef, str]
    convex_sheet_id: Union[PlaceholderRef, str]
    sql_filter: str  # let's say we don't allow placeholders here
    callback_url: Optional[str] = None  # or Union[PlaceholderRef, str] if you prefer

    # This is where we define the fields that should be validate as {{xyz}}
    # for example, if there is a new field somewhere in the http (literal strings) template that has to become
    # replaceable or injectable through {{ }}, it would be here.
    @model_validator(mode="after")
    def parse_placeholders(self):
        # Convert the field(s) to PlaceholderRef if needed
        if isinstance(self.convex_project_id, str):
            self.convex_project_id = parse_placeholder_or_literal(
                self.convex_project_id
            )
        if isinstance(self.convex_sheet_id, str):
            self.convex_sheet_id = parse_placeholder_or_literal(self.convex_sheet_id)
        return self


class ProcessRequestWithPlaceholderRef(BaseModel):
    convex_project_id: Union[PlaceholderRef, str]
    convex_column_id: Union[PlaceholderRef, str]
    column_name: Union[PlaceholderRef, str]
    prompt: dict
    sql_condition: Optional[str] = None
    output_name: str
    prompt_input_columns: Optional[List[str]] = Field(default=[])
    workflow_id: Optional[str] = None
    callback_url: Optional[str] = None

    # This is where we define the fields that should be validate as {{xyz}}
    # for example, if there is a new field somewhere in the http (literal strings) template that has to become
    # replaceable or injectable through {{ }}, it would be here.
    @model_validator(mode="after")
    def parse_placeholders(self):
        if isinstance(self.convex_project_id, str):
            self.convex_project_id = parse_placeholder_or_literal(
                self.convex_project_id
            )
        if isinstance(self.convex_column_id, str):
            self.convex_column_id = parse_placeholder_or_literal(self.convex_column_id)
        if isinstance(self.column_name, str):
            self.column_name = parse_placeholder_or_literal(self.column_name)
        return self


class WorkflowStepWithPlaceholderRef(BaseModel):
    id: str
    action: StepAction
    title: Optional[str] = None
    description: Optional[str] = None
    depends_on: List[str] = Field(default_factory=list)
    payload: Union[
        ViewCreationRequestWithPlaceholderRef, ProcessRequestWithPlaceholderRef
    ]

    @model_validator(mode="after")
    def check_payload_matches_action(self):
        if self.action == StepAction.CREATE_VIEW and not isinstance(
            self.payload, ViewCreationRequestWithPlaceholderRef
        ):
            raise ValueError(
                "payload must be ViewCreationRequestWithPlaceholderRef for create_view"
            )
        if self.action == StepAction.PROCESS and not isinstance(
            self.payload, ProcessRequestWithPlaceholderRef
        ):
            raise ValueError(
                "payload must be ProcessRequestWithPlaceholderRef for process"
            )
        return self


class WorkflowTemplateWithPlaceholderRef(BaseModel):
    workflow_id: str
    name: str
    description: Optional[str] = None
    steps: List[WorkflowStepWithPlaceholderRef]


## Adding new fields to "populate" is pretty much being done her
PLACEHOLDER_FIELDS_CREATE_VIEW = {
    "convex_project_id",
    "convex_sheet_id",
    "callback_url",
}
PLACEHOLDER_FIELDS_PROCESS = {
    "convex_project_id",
    "convex_column_id",
    "callback_url",
    "workflow_id",
}


def convert_literal_to_placeholder_wf(
    literal_wf: WorkflowTemplateWithLiteralStrings,
) -> WorkflowTemplateWithPlaceholderRef:
    steps_with_placeholders = []

    for step in literal_wf.steps:
        if step.action == StepAction.CREATE_VIEW:
            # step.payload is a literal ViewCreationRequest
            payload_dict = (
                step.payload.model_dump()
            )  # e.g. {"convex_project_id": "123", ...}
            # For each of the placeholder fields, we transform "123" -> "{{ convex_project_id }}"
            for key in PLACEHOLDER_FIELDS_CREATE_VIEW:
                if key in payload_dict:
                    payload_dict[key] = f"{{{{ {key} }}}}"

            # Now parse it into the placeholder version
            placeholder_payload = ViewCreationRequestWithPlaceholderRef.model_validate(
                payload_dict
            )

            step_placeholder = WorkflowStepWithPlaceholderRef(
                id=step.id,
                action=step.action,
                title=step.title,
                description=step.description,
                depends_on=step.depends_on,
                payload=placeholder_payload,
            )
            steps_with_placeholders.append(step_placeholder)

        else:  # step.action == StepAction.PROCESS
            payload_dict = step.payload.model_dump()
            for key in PLACEHOLDER_FIELDS_PROCESS:
                if key in payload_dict:
                    payload_dict[key] = f"{{{{ {key} }}}}"

            placeholder_payload = ProcessRequestWithPlaceholderRef.model_validate(
                payload_dict
            )

            step_placeholder = WorkflowStepWithPlaceholderRef(
                id=step.id,
                action=step.action,
                title=step.title,
                description=step.description,
                depends_on=step.depends_on,
                payload=placeholder_payload,
            )
            steps_with_placeholders.append(step_placeholder)

    return WorkflowTemplateWithPlaceholderRef(
        workflow_id=literal_wf.workflow_id,
        name=literal_wf.name,
        description=literal_wf.description,
        steps=steps_with_placeholders,
    )


T = TypeVar("T", bound=BaseModel)


def write_workflow_template_to_json_file(workflow_template: T, file_path: str) -> None:
    """
    Writes a Pydantic model (e.g. WorkflowTemplateWithLiteralStrings or
    WorkflowTemplateWithPlaceholderRef) to disk as JSON.
    """
    data = workflow_template.model_dump()
    json_str = json.dumps(data, indent=2, ensure_ascii=False)

    # Optional check: ensure valid JSON
    json.loads(json_str)  # If not valid, raises JSONDecodeError

    Path(file_path).write_text(json_str, encoding="utf-8")
    logger.info("Wrote workflow template to %s", file_path)


def load_workflow_template_from_json(text: str, template_cls: Type[T]) -> T:
    """
    Reads JSON from from string', which should be either WorkflowTemplateWithLiteralStrings
    or WorkflowTemplateWithPlaceholderRef (or any BaseModel).
    """

    data = json.loads(text)

    try:
        return template_cls.model_validate(data)
    except ValidationError as e:
        raise ValueError(
            f"Could not parse json as {template_cls.__name__}:\n{e}"
        ) from e


# TOOL TO PARSE HTTP FILE TO WORKFLOW
# This assumes only POST reuquests to two types of endpoints: /create_view and /process
def parse_http_file_to_literal_workflow(
    file_path: Union[str, Path],
    workflow_id: str = "auto-generated-workflow-id",
    name: str = "Auto-Generated Workflow",
    description: str = "Parsed from .http file",
) -> WorkflowTemplateWithLiteralStrings:
    """
    Reads an .http file containing lines like:
      POST https://.../create_view
      {
        "convex_project_id": "...",
        ...
      }

      POST https://.../process
      {
        "convex_project_id": "...",
        ...
      }

    The input .http file must already exist (this function does not generate it).

    and converts them into a single WorkflowTemplate object.
    """
    file_path = Path(file_path)
    lines = file_path.read_text(encoding="utf-8").splitlines()

    # We'll collect steps in a list
    steps = []

    # Patterns to detect endpoints
    create_view_pattern = re.compile(r"POST\s+.*?/create_view")
    process_pattern = re.compile(r"POST\s+.*?/process")

    # Track the current action we're reading payload for ("create_view" or "process")
    current_action: Optional[str] = None
    current_json_lines = []

    def flush_step():
        """Parses the accumulated JSON lines into the correct Pydantic model, and appends to steps."""
        nonlocal current_action, current_json_lines, steps

        if not current_action or not current_json_lines:
            # Nothing to parse
            current_action = None
            current_json_lines = []
            return

        raw_json = "\n".join(current_json_lines).strip()
        if not raw_json:
            # No actual JSON block
            current_action = None
            current_json_lines = []
            return

        # Parse the raw JSON text into a Python dict
        try:
            data = json.loads(raw_json)
        except json.JSONDecodeError as e:
            raise ValueError(f"Invalid JSON block:\n{raw_json}") from e

        # Validate the data as either create_view or process
        if current_action == "create_view":
            # parse into a ViewCreationRequest
            payload_obj = ViewCreationRequest.model_validate(data)
            action_enum = StepAction.CREATE_VIEW
        elif current_action == "process":
            # parse into a ProcessRequest
            payload_obj = ProcessRequest.model_validate(data)
            action_enum = StepAction.PROCESS
        else:
            raise ValueError(f"Unknown action: {current_action}")

        # Generate a step ID (or you can use a counter, or parse from the file)
        step_id = str(uuid.uuid4())

        # Build a WorkflowStepWithLiteralStrings (it will run the @model_validator automatically)
        step = WorkflowStepWithLiteralStrings(
            id=step_id,
            action=action_enum,
            payload=payload_obj,
            title=f"{action_enum} step",
            description=f"Parsed from {file_path}",
            depends_on=[],
        )
        steps.append(step)

        # Reset
        current_action = None
        current_json_lines = []

    for line in lines:
        line_stripped = line.strip()
        if not line_stripped:
            # blank line, skip
            continue

        # Check if it's a new POST line
        if create_view_pattern.search(line_stripped):
            # flush the previous step (if any)
            flush_step()
            current_action = "create_view"
            current_json_lines = []
        elif process_pattern.search(line_stripped):
            flush_step()
            current_action = "process"
            current_json_lines = []
        else:
            # It's part of the JSON for the current step
            current_json_lines.append(line)

    # Flush any trailing JSON at EOF
    flush_step()

    # Build and validate a new WorkflowTemplate
    workflow = WorkflowTemplateWithLiteralStrings(
        workflow_id=workflow_id, name=name, description=description, steps=steps
    )

    return workflow


def _load_json_from_path_or_string(source_input: str):
    try:
        # may raise TypeError / ValueError / OSError (e.g. NUL byte in string)
        potential_path = Path(source_input)

        if potential_path.is_file():
            try:
                json_text = potential_path.read_text(encoding="utf-8")
                return json.loads(json_text)
            except json.JSONDecodeError as e:
                raise ValueError(
                    f"Failed to parse JSON from file path string {potential_path}: {e}"
                ) from e
            except Exception as e:
                raise ValueError(
                    f"Failed to read or parse file from path string {potential_path}: {e}"
                ) from e

        # Path object was created but it isn’t an actual file on disk
        return json.loads(source_input)

    except (TypeError, ValueError, OSError):
        # `Path(source_input)` itself failed → treat the raw string as JSON
        try:
            return json.loads(source_input)
        except json.JSONDecodeError as e:
            raise ValueError(f"Failed to parse input string as JSON: {e}") from e


def parse_json_file_to_literal_workflow(
    source_input: Union[str, Path, Dict[str, Any]],  # MODIFIED: Added Dict[str, Any]
    workflow_id: str = None,
    name: str = "Auto-Generated Workflow",
    description: str = "Parsed from input source",
) -> WorkflowTemplateWithLiteralStrings:
    """
    Processes a JSON definition from various sources into a WorkflowTemplateWithLiteralStrings.

    The input JSON structure should be:
    {
      "requests": [
        {
          "timestamp": "...", (optional)
          "path": "/create_view" or "/process",
          "request_data": { ...payload... }
        },
        ...
      ]
    }

    Args:
        source_input: Can be:
            - A file path (str or Path object) to a JSON file.
            - A JSON string.
            - A Python dictionary representing the parsed JSON object.
        workflow_id: The ID to assign to the generated workflow template.
        name: The name for the workflow template.
        description: The description for the workflow template.

    Returns:
        A WorkflowTemplateWithLiteralStrings object.
    """
    data: Dict[str, Any]  # This will hold the dictionary parsed from JSON

    if isinstance(source_input, dict):
        data = source_input
    elif isinstance(source_input, Path):
        input_path = source_input
        if not input_path.is_file():
            raise ValueError(f"Input path is not a file: {input_path}")
        try:
            json_text = input_path.read_text(encoding="utf-8")
            data = json.loads(json_text)
        except json.JSONDecodeError as e:
            raise ValueError(f"Failed to parse JSON from file {input_path}: {e}") from e
        except Exception as e:
            raise ValueError(f"Failed to read or parse file {input_path}: {e}") from e
    elif isinstance(source_input, str):
        data = _load_json_from_path_or_string(source_input)
    else:
        raise TypeError(
            "source_input must be a file path (str or Path), a JSON string, or a Python dictionary."
        )

    # At this point, 'data' should be a Python dictionary representing the JSON structure
    if not isinstance(data, dict):  # Final check on the parsed/provided data structure
        raise ValueError(
            "The processed input did not result in a valid dictionary (JSON object)."
        )

    requests_list = data.get("requests", [])
    if not isinstance(requests_list, list):
        raise ValueError("The 'requests' key in the JSON data must be a list.")
    if not requests_list:
        raise ValueError(
            "No 'requests' found or 'requests' list is empty in the provided data."
        )

    steps: List[WorkflowStepWithLiteralStrings] = []
    for req_idx, req_item in enumerate(requests_list):
        if not isinstance(req_item, dict):
            continue

        path = req_item.get("path", "")
        request_data = req_item.get("request_data", {})

        if not path or not isinstance(
            request_data, dict
        ):  # request_data should be a dict for Pydantic models
            continue

        try:
            action_enum: StepAction
            payload_obj: Union[ViewCreationRequest, ProcessRequest]

            if "/create_view" in path:
                payload_obj = ViewCreationRequest.model_validate(request_data)
                action_enum = StepAction.CREATE_VIEW
            elif "/process" in path:
                payload_obj = ProcessRequest.model_validate(request_data)
                action_enum = StepAction.PROCESS
                if workflow_id is not None:
                    payload_obj.workflow_id = workflow_id

            else:
                raise ValueError(
                    f"Unknown endpoint path in request #{req_idx + 1}: {path}"
                )
        except ValidationError as ve:
            raise ValueError(
                f"Validation error for request #{req_idx + 1} (path: '{path}'): {ve}"
            ) from ve
        except Exception as e:
            raise ValueError(
                f"Unexpected error for request #{req_idx + 1} (path: '{path}'): {e}"
            ) from e

        step_id = str(uuid.uuid4())
        step_title = (
            f"{action_enum.value} step"
            if isinstance(action_enum, Enum)
            else f"{str(action_enum)} step"
        )
        step_description = f"Parsed from input source (request #{req_idx + 1})"

        step = WorkflowStepWithLiteralStrings(
            id=step_id,
            action=action_enum,
            payload=payload_obj,
            title=step_title,
            description=step_description,
            depends_on=[],
        )

        steps.append(step)

    return WorkflowTemplateWithLiteralStrings(
        workflow_id=workflow_id,
        name=name,
        description=description,
        steps=steps,
    )


def jinja_render_value(value: Union[str, PlaceholderRef], subs: dict) -> str:
    """
    Converts either a literal string or a PlaceholderRef
    into Jinja syntax, then renders it with 'subs'.

    - If value is a PlaceholderRef(placeholder_name='convex_project_id'),
      we produce a string '{{ convex_project_id }}'.
    - If value is a literal string that might already contain Jinja syntax,
      we render it as-is.

    Returns the rendered string after applying 'subs'.
    """
    if isinstance(value, PlaceholderRef):
        # Build a Jinja template of the form "{{ placeholder_name }}"
        template_str = f"{{{{ {value.placeholder_name} }}}}"
    else:
        # It's a literal string. We interpret it as a Jinja template too,
        # in case it contains something like "My ID = {{ convex_project_id }}"
        template_str = value

    # Render with Jinja
    rendered = Template(template_str).render(subs)
    return rendered


def convert_placeholder_step_to_literal(
    step: WorkflowStepWithPlaceholderRef, subs: dict
) -> WorkflowStepWithLiteralStrings:
    """
    Takes a single WorkflowStepWithPlaceholderRef, uses Jinja2 to render
    any placeholder fields with 'subs', and returns a WorkflowStepWithLiteralStrings.
    """
    # We'll convert the step.payload into a plain dict
    payload_dict = step.payload.model_dump()

    # Because the payload is either ViewCreationRequestWithPlaceholderRef or
    # ProcessRequestWithPlaceholderRef, we know which fields to handle.
    # We'll treat each field as a potential Jinja template.

    # The CREATE_VIEW fields:
    if "convex_project_id" in payload_dict:
        payload_dict["convex_project_id"] = jinja_render_value(
            payload_dict["convex_project_id"], subs
        )
    if "convex_sheet_id" in payload_dict:
        payload_dict["convex_sheet_id"] = jinja_render_value(
            payload_dict["convex_sheet_id"], subs
        )
    if "callback_url" in payload_dict and isinstance(payload_dict["callback_url"], str):
        payload_dict["callback_url"] = jinja_render_value(
            payload_dict["callback_url"], subs
        )

    # The PROCESS fields:
    if "convex_project_id" in payload_dict:
        payload_dict["convex_project_id"] = jinja_render_value(
            payload_dict["convex_project_id"], subs
        )
    if "convex_column_id" in payload_dict:
        payload_dict["convex_column_id"] = jinja_render_value(
            payload_dict["convex_column_id"], subs
        )
    if "column_name" in payload_dict and isinstance(payload_dict["column_name"], str):
        payload_dict["column_name"] = jinja_render_value(
            payload_dict["column_name"], subs
        )
    if "callback_url" in payload_dict and isinstance(payload_dict["callback_url"], str):
        payload_dict["callback_url"] = jinja_render_value(
            payload_dict["callback_url"], subs
        )
    if "workflow_id" in payload_dict and isinstance(payload_dict["workflow_id"], str):
        payload_dict["workflow_id"] = jinja_render_value(
            payload_dict["workflow_id"], subs
        )

    # Now that everything is rendered, we parse it back
    # into a "literal" (non-placeholder) request model.
    if step.action == StepAction.CREATE_VIEW:
        new_payload = ViewCreationRequest.model_validate(payload_dict)
    else:
        new_payload = ProcessRequest.model_validate(payload_dict)

    # Finally, we build a WorkflowStepWithLiteralStrings
    return WorkflowStepWithLiteralStrings(
        id=step.id,
        action=step.action,
        title=step.title,
        description=step.description,
        depends_on=step.depends_on,
        payload=new_payload,
    )


def convert_placeholder_wf_to_literal(
    ph_wf: WorkflowTemplateWithPlaceholderRef, subs: dict
) -> WorkflowTemplateWithLiteralStrings:
    """
    Renders each step in the placeholder workflow
    with Jinja2, returning a new literal workflow.
    """
    steps_lit = []
    for step in ph_wf.steps:
        new_step = convert_placeholder_step_to_literal(step, subs)
        steps_lit.append(new_step)

    return WorkflowTemplateWithLiteralStrings(
        workflow_id=ph_wf.workflow_id,
        name=ph_wf.name,
        description=ph_wf.description,
        steps=steps_lit,
    )


if __name__ == "__main__":

    HERE = Path(__file__).resolve().parent

    EXAMPLES = HERE / "examples"

    # Make sure it exists (create_parent_dirs works on Python 3.12; otherwise use mkdir(parents=True))
    EXAMPLES.mkdir(exist_ok=True)

    # Build full paths
    input_path = EXAMPLES / "sample-2.json"
    output_path = EXAMPLES / "literal_wf.json"

    # 1) Parse all.http -> WorkflowTemplateWithLiteralStrings
    #    (all.http is an example name; create/provide your own .http file first)
    literal_wf = parse_json_file_to_literal_workflow(input_path, workflow_id="1")
    # placeholder_wf = convert_literal_to_placeholder_wf(literal_wf)

    logger.debug(literal_wf.schema)

    # 2) Save #1 to JSON
    # write_workflow_template_to_json_file(literal_wf, output_path)
    text: str = Path(input_path).read_text(encoding="utf-8")
    new_wf = load_workflow_template_from_json(text, WorkflowTemplateWithLiteralStrings)
    write_workflow_template_to_json_file(new_wf, output_path)

    # # 3) Read JSON -> WorkflowTemplateWithLiteralStrings again
    # reloaded_lit = load_workflow_template_from_json_file(
    #     "literal_wf.json", WorkflowTemplateWithLiteralStrings
    # )
    # print("3) Reloaded literal workflow from JSON:", reloaded_lit)

    # # Convert it to placeholder workflow
    # placeholder_wf = convert_literal_to_placeholder_wf(reloaded_lit)
    # print("3b) Converted to placeholder workflow:", placeholder_wf)

    # # 4) Save placeholder workflow to JSON
    # write_workflow_template_to_json_file(placeholder_wf, "placeholder_wf.json")

    # # 5) Read #4 in from JSON -> WorkflowTemplateWithPlaceholderRef
    # reloaded_placeholder = load_workflow_template_from_json_file(
    #     "placeholder_wf.json", WorkflowTemplateWithPlaceholderRef
    # )
    # print("5) Reloaded placeholder workflow:", reloaded_placeholder)

    # # 6) Replace placeholders with real values
    # my_subs = {
    #     "convex_project_id": "my-real-project-id",
    #     "convex_sheet_id": "my-real-sheet-id",
    #     "convex_column_id": "my-real-column-id",
    # }
    # print(f"Reloaded placeholder: {reloaded_placeholder}")
    # resolved_lit = convert_placeholder_wf_to_literal(reloaded_placeholder, my_subs)
    # print("6) Resolved placeholders -> literal again:", resolved_lit)

    # # 7) Save final literal workflow to JSON
    # write_workflow_template_to_json_file(resolved_lit, "final_resolved_literal_wf.json")
    # # 8) All done

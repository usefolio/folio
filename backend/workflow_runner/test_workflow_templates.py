import unittest
import json
import tempfile
from pathlib import Path
from typing import List, Dict, Any

# Import the modules we want to test
from folio.utils.workflow_tools import (
    WorkflowTemplateWithLiteralStrings,
    WorkflowTemplateWithPlaceholderRef,
    WorkflowStepWithLiteralStrings,
    WorkflowStepWithPlaceholderRef,
    StepAction,
    ViewCreationRequest,
    ProcessRequest,
    convert_literal_to_placeholder_wf,
    convert_placeholder_wf_to_literal,
    write_workflow_template_to_json_file,
    load_workflow_template_from_json_file,
)


class TestWorkflowTemplateConversion(unittest.TestCase):
    def test_happy_path_create_view_step_conversion(self):
        """
        Test that a create_view step with real project_id and sheet_id values
        gets properly converted to use Jinja replaceable variables.
        """
        # Create a sample workflow with one step
        step = WorkflowStepWithLiteralStrings(
            id="88223ce3-390c-4f85-9763-f8bc43ee4b50",
            action=StepAction.CREATE_VIEW,
            payload=ViewCreationRequest(
                convex_project_id="my-real-project-id",
                convex_sheet_id="my-real-sheet-id",
                sql_filter="\"issues\" like '%System Issues%'",
                callback_url="https://adamant-dachshund-473.convex.site",
            ),
            title="StepAction.CREATE_VIEW step",
            # all.http is an example source name; callers must provide/create the .http file.
            description="Parsed from all.http",
            depends_on=[],
        )

        workflow = WorkflowTemplateWithLiteralStrings(
            workflow_id="test-workflow",
            name="Test Workflow",
            description="Test workflow for unit tests",
            steps=[step],
        )

        # Convert the workflow to use placeholders
        placeholder_workflow = convert_literal_to_placeholder_wf(workflow)

        # Check that the workflow was converted correctly
        self.assertEqual(len(placeholder_workflow.steps), 1)

        # Get the first step
        ph_step = placeholder_workflow.steps[0]

        # Check that the step was converted correctly
        self.assertEqual(ph_step.id, "88223ce3-390c-4f85-9763-f8bc43ee4b50")
        self.assertEqual(ph_step.action, StepAction.CREATE_VIEW)

        # Check that the payload fields were converted to placeholders
        self.assertEqual(
            str(ph_step.payload.convex_project_id), "{{ convex_project_id }}"
        )
        self.assertEqual(str(ph_step.payload.convex_sheet_id), "{{ convex_sheet_id }}")

        # Check that non-placeholder fields were not modified
        self.assertEqual(
            ph_step.payload.sql_filter, "\"issues\" like '%System Issues%'"
        )
        self.assertEqual(
            ph_step.payload.callback_url, "https://adamant-dachshund-473.convex.site"
        )

    def test_conversion_with_edge_cases(self):
        """
        Test how the conversion handles edge cases like empty strings and non-string types.
        """
        # Create steps with edge cases
        steps = [
            # Step with empty strings
            WorkflowStepWithLiteralStrings(
                id="empty-strings",
                action=StepAction.CREATE_VIEW,
                payload=ViewCreationRequest(
                    convex_project_id="",  # Empty string
                    convex_sheet_id="",  # Empty string
                    sql_filter="filter",
                    callback_url=None,
                ),
                title="Empty Strings Step",
                description="Testing empty strings",
                depends_on=[],
            ),
            # Step with non-string types (this would normally fail validation,
            # but we'll test how the conversion would handle it if it were allowed)
            WorkflowStepWithLiteralStrings(
                id="non-string-types",
                action=StepAction.PROCESS,
                payload=ProcessRequest(
                    convex_project_id="123",  # String that looks like a number
                    convex_column_id="456",  # String that looks like a number
                    column_name="column1",
                    prompt={"type": "simple"},
                    output_name="output1",
                ),
                title="Non-String Types Step",
                description="Testing non-string types",
                depends_on=[],
            ),
        ]

        workflow = WorkflowTemplateWithLiteralStrings(
            workflow_id="edge-case-workflow",
            name="Edge Case Workflow",
            description="Testing edge cases",
            steps=steps,
        )

        # Convert the workflow to use placeholders
        placeholder_workflow = convert_literal_to_placeholder_wf(workflow)

        # Check empty strings case
        empty_str_step = placeholder_workflow.steps[0]
        self.assertEqual(
            str(empty_str_step.payload.convex_project_id), "{{ convex_project_id }}"
        )
        self.assertEqual(
            str(empty_str_step.payload.convex_sheet_id), "{{ convex_sheet_id }}"
        )

        # Check numeric strings case
        numeric_step = placeholder_workflow.steps[1]
        self.assertEqual(
            str(numeric_step.payload.convex_project_id), "{{ convex_project_id }}"
        )
        self.assertEqual(
            str(numeric_step.payload.convex_column_id), "{{ convex_column_id }}"
        )

    def test_full_json_load_transform_replace_flow(self):
        """
        Test the full flow:
        1. Load a WorkflowStepWithLiteralStrings from a JSON file
        2. Transform it into a WorkflowStepWithPlaceholderRef
        3. Replace placeholders with actual values
        """
        # Create a sample workflow with one step
        step = WorkflowStepWithLiteralStrings(
            id="88223ce3-390c-4f85-9763-f8bc43ee4b50",
            action=StepAction.CREATE_VIEW,
            payload=ViewCreationRequest(
                convex_project_id="original-project-id",
                convex_sheet_id="original-sheet-id",
                sql_filter="\"issues\" like '%System Issues%'",
                callback_url="https://adamant-dachshund-473.convex.site",
            ),
            title="StepAction.CREATE_VIEW step",
            # all.http is an example source name; callers must provide/create the .http file.
            description="Parsed from all.http",
            depends_on=[],
        )

        workflow = WorkflowTemplateWithLiteralStrings(
            workflow_id="test-workflow",
            name="Test Workflow",
            description="Test workflow for unit tests",
            steps=[step],
        )

        # Create a temporary file
        with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as temp_file:
            temp_path = temp_file.name

            # Write the workflow to the temporary file
            write_workflow_template_to_json_file(workflow, temp_path)

            try:
                # Load the workflow from the temporary file
                loaded_workflow = load_workflow_template_from_json_file(
                    temp_path, WorkflowTemplateWithLiteralStrings
                )

                # Convert to placeholder workflow
                placeholder_workflow = convert_literal_to_placeholder_wf(
                    loaded_workflow
                )

                # Write placeholder workflow to json
                placeholder_path = temp_path + ".placeholder.json"
                write_workflow_template_to_json_file(
                    placeholder_workflow, placeholder_path
                )

                # Load placeholder workflow
                loaded_placeholder = load_workflow_template_from_json_file(
                    placeholder_path, WorkflowTemplateWithPlaceholderRef
                )

                # Replace placeholders with new values
                replacements = {
                    "convex_project_id": "new-project-id",
                    "convex_sheet_id": "new-sheet-id",
                    "convex_column_id": "new-column-id",
                }

                resolved_workflow = convert_placeholder_wf_to_literal(
                    loaded_placeholder, replacements
                )

                # Check that replacements worked
                self.assertEqual(
                    resolved_workflow.steps[0].payload.convex_project_id,
                    "new-project-id",
                )
                self.assertEqual(
                    resolved_workflow.steps[0].payload.convex_sheet_id, "new-sheet-id"
                )

                # Make sure other fields weren't affected
                self.assertEqual(
                    resolved_workflow.steps[0].payload.sql_filter,
                    "\"issues\" like '%System Issues%'",
                )

            finally:
                # Clean up temporary files
                Path(temp_path).unlink(missing_ok=True)
                Path(placeholder_path).unlink(missing_ok=True)

    def test_jinja_rendering_with_special_characters(self):
        """
        Test that Jinja rendering handles special characters and SQL filters correctly.
        """
        # Create a step with SQL containing special characters
        step = WorkflowStepWithLiteralStrings(
            id="special-chars",
            action=StepAction.CREATE_VIEW,
            payload=ViewCreationRequest(
                convex_project_id="project-123",
                convex_sheet_id="sheet-456",
                sql_filter="\"column name\" LIKE '%quoted string with apostrophe''s%'",
                callback_url=None,
            ),
            title="Special Characters Step",
            description="Testing special characters in SQL",
            depends_on=[],
        )

        workflow = WorkflowTemplateWithLiteralStrings(
            workflow_id="special-chars-workflow",
            name="Special Characters Workflow",
            description="Testing special characters",
            steps=[step],
        )

        # Convert to placeholder workflow
        placeholder_workflow = convert_literal_to_placeholder_wf(workflow)

        # Replace placeholders with values containing special characters
        replacements = {
            "convex_project_id": "project-id-with-$pecial-chars",
            "convex_sheet_id": 'sheet-id-with-"quotes"',
        }

        # This should not throw an exception
        resolved_workflow = convert_placeholder_wf_to_literal(
            placeholder_workflow, replacements
        )

        # Check that replacements worked
        self.assertEqual(
            resolved_workflow.steps[0].payload.convex_project_id,
            "project-id-with-$pecial-chars",
        )
        self.assertEqual(
            resolved_workflow.steps[0].payload.convex_sheet_id, 'sheet-id-with-"quotes"'
        )

        # SQL filter should be unchanged
        self.assertEqual(
            resolved_workflow.steps[0].payload.sql_filter,
            "\"column name\" LIKE '%quoted string with apostrophe''s%'",
        )

    def test_placeholder_name_appears_elsewhere(self):
        """
        Test what happens when a placeholder field name (like 'convex_project_id')
        appears somewhere else in the content, such as in SQL filter or description.
        The conversion should only replace the designated fields, not every occurrence
        of that string.
        """
        # Create a step with 'convex_project_id' appearing in multiple places
        step = WorkflowStepWithLiteralStrings(
            id="duplicate-field-names",
            action=StepAction.CREATE_VIEW,
            payload=ViewCreationRequest(
                convex_project_id="real-project-id",
                convex_sheet_id="real-sheet-id",
                # Include 'convex_project_id' in the SQL filter
                sql_filter="\"column\" = 'convex_project_id' OR id = 'reference to convex_project_id'",
                # Include 'convex_project_id' in the callback URL
                callback_url="https://example.com/callback?param=convex_project_id",
            ),
            # Include 'convex_project_id' in the title
            title="Step referencing convex_project_id",
            # Include 'convex_project_id' in the description
            description="This step uses convex_project_id for processing",
            depends_on=[],
        )

        workflow = WorkflowTemplateWithLiteralStrings(
            workflow_id="test-duplicate-fields-workflow",
            name="Test Workflow with Duplicate Field References",
            # Include 'convex_project_id' in the description
            description="This workflow uses convex_project_id for testing",
            steps=[step],
        )

        # Convert the workflow to use placeholders
        placeholder_workflow = convert_literal_to_placeholder_wf(workflow)

        # Check that only the designated fields were converted to placeholders
        ph_step = placeholder_workflow.steps[0]

        # The actual field should be converted to a placeholder
        self.assertEqual(
            str(ph_step.payload.convex_project_id), "{{ convex_project_id }}"
        )

        # But occurrences elsewhere should remain as literal strings
        self.assertEqual(
            ph_step.payload.sql_filter,
            "\"column\" = 'convex_project_id' OR id = 'reference to convex_project_id'",
        )
        self.assertEqual(
            ph_step.payload.callback_url,
            "https://example.com/callback?param=convex_project_id",
        )
        self.assertEqual(ph_step.title, "Step referencing convex_project_id")
        self.assertEqual(
            ph_step.description, "This step uses convex_project_id for processing"
        )
        self.assertEqual(
            placeholder_workflow.description,
            "This workflow uses convex_project_id for testing",
        )

        # Now test the replacement phase
        replacements = {
            "convex_project_id": "REPLACED-PROJECT-ID",
            "convex_sheet_id": "REPLACED-SHEET-ID",
        }

        resolved_workflow = convert_placeholder_wf_to_literal(
            placeholder_workflow, replacements
        )

        # Check that only the actual field was replaced
        resolved_step = resolved_workflow.steps[0]
        self.assertEqual(resolved_step.payload.convex_project_id, "REPLACED-PROJECT-ID")

        # The occurrences elsewhere should still be unchanged
        self.assertEqual(
            resolved_step.payload.sql_filter,
            "\"column\" = 'convex_project_id' OR id = 'reference to convex_project_id'",
        )
        self.assertEqual(
            resolved_step.payload.callback_url,
            "https://example.com/callback?param=convex_project_id",
        )
        self.assertEqual(resolved_step.title, "Step referencing convex_project_id")
        self.assertEqual(
            resolved_step.description, "This step uses convex_project_id for processing"
        )
        self.assertEqual(
            resolved_workflow.description,
            "This workflow uses convex_project_id for testing",
        )


if __name__ == "__main__":
    unittest.main()

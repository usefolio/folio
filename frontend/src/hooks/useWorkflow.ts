import { useContext } from "react";
import { WorkflowContext } from "@/context/WorkflowContextCore";
/**
 * Hook to access the workflow context and its methods.
 *
 * Provides access to:
 * - workflowData: The current workflow tree structure
 * - setWorkflowData: Direct setter for workflow data
 * - addNode: Add a new node (view or column) to the workflow
 * - updateNode: Update an existing node's properties
 * - deleteNode: Remove a node from the workflow
 * - toggleExpanded: Expand/collapse a node in the tree view
 * - exportWorkflow: Export workflow as JSON
 * - exportWorkflowAsReqiestsJson: Export workflow as JSON string
 * - exportWorkflowAsRequests: Export workflow as WorkflowRequests
 * - importWorkflow: Import workflow from JSON string
 *
 * Must be used within a WorkflowProvider component.
 * throws error if used outside of WorkflowProvider
 */
export const useWorkflow = () => {
  const context = useContext(WorkflowContext);
  if (context === undefined) {
    throw new Error("useWorkflow must be used within a WorkflowProvider");
  }
  return context;
};

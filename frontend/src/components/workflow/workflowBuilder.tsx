import React, { useState, useRef, useEffect } from "react";
import { useWorkflow } from "@/hooks/useWorkflow";
import { WorkflowNode } from "@/interfaces/interfaces";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/button";
import { PrimaryActionButton, SecondaryIconButton } from "../ui/actionButtons";
import {
  Plus,
  ChevronDown,
  ChevronRight,
  Tag,
  FileText,
  HelpCircle,
  Download,
  Save,
  Upload,
  Trash2,
  Edit,
  X,
  Play,
  Loader2,
  XCircle,
} from "lucide-react";
import ColumnEditorAdapter from "./columnEditorAdapter";
import FilterDisplay from "../visualQueryBuilder/filterDisplay";
import ViewEditorAdapter from "./viewEditorAdapter";
import {
  showErrorNotification,
  showSuccessNotification,
} from "../notification/NotificationHandler";
import {
  WorkflowJsonCleaner,
  validateColumnNode,
  validateViewNode,
} from "@/utils/workflowUtils";
import { useDataContext } from "@/context/DataContext";
import { useBackendClient } from "@/hooks/useBackendClient";
import { Id } from "convex/_generated/dataModel";

// Workflow builder

const WorkflowBuilder: React.FC = () => {
  const { t } = useTranslation();
  const {
    workflowData,
    addNode,
    deleteNode,
    updateNode,
    toggleExpanded,
    exportWorkflow,
    // exportWorkflowViews,
    exportWorkflowAsRequests,
    // exportWorkflowAsViewRequests,
    importWorkflow,
    workflowLoading,
    importProgress,
    clearWorkflowExceptDefault,
  } = useWorkflow();
  const { project, projects } = useDataContext();
  const backendClient = useBackendClient();
  // Editing states
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [addingToNodeId, setAddingToNodeId] = useState<string | null>(null);
  const [addingRootNode, setAddingRootNode] = useState(false);
  const [isImportingInternal, setIsImportingInternal] = useState(false); // Renamed to avoid conflict with context's importProgress.isImporting
  const [deletingNodeId, setDeletingNodeId] = useState<string | null>(null); // For disabling delete button
  const [clearingCanvas, setClearingCanvas] = useState<boolean>(false);
  const [savingNodeId, setSavingNodeId] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  // const [isRunningViewsOnly, setIsRunningViewsOnly] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Map<string, string>>(
    new Map(),
  );
  const [showConfirmClear, setShowConfirmClear] = useState(false);

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nodeRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const treeContainerRef = useRef<HTMLDivElement>(null);

  // Icon mapping for node types
  const getTypeIcon = (type?: string) => {
    switch (type) {
      case "tag":
        return <Tag className="mr-2 text-primary w-4 h-4 shrink-0" />;
      case "summary":
        return <FileText className="mr-2 text-primary w-4 h-4 shrink-0" />;
      case "ask":
        return <HelpCircle className="mr-2 text-primary w-4 h-4 shrink-0" />;
      case "extract":
        return <Download className="mr-2 text-primary w-4 h-4 shrink-0" />;
      default:
        return null;
    }
  };
  useEffect(() => {
    if (editingNodeId && nodeRefs.current[editingNodeId]) {
      nodeRefs.current[editingNodeId]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [editingNodeId]);

  // Auto-scroll to node when adding child
  useEffect(() => {
    if (addingToNodeId && nodeRefs.current[addingToNodeId]) {
      nodeRefs.current[addingToNodeId]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [addingToNodeId]);

  // Auto-scroll to bottom when adding root node
  useEffect(() => {
    if (addingRootNode && treeContainerRef.current) {
      treeContainerRef.current.scrollTo({
        top: treeContainerRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [addingRootNode]);
  // Reset all editing states
  const resetEditingStates = () => {
    setEditingNodeId(null);
    setAddingToNodeId(null);
    setAddingRootNode(false);
  };

  // Handle starting to add a root node
  const startAddingRootNode = () => {
    resetEditingStates();
    setAddingRootNode(true);
  };

  // Handle adding a child to a node
  const startAddingChildToNode = (nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    resetEditingStates();
    setAddingToNodeId(nodeId);
  };

  // Handle starting to edit a node
  const startEditingNode = (nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    resetEditingStates();
    setEditingNodeId(nodeId);
  };

  // Handle canceling any edit operation
  const handleCancelEdit = () => {
    resetEditingStates();
  };

  // Handle save for new or edited node
  const handleSaveNode = async (
    nodeId: string | null,
    nodeData: Partial<WorkflowNode>,
  ) => {
    setSavingNodeId(nodeId || "new");
    try {
      if (nodeId) {
        await updateNode(nodeId, nodeData);
      } else if (addingToNodeId) {
        await addNode(addingToNodeId, nodeData);
      } else if (addingRootNode) {
        await addNode(null, { ...nodeData, isView: true });
      }

      resetEditingStates();
    } finally {
      setSavingNodeId(null);
    }
  };

  // Re-validate the entire workflow whenever it changes
  useEffect(() => {
    const getValidationErrorsMap = (
      nodes: WorkflowNode[],
    ): Map<string, string> => {
      const errorsMap = new Map<string, string>();
      // Iterate over views and columns to add errors to the map
      for (const viewNode of nodes) {
        const viewError = validateViewNode(viewNode, t);
        if (viewError && viewNode.id) {
          errorsMap.set(viewNode.id, viewError);
        }

        if (viewNode.children) {
          for (const columnNode of viewNode.children) {
            const columnError = validateColumnNode(columnNode, t);
            if (columnError && columnNode.id) {
              errorsMap.set(columnNode.id, columnError);
            }
          }
        }
      }
      return errorsMap;
    };

    const errors = getValidationErrorsMap(workflowData);
    setValidationErrors(errors);
  }, [workflowData, t]);

  const runWorkflow = async () => {
    if (validationErrors.size > 0) {
      showErrorNotification(
        t("workflow.validation.failed_title"),
        Array.from(validationErrors.values()).join("\n"),
      );
      return;
    }

    setIsRunning(true);
    try {
      const controller = new AbortController();
      const workflowRequests = exportWorkflowAsRequests();
      await backendClient.runWorkflow({
        requests: workflowRequests,
        workflowType: "literal",
        signal: controller.signal,
        project_id: project as Id<"project">,
      });
      showSuccessNotification(
        t("workflow.run_successful_title"),
        t("workflow.run_successful_message"),
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t("global.unknown_error");
      showErrorNotification(
        t("workflow.run_failed_title"),
        t("workflow.run_failed_message", { error: message }),
      );
    } finally {
      setIsRunning(false);
    }
  };
  // TODO: Restore view-only workflow execution once the feature is re-enabled.
  // const runWorkflowViewsOnly = async () => {
  //   const viewValidationErrors: string[] = [];
  //
  //   // Iterate over all validation errors.
  //   validationErrors.forEach((error, nodeId) => {
  //     const node = workflowData.find((n) => n.id === nodeId);
  //     if (node && node.isView) {
  //       viewValidationErrors.push(`${node.label}: ${error}`);
  //     }
  //   });
  //
  //   if (viewValidationErrors.length > 0) {
  //     showErrorNotification(
  //       t("workflow.validation.failed_title"),
  //       viewValidationErrors.join("\n"),
  //     );
  //     return;
  //   }
  //
  //   setIsRunningViewsOnly(true);
  //   try {
  //     const controller = new AbortController();
  //     const workflowRequests = exportWorkflowAsViewRequests();
  //     await backendClient.runWorkflow({
  //       requests: workflowRequests,
  //       workflowType: "literal",
  //       signal: controller.signal,
  //       project_id: project as Id<"project">,
  //     });
  //
  //     showSuccessNotification(
  //       t("workflow.run_views_successful_title"),
  //       t("workflow.run_views_successful_message"),
  //     );
  //   } catch (error) {
  //     const message =
  //       error instanceof Error ? error.message : t("global.unknown_error");
  //     showErrorNotification(
  //       t("workflow.run_views_failed_title"),
  //       t("workflow.run_views_failed_message", { error: message }),
  //     );
  //   } finally {
  //     setIsRunningViewsOnly(false);
  //   }
  // };
  // Export workflow as JSON
  const handleExportWorkflow = () => {
    const json = exportWorkflow();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const projectDoc = projects.find((p) => p._id === project);
    const projectName = projectDoc?.name ?? "workflow";
    const safeProjectName = projectName
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, "-")
      .replace(/-{2,}/g, "-")
      .replace(/^-+|-+$/g, "");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    link.download = `${safeProjectName || "workflow"}-${timestamp}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Import workflow from file
  const triggerFileImport = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImportingInternal(true);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const rawContent = e.target?.result as string;

        // Use the WorkflowJsonCleaner
        const cleanedData = WorkflowJsonCleaner.cleanAndValidate(rawContent);

        // Convert back to string for import
        const finalJson = JSON.stringify(cleanedData);
        // Import the workflow synchronously
        importWorkflow(finalJson);

        showSuccessNotification(
          t("workflow.import_success_title"),
          t("workflow.import_success_message"),
        );

        setIsImportingInternal(false);
      } catch (error) {
        console.error("Error importing workflow:", error);

        let errorMessage = t("global.unknown_error");
        if (error instanceof Error) {
          if (error.message.includes("Invalid workflow structure")) {
            errorMessage = t("workflow.invalid_workflow_structure");
          } else if (error.message.includes("Unable to clean JSON")) {
            errorMessage = t("workflow.json_parsing_error");
          } else {
            errorMessage = error.message;
          }
        }

        showErrorNotification(t("workflow.import_json_error"), errorMessage);
        setIsImportingInternal(false);
      }
    };

    reader.onerror = () => {
      showErrorNotification(
        t("workflow.import_workflow_error"),
        t("workflow.file_read_error"),
      );
      setIsImportingInternal(false);
    };

    reader.readAsText(file);

    // Reset the file input
    if (event.target) {
      event.target.value = "";
    }
  };

  // Clear the canvas (reset workflow)
  const clearCanvas = async () => {
    // Optionally show a loading spinner here
    setClearingCanvas(true);
    try {
      await clearWorkflowExceptDefault(); // Use new context method
    } catch (error) {
      console.error("Error clearing canvas:", error);
    } finally {
      setClearingCanvas(false);
      resetEditingStates(); // This was already there
      setShowConfirmClear(false); // This was already there
    }
  };

  const handleDeleteNode = async (nodeId: string) => {
    if (deletingNodeId) return; // Prevent rapid clicks
    setDeletingNodeId(nodeId);
    try {
      await deleteNode(nodeId); // deleteNode from context should be async
    } catch (error) {
      console.error("Error deleting node:", error);
      showErrorNotification(
        t("workflow.delete_failed_title"),
        error instanceof Error ? error.message : t("global.unknown_error"),
      );
    } finally {
      setDeletingNodeId(null);
    }
  };
  // Render a single node
  const renderNode = (node: WorkflowNode, level: number) => {
    const isExpanded = node.expanded !== false;
    const hasChildren = node.children && node.children.length > 0;
    const isEditing = editingNodeId === node.id;
    const isAddingChild = addingToNodeId === node.id;
    const isThisNodeBeingDeleted = deletingNodeId === node.id;
    const nodeError = validationErrors.get(node.id);
    return (
      <div key={node.id} className="mb-1">
        {/* Node header */}
        <div
          ref={(el) => (nodeRefs.current[node.id] = el)}
          className={`flex items-center p-2 group ${node.isView ? "bg-gray-50" : ""} ${
            nodeError
              ? "border border-destructive rounded-md"
              : "border border-transparent"
          }`}
          style={{ paddingLeft: `${level * 24 + 8}px` }}
        >
          {/* Expand/collapse button */}
          <Button
            size="iconXs"
            shape="square"
            onClick={() => toggleExpanded(node.id)}
            className="bg-transparent hover:bg-transparent flex items-center justify-center text-gray-500 hover:text-gray-800"
            style={{ visibility: hasChildren ? "visible" : "hidden" }}
          >
            {isExpanded ? <ChevronDown /> : <ChevronRight />}
          </Button>
          {/* Error icon */}
          {nodeError && (
            <div className="mr-2" title={nodeError}>
              <XCircle className="w-4 h-4 text-destructive shrink-0" />
            </div>
          )}

          {/* Node icon */}
          {getTypeIcon(node.type)}

          {/* Node label */}
          <span
            className={`font-medium ${node.isView ? "text-foreground" : "font-normal text-foreground"}`}
          >
            {node.label}
          </span>
          {/* Node model badge */}
          {node.model && !node.isView && (
            <span className="ml-2 text-xs bg-muted px-1.5 py-0.5 text-foreground rounded-md">
              {node.model}
            </span>
          )}
          {/* Summary */}
          {node.isView ? (
            node.sql_condition ? (
              <FilterDisplay
                filterString={node.sql_condition}
                filterConditions={t("sheet_handler.filter_condition_label")}
              />
            ) : (
              <span className="ml-2 text-xs text-muted-foreground">
                {t("visual_query_builder.no_filters")}
              </span>
            )
          ) : node.summary ? (
            <span
              className="ml-2 text-xs bg-muted px-1.5 py-0.5 text-foreground rounded-md
                max-w-[28rem] truncate"
              title={node.summary}
            >
              {node.summary}
            </span>
          ) : null}

          {/* Actions */}
          <div className="ml-auto flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
            {/* Edit button */}
            <Button
              variant="ghost"
              size="iconXs"
              shape="square"
              disabled={node.isView}
              className="p-0 disabled:opacity-0"
              onClick={(e) => {
                if (node.isView) {
                  return;
                } else {
                  startEditingNode(node.id, e);
                }
              }}
            >
              <Edit className="w-4 h-4" />
            </Button>

            {/* Add child button - only for view nodes */}
            {node.isView && (
              <Button
                variant="ghost"
                size="iconXs"
                shape="square"
                className="p-0"
                onClick={(e) => startAddingChildToNode(node.id, e)}
              >
                <Plus className="w-4 h-4" />
              </Button>
            )}

            {/* Delete button */}
            <Button
              variant="ghost"
              size="iconXs"
              shape="square"
              className="p-0 text-destructive"
              onClick={() => handleDeleteNode(node.id)}
              disabled={!!deletingNodeId}
              aria-label={t("workflow.delete_node")}
            >
              {isThisNodeBeingDeleted ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Editor for this node */}
        {isEditing && (
          <div className="ml-8 my-3">
            {node.isView ? (
              <ViewEditorAdapter
                node={node}
                onSave={(data) =>
                  handleSaveNode(node.id, { ...data, isView: true })
                }
                onCancel={handleCancelEdit}
              />
            ) : (
              <ColumnEditorAdapter
                node={node}
                onSave={(data) => handleSaveNode(node.id, data)}
                onCancel={handleCancelEdit}
                isSaving={savingNodeId === node.id}
                nodeError={nodeError}
              />
            )}
          </div>
        )}

        {/* Editor for adding a child to this node */}
        {isAddingChild && (
          <div className="ml-12 my-3">
            <ColumnEditorAdapter
              isNew={true}
              onSave={(nodeData) => handleSaveNode(null, nodeData)}
              onCancel={handleCancelEdit}
              isSaving={savingNodeId === "new"}
              nodeError={nodeError}
            />
          </div>
        )}

        {/* Children */}
        {hasChildren && isExpanded && (
          <div>
            {node.children!.map((child) => renderNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="workflow-builder overflow-auto">
      {!project && (
        <div className="flex flex-col items-center justify-center p-8">
          <span className="text-base">{t("workflow.no_project")}</span>
        </div>
      )}
      {/* Loading overlay */}
      {workflowLoading && project && (
        <div className="flex flex-col items-center justify-center p-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
          <span className="text-xs">{t("workflow.loading_workflow")}</span>
        </div>
      )}

      {/* Import progress overlay */}
      {importProgress.isImporting && (
        <div className="fixed inset-0 bg-white/80 flex items-center justify-center z-50">
          <div className="bg-white p-8 rounded-md border border-border max-w-md w-full">
            <div className="flex items-center mb-4">
              <Loader2 className="h-6 w-6 animate-spin text-primary mr-3" />
              <h3 className="text-lg font-medium">
                {t("workflow.importing_workflow")}
              </h3>
            </div>
            <div className="mb-4">
              <div className="flex justify-between text-sm mb-2">
                <span>{importProgress.message}</span>
                <span>
                  {importProgress.current} / {importProgress.total}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-md h-2">
                <div
                  className="bg-primary h-2 rounded-md transition-all duration-300"
                  style={{
                    width: `${importProgress.total > 0 ? (importProgress.current / importProgress.total) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}
      {!workflowLoading && (
        <>
          {/* Top controls */}
          <div className="mb-4 flex justify-between items-center">
            <div className="flex space-x-2">
              <PrimaryActionButton icon={<Plus className="h-4 w-4" />} onClick={startAddingRootNode}>
                {t("workflow.add_root_view")}
              </PrimaryActionButton>

              <SecondaryIconButton
                icon={
                  clearingCanvas ? (
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )
                }
                onClick={() => setShowConfirmClear(true)}
                disabled={
                  workflowData.length === 0 ||
                  (workflowData.length === 1 &&
                    workflowData[0].label === "Default" &&
                    workflowData[0].children?.length === 0) ||
                  clearingCanvas
                }
              >
                {t("workflow.clear_canvas")}
              </SecondaryIconButton>
            </div>

            <div className="flex space-x-2">
              <SecondaryIconButton icon={<Upload className="h-4 w-4" />} onClick={triggerFileImport} disabled={isImportingInternal}>
                {isImportingInternal ? t("workflow.importing") : t("workflow.import")}
              </SecondaryIconButton>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileImport}
                accept=".json"
                className="hidden"
              />

              <SecondaryIconButton icon={<Save className="h-4 w-4" />} onClick={handleExportWorkflow} disabled={isImportingInternal}>
                {t("workflow.export")}
              </SecondaryIconButton>
              {/**
               * Temporarily hidden until view-specific exports return.
               * <SecondaryIconButton
               *   icon={<Save className="h-4 w-4" />}
               *   onClick={handleExportWorkflowViews}
               *   disabled={isImportingInternal}
               * >
               *   {t("workflow.export_views")}
               * </SecondaryIconButton>
               */}
            </div>
          </div>

          {/* Tree view */}
          <div
            ref={treeContainerRef}
            className="border border-border rounded-md p-4 bg-white"
          >
            {workflowData.length > 0 ? (
              <div className="workflow-tree">
                {workflowData.map((node) => renderNode(node, 0))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-64">
                <Plus className="mb-4 text-foreground w-12 h-12" />
                <p className="mb-2">{t("workflow.empty_state")}</p>
                <PrimaryActionButton icon={<Plus className="h-4 w-4" />} onClick={startAddingRootNode}>
                  {t("workflow.add_root_view")}
                </PrimaryActionButton>
              </div>
            )}

            {/* Editor for adding a root node - only show when explicitly adding */}
            {addingRootNode && (
              <div className="my-3">
                <ViewEditorAdapter
                  onSave={(data) =>
                    handleSaveNode(null, { ...data, isView: true })
                  }
                  onCancel={handleCancelEdit}
                />
              </div>
            )}
          </div>
          {/* Run workflow */}
          <div className="flex flex-1 flex-grow items-center justify-end mt-4">
            <PrimaryActionButton
              onClick={runWorkflow}
              disabled={isRunning}
              icon={
                isRunning ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )
              }
            >
              {t("global.run")}
            </PrimaryActionButton>
            {/**
             * Temporarily hidden until workflow view runs return.
             * <SecondaryIconButton
             *   onClick={runWorkflowViewsOnly}
             *   disabled={isRunningViewsOnly}
             *   icon={
             *     isRunningViewsOnly ? (
             *       <Loader2 className="h-4 w-4 animate-spin" />
             *     ) : (
             *       <Play className="h-4 w-4" />
             *     )
             *   }
             * >
             *   {t("workflow.run_views")}
             * </SecondaryIconButton>
             */}
          </div>

          {/* Confirm Clear Modal */}
          {showConfirmClear && (
            <div className="fixed inset-0 bg-white/80 flex items-center justify-center z-50">
              <div className="bg-white p-6 max-w-md flex flex-col rounded-md border border-border">
                <div className="flex items-center mb-4 text-foreground justify-between">
                  <h2 className="text-md font-medium">
                    {t("workflow.confirm_clear_title")}
                  </h2>
                  <Button
                    variant="ghost"
                    size="iconSm"
                    shape="square"
                    className="p-0"
                    onClick={() => setShowConfirmClear(false)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
                <p className="mb-6">{t("workflow.confirm_clear_message")}</p>
                <div className="flex justify-end space-x-2">
                  <SecondaryIconButton onClick={() => setShowConfirmClear(false)}>
                    {t("global.cancel")}
                  </SecondaryIconButton>
                  <SecondaryIconButton
                    variant="destructive"
                    onClick={clearCanvas}
                    disabled={clearingCanvas}
                    icon={
                      clearingCanvas ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )
                    }
                  >
                    {t("workflow.clear_canvas")}
                  </SecondaryIconButton>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default WorkflowBuilder;

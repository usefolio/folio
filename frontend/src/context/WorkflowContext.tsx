import React, {
  useState,
  useEffect,
  ReactNode,
  useCallback,
  useRef,
} from "react";
import { useMutation } from "convex/react";
import { Doc, Id } from "../../convex/_generated/dataModel";
import { api } from "../../convex/_generated/api";
import { useDataContext } from "./DataContext";
import {
  ViewCreationRequest,
  ColumnProcessRequest,
} from "@/interfaces/interfaces";
import { useTranslation } from "react-i18next";
import { WorkflowNode, WorkflowContextType } from "@/interfaces/interfaces";
import {
  LLMModel,
  LLMModelEnum,
  TextGenerationPrompt,
  StructuredOutputPrompt,
  WorkflowRequest,
  JSONSchema,
  FormBuilderSchema,
} from "@/types/types";
import { WorkflowContext } from "./WorkflowContextCore";
import { ColumnType, ColumnSubType } from "@/types/columns";
import { useQueryWithLoading } from "@/services/queryService";
import {
  mapNodeTypeToColumnSubtype,
  mapNodeTypeToColumnType,
  generateClientNodeId,
  findNodeById,
  createDefaultQueryBuilderState,
  createPromptOptions,
  updateNodesRecursively,
} from "@/utils/workflowUtils";
import { encodePrompt, encodeJsonSchema } from "@/utils/promptUtils";
import { useBackendClient } from "@/hooks/useBackendClient";
import { DEFAULT_SYSTEM_PROMPT } from "@/constants";
const DEFAULT_MODEL = LLMModelEnum.GPT4O;
const DEBOUNCE_SAVE_DELAY = 1500;

export const WorkflowProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const {
    project,
    systemPrompt,
    sheets: projectSheets,
    convex,
  } = useDataContext();
  const { t } = useTranslation();
  const DEFAULT_VIEW_NAME = t("global.default");
  const backendClient = useBackendClient();
  const [workflowData, setWorkflowData] = useState<WorkflowNode[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const defaultViewIdRef = useRef<Id<"sheet"> | null>(null);
  const [importProgress, setImportProgress] = useState({
    isImporting: false,
    current: 0,
    total: 0,
    message: "",
  });
  const workflowDataRef = useRef<WorkflowNode[]>(workflowData);
  useEffect(() => {
    workflowDataRef.current = workflowData;
  }, [workflowData]);

  const createColumnMutation = useMutation(api.columns.createNewColumn);
  const createSheetMutation = useMutation(api.sheets.create);
  const saveWorkflowMutation = useMutation(api.projects.saveProjectWorkflow);
  const deleteSheetMutation = useMutation(api.sheets.deleteSheet);
  const deleteColumnMutation = useMutation(api.columns.deleteColumn);
  const updateColumnDetailsMutation = useMutation(
    api.columns.updateColumnDetails,
  );

  const { data: backendWorkflowTree, loading: isBackendTreeLoading } =
    useQueryWithLoading(
      api.projects.getProjectWorkflowTree,
      project ? { projectId: project } : "skip",
      t,
    );

  useEffect(() => {
    if (!project) {
      setWorkflowData([]);
      setIsInitialized(false);
      defaultViewIdRef.current = null;
      return;
    }
    if (backendWorkflowTree) {
      const mapBackendToClientNodes = (
        nodes: WorkflowNode[],
        depth = 0,
      ): WorkflowNode[] => {
        return nodes.map((beNode) => {
          let children: WorkflowNode[] = [];
          if (beNode.isView && beNode.children) {
            children = mapBackendToClientNodes(beNode.children, depth + 1);
          } else if (!beNode.isView) {
            beNode.children = [];
          }
          return {
            ...beNode,
            expanded:
              beNode.expanded === undefined
                ? depth === 0 && beNode.isView
                : beNode.expanded,
            children: children,
            model: beNode.model || DEFAULT_MODEL,
            inputCols: beNode.inputCols || [],
            queryBuilderState: beNode.isView
              ? beNode.queryBuilderState || createDefaultQueryBuilderState()
              : undefined,
          } as WorkflowNode;
        });
      };
      const clientMappedTree = mapBackendToClientNodes(
        backendWorkflowTree as WorkflowNode[],
      );
      setWorkflowData(clientMappedTree);
      const defaultViewNode = clientMappedTree.find(
        (node) =>
          node.isView && node.label === DEFAULT_VIEW_NAME && node.convexId,
      );
      defaultViewIdRef.current = defaultViewNode
        ? (defaultViewNode.convexId as Id<"sheet">)
        : null;
      if (!isInitialized) setIsInitialized(true);
    } else if (
      project &&
      !isBackendTreeLoading &&
      backendWorkflowTree === null
    ) {
      setWorkflowData([]);
      defaultViewIdRef.current = null;
      if (!isInitialized) setIsInitialized(true);
    }
  }, [project, backendWorkflowTree, isBackendTreeLoading, isInitialized]);

  const debouncedSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const saveUIToDB = useCallback(
    async (dataToSave: WorkflowNode[]) => {
      if (!project || !isInitialized || dataToSave === undefined) return;
      try {
        await saveWorkflowMutation({
          projectId: project,
          workflowData: JSON.stringify(dataToSave),
        });
      } catch (error) {
        console.error("Failed to save UI states to DB:", error);
      }
    },
    [project, saveWorkflowMutation, isInitialized],
  );

  useEffect(() => {
    if (!isInitialized || !project || isBackendTreeLoading) return;
    if (debouncedSaveTimeoutRef.current)
      clearTimeout(debouncedSaveTimeoutRef.current);
    debouncedSaveTimeoutRef.current = setTimeout(() => {
      if (workflowDataRef.current) saveUIToDB(workflowDataRef.current);
    }, DEBOUNCE_SAVE_DELAY);
    return () => {
      if (debouncedSaveTimeoutRef.current)
        clearTimeout(debouncedSaveTimeoutRef.current);
    };
  }, [workflowData, project, isInitialized, saveUIToDB, isBackendTreeLoading]);

  const createTagViewsIfNeeded = useCallback(
    async (
      tagColumnNode: Pick<WorkflowNode, "label" | "tags" | "type" | "convexId">,
      currentProject: Id<"project">,
      allProjectSheets: Doc<"sheet">[],
      mutationFn: (args: {
        text: string;
        project_id: Id<"project">;
        filter: string;
        hidden?: Id<"column">[];
      }) => Promise<Id<"sheet">>,
    ) => {
      if (
        tagColumnNode.type === "tag" &&
        tagColumnNode.tags &&
        tagColumnNode.label &&
        currentProject
      ) {
        const tags = tagColumnNode.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);
        for (const tag of tags) {
          const existingSheet = allProjectSheets.find(
            (s) => s.name === tag && s.project_id === currentProject,
          );
          if (!existingSheet) {
            try {
              console.log(
                `Creating tag view for tag "${tag}" from column "${tagColumnNode.label}"`,
              );
              await mutationFn({
                text: tag,
                project_id: currentProject,
                filter: `"${tagColumnNode.label}" LIKE '%${tag.replace(/'/g, "''")}%'`,
                hidden: [],
              });
            } catch (e) {
              console.error(
                `Failed to create tag view for tag "${tag}" from column "${tagColumnNode.label}":`,
                e instanceof Error ? e.message : String(e),
              );
            }
          }
        }
      }
    },
    [],
  );

  const addNode = useCallback(
    async (
      parentId: string | null,
      nodeData: Partial<WorkflowNode>,
    ): Promise<string> => {
      if (!project) {
        console.error("AddNode Error: Project not available.");
        throw new Error("Project not available.");
      }
      let newPrimaryConvexId: Id<"sheet"> | Id<"column"> | undefined;
      if (nodeData.isView) {
        if (nodeData.label === DEFAULT_VIEW_NAME && defaultViewIdRef.current) {
          const existingDefault = findNodeById(
            workflowDataRef.current,
            `view-backend-${defaultViewIdRef.current}`,
          );
          if (existingDefault) {
            console.error(
              `AddNode Error: Default view "${DEFAULT_VIEW_NAME}" already exists.`,
            );
            throw new Error("Default view already exists.");
          }
        }
        newPrimaryConvexId = await createSheetMutation({
          text: nodeData.label || "New View",
          project_id: project,
          filter: nodeData.sql_condition || "1=1",
          hidden: [],
        });
      } else {
        // Column
        if (!parentId) {
          console.error("AddNode Error: Columns must have a parent view.");
          throw new Error("Columns must have a parent view.");
        }
        const parentNode = findNodeById(workflowDataRef.current, parentId);
        if (!parentNode?.isView || !parentNode?.convexId) {
          console.error("AddNode Error: Invalid parent view for column.");
          throw new Error("Invalid parent view.");
        }
        const parentSheetDbIdForColumn = parentNode.convexId as Id<"sheet">;
        const promptOptions = createPromptOptions(nodeData);
        const colType = mapNodeTypeToColumnType(nodeData.type);
        const colSubtype = mapNodeTypeToColumnSubtype(
          nodeData.type,
          nodeData.tagMode,
        );
        if (!colType && nodeData.type !== undefined) {
          console.error(
            `AddNode Error: Invalid node type "${String(nodeData.type)}" for column.`,
          );
          throw new Error("Invalid node type for column.");
        }
        newPrimaryConvexId = await createColumnMutation({
          name: nodeData.label || "",
          column_type: (colType || "noSchema") as ColumnType,
          column_subtype: colSubtype as ColumnSubType | null,
          project_id: project,
          created_on_sheet_id: parentSheetDbIdForColumn,
          prompt: promptOptions ? encodePrompt(promptOptions) : undefined,
          jsonSchema: nodeData.responseSchema
            ? encodeJsonSchema(nodeData.responseSchema as FormBuilderSchema)
            : undefined,
        });
        if (nodeData.type === "tag" && nodeData.label && newPrimaryConvexId) {
          await createTagViewsIfNeeded(
            {
              label: nodeData.label || "",
              tags: nodeData.tags || "",
              type: "tag" as const,
              convexId: newPrimaryConvexId as Id<"column">,
            },
            project,
            projectSheets || [],
            createSheetMutation,
          );
        }
      }
      return generateClientNodeId(
        nodeData.isView ? "view-pending" : "col-pending",
      );
    },
    [
      project,
      createSheetMutation,
      createColumnMutation,
      projectSheets,
      createTagViewsIfNeeded,
      workflowDataRef,
      defaultViewIdRef,
    ],
  );

  const updateNode = useCallback(
    async (
      nodeId: string,
      updatedData: Partial<WorkflowNode>,
    ): Promise<void> => {
      if (!project) {
        console.error("UpdateNode Error: Project not available.");
        throw new Error("Project not available.");
      }

      const nodeToUpdate = findNodeById(workflowDataRef.current, nodeId); // State BEFORE this specific update batch
      if (!nodeToUpdate) {
        console.warn("UpdateNode Warning: Node to update not found:", nodeId);
        throw new Error("Node to update not found.");
      }

      // Optimistically apply ALL UI changes to local state for immediate responsiveness.
      // This makes finalNodeState below have the most current intended state.
      if (Object.keys(updatedData).length > 0) {
        setWorkflowData((prevData) =>
          updateNodesRecursively(prevData, nodeId, (node) => ({
            ...node,
            ...updatedData,
          })),
        );
      }

      const finalNodeState = { ...nodeToUpdate, ...updatedData }; // The intended state after this edit.

      if (!finalNodeState.convexId) {
        console.log(
          `UpdateNode: Node ${nodeId} (label: ${finalNodeState.label}) has no convexId. Only local UI changes applied and will be persisted by debounced save.`,
        );
        return;
      }

      if (finalNodeState.isView) {
        console.log(
          `View node "${finalNodeState.label}" UI properties updated. Name/filter changes are persisted to project_workflow via debounced save. Direct DB sheet mutation for name/filter would go here if needed.`,
        );
      } else {
        const promptAffectingFields: (keyof WorkflowNode)[] = [
          "label",
          "summary",
          "model",
          "type",
          "tags",
          "tagMode",
          "responseSchema",
          "inputCols",
        ];
        let underlyingPromptDataChanged = false;
        for (const key of promptAffectingFields) {
          if (
            updatedData[key] !== undefined &&
            updatedData[key] !== nodeToUpdate[key]
          ) {
            // Compare updatedData to original nodeToUpdate state
            underlyingPromptDataChanged = true;
            break;
          }
        }

        if (underlyingPromptDataChanged) {
          const newPromptOptions = createPromptOptions(finalNodeState); // Uses the fully merged state
          const oldPromptOptions = createPromptOptions(nodeToUpdate); // Uses the state before this current 'updatedData' batch

          if (newPromptOptions) {
            const newEncodedPrompt = encodePrompt(newPromptOptions);
            const oldEncodedPrompt = oldPromptOptions
              ? encodePrompt(oldPromptOptions)
              : undefined;

            if (newEncodedPrompt !== oldEncodedPrompt) {
              try {
                console.log(
                  `UpdateNode: Prompt changed for column ${finalNodeState.label} (${finalNodeState.convexId}). Sending update to backend.`,
                );
                await updateColumnDetailsMutation({
                  columnId: finalNodeState.convexId as Id<"column">,
                  name: finalNodeState.label,
                  prompt: newEncodedPrompt,
                });
              } catch (error) {
                console.error(
                  `UpdateNode Error: Failed updating column prompt for ${nodeId}:`,
                  error instanceof Error ? error.message : String(error),
                );
                throw error;
              }
            } else if (nodeToUpdate.label !== finalNodeState.label) {
              console.log(
                `UpdateNode: Column name changed for column ${finalNodeState.label} (${finalNodeState.convexId}). Sending update to backend.`,
              );
              await updateColumnDetailsMutation({
                columnId: finalNodeState.convexId as Id<"column">,
                name: finalNodeState.label,
                prompt: newEncodedPrompt,
              });
            } else {
              console.log(
                `UpdateNode: Prompt-affecting fields for column "${finalNodeState.label}" changed, but resulting encoded prompt is the same. No backend prompt update sent.`,
              );
            }
          } else if (
            nodeToUpdate.type !== undefined &&
            finalNodeState.type === undefined
          ) {
            // Type was cleared, potentially clearing prompt
            try {
              console.log(
                `UpdateNode: Prompt type potentially cleared for "${finalNodeState.label}". Sending empty/default prompt to backend.`,
              );
              await updateColumnDetailsMutation({
                columnId: finalNodeState.convexId as Id<"column">,
                name: finalNodeState.label,
                prompt: undefined,
              });
            } catch (error) {
              console.error(
                `UpdateNode Error: Failed clearing prompt for ${nodeId}:`,
                error instanceof Error ? error.message : String(error),
              );
              throw error;
            }
          } else if (underlyingPromptDataChanged) {
            // Data changed but couldn't form new prompt options (e.g. invalid type now)
            console.warn(
              `UpdateNode Warning: Could not generate new prompt options for node "${finalNodeState.label}" despite changes. Old prompt may persist or be cleared if type removed.`,
            );
          }
        } else {
          console.log(
            `UpdateNode: No prompt-affecting data changed for column "${finalNodeState.label}".`,
          );
        }
        if (
          finalNodeState.type === "tag" &&
          finalNodeState.label &&
          finalNodeState.convexId
        ) {
          console.log(
            `UpdateNode: Node "${finalNodeState.label}" is a tag column. Ensuring its tag views exist.`,
          );
          await createTagViewsIfNeeded(
            {
              label: finalNodeState.label,
              tags: finalNodeState.tags || "",
              type: "tag" as const,
              convexId: finalNodeState.convexId as Id<"column">,
            },
            project!,
            projectSheets || [],
            createSheetMutation,
          );
        }
      }
    },
    [
      project,
      workflowDataRef,
      updateColumnDetailsMutation,
      projectSheets,
      createSheetMutation,
      createTagViewsIfNeeded,
      setWorkflowData,
    ],
  );

  const deleteNode = useCallback(
    async (nodeId: string): Promise<void> => {
      if (!project) {
        console.error("DeleteNode Error: Project not available.");
        throw new Error("Project not available.");
      }
      const nodeToDelete = findNodeById(workflowDataRef.current, nodeId);
      if (!nodeToDelete) {
        console.warn("DeleteNode Warning: Node to delete not found:", nodeId);
        throw new Error("Node to delete not found.");
      }
      if (
        nodeToDelete.isView &&
        nodeToDelete.convexId === defaultViewIdRef.current
      ) {
        console.error(
          `DeleteNode Error: Cannot delete the "${DEFAULT_VIEW_NAME}" view.`,
        );
        throw new Error("Cannot delete Default view.");
      }

      const sheetsToDelete = new Set<Id<"sheet">>();
      const columnsToDelete = new Set<Id<"column">>();

      const collectChildrenForDeletion = (parentNode: WorkflowNode) => {
        if (parentNode.isView && parentNode.children) {
          for (const child of parentNode.children) {
            if (!child.isView && child.convexId)
              columnsToDelete.add(child.convexId as Id<"column">);
          }
        }
      };

      if (nodeToDelete.isView && nodeToDelete.convexId) {
        sheetsToDelete.add(nodeToDelete.convexId as Id<"sheet">);
        collectChildrenForDeletion(nodeToDelete);
      } else if (!nodeToDelete.isView && nodeToDelete.convexId) {
        // Column
        columnsToDelete.add(nodeToDelete.convexId as Id<"column">);
        if (
          nodeToDelete.type === "tag" &&
          nodeToDelete.tags &&
          nodeToDelete.label
        ) {
          const tags = nodeToDelete.tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean);
          (projectSheets || []).forEach((sheet) => {
            for (const tag of tags) {
              const expectedFilter = `"${nodeToDelete.label}" LIKE '%${tag.replace(/'/g, "''")}%'`;
              if (
                sheet.name === tag &&
                sheet.filter === expectedFilter &&
                sheet.project_id === project
              ) {
                sheetsToDelete.add(sheet._id);
                const tagViewNodeInClientState = findNodeById(
                  workflowDataRef.current,
                  `view-backend-${sheet._id}`,
                );
                if (tagViewNodeInClientState)
                  collectChildrenForDeletion(tagViewNodeInClientState);
                break;
              }
            }
          });
        }
      }

      const deletePromises: Promise<any>[] = [];
      sheetsToDelete.forEach((id) =>
        deletePromises.push(deleteSheetMutation({ sheetId: id })),
      );
      columnsToDelete.forEach((id) =>
        deletePromises.push(deleteColumnMutation({ columnId: id })),
      );
      const results = await Promise.allSettled(deletePromises);
      results.forEach((result) => {
        if (result.status === "rejected")
          console.error("A deletion failed:", result.reason);
      });
      if (results.some((r) => r.status === "rejected"))
        console.warn("Some items might not have been deleted.");
      else if (deletePromises.length > 0)
        console.log("Node and associated items deleted successfully.");
    },
    [
      project,
      workflowDataRef,
      defaultViewIdRef,
      deleteSheetMutation,
      deleteColumnMutation,
      projectSheets,
    ],
  );

  const clearWorkflowExceptDefault = useCallback(async (): Promise<void> => {
    if (!project || !workflowDataRef.current) {
      console.warn("Clear Workflow Warning: Project or data not available.");
      return;
    }
    const defaultSheetNode = workflowDataRef.current.find(
      (n) => n.isView && n.label === DEFAULT_VIEW_NAME && n.convexId,
    );
    const defaultSheetConvexId = defaultSheetNode?.convexId;
    console.warn(
      "Clear Workflow: User confirmation step (window.confirm) bypassed. Proceeding with clear logic.",
    );

    const sheetsToDelete = new Set<Id<"sheet">>();
    const columnsToDelete = new Set<Id<"column">>();
    workflowDataRef.current.forEach((node) => {
      // Iterate root views
      if (
        node.isView &&
        node.convexId !== defaultSheetConvexId &&
        node.convexId
      ) {
        sheetsToDelete.add(node.convexId as Id<"sheet">);
        (node.children || []).forEach((child) => {
          if (!child.isView && child.convexId)
            columnsToDelete.add(child.convexId as Id<"column">);
        });
      } else if (node.isView && node.convexId === defaultSheetConvexId) {
        (node.children || []).forEach((child) => {
          if (!child.isView && child.convexId)
            columnsToDelete.add(child.convexId as Id<"column">);
        });
      }
    });
    const deletePromises: Promise<any>[] = [];
    sheetsToDelete.forEach((id) =>
      deletePromises.push(deleteSheetMutation({ sheetId: id })),
    );
    columnsToDelete.forEach((id) =>
      deletePromises.push(deleteColumnMutation({ columnId: id })),
    );
    try {
      const results = await Promise.allSettled(deletePromises);
      results.forEach((r) => {
        if (r.status === "rejected")
          console.error("A deletion failed during clear:", r.reason);
      });
      console.log(
        "Workflow cleared (except default view structure where applicable). UI will refresh.",
      );
    } catch (error) {
      console.error("Error during batch clearing workflow:", error);
    }
  }, [
    project,
    workflowDataRef,
    deleteSheetMutation,
    deleteColumnMutation,
    defaultViewIdRef,
  ]);

  const exportWorkflow = useCallback(
    () => JSON.stringify(workflowDataRef.current, null, 2),
    [workflowDataRef],
  );

  const exportWorkflowViews = useCallback(() => {
    const viewsOnly = workflowDataRef.current
      .filter((n) => n.isView)
      .map((view) => ({ ...view, children: [] }));

    return JSON.stringify(viewsOnly, null, 2);
  }, [workflowDataRef]);

  const convertWorkflowToRequests = useCallback((): WorkflowRequest[] => {
    if (!project) {
      console.warn("Export Error: Project not available.");
      return [];
    }
    if (!workflowDataRef.current) {
      console.warn("Export Error: Workflow data not available.");
      return [];
    }
    const requests: WorkflowRequest[] = [];
    const convexUrl = import.meta.env.VITE_CONVEX_URL;
    if (!convexUrl) {
      console.error("Export Error: VITE_CONVEX_URL not defined.");
      return [];
    }
    const callbackUrl = convexUrl.replace(/\.cloud$/, ".site");
    const systemPromptText = systemPrompt?.value || DEFAULT_SYSTEM_PROMPT;

    const processNodeForExport = (
      node: WorkflowNode,
      parentSqlCondition?: string,
    ) => {
      const currentTimestamp = new Date().toISOString();
      if (node.isView && node.convexId) {
        requests.push({
          timestamp: currentTimestamp,
          path: "/create_view",
          request_data: {
            convex_project_id: project,
            convex_sheet_id: node.convexId as Id<"sheet">,
            sql_filter: node.sql_condition || "1=1",
            callback_url: callbackUrl,
          },
        });
        if (node.children)
          node.children.forEach((child) =>
            processNodeForExport(child, node.sql_condition),
          );
      } else if (
        !node.isView &&
        node.convexId &&
        node.convexSheetId &&
        node.summary &&
        node.summary.length > 0 &&
        node.label
      ) {
        const model = (node.model || DEFAULT_MODEL) as LLMModel;
        let determinedExtractionKeyword = "default_keyword";
        if (node.type === "tag")
          determinedExtractionKeyword = "extraction_keyword";
        else if (node.type === "extract")
          determinedExtractionKeyword = "extracted_data";
        else if (node.type === "summary" || node.type === "ask")
          determinedExtractionKeyword = "text_completion";

        const baseRequestData: Omit<
          ColumnProcessRequest["request_data"],
          "prompt" | "extraction_keyword"
        > = {
          convex_project_id: project,
          convex_column_id: node.convexId as Id<"column">,
          column_name: node.label,
          sql_condition: parentSqlCondition || "1=1",
          output_name: determinedExtractionKeyword,
          prompt_input_columns: node.inputCols || [],
          workflow_id: null,
          api_keys: {},
          callback_url: callbackUrl,
        };
        let promptPayload:
          | TextGenerationPrompt
          | StructuredOutputPrompt
          | undefined = undefined;
        if (node.type === "tag") {
          const tags =
            node.tags
              ?.split(",")
              .map((t) => t.trim())
              .filter(Boolean) || [];
          const properties: Record<string, JSONSchema> = {};
          properties[determinedExtractionKeyword] =
            node.tagMode === "multiTag"
              ? { type: "array", items: { type: "string", enum: tags } }
              : { type: "string", enum: tags };
          promptPayload = {
            model,
            system_prompt: systemPromptText,
            user_prompt_template: node.summary,
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "Classification",
                schema: {
                  type: "object",
                  properties: properties,
                  required: [determinedExtractionKeyword],
                },
              },
            },
            extraction_keyword: determinedExtractionKeyword,
          };
        } else if (node.type === "extract") {
          const schemaForExtract = node.responseSchema || {
            type: "object",
            properties: {},
            required: [],
          };
          promptPayload = {
            model,
            system_prompt: systemPromptText,
            user_prompt_template: node.summary,
            response_format: {
              type: "json_schema",
              json_schema: { name: "ExtractedData", schema: schemaForExtract },
            },
            extraction_keyword: determinedExtractionKeyword,
          };
        } else if (node.type === "summary" || node.type === "ask") {
          promptPayload = {
            model,
            messages: [
              {
                role: "system",
                content: [{ type: "text", text: systemPromptText }],
              },
              { role: "user", content: [{ type: "text", text: node.summary }] },
            ],
            extraction_keyword: determinedExtractionKeyword,
          } as TextGenerationPrompt;
        } else {
          console.warn(
            `Export: Skipping request for node ${node.label} due to unhandled type: ${node.type}`,
          );
          return;
        }
        if (promptPayload)
          requests.push({
            timestamp: currentTimestamp,
            path: "/process",
            request_data: {
              ...baseRequestData,
              extraction_keyword: determinedExtractionKeyword,
              prompt: promptPayload,
            },
          });
      }
    };
    workflowDataRef.current.forEach((node) => processNodeForExport(node));
    return requests;
  }, [project, systemPrompt, workflowDataRef]);

  const convertWorkflowToViewRequests =
    useCallback((): ViewCreationRequest[] => {
      if (!project || !workflowDataRef.current) {
        console.warn("Export Views Error: Project or data not available.");
        return [];
      }
      const viewRequests: ViewCreationRequest[] = [];
      const convexUrl = import.meta.env.VITE_CONVEX_URL;
      if (!convexUrl) {
        console.error("Export Views Error: VITE_CONVEX_URL not defined.");
        return [];
      }
      const callbackUrl = convexUrl.replace(/\.cloud$/, ".site");

      workflowDataRef.current.forEach((node) => {
        if (node.isView && node.convexId) {
          viewRequests.push({
            timestamp: new Date().toISOString(),
            path: "/create_view",
            request_data: {
              convex_project_id: project,
              convex_sheet_id: node.convexId as Id<"sheet">,
              sql_filter: node.sql_condition || "1=1",
              callback_url: callbackUrl,
            },
          });
        }
      });
      return viewRequests;
    }, [project, workflowDataRef]);

  const toggleExpanded = useCallback((nodeId: string) => {
    setWorkflowData((prevData) =>
      updateNodesRecursively(prevData, nodeId, (node) => ({
        ...node,
        expanded: !node.expanded,
      })),
    );
  }, []);

  const importWorkflow = useCallback(
    async (jsonData: string): Promise<void> => {
      if (!project) {
        console.error("Import Error: Project not loaded.");
        throw new Error("Project not loaded.");
      }

      setImportProgress({
        isImporting: true,
        current: 0,
        total: 0,
        message: "Preparing import...",
      });

      try {
        // Use the service to handle the import logic
        const result = await backendClient.importWorkflow({
          jsonData,
          project_id: project,
          defaultViewId: defaultViewIdRef.current,
          currentWorkflowData: workflowDataRef.current,
          progressCallback: (progress) => {
            setImportProgress((prev) => ({
              ...prev,
              current: progress.current,
              total: progress.total,
              message: progress.message,
            }));
          },
        });

        // Update the local state with the imported structure
        setWorkflowData(result.importedStructure);

        // Log any warnings/errors that occurred during import
        if (result.errors.length > 0) {
          console.warn("Import completed with warnings:", result.errors);
        }

        console.log(
          "Import workflow successful, saved new structure and updated client state.",
        );
      } catch (error) {
        console.error(
          "Import workflow failed:",
          error instanceof Error ? error.message : String(error),
        );
        throw error;
      } finally {
        setTimeout(
          () =>
            setImportProgress({
              isImporting: false,
              current: 0,
              total: 0,
              message: "",
            }),
          2000,
        );
      }
    },
    [project, convex, setImportProgress, setWorkflowData, t],
  );

  const contextValue: WorkflowContextType = {
    workflowData,
    setWorkflowData,
    addNode,
    updateNode,
    deleteNode,
    clearWorkflowExceptDefault,
    toggleExpanded,
    importWorkflow,
    exportWorkflow,
    exportWorkflowViews,
    workflowLoading: isBackendTreeLoading || !isInitialized,
    importProgress,
    exportWorkflowAsRequestsJson: () =>
      JSON.stringify({ requests: convertWorkflowToRequests() }, null, 2),
    exportWorkflowAsRequests: convertWorkflowToRequests,
    exportWorkflowAsViewRequestsJson: () =>
      JSON.stringify({ requests: convertWorkflowToViewRequests() }, null, 2),
    exportWorkflowAsViewRequests: () =>
      convertWorkflowToViewRequests() as WorkflowRequest[],
  };

  return (
    <WorkflowContext.Provider value={contextValue}>
      {children}
    </WorkflowContext.Provider>
  );
};

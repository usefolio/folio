import React, { useState, useMemo, useRef, useCallback } from "react"; // ← added useMemo
import {
  SavedPrompt,
  PromptOptions,
  JsonOutputPromptOptions,
} from "../../types/types";
import { WorkflowNode } from "../../interfaces/interfaces";
import { useTranslation } from "react-i18next";
import ColumnModalConfig from "../modalConfig/columnModalConfig";
import { Button } from "../ui/button";
import { DEFAULT_AI_MODEL } from "../../constants";
import {
  ModalManagerState,
  ModalReducerActions,
  MentionsComponentRef,
} from "../../interfaces/interfaces";
import { FileWithProgress, GroupedPrompts } from "../../interfaces/interfaces";
// import { Id } from "../../../convex/_generated/dataModel";
import { useDataContext } from "@/context/DataContext";
import {
  mapNodeTypeToPromptType,
  mapPromptTypeToNodeType,
  mapNodeTypeToSchemaType,
} from "@/utils/workflowUtils";
import { Loader2 } from "lucide-react";

interface ColumnEditorAdapterProps {
  node?: WorkflowNode;
  isNew?: boolean;
  onSave: (nodeData: Partial<WorkflowNode>) => void;
  onCancel: () => void;
  isSaving: boolean;
  nodeError?: string;
}
// Adapter for column modal config where modal reducer state and actions are transferred and modified to support the workflow nodes
const ColumnEditorAdapter: React.FC<ColumnEditorAdapterProps> = ({
  node,
  isNew = false,
  onSave,
  onCancel,
  isSaving,
  nodeError,
}) => {
  const { t } = useTranslation();
  const {
    project: projectId,
    savedPrompts,
    columns,
    sheets,
  } = useDataContext();
  const parseTags = (node?: WorkflowNode): string[] =>
    node?.tags
      ? node.tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean)
      : [];
  const defaultPromptOptions: PromptOptions = {
    model: DEFAULT_AI_MODEL,
    userPrompt: "",
    promptType: "schema",
    schemaType: node?.tagMode || "singleTag",
    responseOptions: [],
    promptInputColumns: node?.inputCols ?? [],
    ask: false,
  };
  const [state, setState] = useState<ModalManagerState>({
    columnName: node?.label || "",
    promptOptions: node
      ? ({
          model: node?.model || DEFAULT_AI_MODEL,
          promptType: mapNodeTypeToPromptType(node?.type),
          schemaType:
            node?.type === "tag"
              ? node?.tagMode || "singleTag" // Use saved tagMode
              : mapNodeTypeToSchemaType(node?.type),
          userPrompt: node?.summary || "",
          responseOptions: parseTags(node),
          promptInputColumns: node?.inputCols?.length ? node.inputCols : [],
          ask: node?.type === "ask" || false,
          responseSchema: node.responseSchema
            ? { ...node.responseSchema }
            : { type: "object", properties: {}, fields: [] },
        } as PromptOptions)
      : defaultPromptOptions,
    savedPrompts: savedPrompts,
    selectedPrompt: "",
    isLoading: false,
    currentStep: 0,
    stepsStatus: [
      {
        step: "Step 1",
        status: "pending",
        description: "",
        index: 0,
        kind: "createProject",
      },
      {
        step: "Step 2",
        status: "pending",
        description: "",
        index: 1,
        kind: "upload",
      },
    ],
    isEditingTagTextArea: false,
    tagTextAreaValue: node?.tags || "",
    tagTextAreaError: false,
    tagTextAreaerrorDetails: "",
    tagTextAreaOriginalInput: node?.tags || "",
    promptNameError: null,
    promptsLoaded: false,
    promptInputOverlayValidationError: "",
    promptInputOverlayValidationWarning: "",
    mentionsPopupPosition: { top: 0, left: 0 },
    projectName: "",
    selectedFiles: null,
    error: null,
    exaQuery: "",
    exaActionType: "search",
    exaFindSimilarUrl: "",
    exaSearchType: "news_article",
    isExaLoading: false,
    exaNumResults: 10,
    sqlQuery: "",
    jsonSchema: "none",
    connectors: [],
    selectedConnector: { name: "", lastSync: "", isAlive: false },
    isQueryEntered: false,
    isQueryLoading: false,
    activeTab: "upload",
    showFileTable: false,
    isUploading: false,
    fileSubmitDisabled: false,
    estimatedCost: null,
    estimatedCostLoading: false,
    exportSelectedColumns: {},
    exportSelectedViews: {},
    exportActiveTab: "columns",
    userHasSetColumnsSelection: false,
    userHasSetViewsSelection: false,
    isExporting: false,
    exportDownloadUrl: null,
    creationFlowType: "upload",
    searchResultsCount: null,
  });
  /* ---------- actions wrapped in useMemo (NEW) ---------- */
  const actions: ModalReducerActions = useMemo(
    () => ({
      setColumnName: (name: string) =>
        setState((prev) => ({ ...prev, columnName: name })),

      setPromptOptions: (options: PromptOptions) =>
        setState((prev) => ({ ...prev, promptOptions: options })),

      setSavedPrompts: (prompts: SavedPrompt[]) =>
        setState((prev) => ({ ...prev, savedPrompts: prompts })),

      setSelectedSavedPrompt: (promptId: string) =>
        setState((prev) => ({ ...prev, selectedPrompt: promptId })),

      setIsLoading: (loading: boolean) =>
        setState((prev) => ({ ...prev, isLoading: loading })),

      setCurrentStep: (step: number) =>
        setState((prev) => ({ ...prev, currentStep: step })),

      setStepStatus: ({ index, status, description }) =>
        setState((prev) => ({
          ...prev,
          stepsStatus: prev.stepsStatus.map((s, i) =>
            i === index
              ? {
                  ...s,
                  status,
                  ...(description !== undefined ? { description } : {}),
                }
              : s,
          ),
        })),

      setSteps: (steps) =>
        setState((prev) => ({
          ...prev,
          stepsStatus: steps,
        })),

      resetSteps: () =>
        setState((prev) => ({
          ...prev,
          stepsStatus: prev.stepsStatus.map((s) => ({
            ...s,
            status: "pending",
            description: s.description ?? "",
          })),
        })),

      setCreationFlowType: (flow) =>
        setState((prev) => ({ ...prev, creationFlowType: flow })),

      setSearchResultsCount: (count) =>
        setState((prev) => ({ ...prev, searchResultsCount: count })),

      setIsEditingTagTextArea: (v: boolean) =>
        setState((prev) => ({ ...prev, isEditingTagTextArea: v })),

      setTagTextareaValue: (v: string) =>
        setState((prev) => ({ ...prev, tagTextAreaValue: v })),

      setTagTextAreaError: (v: boolean) =>
        setState((prev) => ({ ...prev, tagTextAreaError: v })),

      setTagTextAreaErrorDetails: (v: string) =>
        setState((prev) => ({ ...prev, tagTextAreaerrorDetails: v })),

      setTagTextAreaOriginalInput: (v: string) =>
        setState((prev) => ({ ...prev, tagTextAreaOriginalInput: v })),

      setPromptNameError: (v: string | null) =>
        setState((prev) => ({ ...prev, promptNameError: v })),

      setPromptInputOverlayValidationError: (v: string) =>
        setState((prev) => ({
          ...prev,
          promptInputOverlayValidationError: v,
        })),

      setPromptInputOverlayValidationWarning: (v: string) =>
        setState((prev) => ({
          ...prev,
          promptInputOverlayValidationWarning: v,
        })),

      setProjectName: (name: string) =>
        setState((prev) => ({ ...prev, projectName: name })),

      setPromptsLoaded: (loaded: boolean) =>
        setState((prev) => ({ ...prev, promptsLoaded: loaded })),

      setMentionsPopupPosition: (pos: {
        top: string | number;
        left: string | number;
      }) => +setState((prev) => ({ ...prev, mentionsPopupPosition: pos })),

      setSelectedFiles: (files: FileWithProgress | FileWithProgress[] | null) =>
        setState((prev) => ({ ...prev, selectedFiles: files })),

      setError: (error: string | null) =>
        setState((prev) => ({ ...prev, error })),

      setExaQuery: (val: string) =>
        setState((prev) => ({ ...prev, exaQuery: val })),

      setExaNumResults: (num: number) =>
        setState((prev) => ({ ...prev, exaNumResults: num })),

      setIsExaLoading: (loading: boolean) =>
        setState((prev) => ({ ...prev, isExaLoading: loading })),

      setExaSearchType: (
        type:
          | "news_article"
          | "github"
          | "personal_site"
          | "linkedin_profile"
          | "company",
      ) => setState((prev) => ({ ...prev, exaSearchType: type })),
      setExaActionType: (action_type: "search" | "findSimilar") =>
        setState((prev) => ({ ...prev, exaActionType: action_type })),
      setExaFindSimilarUrl: (url: string) =>
        setState((prev) => ({ ...prev, exaFindSimilarUrl: url })),
      setSqlQuery: (q: string) =>
        setState((prev) => ({ ...prev, sqlQuery: q })),

      setJsonSchema: (jsonschm: string) =>
        setState((prev) => ({ ...prev, JsonSchema: jsonschm })),

      setSelectedConnector: (name: string) =>
        setState((prev) => ({
          ...prev,
          selectedConnector: { ...prev.selectedConnector, name },
        })),

      setIsQueryEntered: (v: boolean) =>
        setState((prev) => ({ ...prev, isQueryEntered: v })),

      setIsQueryLoading: (v: boolean) =>
        setState((prev) => ({ ...prev, isQueryLoading: v })),

      setActiveTab: (_tab: "upload" | "exa" | "datawarehouse") =>
        setState((prev) => ({ ...prev, activeTab: "upload" })),

      clearSelection: () =>
        setState((prev) => ({
          ...prev,
          selectedFiles: null,
          projectName: "",
          error: null,
          jsonSchema: "none",
          exaQuery: "",
          exaNumResults: 10,
          exaSearchType: "news_article",
          isExaLoading: false,
          sqlQuery: "",
          creationFlowType: "upload",
          searchResultsCount: null,
        })),

      setShowFileTable: (show: boolean) =>
        setState((prev) => ({ ...prev, showFileTable: show })),

      setIsUploading: (up: boolean) =>
        setState((prev) => ({ ...prev, isUploading: up })),

      setSubmitDisabled: (dis: boolean) =>
        setState((prev) => ({ ...prev, fileSubmitDisabled: dis })),

      updateFileStatus: (id, status, prog, err) =>
        setState((prev) => {
          if (!prev.selectedFiles) return prev;

          if (Array.isArray(prev.selectedFiles)) {
            return {
              ...prev,
              selectedFiles: prev.selectedFiles.map((f) =>
                f.id === id
                  ? {
                      ...f,
                      status,
                      progress: prog ?? f.progress,
                      error: err,
                    }
                  : f,
              ),
            };
          }

          const f = prev.selectedFiles as FileWithProgress;
          return f.id === id
            ? {
                ...prev,
                selectedFiles: {
                  ...f,
                  status,
                  progress: prog ?? f.progress,
                  error: err,
                },
              }
            : prev;
        }),

      removeFile: (id) =>
        setState((prev) => {
          if (!prev.selectedFiles) return prev;

          if (Array.isArray(prev.selectedFiles)) {
            const remaining = prev.selectedFiles.filter((f) => f.id !== id);
            return {
              ...prev,
              selectedFiles: remaining.length ? remaining : null,
            };
          }

          const f = prev.selectedFiles as FileWithProgress;
          return f.id === id ? { ...prev, selectedFiles: null } : prev;
        }),

      clearCompletedFiles: () =>
        setState((prev) => {
          if (!prev.selectedFiles) return prev;

          if (Array.isArray(prev.selectedFiles)) {
            const remaining = prev.selectedFiles.filter(
              (f) => f.status !== "completed",
            );
            return {
              ...prev,
              selectedFiles: remaining.length ? remaining : null,
            };
          }

          const f = prev.selectedFiles as FileWithProgress;
          return f.status === "completed"
            ? { ...prev, selectedFiles: null }
            : prev;
        }),

      setEstimatedCost: (c: string | null) =>
        setState((prev) => ({ ...prev, estimatedCost: c })),

      setEstimatedCostLoading: (l: boolean) =>
        setState((prev) => ({ ...prev, estimatedCostLoading: l })),

      setExportActiveTab: (_tab: "columns" | "views") =>
        setState((prev) => ({ ...prev, exportActiveTab: "columns" })),

      toggleExportColumn: (id, sel) =>
        setState((prev) => ({
          ...prev,
          exportSelectedColumns: {
            ...prev.exportSelectedColumns,
            [id]: sel,
          },
        })),

      toggleExportView: (id, sel) =>
        setState((prev) => ({
          ...prev,
          exportSelectedViews: { ...prev.exportSelectedViews, [id]: sel },
        })),

      selectAllExportColumns: (cols) => {
        const sel: Record<string, boolean> = {};
        cols.forEach((c) => (sel[c._id] = true));
        setState((prev) => ({
          ...prev,
          exportSelectedColumns: sel,
          userHasSetColumnsSelection: true,
        }));
      },

      selectAllExportViews: (views) => {
        const sel: Record<string, boolean> = {};
        views.forEach((v) => (sel[v._id] = true));
        setState((prev) => ({
          ...prev,
          exportSelectedViews: sel,
          userHasSetViewsSelection: true,
        }));
      },

      deselectAllExportColumns: () =>
        setState((prev) => ({
          ...prev,
          exportSelectedColumns: {},
          userHasSetColumnsSelection: true,
        })),

      deselectAllExportViews: () =>
        setState((prev) => ({
          ...prev,
          exportSelectedViews: {},
          userHasSetViewsSelection: true,
        })),

      setUserHasSetColumnsSelection: (v) =>
        setState((prev) => ({ ...prev, userHasSetColumnsSelection: v })),

      setUserHasSetViewsSelection: (v) =>
        setState((prev) => ({ ...prev, userHasSetViewsSelection: v })),

      setIsExporting: (v) => setState((prev) => ({ ...prev, isExporting: v })),

      setInitialExportColumns: (sel) =>
        setState((prev) => ({
          ...prev,
          exportSelectedColumns: sel,
          userHasSetColumnsSelection: true,
        })),

      setInitialExportViews: (sel) =>
        setState((prev) => ({
          ...prev,
          exportSelectedViews: sel,
          userHasSetViewsSelection: true,
        })),
      clearColumnModalData: () =>
        setState((prev) => ({
          ...prev,
          promptOptions: {
            model: DEFAULT_AI_MODEL,
            userPrompt: "",
            promptType: "schema", // New type
            schemaType: "singleTag", // New property
            responseOptions: [],
            promptInputColumns: [],
          },
          columnName: "",
          isLoading: false,
          isEditingTagTextArea: false,
          promptNameError: null,
          tagTextAreaOriginalInput: "",
          tagTextAreaValue: "",
          promptInputOverlayValidationError: "",
          promptInputOverlayValidationWarning: "",
          estimatedCost: null,
        })),
      setExportDownloadUrl: (data: { url: string } | null) => {
        setState((prev) => ({
          ...prev,
          exportDownloadUrl: data ? data.url : null,
        }));
      },
    }),
    [],
  );
  // On fly column validation, similar to what is done in column modal config
  const checkIfTagsEmpty = (): boolean => {
    if (
      state.promptOptions.promptType === "schema" &&
      (state.promptOptions.schemaType === "singleTag" ||
        state.promptOptions.schemaType === "multiTag")
    ) {
      return (
        !state.promptOptions.responseOptions ||
        state.promptOptions.responseOptions.length === 0
      );
    }
    return false;
  };

  const checkIfExtractSchemaEmpty = (): boolean => {
    if (
      state.promptOptions.promptType === "schema" &&
      state.promptOptions.schemaType === "freeForm"
    ) {
      return (
        !state.promptOptions.responseSchema ||
        Object.keys(state.promptOptions.responseSchema.properties || {})
          .length === 0
      );
    }
    return false;
  };

  const handleSave = () => {
    const tags =
      state.promptOptions.promptType === "schema" &&
      ["singleTag", "multiTag"].includes(state.promptOptions.schemaType!)
        ? (state.promptOptions.responseOptions?.join(", ") ?? "")
        : "";

    // Extract column names from the prompt
    const regex = /\{\{([^}]+)\}\}/g;
    const matches = state.promptOptions.userPrompt.match(regex);
    const extractedColumns =
      matches?.map((match) => {
        const cleaned = match.replace(/\{\{|\}\}/g, "").trim();
        return cleaned;
      }) || [];
    // Determine which columns to use
    const finalInputCols =
      state.promptOptions.promptInputColumns.length > 0
        ? state.promptOptions.promptInputColumns
        : extractedColumns;

    const nodeData: Partial<WorkflowNode> = {
      label: state.columnName,
      type: mapPromptTypeToNodeType(state.promptOptions),
      model: state.promptOptions.model,
      summary: state.promptOptions.userPrompt,
      tags,
      inputCols: finalInputCols, // This should have the columns
      tagMode:
        state.promptOptions.promptType === "schema" &&
        (state.promptOptions.schemaType === "singleTag" ||
          state.promptOptions.schemaType === "multiTag")
          ? state.promptOptions.schemaType
          : undefined,
      responseSchema:
        state.promptOptions.promptType === "schema" &&
        state.promptOptions.schemaType === "freeForm"
          ? state.promptOptions.responseSchema
          : undefined,
    };
    onSave(nodeData);
  };
  const promptCreationDisabled = useMemo(() => {
    if (
      !state.columnName ||
      !state.promptOptions.userPrompt ||
      (state.promptNameError !== null && !(!isNew && !!node)) ||
      !!state.promptInputOverlayValidationError ||
      state.tagTextAreaError ||
      checkIfTagsEmpty() ||
      checkIfExtractSchemaEmpty() ||
      state.promptOptions.promptInputColumns.length === 0 ||
      isSaving ||
      state.promptOptions.isCrawl
    ) {
      return true;
    } else {
      return false;
    }
  }, [
    state,
    checkIfTagsEmpty,
    checkIfExtractSchemaEmpty,
    checkIfTagsEmpty,
    isSaving,
    isNew,
    node,
  ]);
  // Might be used later
  // const workflowProjectId = { __tableName: "project" } as Id<"project">;
  const mentionsRef = useRef<MentionsComponentRef | null>(null);
  const promptOptionsRef = useRef(state.promptOptions);
  const [localMentionsTextAreaValueState, setLocalMentionsTextAreaValueState] =
    useState(state.promptOptions.userPrompt);
  const [promptSearch, setPromptSearch] = useState("");
  const [localTagTextareaValue, setLocalTagTextareaValue] = useState(
    state.tagTextAreaValue,
  );
  const validColumnNames = useMemo(() => {
    return new Set(columns.map((col) => col.name));
  }, [columns]);
  const getCompatiblePromptType = (promptOptions: PromptOptions) => {
    // Handle new schema types
    if (promptOptions?.promptType === "schema") {
      if (
        promptOptions?.schemaType === "singleTag" ||
        promptOptions?.schemaType === "multiTag"
      ) {
        return "StructuredOutput";
      } else if (promptOptions?.schemaType === "freeForm") {
        return "json";
      }
    } else if (promptOptions?.promptType === "noSchema") {
      if (promptOptions?.ask === true) {
        return "ask";
      }
      return "TextGeneration";
    }

    // For completely unrecognized formats, return null
    return null;
  };
  const filteredSavedPrompts = useMemo(() => {
    if (!savedPrompts || savedPrompts.length === 0) return [];
    if (state.promptOptions.isCrawl) return [];

    const currentCompatibleType = getCompatiblePromptType(state.promptOptions);

    return (
      savedPrompts
        .filter((prompt) => {
          const savedPromptCompatibleType = getCompatiblePromptType(
            prompt.promptOptions,
          );
          return savedPromptCompatibleType === currentCompatibleType;
        })
        // 2. Filter by the search term
        .filter(
          (prompt) =>
            prompt.columnName
              .toLowerCase()
              .includes(promptSearch.toLowerCase()) ||
            prompt.projectName
              .toLowerCase()
              .includes(promptSearch.toLowerCase()),
        )
    );
  }, [savedPrompts, state.promptOptions, promptSearch]);

  const groupedSavedPrompts = useMemo<GroupedPrompts>(() => {
    return filteredSavedPrompts.reduce((acc, prompt) => {
      let sheetName: string;

      if (prompt.sourceSheetId) {
        // Find the sheet name using the ID
        const sourceSheet = sheets.find((s) => s._id === prompt.sourceSheetId);
        sheetName = sourceSheet ? sourceSheet.name : t("global.default");
      } else {
        // Fallback for prompts not associated with a specific sheet
        sheetName = t("global.default");
      }

      if (!acc[sheetName]) {
        acc[sheetName] = [];
      }
      acc[sheetName].push(prompt);
      return acc;
    }, {} as GroupedPrompts);
  }, [filteredSavedPrompts, sheets]);
  const handleSelectSavedPrompt = useCallback(
    (value: string) => {
      if (value === "none") {
        // Reset the modal state to default values
        actions.setSelectedSavedPrompt("none");

        // Set default prompt options with new type structure
        actions.setPromptOptions({
          model: DEFAULT_AI_MODEL,
          userPrompt: "",
          promptType: "schema",
          schemaType: "singleTag",
          responseOptions: [],
          promptInputColumns: [],
        });

        actions.setIsEditingTagTextArea(false);
        actions.setPromptNameError(null);
        actions.setTagTextAreaOriginalInput("");
        actions.setTagTextareaValue("");
        setLocalMentionsTextAreaValueState("");
        setLocalTagTextareaValue("");
        actions.setPromptInputOverlayValidationError("");
        mentionsRef.current?.updateOverlaySafely("");
        return;
      }

      actions.setSelectedSavedPrompt(value);

      // Find the selected saved prompt
      const [columnName, projectId] = value.split("-");
      const selected = savedPrompts.find(
        (prompt) =>
          prompt.columnName === columnName && prompt.projectId === projectId,
      );

      // If there is a saved prompt, handle it based on its type
      if (selected) {
        const userPrompt = selected.promptOptions.userPrompt?.trim() || "";
        const model = selected.promptOptions.model || DEFAULT_AI_MODEL;
        const promptInputColumns =
          selected.promptOptions.promptInputColumns || [];

        if (
          selected.promptOptions.promptType === "noSchema" &&
          selected.promptOptions.ask
        ) {
          actions.setPromptOptions({
            model,
            userPrompt,
            promptType: "noSchema",
            promptInputColumns,
            ask: true,
          });
          setLocalMentionsTextAreaValueState(userPrompt);
          mentionsRef.current?.updateOverlaySafely(userPrompt);
        } else if (
          selected.promptOptions.promptType === "noSchema" &&
          !selected.promptOptions.ask &&
          !selected.promptOptions.isCrawl
        ) {
          actions.setPromptOptions({
            model,
            userPrompt,
            promptType: "noSchema",
            promptInputColumns,
            ask: false,
            isCrawl: false,
          });
          setLocalMentionsTextAreaValueState(userPrompt);
          mentionsRef.current?.updateOverlaySafely(userPrompt);
        } else if (
          selected.promptOptions.promptType === "schema" &&
          (selected.promptOptions.schemaType === "singleTag" ||
            selected.promptOptions.schemaType === "multiTag")
        ) {
          const responseOptions = selected.promptOptions.responseOptions || [];
          const isMultiTag = selected.promptOptions.schemaType === "multiTag";

          actions.setPromptOptions({
            model,
            userPrompt,
            promptType: "schema",
            schemaType: isMultiTag ? "multiTag" : "singleTag",
            responseOptions,
            promptInputColumns,
          });
          setLocalMentionsTextAreaValueState(userPrompt);
          actions.setIsEditingTagTextArea(false);
          actions.setTagTextAreaOriginalInput(responseOptions.join(", ") || "");
          actions.setTagTextareaValue(responseOptions.join(", ") || "");
          setLocalTagTextareaValue(responseOptions.join(", ") || "");
          mentionsRef.current?.updateOverlaySafely(userPrompt);
        } else if (
          selected.promptOptions.promptType === "schema" &&
          selected.promptOptions.schemaType === "freeForm"
        ) {
          const optionsToSet = {
            model,
            userPrompt,
            promptType: "schema" as const,
            schemaType: "freeForm" as const,
            promptInputColumns,
            responseSchema: (state.promptOptions as JsonOutputPromptOptions)
              .responseSchema,
          };
          actions.setPromptOptions(optionsToSet);
          setLocalMentionsTextAreaValueState(userPrompt);
          mentionsRef.current?.updateOverlaySafely(userPrompt);
        }
      }
    },
    [
      actions,
      savedPrompts,
      state.promptOptions,
      mentionsRef.current?.updateOverlaySafely,
      localTagTextareaValue,
    ],
  );
  return (
    <div className="column-editor border border-border rounded-md p-4">
      <ColumnModalConfig
        state={state}
        actions={actions}
        projectId={projectId}
        isEditingExistingNode={!isNew && !!node}
        useCostEstimation={false}
        nodeError={nodeError}
        mentionsRef={mentionsRef}
        promptOptionsRef={promptOptionsRef}
        localMentionsTextAreaValueState={localMentionsTextAreaValueState}
        setLocalMentionsTextAreaValueState={setLocalMentionsTextAreaValueState}
        promptSearch={promptSearch}
        setPromptSearch={setPromptSearch}
        validColumnNames={validColumnNames}
        filteredSavedPrompts={filteredSavedPrompts}
        groupedSavedPrompts={groupedSavedPrompts}
        handleSelectSavedPrompt={handleSelectSavedPrompt}
        localTagTextareaValue={localTagTextareaValue}
        setLocalTagTextareaValue={setLocalTagTextareaValue}
      />

      <div className="flex justify-end space-x-2 mt-4">
        <Button
          variant="outline"
          size="compact"
          shape="square"
          onClick={onCancel}
        >
          {t("global.cancel")}
        </Button>
        <Button
          onClick={handleSave}
          variant="default"
          size="compact"
          shape="square"
          className="hover:bg-orange-600"
          disabled={promptCreationDisabled}
        >
          {isNew ? (
            t("workflow.add")
          ) : isSaving ? (
            <Loader2 className="w-4 h-4 animate-spin text-white" />
          ) : (
            t("workflow.save")
          )}
        </Button>
      </div>
    </div>
  );
};

export default React.memo(ColumnEditorAdapter);

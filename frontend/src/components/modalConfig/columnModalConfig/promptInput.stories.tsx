import React, { useRef, useState, useMemo } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { PromptInput } from "./promptInput";
import { Doc, Id } from "convex/_generated/dataModel";
import {
  ModalManagerState,
  ModalReducerActions,
  MentionsComponentRef,
  GroupedPrompts,
} from "@/interfaces/interfaces";
import {
  PromptOptions,
  TextGenerationPromptOptions,
  SavedPrompt,
} from "@/types/types";

// Mock Data and State
const mockColumns: Doc<"column">[] = [
  {
    _id: "col1" as Id<"column">,
    name: "User Name",
    _creationTime: 0,
    project_id: "p1" as Id<"project">,
    column_type: "noSchema",
    cell_state: new ArrayBuffer(0),
  },
  {
    _id: "col2" as Id<"column">,
    name: "Email Address",
    _creationTime: 0,
    project_id: "p1" as Id<"project">,
    column_type: "noSchema",
    cell_state: new ArrayBuffer(0),
  },
  {
    _id: "col3" as Id<"column">,
    name: "Order Value",
    _creationTime: 0,
    project_id: "p1" as Id<"project">,
    column_type: "noSchema",
    cell_state: new ArrayBuffer(0),
  },
];
const mockSavedPrompts: SavedPrompt[] = [
  {
    columnName: "Order Value",
    projectId: "p1" as Id<"project">,
    projectName: "Project Alpha",
    sourceSheetId: "sheet2" as Id<"sheet">,
    promptOptions: {
      model: "gpt-4o",
      userPrompt: "Summarize the content from {{Order Value}}",
      promptInputColumns: ["col3"],
      ask: false,
      isCrawl: false,
      promptType: "noSchema",
    } as PromptOptions,
  },
  {
    columnName: "User Name",
    projectId: "p1" as Id<"project">,
    projectName: "Project Alpha",
    sourceSheetId: "sheet1" as Id<"sheet">,
    promptOptions: {
      model: "gpt-4o",
      userPrompt: "Classify sentiment in {{User Name}}",
      promptInputColumns: ["col1"],
      ask: false,
      isCrawl: false,
      promptType: "schema",
      responseOptions: ["positive", "negative"],
    } as PromptOptions,
  },
];
const mockSheets: Doc<"sheet">[] = [
  {
    _id: "sheet1" as Id<"sheet">,
    name: "Sales Leads",
    project_id: "p1" as Id<"project">,
    filter: "",
    _creationTime: 0,
    rows_in_sheet_counter: 0,
    hidden: [],
  },
  {
    _id: "sheet2" as Id<"sheet">,
    name: "Support Tickets",
    project_id: "p2" as Id<"project">,
    filter: "",
    _creationTime: 0,
    rows_in_sheet_counter: 0,
    hidden: [],
  },
];
const createMockState = (
  overrides: Partial<ModalManagerState> = {},
): ModalManagerState => ({
  columnName: "New Summary Column",
  promptOptions: {
    promptType: "noSchema",
    model: "gpt-4o",
    userPrompt: "",
    promptInputColumns: [],
  } as TextGenerationPromptOptions,
  savedPrompts: mockSavedPrompts,
  selectedPrompt: "",
  isLoading: false,
  currentStep: 0,
  stepsStatus: [],
  isEditingTagTextArea: false,
  tagTextAreaValue: "",
  tagTextAreaError: false,
  tagTextAreaerrorDetails: "",
  tagTextAreaOriginalInput: "",
  promptNameError: null,
  promptsLoaded: true,
  promptInputOverlayValidationError: "",
  promptInputOverlayValidationWarning: "",
  mentionsPopupPosition: { top: 0, left: 0 },
  projectName: "My Project",
  selectedFiles: null,
  error: null,
  exaQuery: "",
  exaSearchType: "news_article",
  exaNumResults: 10,
  isExaLoading: false,
  exaActionType: "search",
  exaFindSimilarUrl: "",
  sqlQuery: "",
  jsonSchema: "",
  connectors: [],
  selectedConnector: {} as any,
  isQueryEntered: false,
  isQueryLoading: false,
  activeTab: "upload",
  showFileTable: false,
  isUploading: false,
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
  ...overrides,
});

// Corrected: The mock actions now match the ModalReducerActions interface.
const mockActions: ModalReducerActions = {
  setColumnName: (p) => console.log("setColumnName", p),
  setPromptOptions: (p) => console.log("setPromptOptions", p),
  setSavedPrompts: (p) => console.log("setSavedPrompts", p),
  setSelectedSavedPrompt: (p) => console.log("setSelectedSavedPrompt", p),
  setIsLoading: (p) => console.log("setIsLoading", p),
  setCurrentStep: (p) => console.log("setCurrentStep", p),
  setStepStatus: (p) => console.log("setStepStatus", p),
  setSteps: (p) => console.log("setSteps", p),
  resetSteps: () => console.log("resetSteps"),
  setCreationFlowType: (p) => console.log("setCreationFlowType", p),
  setSearchResultsCount: (p) => console.log("setSearchResultsCount", p),
  setIsEditingTagTextArea: (p) => console.log("setIsEditingTagTextArea", p),
  setTagTextareaValue: (p) => console.log("setTagTextareaValue", p),
  setTagTextAreaError: (p) => console.log("setTagTextAreaError", p),
  setTagTextAreaErrorDetails: (p) =>
    console.log("setTagTextAreaErrorDetails", p),
  setTagTextAreaOriginalInput: (p) =>
    console.log("setTagTextAreaOriginalInput", p),
  setPromptNameError: (p) => console.log("setPromptNameError", p),
  setPromptInputOverlayValidationError: (p) =>
    console.log("setPromptInputOverlayValidationError", p),
  setPromptInputOverlayValidationWarning: (p) =>
    console.log("setPromptInputOverlayValidationWarning", p),
  setProjectName: (p) => console.log("setProjectName", p),
  setPromptsLoaded: (p) => console.log("setPromptsLoaded", p),
  setMentionsPopupPosition: (p) => console.log("setMentionsPopupPosition", p),
  setSelectedFiles: (p) => console.log("setSelectedFiles", p),
  setError: (p) => console.log("setError", p),
  setExaQuery: (p) => console.log("setExaQuery", p),
  setExaSearchType: (p) => console.log("setExaSearchType", p),
  setExaActionType: (p) => console.log("setExaActionType", p),
  setExaFindSimilarUrl: (p) => console.log("setExaFindSimilarUrl", p),
  setIsExaLoading: (p) => console.log("setIsExaLoading", p),
  setExaNumResults: (p) => console.log("setExaNumResults", p),
  setSqlQuery: (p) => console.log("setSqlQuery", p),
  setJsonSchema: (p) => console.log("setJsonSchema", p),
  setSelectedConnector: (p) => console.log("setSelectedConnector", p),
  setIsQueryEntered: (p) => console.log("setIsQueryEntered", p),
  setIsQueryLoading: (p) => console.log("setIsQueryLoading", p),
  setActiveTab: (p) => console.log("setActiveTab", p),
  clearSelection: () => console.log("clearSelection"),
  setShowFileTable: (p) => console.log("setShowFileTable", p),
  setIsUploading: (p) => console.log("setIsUploading", p),
  updateFileStatus: (id, status, progress, error) =>
    console.log("updateFileStatus", { id, status, progress, error }),
  removeFile: (p) => console.log("removeFile", p),
  clearCompletedFiles: () => console.log("clearCompletedFiles"),
  setEstimatedCost: (p) => console.log("setEstimatedCost", p),
  setEstimatedCostLoading: (p) => console.log("setEstimatedCostLoading", p),
  setExportActiveTab: (p) => console.log("setExportActiveTab", p),
  toggleExportColumn: (id, selected) =>
    console.log("toggleExportColumn", { id, selected }),
  toggleExportView: (id, selected) =>
    console.log("toggleExportView", { id, selected }),
  selectAllExportColumns: (p) => console.log("selectAllExportColumns", p),
  selectAllExportViews: (p) => console.log("selectAllExportViews", p),
  deselectAllExportColumns: () => console.log("deselectAllExportColumns"),
  deselectAllExportViews: () => console.log("deselectAllExportViews"),
  setUserHasSetColumnsSelection: (p) =>
    console.log("setUserHasSetColumnsSelection", p),
  setUserHasSetViewsSelection: (p) =>
    console.log("setUserHasSetViewsSelection", p),
  setIsExporting: (p) => console.log("setIsExporting", p),
  setInitialExportColumns: (p) => console.log("setInitialExportColumns", p),
  setInitialExportViews: (p) => console.log("setInitialExportViews", p),
  clearColumnModalData: () => console.log("clearColumnModalData"),
  setExportDownloadUrl: (p) => console.log("setExportDownloadUrl", p),
};

// This wrapper provides all necessary props to the PromptInput component
const PromptInputStoryWrapper = (props: {
  initialState: ModalManagerState;
}) => {
  const mentionsRef = useRef<MentionsComponentRef>(null);
  const promptOptionsRef = useRef<PromptOptions>(
    props.initialState.promptOptions,
  );
  const [localValue, setLocalValue] = useState(
    props.initialState.promptOptions?.userPrompt || "",
  );
  const [promptSearch, setPromptSearch] = useState("");
  const groupedSavedPrompts = useMemo<GroupedPrompts>(() => {
    const filtered = (props.initialState.savedPrompts || []).filter(
      (prompt) =>
        prompt.columnName.toLowerCase().includes(promptSearch.toLowerCase()) ||
        prompt.projectName.toLowerCase().includes(promptSearch.toLowerCase()),
    );

    return filtered.reduce((acc, prompt) => {
      let sheetName: string;
      if (prompt.sourceSheetId) {
        const sourceSheet = mockSheets.find(
          (s) => s._id === prompt.sourceSheetId,
        );
        sheetName = sourceSheet ? sourceSheet.name : "From Other Sheets";
      } else {
        sheetName = "Uncategorized";
      }

      if (!acc[sheetName]) {
        acc[sheetName] = [];
      }
      acc[sheetName].push(prompt);
      return acc;
    }, {} as GroupedPrompts);
  }, [props.initialState.savedPrompts, promptSearch]);
  return React.createElement(PromptInput, {
    state: props.initialState,
    actions: mockActions,
    mentionsRef: mentionsRef,
    localMentionsTextAreaValueState: localValue,
    setLocalMentionsTextAreaValueState: setLocalValue,
    projectColumns: mockColumns,
    validColumnNames: new Set(mockColumns.map((c) => c.name)),
    promptOptionsRef: promptOptionsRef,
    filteredSavedPrompts: mockSavedPrompts,
    handleSelectSavedPrompt: (id) => console.log("handleSelectSavedPrompt", id),
    groupedSavedPrompts: groupedSavedPrompts,
    promptSearch: promptSearch,
    setPromptSearch: setPromptSearch,
  });
};

const meta = {
  title: "Components/Modal Config/columnModalConfig/promptInput",
  component: PromptInputStoryWrapper,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div style={{ width: "600px" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PromptInputStoryWrapper>;

export default meta;
type Story = StoryObj<typeof meta>;

// --- Stories ---

export const Default: Story = {
  name: "Default State",
  args: {
    initialState: createMockState(),
  },
};

export const WithInitialPrompt: Story = {
  name: "With Initial Prompt & Mention",
  args: {
    initialState: createMockState({
      promptOptions: {
        promptType: "noSchema",
        model: "gpt-4o",
        userPrompt:
          "Summarize the order for the user with the name {{User Name}}",
        promptInputColumns: ["User Name"],
      } as TextGenerationPromptOptions,
    }),
  },
};

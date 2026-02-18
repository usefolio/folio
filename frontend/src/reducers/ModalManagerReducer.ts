import { useReducer, useMemo } from "react";
import {
  ModalManagerState,
  FileWithProgress,
  type FileUploadStatus,
  type Step,
} from "../interfaces/interfaces";
import { PromptOptions, SavedPrompt } from "../types/types";
import i18n from "../i18n";
import { DEFAULT_AI_MODEL } from "../constants";

// Initial values for the state
const initialState: ModalManagerState = {
  promptOptions: {
    model: DEFAULT_AI_MODEL,
    promptType: "schema",
    schemaType: "singleTag",
    userPrompt: "",
    responseOptions: [],
    promptInputColumns: [],
    ask: false,
  },
  columnName: "",
  savedPrompts: [],
  selectedPrompt: "",
  isLoading: false,
  currentStep: 0, // Start at step 0
  isEditingTagTextArea: false,
  tagTextAreaValue: "",
  tagTextAreaError: false,
  tagTextAreaerrorDetails: "",
  tagTextAreaOriginalInput: "",
  promptNameError: null,
  promptsLoaded: false,
  promptInputOverlayValidationError: "",
  promptInputOverlayValidationWarning: "",
  mentionsPopupPosition: {
    top: 0,
    left: 0,
  },
  stepsStatus: [
    {
      step: i18n.t("reducers.modal_manager_reducer.create_project_step"),
      status: "pending",
      description: "",
      index: 0,
      kind: "createProject",
    },
    {
      step: i18n.t("reducers.modal_manager_reducer.upload_file_step"),
      status: "pending",
      description: "",
      index: 1,
      kind: "upload",
    },
    {
      step: i18n.t("reducers.modal_manager_reducer.process_data_step"),
      status: "pending",
      description: "",
      index: 2,
      kind: "processData",
    },
    {
      step: i18n.t("reducers.modal_manager_reducer.create_view_step"),
      status: "pending",
      description: "",
      index: 3,
      kind: "createView",
    },
  ],
  projectName: "",
  selectedFiles: null,
  error: null,
  exaQuery: "",
  exaSearchType: "news_article",
  exaNumResults: 10,
  isExaLoading: false,
  exaActionType: "search",
  exaFindSimilarUrl: "",
  sqlQuery: "",
  jsonSchema: "none",
  connectors: [
    { name: "MySQL", lastSync: "4 hours ago", isAlive: true },
    { name: "PostgreSQL", lastSync: "1 day ago", isAlive: false },
    { name: "MongoDB", lastSync: "2 hours ago", isAlive: true },
  ],
  selectedConnector: { name: "MySQL", lastSync: "4 hours ago", isAlive: true },
  isQueryEntered: false,
  isQueryLoading: false,
  activeTab: "upload",
  showFileTable: false,
  isUploading: false,
  fileSubmitDisabled: false,
  creationFlowType: "upload",
  searchResultsCount: null,
  estimatedCost: null,
  estimatedCostLoading: false,
  exportSelectedColumns: {},
  exportSelectedViews: {},
  exportActiveTab: "columns",
  userHasSetColumnsSelection: false,
  userHasSetViewsSelection: false,
  isExporting: false,
  exportDownloadUrl: null,
};
// Action types that define all possible updates to the state
type Action =
  // Set the column name
  | { type: "SET_COLUMN_NAME"; payload: string }
  // Update the user prompt template
  | { type: "SET_PROMPT_OPTIONS"; payload: PromptOptions }
  // Replace enum tag
  | { type: "SET_ENUM_TAGS"; payload: string[] }
  // Update the list of saved prompts
  | { type: "SET_SAVED_PROMPTS"; payload: SavedPrompt[] }
  // Set the currently selected saved prompt from the list
  | { type: "SET_SELECTED_SAVED_PROMPT"; payload: string }
  //Set the loading state
  | { type: "SET_IS_LOADING"; payload: boolean }
  // Steps in creating a project
  | { type: "SET_CURRENT_STEP"; payload: number }
  | {
      type: "SET_STEP_STATUS";
      payload: {
        index: number;
        status: "pending" | "loading" | "success" | "error" | "warning";
        description?: string;
      };
    }
  | { type: "SET_STEPS"; payload: Step[] }
  | { type: "SET_CREATION_FLOW_TYPE"; payload: "upload" | "search" }
  | { type: "SET_SEARCH_RESULTS_COUNT"; payload: number | null }
  | {
      type: "UPDATE_FILE_STATUS";
      payload: {
        id: string;
        status: FileUploadStatus;
        progress?: number;
        error?: string;
      };
    }
  | { type: "REMOVE_FILE"; payload: string }
  | { type: "CLEAR_COMPLETED_FILES" }
  | { type: "RESET_STEPS" }
  | { type: "SET_IS_EDITING_TAG_TEXT_AREA"; payload: boolean }
  | { type: "SET_TAG_TEXT_AREA_VALUE"; payload: string }
  | { type: "SET_TAG_TEXT_AREA_ERROR"; payload: boolean }
  | { type: "SET_TAG_TEXT_AREA_ERROR_DETAILS"; payload: string }
  | { type: "SET_TAG_TEXT_AREA_ORIGINAL_INPUT"; payload: string }
  | { type: "SET_PROMPT_NAME_ERROR"; payload: string | null }
  | { type: "SET_PROMPT_OVERLAY_VALIDATION_ERROR"; payload: string }
  | { type: "SET_PROMPT_OVERLAY_VALIDATION_WARNING"; payload: string }
  | { type: "SET_PROJECT_NAME"; payload: string }
  | { type: "SET_PROMPTS_LOADED"; payload: boolean }
  | {
      type: "SET_MENTIONS_POPUP_POSITION";
      payload: {
        top: number | string;
        left: number | string;
      };
    }
  | {
      type: "SET_SELECTED_FILES";
      payload: FileWithProgress | FileWithProgress[] | null;
    }
  | { type: "SET_FILE_NAME"; payload: string }
  | { type: "SET_ERROR"; payload: string | null }
  | { type: "SET_EXA_QUERY"; payload: string }
  | { type: "SET_EXA_ACTION_TYPE"; payload: "search" | "findSimilar" }
  | { type: "SET_EXA_FIND_SIMILAR_URL"; payload: string }
  | {
      type: "SET_EXA_SEARCH_TYPE";
      payload:
        | "news_article"
        | "github"
        | "personal_site"
        | "linkedin_profile"
        | "company";
    }
  | { type: "SET_EXA_NUM_RESULTS"; payload: number }
  | { type: "SET_IS_EXA_LOADING"; payload: boolean }
  | { type: "SET_SQL_QUERY"; payload: string }
  | { type: "SET_JSON_SCHEMA"; payload: string }
  | { type: "SET_SELECTED_CONNECTOR"; payload: string }
  | { type: "SET_IS_QUERY_ENTERED"; payload: boolean }
  | { type: "SET_IS_QUERY_LOADING"; payload: boolean }
  | { type: "SET_ACTIVE_TAB"; payload: "upload" | "exa" | "datawarehouse" }
  | { type: "CLEAR_SELECTION" }
  | { type: "SET_SHOW_FILE_TABLE"; payload: boolean }
  | { type: "SET_IS_UPLOADING"; payload: boolean }
  | { type: "SET_FILE_SUBMIT_DISABLED"; payload: boolean }
  | { type: "CALCULATE_COST"; payload: string | null }
  | { type: "CALCULATE_COST_LOADING"; payload: boolean }
  | { type: "SET_EXPORT_ACTIVE_TAB"; payload: "columns" | "views" }
  | { type: "TOGGLE_EXPORT_COLUMN"; payload: { id: string; selected: boolean } }
  | { type: "TOGGLE_EXPORT_VIEW"; payload: { id: string; selected: boolean } }
  | { type: "SELECT_ALL_EXPORT_COLUMNS"; payload: { [key: string]: boolean } }
  | { type: "SELECT_ALL_EXPORT_VIEWS"; payload: { [key: string]: boolean } }
  | { type: "DESELECT_ALL_EXPORT_COLUMNS" }
  | { type: "DESELECT_ALL_EXPORT_VIEWS" }
  | { type: "SET_USER_HAS_SET_COLUMNS_SELECTION"; payload: boolean }
  | { type: "SET_USER_HAS_SET_VIEWS_SELECTION"; payload: boolean }
  | { type: "SET_IS_EXPORTING"; payload: boolean }
  | { type: "SET_INITIAL_EXPORT_COLUMNS"; payload: { [key: string]: boolean } }
  | { type: "SET_INITIAL_EXPORT_VIEWS"; payload: { [key: string]: boolean } }
  | { type: "CLEAR_COLUMN_MODAL_DATA" }
  | { type: "SET_EXPORT_DOWNLOAD_URL"; payload: { url: string } | null };

// Typical boilerplate from React Redux, now integrated into react through useReducer hook
const reducer = (
  state: ModalManagerState,
  action: Action,
): ModalManagerState => {
  switch (action.type) {
    case "SET_PROMPT_OPTIONS":
      return { ...state, promptOptions: action.payload };
    case "SET_COLUMN_NAME":
      return { ...state, columnName: action.payload };
    case "SET_SAVED_PROMPTS":
      return { ...state, savedPrompts: action.payload };
    case "SET_SELECTED_SAVED_PROMPT":
      return { ...state, selectedPrompt: action.payload };
    case "SET_IS_LOADING":
      return { ...state, isLoading: action.payload };
    case "SET_CURRENT_STEP":
      return { ...state, currentStep: action.payload };
    case "SET_STEP_STATUS":
      return {
        ...state,
        stepsStatus: state.stepsStatus.map((step) =>
          step.index === action.payload.index
            ? {
                ...step,
                status: action.payload.status,
                ...(action.payload.description !== undefined
                  ? { description: action.payload.description }
                  : {}),
              }
            : step,
        ),
      };
    case "SET_STEPS":
      return {
        ...state,
        stepsStatus: action.payload,
      };
    case "SET_CREATION_FLOW_TYPE":
      return {
        ...state,
        creationFlowType: action.payload,
      };
    case "SET_SEARCH_RESULTS_COUNT":
      return {
        ...state,
        searchResultsCount: action.payload,
      };
    case "SET_SHOW_FILE_TABLE":
      return { ...state, showFileTable: action.payload };
    case "SET_IS_UPLOADING":
      return { ...state, isUploading: action.payload };
    case "SET_FILE_SUBMIT_DISABLED":
      return { ...state, fileSubmitDisabled: action.payload };
    case "UPDATE_FILE_STATUS":
      if (!state.selectedFiles) return state;
      return {
        ...state,
        selectedFiles: (state.selectedFiles as FileWithProgress[]).map(
          (file) =>
            file.id === action.payload.id
              ? {
                  ...file,
                  status: action.payload.status,
                  progress:
                    action.payload.progress !== undefined
                      ? action.payload.progress
                      : file.progress,
                  error: action.payload.error,
                }
              : file,
        ),
      };
    case "REMOVE_FILE": {
      if (!state.selectedFiles) return state;
      const updatedFiles = (state.selectedFiles as FileWithProgress[]).filter(
        (file) => file.id !== action.payload,
      );
      return {
        ...state,
        selectedFiles: updatedFiles.length > 0 ? updatedFiles : null,
      };
    }
    case "CLEAR_COMPLETED_FILES": {
      if (!state.selectedFiles) return state;
      const remainingFiles = (state.selectedFiles as FileWithProgress[]).filter(
        (file) => file.status !== "completed",
      );
      return {
        ...state,
        selectedFiles: remainingFiles.length > 0 ? remainingFiles : null,
      };
    }
    case "RESET_STEPS":
      return {
        ...state,
        stepsStatus: state.stepsStatus.map((step) => ({
          ...step,
          status: "pending",
          description: "",
        })),
        isLoading: false,
      };
    case "SET_IS_EDITING_TAG_TEXT_AREA":
      return { ...state, isEditingTagTextArea: action.payload };
    case "SET_TAG_TEXT_AREA_VALUE":
      return { ...state, tagTextAreaValue: action.payload };
    case "SET_TAG_TEXT_AREA_ERROR":
      return { ...state, tagTextAreaError: action.payload };
    case "SET_TAG_TEXT_AREA_ERROR_DETAILS":
      return { ...state, tagTextAreaerrorDetails: action.payload };
    case "SET_TAG_TEXT_AREA_ORIGINAL_INPUT":
      return { ...state, tagTextAreaOriginalInput: action.payload };
    case "SET_PROMPT_NAME_ERROR":
      return { ...state, promptNameError: action.payload };
    case "SET_PROMPT_OVERLAY_VALIDATION_ERROR":
      return { ...state, promptInputOverlayValidationError: action.payload };
    case "SET_PROMPT_OVERLAY_VALIDATION_WARNING":
      return { ...state, promptInputOverlayValidationWarning: action.payload };
    case "SET_PROJECT_NAME":
      return { ...state, projectName: action.payload };
    case "SET_PROMPTS_LOADED":
      return { ...state, promptsLoaded: action.payload };
    case "SET_MENTIONS_POPUP_POSITION":
      return { ...state, mentionsPopupPosition: action.payload };
    case "SET_SELECTED_FILES":
      return { ...state, selectedFiles: action.payload };
    case "SET_ERROR":
      return { ...state, error: action.payload };
    case "SET_EXA_QUERY":
      return { ...state, exaQuery: action.payload };
    case "SET_EXA_SEARCH_TYPE":
      return { ...state, exaSearchType: action.payload };
    case "SET_EXA_ACTION_TYPE":
      return { ...state, exaActionType: action.payload };
    case "SET_EXA_FIND_SIMILAR_URL":
      return { ...state, exaFindSimilarUrl: action.payload };
    case "SET_IS_EXA_LOADING":
      return { ...state, isExaLoading: action.payload };
    case "SET_EXA_NUM_RESULTS":
      return { ...state, exaNumResults: action.payload };
    case "SET_SQL_QUERY":
      return { ...state, sqlQuery: action.payload };
    case "SET_JSON_SCHEMA":
      return { ...state, jsonSchema: action.payload };
    case "SET_SELECTED_CONNECTOR":
      return {
        ...state,
        selectedConnector:
          state.connectors.find((c) => c.name === action.payload) ||
          state.connectors[0],
      };
    case "SET_IS_QUERY_ENTERED":
      return { ...state, isQueryEntered: action.payload };
    case "SET_IS_QUERY_LOADING":
      return { ...state, isQueryLoading: action.payload };
    case "SET_ACTIVE_TAB":
      return {
        ...state,
        activeTab: action.payload as "upload" | "exa" | "datawarehouse",
      };
    case "CLEAR_SELECTION":
      return {
        ...state,
        selectedFiles: null,
        projectName: "",
        error: null,
        jsonSchema: "none",
        exaQuery: "",
        exaSearchType: "news_article",
        isExaLoading: false,
        exaNumResults: 10,
        sqlQuery: "",
        selectedConnector: state.connectors[0],
        isQueryEntered: false,
        fileSubmitDisabled: false,
        isUploading: false,
        activeTab: "upload",
        creationFlowType: "upload",
        searchResultsCount: null,
      };
    case "CALCULATE_COST":
      return { ...state, estimatedCost: action.payload };
    case "CALCULATE_COST_LOADING":
      return { ...state, estimatedCostLoading: action.payload };
    case "SET_EXPORT_ACTIVE_TAB":
      return { ...state, exportActiveTab: action.payload };
    case "TOGGLE_EXPORT_COLUMN":
      return {
        ...state,
        exportSelectedColumns: {
          ...state.exportSelectedColumns,
          [action.payload.id]: action.payload.selected,
        },
      };
    case "TOGGLE_EXPORT_VIEW":
      return {
        ...state,
        exportSelectedViews: {
          ...state.exportSelectedViews,
          [action.payload.id]: action.payload.selected,
        },
      };
    case "SELECT_ALL_EXPORT_COLUMNS":
      return { ...state, exportSelectedColumns: action.payload };
    case "SELECT_ALL_EXPORT_VIEWS":
      return { ...state, exportSelectedViews: action.payload };
    case "DESELECT_ALL_EXPORT_COLUMNS":
      return { ...state, exportSelectedColumns: {} };
    case "DESELECT_ALL_EXPORT_VIEWS":
      return { ...state, exportSelectedViews: {} };
    case "SET_USER_HAS_SET_COLUMNS_SELECTION":
      return { ...state, userHasSetColumnsSelection: action.payload };
    case "SET_USER_HAS_SET_VIEWS_SELECTION":
      return { ...state, userHasSetViewsSelection: action.payload };
    case "SET_IS_EXPORTING":
      return { ...state, isExporting: action.payload };
    case "SET_INITIAL_EXPORT_COLUMNS":
      return {
        ...state,
        exportSelectedColumns: action.payload,
        userHasSetColumnsSelection: true,
      };
    case "SET_INITIAL_EXPORT_VIEWS":
      return {
        ...state,
        exportSelectedViews: action.payload,
        userHasSetViewsSelection: true,
      };
    case "CLEAR_COLUMN_MODAL_DATA":
      return {
        ...state,
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
      };
    case "SET_EXPORT_DOWNLOAD_URL": {
      return {
        ...state,
        exportDownloadUrl: action.payload ? action.payload.url : null,
      };
    }
    default:
      // Return the current state if no action matches
      return state;
  }
};

// Hook to provide state management for the modal using the reducer
export const useModalManagerReducer = () => {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Actions

  const actions = useMemo(
    () => ({
      setColumnName: (payload: string) =>
        dispatch({ type: "SET_COLUMN_NAME", payload }),
      setPromptOptions: (payload: PromptOptions) =>
        dispatch({ type: "SET_PROMPT_OPTIONS", payload }),
      setSavedPrompts: (payload: SavedPrompt[]) =>
        dispatch({ type: "SET_SAVED_PROMPTS", payload }),
      setSelectedSavedPrompt: (payload: string) =>
        dispatch({ type: "SET_SELECTED_SAVED_PROMPT", payload }),
      setIsLoading: (payload: boolean) =>
        dispatch({ type: "SET_IS_LOADING", payload }),
      setCurrentStep: (payload: number) =>
        dispatch({ type: "SET_CURRENT_STEP", payload }),
      setStepStatus: (payload: {
        index: number;
        status: "pending" | "loading" | "success" | "error" | "warning";
        description?: string;
      }) => dispatch({ type: "SET_STEP_STATUS", payload }),
      setSteps: (payload: Step[]) =>
        dispatch({ type: "SET_STEPS", payload }),
      resetSteps: () => dispatch({ type: "RESET_STEPS" }),
      setCreationFlowType: (payload: "upload" | "search") =>
        dispatch({ type: "SET_CREATION_FLOW_TYPE", payload }),
      setSearchResultsCount: (payload: number | null) =>
        dispatch({ type: "SET_SEARCH_RESULTS_COUNT", payload }),
      setIsEditingTagTextArea: (payload: boolean) =>
        dispatch({ type: "SET_IS_EDITING_TAG_TEXT_AREA", payload }),
      setTagTextareaValue: (payload: string) =>
        dispatch({ type: "SET_TAG_TEXT_AREA_VALUE", payload }),
      setTagTextAreaError: (payload: boolean) =>
        dispatch({ type: "SET_TAG_TEXT_AREA_ERROR", payload }),
      setTagTextAreaErrorDetails: (payload: string) =>
        dispatch({ type: "SET_TAG_TEXT_AREA_ERROR_DETAILS", payload }),
      setTagTextAreaOriginalInput: (payload: string) =>
        dispatch({ type: "SET_TAG_TEXT_AREA_ORIGINAL_INPUT", payload }),
      setPromptNameError: (payload: string | null) =>
        dispatch({ type: "SET_PROMPT_NAME_ERROR", payload }),
      setPromptInputOverlayValidationError: (payload: string) =>
        dispatch({ type: "SET_PROMPT_OVERLAY_VALIDATION_ERROR", payload }),
      setPromptInputOverlayValidationWarning: (payload: string) =>
        dispatch({ type: "SET_PROMPT_OVERLAY_VALIDATION_WARNING", payload }),
      setProjectName: (payload: string) =>
        dispatch({
          type: "SET_PROJECT_NAME",
          payload,
        }),
      setPromptsLoaded: (payload: boolean) =>
        dispatch({ type: "SET_PROMPTS_LOADED", payload }),
      setMentionsPopupPosition: (payload: {
        top: number | string;
        left: number | string;
      }) => dispatch({ type: "SET_MENTIONS_POPUP_POSITION", payload }),
      setSelectedFiles: (
        payload: FileWithProgress | FileWithProgress[] | null,
      ) => dispatch({ type: "SET_SELECTED_FILES", payload }),
      setError: (payload: string | null) =>
        dispatch({ type: "SET_ERROR", payload }),
      setExaQuery: (payload: string) =>
        dispatch({ type: "SET_EXA_QUERY", payload }),
      setExaSearchType: (
        payload:
          | "news_article"
          | "github"
          | "personal_site"
          | "linkedin_profile"
          | "company",
      ) => dispatch({ type: "SET_EXA_SEARCH_TYPE", payload }),
      setExaActionType: (payload: "search" | "findSimilar") =>
        dispatch({ type: "SET_EXA_ACTION_TYPE", payload }),
      setExaFindSimilarUrl: (payload: string) =>
        dispatch({ type: "SET_EXA_FIND_SIMILAR_URL", payload }),
      setIsExaLoading: (payload: boolean) =>
        dispatch({ type: "SET_IS_EXA_LOADING", payload }),
      setExaNumResults: (payload: number) =>
        dispatch({ type: "SET_EXA_NUM_RESULTS", payload }),
      setSqlQuery: (payload: string) =>
        dispatch({ type: "SET_SQL_QUERY", payload }),
      setJsonSchema: (payload: string) =>
        dispatch({ type: "SET_JSON_SCHEMA", payload }),
      setSelectedConnector: (payload: string) =>
        dispatch({ type: "SET_SELECTED_CONNECTOR", payload }),
      setIsQueryEntered: (payload: boolean) =>
        dispatch({ type: "SET_IS_QUERY_ENTERED", payload }),
      setIsQueryLoading: (payload: boolean) =>
        dispatch({ type: "SET_IS_QUERY_LOADING", payload }),
      setActiveTab: (payload: "upload" | "exa" | "datawarehouse") =>
        dispatch({ type: "SET_ACTIVE_TAB", payload }),
      clearSelection: () => dispatch({ type: "CLEAR_SELECTION" }),
      setShowFileTable: (show: boolean) =>
        dispatch({ type: "SET_SHOW_FILE_TABLE", payload: show }),
      setIsUploading: (isUploading: boolean) =>
        dispatch({ type: "SET_IS_UPLOADING", payload: isUploading }),
      setFileSubmitDisabled: (disabled: boolean) =>
        dispatch({ type: "SET_FILE_SUBMIT_DISABLED", payload: disabled }),
      updateFileStatus: (
        id: string,
        status: FileUploadStatus,
        progress?: number,
        error?: string,
      ) =>
        dispatch({
          type: "UPDATE_FILE_STATUS",
          payload: { id, status, progress, error },
        }),
      removeFile: (id: string) =>
        dispatch({ type: "REMOVE_FILE", payload: id }),
      clearCompletedFiles: () => dispatch({ type: "CLEAR_COMPLETED_FILES" }),
      setEstimatedCost: (estimatedCost: string | null) =>
        dispatch({ type: "CALCULATE_COST", payload: estimatedCost }),
      setEstimatedCostLoading: (estimatedCostLoading: boolean) =>
        dispatch({
          type: "CALCULATE_COST_LOADING",
          payload: estimatedCostLoading,
        }),
      setUserHasSetColumnsSelection: (payload: boolean) =>
        dispatch({ type: "SET_USER_HAS_SET_COLUMNS_SELECTION", payload }),
      setUserHasSetViewsSelection: (payload: boolean) =>
        dispatch({ type: "SET_USER_HAS_SET_VIEWS_SELECTION", payload }),
      setExportActiveTab: (tab: "columns" | "views") =>
        dispatch({ type: "SET_EXPORT_ACTIVE_TAB", payload: tab }),
      selectAllExportColumns: (columns: { _id: string; name: string }[]) => {
        const selectedColumns: { [key: string]: boolean } = {};
        columns.forEach((column) => {
          selectedColumns[column._id] = true;
        });
        dispatch({
          type: "SELECT_ALL_EXPORT_COLUMNS",
          payload: selectedColumns,
        });
        dispatch({ type: "SET_USER_HAS_SET_COLUMNS_SELECTION", payload: true });
      },
      selectAllExportViews: (views: { _id: string; name: string }[]) => {
        const selectedViews: { [key: string]: boolean } = {};
        views.forEach((view) => {
          selectedViews[view._id] = true;
        });
        dispatch({
          type: "SELECT_ALL_EXPORT_VIEWS",
          payload: selectedViews,
        });
        dispatch({ type: "SET_USER_HAS_SET_VIEWS_SELECTION", payload: true });
      },
      deselectAllExportColumns: () => {
        dispatch({ type: "DESELECT_ALL_EXPORT_COLUMNS" });
        dispatch({ type: "SET_USER_HAS_SET_COLUMNS_SELECTION", payload: true });
      },
      deselectAllExportViews: () => {
        dispatch({ type: "DESELECT_ALL_EXPORT_VIEWS" });
        dispatch({ type: "SET_USER_HAS_SET_VIEWS_SELECTION", payload: true });
      },
      toggleExportColumn: (id: string, selected: boolean) => {
        dispatch({
          type: "TOGGLE_EXPORT_COLUMN",
          payload: { id, selected },
        });
        dispatch({ type: "SET_USER_HAS_SET_COLUMNS_SELECTION", payload: true });
      },
      toggleExportView: (id: string, selected: boolean) => {
        dispatch({
          type: "TOGGLE_EXPORT_VIEW",
          payload: { id, selected },
        });
        dispatch({ type: "SET_USER_HAS_SET_VIEWS_SELECTION", payload: true });
      },
      setIsExporting: (value: boolean) => {
        dispatch({ type: "SET_IS_EXPORTING", payload: value });
      },
      setInitialExportColumns: (selections: { [key: string]: boolean }) => {
        dispatch({ type: "SET_INITIAL_EXPORT_COLUMNS", payload: selections });
      },
      setInitialExportViews: (selections: { [key: string]: boolean }) => {
        dispatch({ type: "SET_INITIAL_EXPORT_VIEWS", payload: selections });
      },
      clearColumnModalData: () => {
        dispatch({ type: "CLEAR_COLUMN_MODAL_DATA" });
      },
      setExportDownloadUrl: (data: { url: string } | null) => {
        dispatch({ type: "SET_EXPORT_DOWNLOAD_URL", payload: data });
      },
    }),
    [dispatch],
  );

  return { state, actions };
};

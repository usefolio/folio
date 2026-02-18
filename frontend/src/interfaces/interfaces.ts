import { Id, Doc } from "../../convex/_generated/dataModel";
import {
  PromptOptions,
  SavedPrompt,
  JSONSchema,
  Token,
  Condition,
  ModelInfo,
  ProviderInfo,
  WorkflowRequest,
  FormBuilderSchema,
  JsonSchemaBuilderTemplate,
  UISavedJsonSchema,
  LLMModel,
  ModalType,
  ScheduledActionData,
  AlertData,
} from "../types/types";
import { ColumnType, ColumnSubType } from "../types/columns";
import { useModalManagerReducer } from "../reducers/ModalManagerReducer";
import { GridCellKind, CustomCell } from "@glideapps/glide-data-grid";
import { Rectangle } from "@glideapps/glide-data-grid";
import { ConvexReactClient } from "convex/react";
import { SetStateAction } from "react";
export interface GridProps {
  sheet_id: Id<"sheet">;
  project_id: Id<"project">;
  onNewColumnButtonClick: () => void;
  setClickedColumnId: (id: Id<"column"> | null) => void;
  clickedColumnId: Id<"column"> | null;
  openShowPromptModal: (props: {
    columnName: string;
    columnPrompt: SavedPrompt | string;
    columnJsonSchema?: { schema: JSONSchema };
  }) => void;
  state: GridState;
  rows: {
    cells: { column_id: Id<"column">; value: string; state: string }[];
    _id: Id<"row">;
    _creationTime: number;
    project_id?: Id<"project"> | undefined;
    order: number;
    row_number: number;
  }[];
  handleCreateViewsFromDeepDive: (
    columnName: string,
    tags: string[],
  ) => Promise<void>;
  scrollUp: () => void;
  scrollDown: () => void;
  actions: {
    setFilteredColumns: (payload: Id<"column">[]) => void;
    setHiddenColumns: (payload: Id<"column">[]) => void;
    setVisibleRegion: (payload: Rectangle) => void;
    setHeaderDropdownVisible: (payload: boolean) => void;
    setHeaderDropdownPosition: (payload: { x: number; y: number }) => void;
    setClickedCell: (payload: GridState["clickedCell"]) => void;
    setPopupStyle: (payload: GridState["popupStyle"]) => void;
    updatePopupStyle: (
      payload: (prev: GridState["popupStyle"]) => GridState["popupStyle"],
    ) => void;
    updateColumnWidths: (
      payload: (prev: Map<Id<"column">, number>) => Map<Id<"column">, number>,
    ) => void;
    setIsProgrammaticPopupUpdate: (payload: boolean) => void;
  };
  hideColumn: (columnId: Id<"column">) => void;
  switchToNewSheet: boolean;
  setSwitchToNewSheet: (v: boolean) => void;
}

export interface ColumnCreationModalProps {
  sheet_id: Id<"sheet">;
  project_id: Id<"project">;
  isOpen: boolean;
  onClose: () => void;
  onCreateColumn: (columnName: string, columnPrompt: string) => void;
  /**
   * Optional: If you want to indicate loading state while creating column
   * isLoading?: boolean;
   */
}

export interface Sheet {
  _id: Id<"sheet">;
  _creationTime: number;
  rows_in_sheet_counter?: number | undefined;
  hidden: Id<"column">[] | undefined;
  name: string;
  project_id: Id<"project">;
  filter: string;
}
export interface SheetHandlerProps {
  project: Id<"project"> | null;
  sheets: Doc<"sheet">[];
  sheet: Doc<"sheet"> | null;
  setSheet: (sheet: Doc<"sheet">) => void;
  onNewColumnButtonClick: () => void;
  switchToNewSheet: boolean;
  setSwitchToNewSheet: (v: boolean) => void;
  setClickedColumnId?: (id: Id<"column"> | null) => void;
  clickedColumnId: Id<"column"> | null;
  openShowPromptModal: (props: {
    columnName: string;
    columnPrompt: SavedPrompt | string;
    columnJsonSchema?: { schema: JSONSchema };
  }) => void;
  handleCreateViewsFromDeepDive: (
    columnName: string,
    tags: string[],
  ) => Promise<void>;
}
export interface SheetMenuProps {
  sheets: Doc<"sheet">[];
  sheet: Doc<"sheet"> | null;
  setSheet: (sheet: Doc<"sheet">) => void;
  disableInteraction?: boolean;
  creatingSheetId: string | null;
}

export interface SidebarProps {
  projects?: {
    _id: Id<"project">;
    _creationTime: number;
    rows_in_project_counter?: number;
    name: string;
  }[];
  projectGrouping?: Doc<"project_grouping">[];
  setProject?: (newProjectId: Id<"project"> | null) => void;
  selectDefaultProject?: () => Id<"project"> | null;
  project?: Id<"project"> | null;
  className?: string;
  openNewProjectModal: () => void;
  setSheet?: (newSheet: Doc<"sheet"> | undefined) => void;
  style?: React.CSSProperties;
  loadMoreProjects?: () => void;
  hasMoreProjects?: boolean;
  projectsLoading?: boolean;
}
export interface ViewCreationModalProps {
  project_id: Id<"project">;
  isOpen: boolean;
  onClose: () => void;
  onCreateView: (sheet_id: Id<"sheet">) => void;
}
export interface UniversalModalProps {
  isOpen: boolean;
  title: JSX.Element | string;
  subtitle?: string;
  closeModal: () => void;
  headerElement?: JSX.Element | null;
  content: JSX.Element;
  footer?: JSX.Element | null;
  modalType: string | null;
  isTableVisible: boolean;
  modalSubtype: string;
  preventClose?: boolean;
  activeTab: "upload" | "exa" | "datawarehouse";
  exaSearchType:
    | "news_article"
    | "github"
    | "personal_site"
    | "linkedin_profile"
    | "company";
  exaActionType: "search" | "findSimilar";
}
export interface ClickedCell {
  //Value from found cell
  value: string;
  //Cell state
  state: string;
  //Cell height
  cellHeight: number;
  // Cell width
  cellWidth: number;
  // Cell positions for popup positioning
  position: { x: number; y: number };
  columnType: ColumnType;
  columnSubType: ColumnSubType;
}
export interface GridPopupProps {
  top: number;
  left: number;
  visibility: "hidden" | "visible";
  opacity: number;
  width: string | number;
  content: string | undefined;
  maxWidth: string | number;
  onClose: () => void;
  clickedCell: ClickedCell | null;
}
export interface ModalReducerActions {
  setColumnName: (payload: string) => void;
  setPromptOptions: (payload: PromptOptions) => void;
  setSavedPrompts: (payload: SavedPrompt[]) => void;
  setSelectedSavedPrompt: (payload: string) => void;
  setIsLoading: (payload: boolean) => void;
  setCurrentStep: (payload: number) => void;
  setStepStatus: (payload: {
    index: number;
    status: "pending" | "loading" | "success" | "error" | "warning";
    description?: string;
  }) => void;
  setSteps: (payload: Step[]) => void;
  resetSteps: () => void;
  setCreationFlowType: (payload: "upload" | "search") => void;
  setSearchResultsCount: (payload: number | null) => void;
  setIsEditingTagTextArea: (payload: boolean) => void;
  setTagTextareaValue: (payload: string) => void;
  setTagTextAreaError: (payload: boolean) => void;
  setTagTextAreaErrorDetails: (payload: string) => void;
  setTagTextAreaOriginalInput: (payload: string) => void;
  setPromptNameError: (payload: string | null) => void;
  setPromptInputOverlayValidationError: (payload: string) => void;
  setPromptInputOverlayValidationWarning: (payload: string) => void;
  setProjectName: (payload: string) => void;
  setPromptsLoaded: (payload: boolean) => void;
  setMentionsPopupPosition: (payload: {
    top: number | string;
    left: number | string;
  }) => void;
  setSelectedFiles: (
    payload: FileWithProgress | FileWithProgress[] | null,
  ) => void;
  setError: (payload: string | null) => void;
  setExaQuery: (payload: string) => void;
  setExaSearchType: (
    payload:
      | "news_article"
      | "github"
      | "personal_site"
      | "linkedin_profile"
      | "company",
  ) => void;
  setExaActionType: (payload: "search" | "findSimilar") => void;
  setExaFindSimilarUrl: (payload: string) => void;
  setIsExaLoading: (payload: boolean) => void;
  setExaNumResults: (payload: number) => void;
  setSqlQuery: (payload: string) => void;
  setJsonSchema: (payload: string) => void;
  setSelectedConnector: (payload: string) => void;
  setIsQueryEntered: (payload: boolean) => void;
  setIsQueryLoading: (payload: boolean) => void;
  setActiveTab: (payload: "upload" | "exa" | "datawarehouse") => void;
  clearSelection: () => void;
  setShowFileTable: (show: boolean) => void;
  setIsUploading: (isUploading: boolean) => void;
  updateFileStatus: (
    id: string,
    status: FileUploadStatus,
    progress?: number,
    error?: string,
  ) => void;
  removeFile: (id: string) => void;
  clearCompletedFiles: () => void;
  setSubmitDisabled?: (disabled: boolean) => void;
  setEstimatedCost: (estimatedCost: string | null) => void;
  setEstimatedCostLoading: (estimatedCostLoading: boolean) => void;
  setExportActiveTab: (tab: "columns" | "views") => void;
  toggleExportColumn: (id: string, selected: boolean) => void;
  toggleExportView: (id: string, selected: boolean) => void;
  selectAllExportColumns: (columns: { _id: string; name: string }[]) => void;
  selectAllExportViews: (views: { _id: string; name: string }[]) => void;
  deselectAllExportColumns: () => void;
  deselectAllExportViews: () => void;
  setUserHasSetColumnsSelection: (payload: boolean) => void;
  setUserHasSetViewsSelection: (payload: boolean) => void;
  setIsExporting: (value: boolean) => void;
  setInitialExportColumns: (selections: { [key: string]: boolean }) => void;
  setInitialExportViews: (selections: { [key: string]: boolean }) => void;
  clearColumnModalData: () => void;
  setExportDownloadUrl: (data: { url: string } | null) => void;
}
export interface ModalManagerProps {
  isModalOpen: boolean;
  modalType: ModalType;
  closeModal: () => void;
  project_id: Id<"project"> | null;
  sheet: Doc<"sheet">;

  modalData: {
    columnName: string;
    columnPrompt: SavedPrompt | string | null;
    columnJsonSchema?: { schema: JSONSchema } | null;
  } | null;
  state: ModalManagerState;
  actions: ModalReducerActions;
  modalSessionIdRef: React.MutableRefObject<number>;
  handleNewView?: (updatedSheet: string) => void;
  handleCreateView?: (
    viewName: string,
    sqlQuery: string,
    project_id: Id<"project">,
    notification: boolean,
    navigateToNewSheet: boolean,
    hiddenColumns?: Id<"column">[],
    onCreationComplete?: () => void,
  ) => void;
  setLoadingViewProjects?: React.Dispatch<
    React.SetStateAction<Record<string, boolean>>
  >;
  // clickedColumnId?: Id<"column">; Clicked column will be used later
}
export interface Connector {
  name: string;
  lastSync: string;
  isAlive: boolean;
}
export interface ModalManagerState {
  columnName: string;
  promptOptions: PromptOptions;
  savedPrompts: SavedPrompt[];
  selectedPrompt: string;
  isLoading: boolean;
  currentStep: number; // Track the current step
  stepsStatus: Step[]; // Track step statuses
  isEditingTagTextArea: boolean;
  tagTextAreaValue: string;
  tagTextAreaError: boolean;
  tagTextAreaerrorDetails: string;
  tagTextAreaOriginalInput: string;
  promptNameError: string | null;
  promptsLoaded: boolean;
  promptInputOverlayValidationError: string;
  promptInputOverlayValidationWarning: string;
  mentionsPopupPosition: { top: number | string; left: number | string };
  projectName: string;
  selectedFiles: FileWithProgress | FileWithProgress[] | null;
  error: string | null;
  exaQuery: string;
  exaSearchType:
    | "news_article"
    | "github"
    | "personal_site"
    | "linkedin_profile"
    | "company";
  exaNumResults: number;
  isExaLoading: boolean;
  exaActionType: "search" | "findSimilar"; // ADD THIS
  exaFindSimilarUrl: string; // ADD THIS
  sqlQuery: string;
  jsonSchema: string;
  connectors: Connector[];
  selectedConnector: Connector;
  isQueryEntered: boolean;
  isQueryLoading: boolean;
  activeTab: "upload" | "exa" | "datawarehouse";
  showFileTable: boolean;
  isUploading: boolean;
  fileSubmitDisabled?: boolean;
  creationFlowType: "upload" | "search";
  searchResultsCount: number | null;
  estimatedCost: string | null;
  estimatedCostLoading: boolean;
  exportSelectedColumns: { [key: string]: boolean };
  exportSelectedViews: { [key: string]: boolean };
  exportActiveTab: "columns" | "views";
  userHasSetColumnsSelection: boolean;
  userHasSetViewsSelection: boolean;
  isExporting: boolean;
  exportDownloadUrl: string | null;
  previousNodeId?: string;
  lastSyncedSummary?: string;
}
// GRID STATE INTERFACE
export interface GridState {
  filteredColumns: Id<"column">[];
  hiddenColumns: Id<"column">[];
  columnWidths: Map<Id<"column">, number>;
  visibleRegion: Rectangle;
  headerDropdownVisible: boolean;
  headerDropdownPosition: { x: number; y: number };
  clickedCell: ClickedCell | null;

  popupStyle: {
    top: number;
    left: number;
    visibility: "hidden" | "visible";
    opacity: number;
    width: string;
    //Max width 250px, because having it the same as the column width caused weird visual bugs
    maxWidth: string;
  };
  isProgrammaticPopupUpdate: boolean;
}
export interface ColumnModalConfigProps {
  state: ReturnType<typeof useModalManagerReducer>["state"];
  actions: ModalReducerActions;
  projectId: Id<"project"> | null;
  savedJsonSchemas?: Array<{
    id: string;
    name: string;
    schema: JSONSchema;
    projectId: Id<"project">;
  }>;
  mentionsRef: React.MutableRefObject<MentionsComponentRef | null>;
  promptOptionsRef: React.MutableRefObject<PromptOptions>;
  localMentionsTextAreaValueState: string;
  setLocalMentionsTextAreaValueState: React.Dispatch<
    React.SetStateAction<string>
  >;
  promptSearch: string;
  setPromptSearch: React.Dispatch<React.SetStateAction<string>>;
  validColumnNames: Set<string>;
  filteredSavedPrompts: SavedPrompt[];
  groupedSavedPrompts: GroupedPrompts;
  handleSelectSavedPrompt: (value: string) => void;
  localTagTextareaValue: string;
  setLocalTagTextareaValue: React.Dispatch<React.SetStateAction<string>>;
  useCostEstimation?: boolean;
  isEditingExistingNode?: boolean;
  nodeError?: string;
  // Is the modal in show prompt mode where everything in read-only state
  isReadOnly?: boolean;
}
export type StepKind =
  | "search"
  | "createProject"
  | "upload"
  | "processData"
  | "createView";

export interface Step {
  step: string;
  status: "pending" | "loading" | "success" | "error" | "warning";
  description?: string;
  index: number;
  kind?: StepKind;
}

export interface NewProjectModalConfigProps {
  isLoading: boolean;
  stepsStatus: Step[];
  accept?: string[];
  state: ModalManagerState;
  validateFileName: any;
  actions: ModalReducerActions;
  onSearchStarted?: () => void;
  onSearchFailed?: (description?: string) => void;
  onSearchCompleted?: (args: {
    file: FileWithProgress;
    projectName: string;
    resultsCount: number;
  }) => void;
  setSearchHandler?: (
    handler: (() => Promise<void>) | null,
  ) => void;
}

export interface ViewModalConfigProps {
  state: ModalManagerState;
  actions: {
    setViewName: (name: string) => void;
    setFilterCondition: (condition: string) => void;
  };
}
export interface TextGenerationPromptMessage {
  role: string;
  content: { type: string; text: string }[];
}

// Define the loading-cell type for custom cell in Glide Apps Data Grid
export interface LoadingCellProps {
  readonly kind: "loading-cell";
}

// Define the MP3Cell
export interface Mp3CellData {
  kind: "mp3-player-cell";
  url: string; // URL for the MP3 file
}

export interface Mp3Cell extends CustomCell {
  kind: GridCellKind.Custom;
  data: Mp3CellData;
  allowOverlay: boolean;
  cellInfo: { rowIndex: number; columnIndex: number; columnId: Id<"column"> };
}

// Define the props for the ErrorCell
export interface ErrorCellProps {
  readonly type: "error-cell"; // Defines the type as "error-cell"
  readonly text: string; // The error message or text to display
}

// Interface for the retry context
export interface RetryContextProps {
  retryData: {
    // Function and it's arguments to retry, null if reset or not set
    fn: (...args: any[]) => Promise<any>;
    args: any[];
  } | null;
  // Function to update retry data
  setRetryData: React.Dispatch<
    React.SetStateAction<RetryContextProps["retryData"] | null>
  >;
  // Function to clear retry data
  clearRetryData: () => void;
}
// MediaSidebar Interfaces
export interface SidebarContent {
  type: string;
  urls: string[];
}

export interface MediaSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  content: SidebarContent | null;
}
// Interface for the file cell
export interface FileCellProps {
  readonly type: "file-cell";
  readonly url: string | string[];
  readonly fileName: string | string[];
}
export interface HeaderDropdownProps {
  clickedColumnId: string | null;
  // Column list
  visibleColumns: Array<{ _id: string; name: string }>;
  dropdownVisible: boolean;
  // Dropdown Position
  dropdownPosition: { x: number; y: number };
  closeHeaderDropdown: () => void;
  // Open a modal with passed data
  openShowPromptModal: (props: {
    columnName: string;
    columnPrompt: SavedPrompt | string;
    columnJsonSchema?: { schema: JSONSchema };
  }) => void;
  projectId: Id<"project"> | null;
  // Function to hide a column
  hideColumn: (columnId: Id<"column">) => void;
  handleCreateViewsFromDeepDive?: (columnName: string, tags: string[]) => void;
  switchToNewSheet: boolean;
  setSwitchToNewSheet: (v: boolean) => void;
  isResizing?: boolean;
}

// Pass in options when creating a logger instance.
// Service option, to label logs
export interface LoggerOptions {
  // The name of the service, class, or component generating the logs.
  service: string;
}

export interface ServiceCredential {
  id: Id<"service_credentials">;
  service: string;
  apiKey: string; // This contains the actual decrypted key
  lastModified: number;
}

// Define the shape of the context's data.
export interface DataContextProps {
  // List of all available projects
  projects: Doc<"project">[];
  // List of project groups
  projectGrouping: Doc<"project_grouping">[];
  // List of sheets for the selected project
  sheets: Doc<"sheet">[];
  // List of columns for the selected project
  columns: Doc<"column">[];
  // The currently selected project (or null if not selected)
  project: Id<"project"> | null;
  // The currently selected sheet (or undefined if not selected)
  sheet: Doc<"sheet"> | undefined;
  // Indicates whether any data is still loading
  loading: boolean;
  // Logs
  logs: Doc<"log">[];
  // Jobs
  jobs: Doc<"job">[];
  // Workspace
  workspace: Doc<"workspace"> | null;
  // Service Credential
  serviceCredentials: ServiceCredential[] | null;
  // Service credential loading
  serviceCredentialsLoading: boolean;
  // Columns with loading cells
  loadingColumnsSet: Set<Id<"column">>;
  // Columns whose most recent job ended in failure
  failedColumnsSet: Set<Id<"column">>;
  // System prompt:
  systemPrompt: Doc<"system_settings"> | null;
  // System Prompt loading:
  fetchedSystemPromptLoading: boolean;
  // Indicates whether each resource has no data (after loading)
  isEmpty: {
    // True if projects query returned empty results
    projects: boolean;
    // True if sheets query returned empty results
    sheets: boolean;
    // True if columns query returned empty results
    columns: boolean;
    // True if logs query returned empty results
    logs: boolean;
    // True if jobs query returned empty results
    jobs?: boolean;
    // True if project grouping query returned empty results
    projectGrouping?: boolean;
    // True if workspace query returned empty results
    workspace?: boolean;
    // True if serviceCredentials query returned empty results
    serviceCredentials?: boolean;
    // True if SystemPrompt query returned empty results
    fetchedSystemPrompt?: boolean;
    promptsAndTJsonSchemas?: boolean;
  };
  // Provides a comprehensive view of the data state
  dataState:
    | "loading"
    | "no-projects"
    | "no-sheets"
    | "no-columns"
    | "no-jobs"
    | "no-logs"
    | "has-data";
  // Function to update the selected project
  setProject: (newProjectId: Id<"project"> | null) => void;
  // Function to select the default project
  selectDefaultProject: () => Id<"project"> | null;
  // Function to update the selected sheet
  setSheet: (newSheet: Doc<"sheet"> | undefined) => void;
  // Convex client
  convex: ConvexReactClient;
  loadMoreProjects?: () => void;
  hasMoreProjects?: boolean;
  loadMoreSheets?: () => void;
  hasMoreSheets?: boolean;
  scrollColumnsRight?: () => void;
  scrollColumnsLeft?: () => void;
  projectsLoading?: boolean;
  sheetsLoading?: boolean;
  scrollDownLogs?: () => void;
  scrollUpLogs?: () => void;
  logsResults: PaginatedLogsResponse[];
  logsLoading: boolean;
  scrollDownJobs?: () => void;
  scrollUpJobs?: () => void;
  jobsResults: PaginatedJobsResponse[];
  jobsLoading: boolean;
  savedPrompts: SavedPrompt[];
  savedJsonSchemas: UISavedJsonSchema[];
  promptsAndJsonSchemasLoading: boolean;
  refreshAllPromptsAndJsonSchemas: () => void;
  handleCreateView: (
    viewName: string,
    sqlQuery: string,
    project_id: Id<"project">,
    notification?: boolean,
    navigateToNewSheet?: boolean,
    hiddenColumns?: Id<"column">[],
    onCreationComplete?: () => void,
  ) => Promise<void>;
  handleNewView: (sheet_id: string) => void;
  setLoadingViewProjects: React.Dispatch<
    SetStateAction<Record<string, boolean>>
  >;
  loadingViewProjects: Record<string, boolean>;
  creatingSheetId: string | null;
}
// Sync Cards
export interface SyncCardProps {
  name: string;
  lastSync: string;
  records: number;
  syncs: { id: number; success: boolean; records: number }[];
}
export interface Operator {
  value: string;
  label: string;
}
export interface VisualQueryBuilderProps {
  viewName: string;
  fields: string[];
  onSave: (sqlQuery: string) => void;
  onCancel: () => void;
  loading: boolean;
  isAddingCondition: boolean;
  setIsAddingCondition: (isAdding: boolean) => void;
  constructedQueryVisible: boolean;
  setConstructedQueryVisible: (visible: boolean) => void;
  initialState?: QueryBuilderState | null;
  onStateChange?: (state: QueryBuilderState) => void;
  projectColumns?: Doc<"column">[];
  mode?: string;
}

export interface QueryBuilderState {
  tokens: Token[];
  currentCondition: Condition;
  showOperators: boolean;
  isAddingCondition?: boolean;
  constructedQueryVisible?: boolean;
}

export interface TagProps {
  tag: string | string[];
  colorName?: string;
  children: React.ReactNode;
  className?: string;
}

export interface SpreadsheetData {
  id: string;
  title: string;
  newItemsCount: number;
  status: "creating" | "ready";
}

export interface DayData {
  date: Date;
  formattedDate: string;
  shortDay: string;
  isToday: boolean;
  spreadsheet: SpreadsheetData | null;
}

export interface WeekData {
  weekStart: Date;
  weekEnd: Date;
  formattedWeek: string;
  days: DayData[];
  newItemsCount: number;
  isCurrentWeek: boolean;
}

export type FileInvalidReason =
  | "different-type"
  | "multiple-parquet"
  | "multiple-csv"
  | "invalid-file-type"
  | "limit-exceeded";

export type FileUploadStatus = "pending" | "uploading" | "completed" | "error";

export interface FileWithProgress {
  id: string;
  file: File;
  status: FileUploadStatus;
  progress: number;
  isInvalid?: boolean;
  invalidReason?: FileInvalidReason | null;
}
export interface AudioCellProps {
  type: "audio-cell";
  fileName: string;
  readonly?: boolean;
  audioUrl?: string;
}
export interface AudioCell {
  kind: GridCellKind.Custom;
  data: AudioCellProps;
  allowOverlay: boolean;
  copyData: string;
}
export interface FileValidationResult {
  markedFiles: FileWithProgress[];
  hasInvalidFiles: boolean;
  errorMessage: string | null;
  dominantType?: string;
  isParquetError?: boolean;
}
export interface JsonCellProps {
  type: "json-cell";
  json: string;
  readonly?: boolean;
}
export interface JsonCell {
  kind: GridCellKind.Custom;
  data: JsonCellProps;
  allowOverlay: boolean;
  copyData: string;
}
export interface PaginatedColumnsResponse {
  columns: Doc<"column">[];
  indexKeys: any[];
  hasMore: boolean;
  sheetId: Id<"sheet">;
}

export interface PaginatedColumns {
  results: PaginatedColumnsResponse[];
  scrollRight: () => void;
  scrollLeft: () => void;
  limit?: number;
}
export interface PaginatedProjects {
  projects: Doc<"project">[];
  loading: boolean;
  loadMore: () => void;
  hasMore: boolean;
  limit?: number;
}
export interface PaginatedSheets {
  sheets: Doc<"sheet">[];
  loading: boolean;
  loadMore: () => void;
  hasMore: boolean;
  limit?: number;
}
export interface PaginatedLogsResponse {
  logs: Doc<"log">[];
  indexKeys: any[];
  hasMore: boolean;
  projectId: Id<"project">;
  limit?: number;
}

export interface PaginatedLogs {
  results: PaginatedLogsResponse[];
  scrollDown: () => void;
  scrollUp: () => void;
  limit?: number;
}

// Paginated Jobs Interfaces
export interface PaginatedJobsResponse {
  jobs: Doc<"job">[];
  indexKeys: any[];
  hasMore: boolean;
  projectId: Id<"project">;
}

export interface PaginatedJobs {
  results: PaginatedJobsResponse[];
  scrollDown: () => void;
  scrollUp: () => void;
  limit?: number;
}
export interface MentionsComponentRef {
  updateOverlay: (text: string) => void;
  updateOverlaySafely: (text: string) => void;
}
export interface MentionsComponentProps {
  value: string;
  setValue: (val: string) => void;
  setPromptOptions: (opts: PromptOptions) => void;
  setMentionsPopupPosition: (pos: {
    top: number | string;
    left: number | string;
  }) => void;
  projectColumns: Doc<"column">[];
  overlayError?: string;
  overlayWarning?: string;
  validColumnNames: Set<string>;
  promptOptionsRef: React.MutableRefObject<PromptOptions>;
  overlayErrorSetter: (msg: string) => void;
  overlayWarningSetter: (msg: string) => void;
  onSend?: () => void;
  inChat?: boolean;
  conversationId?: Id<"chat_conversation"> | null;
  chatSheet?: Doc<"sheet">;
  chatLoading?: boolean;
  disabled?: boolean;
  /**
   * When true, shows a copy-to-clipboard button even if the component is disabled.
   * Used for read-only views of prompts.
   */
  showCopyButton?: boolean;
}
export interface ProjectViewCreation {
  isCreating: boolean;
  viewName: string;
  showQueryBuilder: boolean;
  showViewInput: boolean;
  tokens?: Token[];
  currentCondition?: Condition;
  showOperators?: boolean;
}

export interface ProjectQueryBuilderState {
  tokens: Token[];
  currentCondition: Condition;
  showOperators: boolean;
  isAddingCondition: boolean;
  constructedQueryVisible: boolean;
}
export interface ViewNameInputProps {
  initialValue: string;
  onSave: (value: string) => void;
  disabled: boolean;
  placeholder: string;
}

export interface HeaderProps {
  openExportModal: () => void;
  openSummaryModal: () => void;
  openAlertModal: () => void;
}
export interface SheetObject {
  name: string;
  condition: string;
  column_names: string[];
}
export interface ModelsTableProps {
  models: ModelInfo[];
  isVisible?: boolean;
}

export interface ApiProviderCardProps {
  provider: ProviderInfo;
  onApiKeySave: (providerId: string, key: string) => void;
  onToggleModels: (providerId: string) => void;
  isExpanded: boolean;
}

export interface SettingsModalConfigProps {
  onApiKeySave: (providerId: string, key: string) => void;
}
/**
 * Defines the detailed structure of a node within the workflow UI.
 * This type is the single source of truth for both frontend state and the
 * structure returned by the buildWorkflowTree function and getProjectWorkflowTree query.
 */
export interface WorkflowNode {
  // A unique identifier for the node in the client, e.g., view-backend-xyz or col-backend-abc.
  id: string;
  // The display name of the node, derived from the sheet or column name.
  label: string;
  // The Convex database ID for the corresponding sheet or column document.
  convexId: Id<"sheet"> | Id<"column"> | undefined;
  // If the node is a column, this is the Convex ID of its parent sheet.
  convexSheetId?: Id<"sheet"> | undefined;
  // Determines if the node is a view (sheet) or a processing step (column).
  isView: boolean;
  // UI state: whether the node's children are visible.
  expanded?: boolean;
  // Child nodes of this node. Only applicable to views, representing the columns under them.
  children: WorkflowNode[];
  // View-specific properties
  sql_condition?: string;
  // The state of the visual query builder for a view.
  queryBuilderState?: QueryBuilderState;
  // Column-specific properties
  // The type of operation the column performs, e.g., 'tag', 'summary', 'extract'.
  type?: "tag" | "summary" | "ask" | "extract" | string; // string allows for future extensibility
  // The AI model used for the operation.
  model?: LLMModel;
  // The user-prvided prompt or instruction for the AI.
  summary?: string;
  // For tag type: a comma-separated string of possible tags.
  tags?: string;
  // For tag type: specifies if multiple tags can be applied.
  tagMode?: "singleTag" | "multiTag";
  // For extract type: the JSON schema defining the desired output structure.
  responseSchema?: JSONSchema;
  // The database column names used as input for the prompt.
  inputCols?: string[];
}
export interface WorkflowContextType {
  workflowData: WorkflowNode[];
  setWorkflowData: React.Dispatch<React.SetStateAction<WorkflowNode[]>>;
  addNode: (
    parentId: string | null,
    nodeData: Partial<WorkflowNode>,
  ) => Promise<string>;
  updateNode: (
    nodeId: string,
    updatedData: Partial<WorkflowNode>,
  ) => Promise<void>;
  deleteNode: (nodeId: string) => Promise<void>;
  clearWorkflowExceptDefault: () => Promise<void>;
  toggleExpanded: (nodeId: string) => void;
  importWorkflow: (jsonData: string) => Promise<void>;
  exportWorkflow: () => string;
  exportWorkflowViews: () => string;
  exportWorkflowAsRequestsJson: () => string;
  exportWorkflowAsRequests: () => WorkflowRequest[];
  exportWorkflowAsViewRequestsJson: () => string;
  exportWorkflowAsViewRequests: () => WorkflowRequest[];
  workflowLoading: boolean;
  importProgress: {
    isImporting: boolean;
    current: number;
    total: number;
    message: string;
  };
}

export interface SystemPromptSettings {
  prompt: string;
  lastModified: string;
}

// Base request interface (no timestamp here!)
interface BaseRequest {
  callback_url: string;
  convex_project_id: string;
}

// View creation request
export interface ViewCreationRequest {
  timestamp: string;
  path: "/create_view";
  request_data: BaseRequest & {
    convex_sheet_id: string;
    sql_filter: string;
  };
}

// Column creation/process request
export interface ColumnProcessRequest {
  timestamp: string;
  path: "/process";
  request_data: BaseRequest & {
    convex_column_id: string;
    column_name: string;
    sql_condition: string;
    output_name: string;
    prompt_input_columns: string[];
    workflow_id: null;
    api_keys: Record<string, never>;
    extraction_keyword: string;
    prompt: any; // Structured or text generation prompt
  };
}

// Column list request for export validation
export interface ColumnListRequest {
  timestamp: string;
  path: "/columns/list";
  request_data: BaseRequest & {
    project_id: string;
  };
}

export interface AllPromptsAndJsonSchemasResult {
  prompts: SavedPrompt[];
  jsonSchemas: Array<{
    id: string;
    name: string;
    schema: JSONSchema;
    projectId: Id<"project">;
  }>;
  count: {
    prompts: number;
    jsonSchemas: number;
  };
}

export interface JsonSchemaBuilderProps {
  onSchemaChange: (schema: JSONSchema) => void;
  initialSchema?: JSONSchema;
  columnName: string;
  projectName: string;
  savedJsonSchemas?: JsonSchemaBuilderTemplate[];
  isReadOnly?: boolean;
}
export interface FormBuilderProps {
  initialSchema?: FormBuilderSchema;
  onSchemaChange?: (schema: FormBuilderSchema) => void;
  isReadOnly?: boolean;
  projectName: string;
  columnName: string;
}
export interface ColumnEditorAdapterProps {
  node?: WorkflowNode;
  isNew?: boolean;
  onSave: (nodeData: Partial<WorkflowNode>) => void;
  onCancel: () => void;
  isSaving: boolean;
}
// Interface for chat messages
export interface ChatMessage {
  id: string;
  content: string;
  role: "user" | "assistant";
  timestamp: Date;
  isStreaming?: boolean;
}

export interface ExportModalConfigProps {
  state: ModalManagerState;
  actions: ModalReducerActions;
  projectId: Id<"project">;
  closeModal: () => void;
}

export interface MarkdownCellProps {
  type: "markdown-cell";
  readonly?: boolean;
}

export interface MarkdownCell {
  kind: GridCellKind.Custom;
  data: MarkdownCellProps;
  allowOverlay: boolean;
  copyData: string;
}

export interface PerformanceMetric {
  startTime: number;
  endTime: number;
  duration: number;
}

export interface JamsocketContextState {
  isMainSessionReady: boolean;
  projectBackendUrls: Map<Id<"project">, string>;
  spawningProjects: Set<Id<"project">>;
  performanceMetrics: Map<Id<"project">, PerformanceMetric>;
}
/**
 * Configuration object for the BackendClient.
 */
export interface BackendClientConfig {
  convex: ConvexReactClient;
  t: (key: string, options?: Record<string, string>) => string;
}
// Modal Context
export interface ModalContextType {
  isModalOpen: boolean;
  isModalReady: boolean;
  modalType: ModalType;
  modalData: ModalDataContext;
  modalState: ReturnType<typeof useModalManagerReducer>["state"];
  modalActions: ReturnType<typeof useModalManagerReducer>["actions"];
  modalSessionIdRef: React.MutableRefObject<number>;
  openModal: (type: ModalType, data?: Partial<ModalDataContext>) => void;
  closeModal: () => void;
}

export interface ModalDataContext {
  columnName: string;
  columnPrompt: SavedPrompt | string | null;
  columnJsonSchema?: { schema: JSONSchema } | null;
}

export interface SidebarStateContextType {
  displayCount: number;
  setDisplayCount: React.Dispatch<React.SetStateAction<number>>;
  ITEMS_PER_PAGE: number;
}

export interface FilterDisplayProps {
  filterString?: string;
  filterConditions: string;
  mode?: string;
}
// Inteface for keeping prompts in groups by sheetName
export interface GroupedPrompts {
  [sheetName: string]: SavedPrompt[];
}

export interface SchedulingModalConfigProps {
  onSave: (data: ScheduledActionData) => void;
  onCancel: () => void;
  isLoading: boolean;
  state: ReturnType<typeof useModalManagerReducer>["state"];
  actions: ModalReducerActions;
  projectId: Id<"project"> | null;
  savedJsonSchemas?: Array<{
    id: string;
    name: string;
    schema: JSONSchema;
    projectId: Id<"project">;
  }>;
  mentionsRef: React.MutableRefObject<MentionsComponentRef | null>;
  promptOptionsRef: React.MutableRefObject<PromptOptions>;
  localMentionsTextAreaValueState: string;
  setLocalMentionsTextAreaValueState: React.Dispatch<
    React.SetStateAction<string>
  >;
  columns: Doc<"column">[];
  promptSearch: string;
  setPromptSearch: React.Dispatch<React.SetStateAction<string>>;
  validColumnNames: Set<string>;
  filteredSavedPrompts: SavedPrompt[];
  groupedSavedPrompts: GroupedPrompts;
  handleSelectSavedPrompt: (value: string) => void;
  localTagTextareaValue: string;
  setLocalTagTextareaValue: React.Dispatch<React.SetStateAction<string>>;
}
export interface AlertModalConfigProps {
  onSave: (data: AlertData) => void;
  onCancel: () => void;
  isLoading: boolean;
}

import { ReactNode, useMemo, useState, useRef } from "react";
import { MemoryRouter } from "react-router";
import { I18nextProvider } from "react-i18next";
import i18n from "../../src/i18n";
import { DataContext } from "../../src/context/DataContext";
import { ModalContext } from "../../src/context/ModalContext";
import { SidebarStateProvider } from "../../src/context/SidebarStateContext";
import { WorkflowContext } from "../../src/context/WorkflowContextCore";
import type {
  WorkflowContextType,
  SidebarStateContextType,
  DataContextProps,
  ModalContextType,
  ModalDataContext,
} from "../../src/interfaces/interfaces";
import type { WorkflowNode } from "../../src/interfaces/interfaces";
import type {
  PaginatedLogsResponse,
  PaginatedJobsResponse,
} from "../../src/interfaces/interfaces";
import { ConvexReactClient } from "convex/react";
import { LLMModel, PromptOptions } from "../../src/types/types";
import { RootSidebarProvider } from "../../src/components/ui/sidebar";
import { useAuth } from "@clerk/clerk-react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { JamsocketProvider } from "../../src/context/JamsocketContext";

type MockAppProvidersProps = {
  children: ReactNode;
  data?: Partial<DataContextProps>;
  modal?: Partial<ModalContextType>;
  sidebarState?: Partial<SidebarStateContextType>;
  workflow?: Partial<WorkflowContextType>;
  fullscreen?: boolean;
};

// stubs

const noop = () => {};

const resolved = <T,>(v: T) => Promise.resolve(v);
const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL!);
// MockAppProviders

export function MockAppProviders({
  children,
  data,
  modal,
  workflow,
  fullscreen = false,
}: MockAppProvidersProps) {
  // ----- Data -----
  /**
   * DataContextProps
   */
  const dataValue = useMemo<DataContextProps>(() => {
    const emptyLogsResults: PaginatedLogsResponse[] = [];
    const emptyJobsResults: PaginatedJobsResponse[] = [];

    const defaultIsEmpty: DataContextProps["isEmpty"] = {
      projects: false,
      sheets: false,
      columns: false,
      logs: false,
      jobs: false,
      projectGrouping: false,
      workspace: false,
      serviceCredentials: false,
      fetchedSystemPrompt: false,
      promptsAndTJsonSchemas: false,
    };

    return {
      projects: [],
      projectGrouping: [],
      sheets: [],
      columns: [],
      project: null,
      sheet: undefined,
      loading: false,
      logs: [],
      jobs: [],
      workspace: null,
      serviceCredentials: null,
      serviceCredentialsLoading: false,
      loadingColumnsSet: new Set(),
      systemPrompt: null,
      fetchedSystemPromptLoading: false,
      isEmpty: defaultIsEmpty,
      dataState: "has-data",
      setProject: noop,
      setSheet: noop,
      convex: convex,
      loadMoreProjects: noop,
      hasMoreProjects: false,
      loadMoreSheets: noop,
      hasMoreSheets: false,
      scrollColumnsRight: noop,
      scrollColumnsLeft: noop,
      projectsLoading: false,
      sheetsLoading: false,
      scrollDownLogs: noop,
      scrollUpLogs: noop,
      logsResults: emptyLogsResults,
      logsLoading: false,
      scrollDownJobs: noop,
      scrollUpJobs: noop,
      jobsResults: emptyJobsResults,
      jobsLoading: false,
      savedPrompts: [],
      savedJsonSchemas: [],
      promptsAndJsonSchemasLoading: false,
      refreshAllPromptsAndJsonSchemas: noop,
      // finally spread story overrides
      ...data,
    };
  }, [data]);

  // Modal
  const modalSessionIdRef = useRef(0);
  const [isModalOpen, setModalOpen] = useState(false);
  const [isModalReady, setIsModalReady] = useState(false);
  const [modalType, setModalType] =
    useState<ModalContextType["modalType"]>(null);
  const [modalData, setModalData] = useState<ModalDataContext>({
    columnName: "",
    columnPrompt: null,
    columnJsonSchema: null,
  });

  const openModal: ModalContextType["openModal"] = (type, dataOverrides) => {
    modalSessionIdRef.current += 1;
    setModalData((prev) => ({
      ...prev,
      columnName: "",
      columnPrompt: null,
      columnJsonSchema: null,
      ...dataOverrides,
    }));
    setModalType(type);
    setIsModalReady(true);
    setModalOpen(true);
  };
  const closeModal: ModalContextType["closeModal"] = () => {
    setModalOpen(false);
    setIsModalReady(false);
    setModalType(null);
  };

  /**
   * modalState and modalActions
   */
  const modalValue: ModalContextType = {
    isModalOpen,
    isModalReady,
    modalType,
    modalData,
    modalState: {
      columnName: "",
      promptOptions: {
        model: "gpt-4o" as LLMModel,
        promptType: "noSchema",
        userPrompt: "",
        promptInputColumns: [],
      } as PromptOptions,
      savedPrompts: [],
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
      promptsLoaded: false,
      promptInputOverlayValidationError: "",
      promptInputOverlayValidationWarning: "",
      mentionsPopupPosition: { top: 0, left: 0 },
      projectName: "",
      selectedFiles: null,
      error: null,
      exaQuery: "",
      exaSearchType: "company",
      exaNumResults: 0,
      isExaLoading: false,
      exaActionType: "search",
      exaFindSimilarUrl: "",
      sqlQuery: "",
      jsonSchema: "",
      connectors: [],
      selectedConnector: { name: "", lastSync: "", records: 0, syncs: [] },
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
    } as any,
    modalActions: {
      setColumnName: noop,
      setPromptOptions: noop,
      setSavedPrompts: noop,
      setSelectedSavedPrompt: noop,
      setIsLoading: noop,
      setCurrentStep: noop,
      setStepStatus: noop,
      resetSteps: noop,
      setIsEditingTagTextArea: noop,
      setTagTextareaValue: noop,
      setTagTextAreaError: noop,
      setTagTextAreaErrorDetails: noop,
      setTagTextAreaOriginalInput: noop,
      setPromptNameError: noop,
      setPromptInputOverlayValidationError: noop,
      setPromptInputOverlayValidationWarning: noop,
      setProjectName: noop,
      setPromptsLoaded: noop,
      setMentionsPopupPosition: noop,
      setSelectedFiles: noop,
      setError: noop,
      setExaQuery: noop,
      setExaSearchType: noop,
      setExaActionType: noop,
      setExaFindSimilarUrl: noop,
      setIsExaLoading: noop,
      setExaNumResults: noop,
      setSqlQuery: noop,
      setJsonSchema: noop,
      setSelectedConnector: noop,
      setIsQueryEntered: noop,
      setIsQueryLoading: noop,
      setActiveTab: noop,
      clearSelection: noop,
      setShowFileTable: noop,
      setIsUploading: noop,
      updateFileStatus: noop,
      removeFile: noop,
      clearCompletedFiles: noop,
      setSubmitDisabled: noop,
      setEstimatedCost: noop,
      setEstimatedCostLoading: noop,
      setExportActiveTab: noop,
      toggleExportColumn: noop,
      toggleExportView: noop,
      selectAllExportColumns: noop,
      selectAllExportViews: noop,
      deselectAllExportColumns: noop,
      deselectAllExportViews: noop,
      setUserHasSetColumnsSelection: noop,
      setUserHasSetViewsSelection: noop,
      setIsExporting: noop,
      setInitialExportColumns: noop,
      setInitialExportViews: noop,
      clearColumnModalData: noop,
      setExportDownloadUrl: noop,
    } as any,
    modalSessionIdRef,
    openModal,
    closeModal,
    ...modal,
  };

  // Workflow
  const [workflowData, setWorkflowData] = useState<WorkflowNode[]>([]);

  const workflowValue: WorkflowContextType = {
    workflowData,
    setWorkflowData,
    addNode: (_parentId, _nodeData) => resolved("mock-node-id"),
    updateNode: (_nodeId, _data) => resolved<void>(undefined),
    deleteNode: (_nodeId) => resolved<void>(undefined),
    clearWorkflowExceptDefault: () => resolved<void>(undefined),
    toggleExpanded: noop,
    importWorkflow: (_json) => resolved<void>(undefined),
    exportWorkflow: () => "{}",
    exportWorkflowViews: () => "{}",
    exportWorkflowAsRequestsJson: () => "[]",
    exportWorkflowAsRequests: () => [],
    exportWorkflowAsViewRequestsJson: () => "[]",
    exportWorkflowAsViewRequests: () => [],
    workflowLoading: false,
    importProgress: {
      isImporting: false,
      current: 0,
      total: 0,
      message: "",
    },
    ...workflow,
  };

  const content = (
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>
        <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
          <JamsocketProvider>
            <RootSidebarProvider>
              <DataContext.Provider value={dataValue}>
                <ModalContext.Provider value={modalValue}>
                  <SidebarStateProvider>
                    <WorkflowContext.Provider value={workflowValue}>
                      {children}
                    </WorkflowContext.Provider>
                  </SidebarStateProvider>
                </ModalContext.Provider>
              </DataContext.Provider>
            </RootSidebarProvider>
          </JamsocketProvider>
        </ConvexProviderWithClerk>
      </MemoryRouter>
    </I18nextProvider>
  );
  if (fullscreen) {
    return (
      <div className="flex h-screen w-screen flex-grow flex-auto">
        {content}
      </div>
    );
  }
  return content;
}

import {
  createContext,
  useContext,
  ReactNode,
  useEffect,
  useMemo,
  useState,
  useCallback,
  useRef,
} from "react";
import { useQueryWithLoading } from "../services/queryService";
import { api } from "../../convex/_generated/api";
import type { Id, Doc } from "../../convex/_generated/dataModel";
import { useTranslation } from "react-i18next";
import { DataContextProps } from "../interfaces/interfaces";
import { ConvexReactClient, useAction } from "convex/react";
import { AllPromptsAndJsonSchemasResult } from "../interfaces/interfaces";
// Import pagination hooks
import usePaginatedProjects from "@/hooks/usePaginatedProjects";
import usePaginatedSheets from "@/hooks/usePaginatedSheets";
import usePaginatedColumns from "@/hooks/usePaginatedColumns";
import usePaginatedLogs from "@/hooks/usePaginatedLogs";
import usePaginatedJobs from "@/hooks/usePaginatedJobs";
import {
  computeColumnsBlockedByJobs,
  computeColumnsFailedByJobs,
} from "@/utils/jobUtils";
import {
  UISavedJsonSchema,
  BackendSavedJsonSchemas,
  FormField,
} from "@/types/types";
import { convertJsonSchemaToFields } from "@/utils/jsonSchemaConverters";
import { useLocation } from "react-router";
import { useBackendClient } from "@/hooks/useBackendClient";
import { useLogger } from "@/utils/Logger";
import {
  showSuccessNotification,
  showErrorNotification,
} from "@/components/notification/NotificationHandler";

export const DataContext = createContext<DataContextProps | undefined>(
  undefined,
);
export const DataProvider = ({
  children,
  convex,
}: {
  children: ReactNode;
  convex: ConvexReactClient;
}) => {
  const { t } = useTranslation();
  const location = useLocation();
  const [projectSelectionInitialized, setProjectSelectionInitialized] =
    useState(false);
  const [project, setProject] = useState<Id<"project"> | null>(null);
  const [sheet, setSheet] = useState<Doc<"sheet"> | undefined>(undefined);
  const [isProjectTransitioning, setIsProjectTransitioning] = useState(false);
  const [systemPromptSettings, setSystemPromptSettings] =
    useState<Doc<"system_settings"> | null>(null);
  const [allPromptsAndJsonSchemas, setAllPromptsAndJsonSchemas] =
    useState<AllPromptsAndJsonSchemasResult | null>(null);
  const [promptsAndJsonSchemasLoading, setPromptsAndJsonSchemasLoading] =
    useState<boolean>(true);
  const [_fetchError, setFetchError] = useState<Error | null>(null);
  const [creatingSheetId, setCreatingSheetId] = useState<string | null>(null);
  const [loadingViewProjects, setLoadingViewProjects] = useState<
    Record<string, boolean>
  >({});
  const lastSelectedProjectIdRef = useRef<Id<"project"> | null>(null);
  const backendClient = useBackendClient();
  const logger = useLogger("DataContext.tsx");
  // Pagination hooks
  const {
    projects,
    loading: projectsLoading,
    loadMore: loadMoreProjects,
    hasMore: hasMoreProjects,
  } = usePaginatedProjects();

  const {
    sheets,
    loading: sheetsLoading,
    loadMore: loadMoreSheets,
    hasMore: hasMoreSheets,
  } = usePaginatedSheets(project ?? undefined);

  const {
    results: columnsResults,
    scrollRight: scrollColumnsRight,
    scrollLeft: scrollColumnsLeft,
  } = usePaginatedColumns(project ?? undefined, sheet?._id ?? undefined);

  // Enable logs fetching only on the logs page to avoid unnecessary queries
  const isLogsPage = location.pathname === "/logs";
  const {
    results: logsResults,
    scrollDown: scrollDownLogs,
    scrollUp: scrollUpLogs,
  } = usePaginatedLogs(project ?? undefined, 50, isLogsPage);

  const {
    results: jobsResults,
    scrollDown: scrollDownJobs,
    scrollUp: scrollUpJobs,
  } = usePaginatedJobs(project ?? undefined);

  const jobs = useMemo(() => {
    if (!project) return [];
    return jobsResults.flatMap((result) => result.jobs || []);
  }, [jobsResults, project]);

  const jobsLoading = useMemo(() => {
    if (!project) return false;
    return (
      jobsResults.length === 0 ||
      jobsResults.some((result) => result.jobs === undefined)
    );
  }, [jobsResults, project]);

  const jobsEmpty = useMemo(() => {
    if (!project) return true;
    const hasResults = jobsResults.length > 0;
    const hasJobs = jobsResults.some(
      (result) => result.jobs && result.jobs.length > 0,
    );
    const hasMoreJobs = jobsResults.some((result) => result.hasMore);
    return hasResults && !hasJobs && !hasMoreJobs;
  }, [jobsResults, project]);

  const fetchAllPromptsAndJsonSchemasAction = useAction(
    api.columns.fetchAllPromptsAndJsonSchemasAction,
  );
  // Get prompts and jsonSchemas from convex and save them to state
  const fetchAllPromptsAndJsonSchemas = useCallback(async () => {
    setPromptsAndJsonSchemasLoading(true);
    setFetchError(null);
    try {
      const resultFromAction = await fetchAllPromptsAndJsonSchemasAction({});
      setAllPromptsAndJsonSchemas({
        prompts: resultFromAction.prompts,
        jsonSchemas: resultFromAction.jsonSchemas,
        count: {
          prompts: resultFromAction.prompts.length,
          jsonSchemas: resultFromAction.jsonSchemas.length,
        },
      });
    } catch (error) {
      console.error(
        "Error fetching all prompts and json schemas:",
        error as Error,
      );
    } finally {
      setPromptsAndJsonSchemasLoading(false);
    }
  }, [fetchAllPromptsAndJsonSchemasAction]);
  // Function to refresh prompts and templates when creating new column for example
  const refreshAllPromptsAndJsonSchemas = useCallback(() => {
    fetchAllPromptsAndJsonSchemas();
  }, [fetchAllPromptsAndJsonSchemas]);

  useEffect(() => {
    fetchAllPromptsAndJsonSchemas();
  }, [fetchAllPromptsAndJsonSchemas]);

  // Query hooks
  const projectGroupingData = useQueryWithLoading(
    api.project_groupings.list,
    {},
    t,
  );
  const workspaceData = useQueryWithLoading(
    api.service_credentials.getCurrentUserWorkspace,
    {},
    t,
  );

  const serviceCredentialsData = useQueryWithLoading(
    api.service_credentials.getServiceCredentials,
    workspaceData.data ? { workspaceId: workspaceData.data._id } : "skip",
    t,
  );

  const fetchedSystemPromptData = useQueryWithLoading(
    api.system_settings.getSystemPrompt,
    workspaceData.data ? { workspaceId: workspaceData.data._id } : "skip",
    t,
  );
  // Memoized computed values
  const projectGrouping = useMemo(
    () => projectGroupingData.data || [],
    [projectGroupingData.data],
  );

  const loadingColumnsSet = useMemo(
    () => computeColumnsBlockedByJobs(jobs),
    [jobs],
  );

  const failedColumnsSet = useMemo(
    () => computeColumnsFailedByJobs(jobs),
    [jobs],
  );

  const columns = useMemo(() => {
    if (!project) return [];
    return columnsResults.flatMap((result) => result.columns || []);
  }, [columnsResults, project]);

  const columnsLoading = useMemo(() => {
    if (!project) return false;
    return (
      columnsResults.length === 0 ||
      columnsResults.some((result) => result.columns === undefined)
    );
  }, [columnsResults, project]);

  const columnsEmpty = useMemo(() => {
    if (!project) return true;
    const hasResults = columnsResults.length > 0;
    const hasColumns = columnsResults.some(
      (result) => result.columns && result.columns.length > 0,
    );
    const hasMoreColumns = columnsResults.some((result) => result.hasMore);
    return hasResults && !hasColumns && !hasMoreColumns;
  }, [columnsResults, project]);

  const logs = useMemo(() => {
    if (!project) return [];
    return logsResults.flatMap((result) => result.logs || []);
  }, [logsResults, project]);

  const logsLoading = useMemo(() => {
    // If logs are not enabled for the current route, treat as not loading
    if (!project || !isLogsPage) return false;
    return (
      logsResults.length === 0 ||
      logsResults.some((result) => result.logs === undefined)
    );
  }, [logsResults, project, isLogsPage]);

  const logsEmpty = useMemo(() => {
    if (!project) return true;
    const hasResults = logsResults.length > 0;
    const hasLogs = logsResults.some(
      (result) => result.logs && result.logs.length > 0,
    );
    const hasMoreLogs = logsResults.some((result) => result.hasMore);
    return hasResults && !hasLogs && !hasMoreLogs;
  }, [logsResults, project]);

  const savedPrompts = useMemo(
    () => allPromptsAndJsonSchemas?.prompts || [],
    [allPromptsAndJsonSchemas?.prompts],
  );

  const savedJsonSchemas = useMemo((): UISavedJsonSchema[] => {
    if (!allPromptsAndJsonSchemas?.jsonSchemas) {
      return [];
    }
    // Convert backend schemas (pure JSONSchema) to UI-ready schemas
    return allPromptsAndJsonSchemas.jsonSchemas.map(
      (backendSchema: BackendSavedJsonSchemas) => {
        const conversionResult = convertJsonSchemaToFields(
          backendSchema.schema,
        );
        const derivedFields: FormField[] = conversionResult.fields || [];
        return {
          id: backendSchema.id,
          name: backendSchema.name,
          schema: {
            ...backendSchema.schema,
            fields: derivedFields,
          },
          projectId: backendSchema.projectId,
        };
      },
    );
  }, [allPromptsAndJsonSchemas?.jsonSchemas]);
  // Memoized callbacks
  const handleSetProject = useCallback(
    (newProjectId: Id<"project"> | null) => {
      if (newProjectId === null) {
        if (project === null && !projectSelectionInitialized) {
          return;
        }
        setSheet(undefined);
        setProject(null);
        setIsProjectTransitioning(false);
        setProjectSelectionInitialized(false);
        return;
      }

      if (newProjectId === project) return;

      lastSelectedProjectIdRef.current = newProjectId;
      setIsProjectTransitioning(true);
      setSheet(undefined);
      setProject(newProjectId);
      setProjectSelectionInitialized(true);
    },
    [project, projectSelectionInitialized],
  );

  const selectDefaultProject = useCallback(() => {
    const nonSyncedProjects = projects.filter(
      (projectItem) => projectItem.type !== "synced",
    );
    const defaultProject = nonSyncedProjects[0];

    if (!defaultProject) {
      return null;
    }

    if (defaultProject._id === project) {
      setProjectSelectionInitialized(true);
      return defaultProject._id;
    }

    handleSetProject(defaultProject._id);
    return defaultProject._id;
  }, [projects, project, handleSetProject]);
  const setSheetMemoized = useCallback((newSheet: Doc<"sheet"> | undefined) => {
    setSheet(newSheet);
  }, []);

  // Memoize loading state
  const loading = useMemo(
    () =>
      projectsLoading ||
      sheetsLoading ||
      columnsLoading ||
      logsLoading ||
      jobsLoading ||
      projectGroupingData.loading ||
      workspaceData.loading ||
      serviceCredentialsData.loading ||
      fetchedSystemPromptData.loading ||
      promptsAndJsonSchemasLoading,
    [
      projectsLoading,
      sheetsLoading,
      columnsLoading,
      logsLoading,
      jobsLoading,
      projectGroupingData.loading,
      workspaceData.loading,
      serviceCredentialsData.loading,
      fetchedSystemPromptData.loading,
      promptsAndJsonSchemasLoading,
    ],
  );

  // Memoize isEmpty object
  const isEmpty = useMemo(
    () => ({
      projects: projects.length === 0 && !hasMoreProjects,
      sheets: sheets.length === 0 && !hasMoreSheets,
      columns: columnsEmpty,
      logs: logsEmpty,
      jobs: jobsEmpty,
      projectGrouping: projectGroupingData.isEmptyResult,
      workspace: workspaceData.isEmptyResult,
      serviceCredentials: serviceCredentialsData.isEmptyResult,
      systemPrompt: fetchedSystemPromptData.isEmptyResult,
    }),
    [
      projects.length,
      hasMoreProjects,
      sheets.length,
      hasMoreSheets,
      columnsEmpty,
      logsEmpty,
      jobsEmpty,
      projectGroupingData.isEmptyResult,
      workspaceData.isEmptyResult,
      serviceCredentialsData.isEmptyResult,
      fetchedSystemPromptData.isEmptyResult,
    ],
  );

  // Memoize dataState
  const dataState = useMemo(() => {
    if (loading) return "loading";
    if (isEmpty.projects) return "no-projects";
    if (isEmpty.sheets) return "no-sheets";
    if (project && sheet && columnsEmpty) return "no-columns";
    if (project && sheet && jobsEmpty) return "no-jobs";
    if (project && sheet && logsEmpty) return "no-logs";
    return "has-data";
  }, [loading, isEmpty, project, sheet, columnsEmpty, jobsEmpty, logsEmpty]);

  // Auto-select project effect
  useEffect(() => {
    if (location.pathname === "/" || location.pathname === "/workflow") {
      if (
        !projectSelectionInitialized &&
        !project &&
        projects.length > 0 &&
        !isProjectTransitioning
      ) {
        const rememberedProjectId = lastSelectedProjectIdRef.current;
        if (rememberedProjectId) {
          const stillExists = projects.find(
            (projItem) => projItem._id === rememberedProjectId,
          );

          if (stillExists) {
            handleSetProject(rememberedProjectId);
            return;
          }
        }
        selectDefaultProject();
      }
    }
  }, [
    location.pathname,
    projectSelectionInitialized,
    project,
    projects.length,
    isProjectTransitioning,
    selectDefaultProject,
    projects,
    handleSetProject,
  ]);

  useEffect(() => {
    if (!location.pathname.startsWith("/billing")) {
      return;
    }

    if (isProjectTransitioning) {
      return;
    }

    if (project !== null || projectSelectionInitialized) {
      handleSetProject(null);
    }
  }, [
    location.pathname,
    project,
    projectSelectionInitialized,
    handleSetProject,
    isProjectTransitioning,
  ]);

  // Reset transition flag
  useEffect(() => {
    if (!sheetsLoading && isProjectTransitioning) {
      setIsProjectTransitioning(false);
    }
  }, [sheetsLoading, isProjectTransitioning]);

  // Auto-select sheet
  useEffect(() => {
    if (isProjectTransitioning || sheets.length === 0) {
      return;
    }
    const currentSheetFromList = sheets.find((s) => s._id === sheet?._id);
    if (currentSheetFromList) {
      if (
        sheet?.rows_in_sheet_counter !==
        currentSheetFromList.rows_in_sheet_counter
      ) {
        setSheet(currentSheetFromList);
      }
    } else {
      setSheet(sheets[0]);
    }
  }, [sheet, sheets, isProjectTransitioning]);

  // System prompt effect
  useEffect(() => {
    if (fetchedSystemPromptData.data) {
      setSystemPromptSettings(fetchedSystemPromptData.data);
    }
  }, [fetchedSystemPromptData.data]);

  const handleNewView = (sheet_id: string) => {
    const sheet = sheets.find((s) => s._id === sheet_id);
    if (sheet) {
      setSheet(sheet);
    }
  };
  const handleCreateView = async (
    viewName: string,
    sqlQuery: string,
    project_id: Id<"project">,
    notification: boolean = true,
    navigateToNewSheet: boolean = true,
    hiddenColumns?: Id<"column">[],
    onCreationComplete?: () => void,
  ) => {
    console.log("creating new view from scheduled actions");
    const targetProjectId = project_id
      ? project_id
      : (project as Id<"project">);

    if (!targetProjectId) {
      logger.error(
        "Error: project_id is null or undefined. Cannot create view.",
      );
      return;
    }
    let newSheet;
    // Set loading state for specific project
    setLoadingViewProjects((prev) => ({
      ...prev,
      [targetProjectId]: true,
    }));
    try {
      newSheet = await backendClient.createSheet(
        viewName,
        sqlQuery,
        project_id as Id<"project">,
        hiddenColumns as Id<"column">[],
      );
      setCreatingSheetId(String(newSheet));
      await backendClient.createView({
        viewName,
        filterCondition: sqlQuery,
        newSheetId: String(newSheet) as Id<"sheet">,
        project_id: project_id as Id<"project">,
      });
      //Only navigate to the new sheet if still on the same project
      if (project === targetProjectId && navigateToNewSheet) {
        handleNewView(String(newSheet));
      }

      // Reset loading state for specific project only
      setLoadingViewProjects((prev) => ({
        ...prev,
        [targetProjectId]: false,
      }));
      // Clear the creating sheet ID state
      setCreatingSheetId(null);

      // Call the completion callback if provided
      if (onCreationComplete) {
        onCreationComplete();
      }

      if (notification) {
        showSuccessNotification(
          t("modal_manager.main.view_creation_success_title"),
          t("modal_manager.main.view_creation_success_message"),
        );
      }
    } catch (error) {
      setCreatingSheetId(null);
      // Reset loading state for specific project only
      setLoadingViewProjects((prev) => ({
        ...prev,
        [targetProjectId]: false,
      }));

      // Also call the completion callback on error
      if (onCreationComplete) {
        onCreationComplete();
      }
      if (newSheet) {
        await backendClient.deleteSheet(String(newSheet) as Id<"sheet">);
        setTimeout(() => {
          setSheet(sheets[0]);
        }, 0);
      }
      const errorMessage =
        error instanceof Error
          ? error.message
          : t("modal_manager.main.error_unknown");
      showErrorNotification(
        t("modal_manager.main.view_creation_error_title"),
        t("modal_manager.main.view_creation_error_message", {
          error: errorMessage,
        }),
      );
    }
  };
  // CRITICAL: Memoize the entire context value
  const contextValue = useMemo<DataContextProps>(
    () => ({
      projects,
      sheets,
      columns,
      project,
      projectGrouping,
      sheet,
      logs,
      jobs,
      fetchedSystemPromptLoading: fetchedSystemPromptData.loading,
      systemPrompt: systemPromptSettings,
      workspace: workspaceData.data || null,
      serviceCredentials: serviceCredentialsData.data || null,
      serviceCredentialsLoading: serviceCredentialsData.loading,
      loadingColumnsSet,
      failedColumnsSet,
      loading,
      isEmpty,
      dataState,
      setProject: handleSetProject,
      selectDefaultProject,
      setSheet: setSheetMemoized,
      convex,
      loadMoreProjects,
      loadMoreSheets,
      hasMoreProjects,
      hasMoreSheets,
      scrollColumnsRight,
      scrollColumnsLeft,
      projectsLoading,
      sheetsLoading,
      scrollDownLogs,
      scrollUpLogs,
      logsLoading,
      logsResults,
      scrollDownJobs,
      scrollUpJobs,
      jobsLoading,
      jobsResults,
      savedPrompts,
      savedJsonSchemas,
      promptsAndJsonSchemasLoading,
      refreshAllPromptsAndJsonSchemas,
      creatingSheetId,
      loadingViewProjects,
      handleCreateView,
      handleNewView,
      setLoadingViewProjects,
    }),
    [
      projects,
      sheets,
      columns,
      project,
      projectGrouping,
      sheet,
      logs,
      jobs,
      fetchedSystemPromptData.loading,
      systemPromptSettings,
      workspaceData.data,
      serviceCredentialsData.data,
      serviceCredentialsData.loading,
      loadingColumnsSet,
      failedColumnsSet,
      loading,
      isEmpty,
      dataState,
      handleSetProject,
      selectDefaultProject,
      setSheetMemoized,
      convex,
      loadMoreProjects,
      loadMoreSheets,
      hasMoreProjects,
      hasMoreSheets,
      scrollColumnsRight,
      scrollColumnsLeft,
      projectsLoading,
      sheetsLoading,
      scrollDownLogs,
      scrollUpLogs,
      logsLoading,
      logsResults,
      scrollDownJobs,
      scrollUpJobs,
      jobsLoading,
      jobsResults,
      savedPrompts,
      savedJsonSchemas,
      promptsAndJsonSchemasLoading,
      refreshAllPromptsAndJsonSchemas,
      creatingSheetId,
      loadingViewProjects,
      handleCreateView,
      handleNewView,
      setLoadingViewProjects,
    ],
  );

  return (
    <DataContext.Provider value={contextValue}>{children}</DataContext.Provider>
  );
};

export const useDataContext = () => {
  const { t } = useTranslation();
  const context = useContext(DataContext);
  if (!context) {
    throw new Error(t("context.data_context.provider_error"));
  }
  return context;
};

import React, {
  useEffect,
  useRef,
  useState,
  useMemo,
  useCallback,
} from "react";
import { Plus, ChevronLeft, ChevronRight } from "lucide-react";
import SheetMenu from "./SheetMenu";
import Grid from "./Grid";
import VisualQueryBuilder from "./visualQueryBuilder/visualQueryBuilder";
import { SheetHandlerProps } from "../interfaces/interfaces";
import { Id } from "../../convex/_generated/dataModel";
import { useTranslation } from "react-i18next";
import ColumnVisibilityManager from "./grid/columnVisibilityManager";
import { useGridReducer } from "@/reducers/GridReducer";
import { useDataContext } from "@/context/DataContext";
import FilterDisplay from "./visualQueryBuilder/filterDisplay";
import { BADGE_LABEL_CLASS } from "./visualQueryBuilder/badgeStyles";
import { Button } from "./ui/button";
import { ScrollArea, ScrollBar } from "./ui/scroll-area";
import { Skeleton } from "./ui/skeleton";
import usePaginatedRows from "@/utils/usePaginatedRows";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import {
  ProjectViewCreation,
  QueryBuilderState,
} from "../interfaces/interfaces";
import ViewNameInput from "./viewNameInput/viewNameInput";
import { Token, Condition } from "@/types/types";

interface EmptyStateNoticeProps {
  message: string;
  imageAlt: string;
}

const EmptyStateNotice: React.FC<EmptyStateNoticeProps> = ({
  message,
  imageAlt,
}) => (
  <div className="flex flex-col items-center gap-4 px-4 text-center">
    <img
      src="/no_files.png"
      alt={imageAlt}
      className="h-32 w-32 object-contain"
    />
    <span className={`${BADGE_LABEL_CLASS} text-gray-600 text-xs `}>
      {message.toUpperCase()}
    </span>
  </div>
);

const SheetHandler: React.FC<SheetHandlerProps> = ({
  project,
  sheets,
  sheet,
  setSheet,
  onNewColumnButtonClick,
  setClickedColumnId,
  clickedColumnId,
  openShowPromptModal,
  handleCreateViewsFromDeepDive,
  switchToNewSheet,
  setSwitchToNewSheet,
}) => {
  const { t } = useTranslation();
  const { state, actions } = useGridReducer();
  const {
    columns,
    projects,
    sheetsLoading,
    projectsLoading,
    loadingViewProjects,
    setLoadingViewProjects,
    creatingSheetId,
    handleCreateView: onViewCreationButtonClick,
  } = useDataContext();
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  // State for QueryBuilder visibility
  const [showQueryBuilder, setShowQueryBuilder] = useState(false);
  const [newViewName, setNewViewName] = useState("New View");
  // Local tracking for view name and ref
  const [showViewInput, setShowViewInput] = useState(false);
  const viewInputRef = useRef<HTMLInputElement>(null);
  // Visual query builder condition adding to properly move the filter button position in the correct place
  const [isAddingCondition, setIsAddingCondition] = useState(false);
  const [constructedQueryVisible, setConstructedQueryVisible] = useState(false);

  // Track view creation process
  const [projectViewCreationStates, setProjectViewCreationStates] = useState<
    Record<string, ProjectViewCreation>
  >({});

  // Project-specific query states
  const [projectQueryStates, setProjectQueryStates] = useState<
    Record<string, QueryBuilderState>
  >({});
  const [tokens, setTokens] = useState<Token[]>([]);
  const [currentCondition, setCurrentCondition] = useState<Condition>({
    field: "",
    operator: "",
    value: "",
    isEditing: true,
  });
  const [showOperators, setShowOperators] = useState(false);
  const previousSheetsRef = useRef<typeof sheets>([]);
  // Project transition state management

  // The isProjectTransitioning is used to manage the state of the application when the user switches from one project to another. So when project changes:

  // isProjectTransitioning is set to true.
  // This prevents calculations or effects from running prematurely with stale data like auto-selecting a sheet from the old project's sheet list before the new project's sheets have loaded.
  // It helps with updates as we wait for the sheets of the new project to load before setting isProjectTransitioning back to false and then proceeding with auto-selecting a default sheet for the new project.

  const [isProjectTransitioning, setIsProjectTransitioning] = useState(false);
  const [localHiddenColumns, setLocalHiddenColumns] = useState<Id<"column">[]>(
    (sheet && sheet.hidden) || [],
  );
  // Track which sheets are being created
  const prevProjectRef = useRef(project);

  const prevSheetRef = useRef(sheet);
  const {
    results,
    scrollDown,
    scrollUp,
    initialLoading: rowsInitialPageLoading,
    pageLoading: _rowsPageLoading,
  } = usePaginatedRows((sheet || prevSheetRef.current)?._id as Id<"sheet">);
  const sheetIdAtCreationStart = useRef<string | null>(null);
  // Fix for navigation bug if query builder is open
  useEffect(() => {
    handleQueryBuilderCancel();
    setShowQueryBuilder(false);
  }, [location.pathname]);
  // This effect will watch the results from the paginated rows.
  useEffect(() => {
    // Find the first result page that has an error message
    const errorResult = results.find((result) => result.error);

    if (errorResult?.error) {
      // If an error is found, set it
      setDataError(errorResult.error);
    } else {
      // If no errors are found, clear the error state
      setDataError(null);
    }
  }, [results, setDataError]);

  const rows = useMemo(() => {
    //check if results are loaded, if not return an empty array
    if (!results || !state.filteredColumns) return [];
    return results.flatMap((page) =>
      // Filter the row's cells so only the cells with column IDs from filteredColumns are there
      // Tied to column hiding.
      page.rows.map((row) => ({
        ...row,
        cells: row.cells.filter((cell) =>
          state.filteredColumns.includes(cell.column_id),
        ),
      })),
    );
  }, [results, state.filteredColumns]);

  // Keep legacy counter-based loading, but also gate on pagination load state
  const rowsLoading = useMemo(() => {
    const counter = sheet?.rows_in_sheet_counter;
    const counterLoading =
      rows.length === 0 && (counter === undefined || (counter as number) > 0);
    // Only consider the initial page load for the skeleton overlay
    return rowsInitialPageLoading || counterLoading;
  }, [rowsInitialPageLoading, rows, sheet?.rows_in_sheet_counter]);

  const isLoadingForCurrentProject = useMemo(() => {
    if (!project) return false;
    return loadingViewProjects[project as string] || false;
  }, [project, loadingViewProjects]);

  useEffect(() => {
    // Don't reset view creation when just switching sheets within the same project
    if (
      sheet &&
      project &&
      sheet !== prevSheetRef.current &&
      sheet.project_id === project
    ) {
      // Update the previous sheet ref without cancelling view creation
      prevSheetRef.current = sheet;

      // If this is a newly created sheet and in creation mode finish the creation process
      if (
        previousSheetsRef.current.some(
          (oldSheet) => oldSheet._id === sheet._id,
        ) === false
      ) {
        setShowQueryBuilder(false);
      }
    }
  }, [sheet, project]);

  useEffect(() => {
    if (sheet) {
      prevSheetRef.current = sheet;
    }
  }, [sheet]);

  const [showFallback, setShowFallback] = useState(false);
  // Reset all view creation related state
  const resetViewCreationState = useCallback(() => {
    setShowQueryBuilder(false);
    setNewViewName("New View");
    setShowViewInput(false);
  }, []);

  const updateProjectViewCreationState = useCallback(
    (projectId: string, updates: Partial<ProjectViewCreation>) => {
      setProjectViewCreationStates((prev) => ({
        ...prev,
        [projectId]: {
          ...(prev[projectId] || {
            isCreating: false,
            viewName: "New View",
            showQueryBuilder: false,
            showViewInput: false,
          }),
          ...updates,
        },
      }));
    },
    [],
  );
  const updateProjectQueryState = useCallback(
    (projectId: string, stateUpdates: QueryBuilderState) => {
      if (!projectId) return;
      setProjectQueryStates((prev) => ({
        ...prev,
        [projectId]: stateUpdates,
      }));
    },
    [],
  );

  // Observer for sheets array changes
  useEffect(() => {
    // Detect if a new sheet was added by comparing with previous sheets reference
    const newSheets = sheets.filter(
      (newSheet) =>
        !previousSheetsRef.current.some(
          (oldSheet) => oldSheet._id === newSheet._id,
        ),
    );

    // Always update the sheets reference for the next comparison
    previousSheetsRef.current = [...sheets];

    // If a new sheet appeared and it belongs to the current project, switch to it.
    if (project && newSheets.length > 0) {
      const newlyCreatedSheetForCurrentProject = newSheets.find(
        (s) => s.project_id === project,
      );
      if (newlyCreatedSheetForCurrentProject && switchToNewSheet) {
        setSheet(newlyCreatedSheetForCurrentProject);
      }
    }
  }, [sheets, project, setSheet, switchToNewSheet]);

  // Prevent flicker for "please select project or sheet to view the grid"
  useEffect(() => {
    // Only show fallback if nothing is selected AND we are not loading sheets/rows
    if (
      !rowsLoading &&
      !sheetsLoading &&
      (!project || !(sheet || prevSheetRef.current))
    ) {
      const timer = setTimeout(() => setShowFallback(true), 200);
      // Clear timeout if conditions change quickly
      return () => clearTimeout(timer);
    } else {
      setShowFallback(false);
    }
  }, [rowsLoading, sheetsLoading, project, sheet]);

  useEffect(() => {
    if (state.popupStyle.opacity) {
      actions.updatePopupStyle((prev) => {
        return {
          ...prev,
          visibility: "hidden",
          opacity: 0,
        };
      });
    }
  }, [project, sheet]);

  // Focus input when view creation input is shown
  useEffect(() => {
    if (showViewInput && viewInputRef.current) {
      viewInputRef.current.focus();
    }
  }, [showViewInput]);

  useEffect(() => {
    // Handle project switching
    if (!project) return;

    // IMPORTANT: Always restore from project state when switching
    const projectId = project as string;
    const projectState = projectViewCreationStates[projectId];
    const queryState = projectQueryStates[projectId];

    // Restore UI state from saved project state
    if (projectState) {
      setShowQueryBuilder(projectState.showQueryBuilder || false);
      setShowViewInput(projectState.showViewInput || false);
      setNewViewName(projectState.viewName || "");
    } else {
      // Default for new projects
      setShowQueryBuilder(false);
      setShowViewInput(false);
      setNewViewName("New View");
    }

    // Restore query builder state from saved project state
    if (queryState) {
      setTokens(queryState.tokens || []);
      setCurrentCondition(
        queryState.currentCondition || {
          field: "",
          operator: "",
          value: "",
          isEditing: true,
        },
      );
      setShowOperators(queryState.showOperators || false);

      // Don't close the panel if it's already open
      if (!isAddingCondition) {
        setIsAddingCondition(queryState.isAddingCondition || false);
      }
    } else {
      // Initialize for new projects
      setTokens([]);
      setCurrentCondition({
        field: "",
        operator: "",
        value: "",
        isEditing: true,
      });
      setShowOperators(false);
      setIsAddingCondition(false);
      setConstructedQueryVisible(false);

      // Initialize state in the store
      updateProjectQueryState(projectId, {
        tokens: [],
        currentCondition: {
          field: "",
          operator: "",
          value: "",
          isEditing: true,
        },
        showOperators: false,
        isAddingCondition: false,
      });
    }
  }, [
    project,
    projectViewCreationStates,
    projectQueryStates,
    updateProjectQueryState,
    isAddingCondition,
  ]);

  useEffect(() => {
    const projectIdLeaving = prevProjectRef.current;
    const projectIdEntering = project;

    if (projectIdLeaving && projectIdLeaving !== projectIdEntering) {
      // Save current state for the project we're leaving
      updateProjectViewCreationState(projectIdLeaving as string, {
        showQueryBuilder,
        showViewInput,
        viewName: newViewName,
        isCreating:
          projectViewCreationStates[projectIdLeaving as string]?.isCreating ||
          false,
      });

      // Save current query builder state
      updateProjectQueryState(projectIdLeaving as string, {
        tokens,
        currentCondition,
        showOperators,
        isAddingCondition,
      });
    }

    prevProjectRef.current = project;

    if (projectIdLeaving !== projectIdEntering) {
      setIsProjectTransitioning(true);
      const timer = setTimeout(() => {
        setIsProjectTransitioning(false);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [
    project,
    showQueryBuilder,
    showViewInput,
    newViewName,
    tokens,
    currentCondition,
    showOperators,
    isAddingCondition,
    constructedQueryVisible,
    updateProjectViewCreationState,
    updateProjectQueryState,
    projectViewCreationStates,
  ]);

  useEffect(() => {
    // If in a project transition and loading states
    if (isProjectTransitioning && isLoadingForCurrentProject) {
      // Clear project transition after a short delay
      const forceCleanupTimer = setTimeout(() => {
        setIsProjectTransitioning(false);
      }, 400);

      return () => clearTimeout(forceCleanupTimer);
    }
  }, [isProjectTransitioning, isLoadingForCurrentProject]);

  useEffect(() => {
    // Reset the transition flag once sheets are loaded
    if (!sheetsLoading && isProjectTransitioning) {
      setIsProjectTransitioning(false);
    }
  }, [sheetsLoading, isProjectTransitioning]);

  useEffect(() => {
    // Trigger cleanup when loading for the current project stops
    if (!isLoadingForCurrentProject && project) {
      const projectState = projectViewCreationStates[project as string];
      if (projectState?.isCreating) {
        updateProjectViewCreationState(project as string, {
          isCreating: false,
        });

        // Clear the query state for this project
        updateProjectQueryState(project as string, {
          tokens: [],
          currentCondition: {
            field: "",
            operator: "",
            value: "",
            isEditing: true,
          },
          showOperators: false,
        });
      }
    }
  }, [
    isLoadingForCurrentProject,
    project,
    projectViewCreationStates,
    updateProjectViewCreationState,
    updateProjectQueryState,
  ]);
  useEffect(() => {
    // Only cancel if sheet changes manually within the same project
    if (
      sheet &&
      project &&
      prevSheetRef.current &&
      sheet._id !== prevSheetRef.current._id &&
      sheet.project_id === project &&
      isLoadingForCurrentProject
    ) {
      resetViewCreationState();
      sheetIdAtCreationStart.current = null;

      updateProjectViewCreationState(project as string, {
        showViewInput: false,
        showQueryBuilder: false,
        viewName: "New View",
        isCreating: false,
      });

      // Reset query state
      updateProjectQueryState(project as string, {
        tokens: [],
        currentCondition: {
          field: "",
          operator: "",
          value: "",
          isEditing: true,
        },
        showOperators: false,
      });
    }
  }, [
    sheet,
    project,
    isLoadingForCurrentProject,
    resetViewCreationState,
    updateProjectViewCreationState,
    updateProjectQueryState,
    prevSheetRef,
  ]);
  // Handle view button click
  const handleViewButtonClick = useCallback(() => {
    if (!project) return;

    if (showViewInput && newViewName.trim()) {
      // If input is shown and there is a name, proceed with query builder
      setShowQueryBuilder(true);
      updateProjectViewCreationState(project as string, {
        showQueryBuilder: true,
      });
    } else if (showViewInput) {
      // If input is shown but empty, hide it
      setShowViewInput(false);
      setShowQueryBuilder(false);
      updateProjectViewCreationState(project as string, {
        showViewInput: false,
        showQueryBuilder: false,
      });
    } else {
      // Show the input field to start view creation
      updateProjectQueryState(project as string, {
        tokens: [],
        currentCondition: {
          field: "",
          operator: "",
          value: "",
          isEditing: true,
        },
        showOperators: false,
      });

      setShowViewInput(true);
      setShowQueryBuilder(true);
      setNewViewName(newViewName);
      updateProjectViewCreationState(project as string, {
        showViewInput: true,
        showQueryBuilder: true,
      });

      // Clear any token editing state
      setIsAddingCondition(false);
      setConstructedQueryVisible(false);
    }
  }, [
    showViewInput,
    project,
    newViewName,
    updateProjectViewCreationState,
    updateProjectQueryState,
    setIsAddingCondition,
    setConstructedQueryVisible,
  ]);

  // Handle query builder save
  const handleQueryBuilderSave = useCallback(
    (sqlQuery: string) => {
      if (!project || !sheet) return;
      if (!switchToNewSheet) {
        setSwitchToNewSheet(true);
      }
      const currentProjectId = project;
      const currentViewName = newViewName;

      // Set loading state for the project
      setLoadingViewProjects((prev) => {
        // Update global map for loading status
        const newState = { ...prev, [currentProjectId]: true };
        return newState;
      });

      setShowQueryBuilder(false);
      setShowViewInput(false);
      setNewViewName("New View");

      updateProjectViewCreationState(currentProjectId as string, {
        isCreating: true,
        showQueryBuilder: false,
        showViewInput: false,
        viewName: "New View",
      });

      updateProjectQueryState(currentProjectId as string, {
        tokens: [],
        currentCondition: {
          field: "",
          operator: "",
          value: "",
          isEditing: true,
        },
        showOperators: false,
        isAddingCondition: false,
      });

      onViewCreationButtonClick(
        currentViewName,
        sqlQuery,
        currentProjectId as Id<"project">,
        true,
        true,
        localHiddenColumns,
        // This callback function runs after the async operation completes
        () => {
          // Reset state for this project
          updateProjectViewCreationState(currentProjectId as string, {
            isCreating: false,
            showViewInput: false,
            showQueryBuilder: false,
            viewName: "New View",
          });

          // Clear loading state
          setLoadingViewProjects((prev) => {
            // Clear flag
            const newState = { ...prev, [currentProjectId]: false };
            return newState;
          });

          // Only update UI if still on the same project
          if (project === currentProjectId) {
            setShowViewInput(false);
            setShowQueryBuilder(false);
            setNewViewName("New View");
          }
        },
      );
    },
    [
      project,
      sheet,
      switchToNewSheet,
      newViewName,
      setLoadingViewProjects,
      updateProjectViewCreationState,
      updateProjectQueryState,
      onViewCreationButtonClick,
      localHiddenColumns,
      setSwitchToNewSheet,
    ],
  );

  // Handle query builder cancel
  const handleQueryBuilderCancel = useCallback(() => {
    if (!project) return;

    resetViewCreationState();
    sheetIdAtCreationStart.current = null;

    updateProjectViewCreationState(project as string, {
      showViewInput: false,
      showQueryBuilder: false,
      viewName: "New View",
    });
  }, [resetViewCreationState, project, updateProjectViewCreationState]);
  // Get field names from columns
  const fieldNames = columns?.map((col) => col.name) || [];

  // Scroll handlers for the scroll buttons
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScrollability = () => {
    if (!scrollAreaRef.current) return;

    const scrollViewport = scrollAreaRef.current.querySelector(
      "[data-radix-scroll-area-viewport]",
    ) as HTMLElement;
    if (!scrollViewport) return;

    // Can scroll left if not at the beginning
    setCanScrollLeft(scrollViewport.scrollLeft > 0);

    // Can scroll right if not at the end
    setCanScrollRight(
      scrollViewport.scrollLeft <
        scrollViewport.scrollWidth - scrollViewport.clientWidth,
    );
  };

  const handleScrollLeft = () => {
    if (!scrollAreaRef.current) return;

    const scrollViewport = scrollAreaRef.current.querySelector(
      "[data-radix-scroll-area-viewport]",
    ) as HTMLElement;
    if (!scrollViewport) return;

    // Scroll left by 200px
    scrollViewport.scrollBy({ left: -200, behavior: "smooth" });
  };

  const handleScrollRight = () => {
    if (!scrollAreaRef.current) return;

    const scrollViewport = scrollAreaRef.current.querySelector(
      "[data-radix-scroll-area-viewport]",
    ) as HTMLElement;
    if (!scrollViewport) return;

    // Scroll right by 200px
    scrollViewport.scrollBy({ left: 200, behavior: "smooth" });
  };

  useEffect(() => {
    if (!scrollAreaRef.current) return;

    const scrollViewport = scrollAreaRef.current.querySelector(
      "[data-radix-scroll-area-viewport]",
    ) as HTMLElement;
    if (!scrollViewport) return;

    // Initial check
    checkScrollability();

    // Check on scroll
    const handleScroll = () => {
      checkScrollability();
    };

    scrollViewport.addEventListener("scroll", handleScroll);

    // Check when content or container size changes
    const resizeObserver = new ResizeObserver(() => {
      checkScrollability();
    });

    resizeObserver.observe(scrollViewport);

    return () => {
      scrollViewport.removeEventListener("scroll", handleScroll);
      resizeObserver.disconnect();
    };
  }, [sheets, sheet]);
  const updateHiddenColumnsMutation = useMutation(
    api.sheets.updateSheetHiddenColumns,
  );
  useEffect(() => {
    if (sheet && sheet.hidden) {
      // Initialize both local and grid state once on sheet change
      setLocalHiddenColumns(sheet.hidden);
      actions.setHiddenColumns(sheet.hidden);
    }
  }, [sheet?._id]);
  useEffect(() => {
    // Ensure Grid state is always in sync with local state
    if (
      JSON.stringify(state.hiddenColumns) !== JSON.stringify(localHiddenColumns)
    ) {
      actions.setHiddenColumns(localHiddenColumns);
    }
  }, [localHiddenColumns]);

  const toggleColumnVisibility = async (
    columnId: Id<"column">,
    isVisible: boolean,
  ) => {
    if (!sheet) return;

    let updatedHiddenColumns: Id<"column">[];

    if (isVisible) {
      // Show column
      updatedHiddenColumns = localHiddenColumns.filter((id) => id !== columnId);
    } else {
      // Hide column
      updatedHiddenColumns = [...localHiddenColumns, columnId];
    }

    // Update local state immediately for UI responsiveness
    setLocalHiddenColumns(updatedHiddenColumns);

    // Update Grid state for filtering
    actions.setHiddenColumns(updatedHiddenColumns);

    // Update Convex backend
    try {
      await updateHiddenColumnsMutation({
        sheet_id: sheet._id,
        hidden_columns: updatedHiddenColumns,
      });
    } catch (error) {
      console.error("Error updating hidden columns:", error);
      // Revert on error
      setLocalHiddenColumns(sheet.hidden || []);
      actions.setHiddenColumns(sheet.hidden || []);
    }
  };

  // Function to update all hidden columns at once
  const updateAllHiddenColumns = async (hiddenColumns: Id<"column">[]) => {
    if (!sheet) return;

    // Update local state
    setLocalHiddenColumns(hiddenColumns);

    // Update Grid state
    actions.setHiddenColumns(hiddenColumns);

    // Update Convex
    try {
      await updateHiddenColumnsMutation({
        sheet_id: sheet._id,
        hidden_columns: hiddenColumns,
      });
    } catch (error) {
      console.error("Error updating all hidden columns:", error);
      // Revert on error
      setLocalHiddenColumns(sheet.hidden || []);
      actions.setHiddenColumns(sheet.hidden || []);
    }
  };

  // Function to hide a single column
  const hideColumn = (columnId: Id<"column">) => {
    toggleColumnVisibility(columnId, false);
  };

  // Helper function to render content based on state
  const renderGridContent = () => {
    // Conditions for messages display and loading skeletons
    const isLoading =
      rowsLoading || isProjectTransitioning || projectsLoading || sheetsLoading;
    const isEmptyProject =
      sheets?.length === 0 && !rowsLoading && !sheetsLoading && !sheet;
    const isFallbackVisible =
      !rowsLoading && showFallback && project && !isEmptyProject;
    // Only show empty-sheet overlay after pagination finished and no rows exist
    // Show empty sheet overlay strictly based on server-side counter once loading is done
    const isEmptySheet =
      !!sheet &&
      !rowsInitialPageLoading &&
      !rowsLoading &&
      (sheet.rows_in_sheet_counter ?? 0) === 0;

    const isGridVisible =
      !isLoading &&
      !dataError &&
      !isEmptyProject &&
      !isFallbackVisible &&
      !isEmptySheet &&
      rows &&
      rows.length > 0 &&
      state.filteredColumns !== undefined;
    const noProjects = projects.length === 0;
    const isViewBeingCreated =
      sheet && creatingSheetId && sheet._id === creatingSheetId;

    return (
      <>
        {/* The Grid has to be ALWAYS rendered to prevent disappearing headers bug*/}
        <div
          className={`z-0 w-full h-full transition-opacity duration-100 ${
            isGridVisible
              ? "opacity-100"
              : "opacity-0 pointer-events-none absolute"
          }`}
        >
          <Grid
            project_id={project || ("1" as Id<"project">)}
            sheet_id={(sheet || prevSheetRef.current)?._id as Id<"sheet">}
            onNewColumnButtonClick={onNewColumnButtonClick}
            clickedColumnId={clickedColumnId}
            openShowPromptModal={openShowPromptModal}
            state={state}
            actions={actions}
            rows={rows}
            scrollUp={scrollUp}
            scrollDown={scrollDown}
            key="persistent-grid"
            setClickedColumnId={(id: Id<"column"> | null) =>
              setClickedColumnId?.(id)
            }
            hideColumn={hideColumn}
            handleCreateViewsFromDeepDive={handleCreateViewsFromDeepDive}
            setSwitchToNewSheet={setSwitchToNewSheet}
            switchToNewSheet={switchToNewSheet}
          />
        </div>

        {/* *** ADD THE ERROR OVERLAY HERE *** */}
        {dataError && (
          <div className="absolute inset-0 bg-gray-50 z-10 flex justify-center items-center flex-col">
            <h2
              className="w-full break-words max-h-80 text-sm text-center"
              style={{ wordBreak: "break-word" }}
            >
              {t("app.data_error_title")}
            </h2>
            <p className="text-xs text-muted-foreground mt-2">{dataError}</p>
          </div>
        )}

        {/* LOADING OVERLAY */}
        {(isLoading || isViewBeingCreated) && !dataError && (
          <div className="absolute inset-0 bg-gray-50 z-10">
            {renderSkeletonLoader()}
          </div>
        )}

        {!isLoading && !isViewBeingCreated && !dataError && (
          <>
            {noProjects && (
              <div
                data-testid="no-projects-message"
                className="absolute inset-0 bg-gray-50 z-10 flex justify-center items-center"
              >
                <h2
                  className="w-full break-words max-h-80 text-sm text-center"
                  style={{ wordBreak: "break-word" }}
                >
                  {t("app.no_projects_message")}
                </h2>
              </div>
            )}
            {/* NO DATA FOR PROJECT OVERLAY */}
            {isEmptyProject && !noProjects && (
              <div
                data-testid="empty-project-message"
                className="absolute inset-0 bg-gray-50 z-10 flex justify-center items-center"
              >
                <EmptyStateNotice
                  imageAlt={t("grid.main.no_data_image_alt")}
                  message={t("grid.main.no_data_for_project")}
                />
              </div>
            )}

            {/* FALLBACK MESSAGE OVERLAY */}
            {isFallbackVisible && (
              <div className="absolute inset-0 bg-gray-50 z-10 flex justify-center items-center">
                <h2 className="text-sm">
                  {t("sheet_handler.fallback_message")}
                </h2>
              </div>
            )}

            {/* NO DATA IN SHEET OVERLAY */}
            {isEmptySheet && (
              <div
                data-testid="empty-sheet-message"
                className="absolute inset-0 bg-gray-50 z-10 flex justify-center items-center"
              >
                <EmptyStateNotice
                  imageAlt={t("grid.main.no_data_image_alt")}
                  message={t("grid.main.no_data_in_sheet", {
                    sheetName: sheet?.name,
                  })}
                />
              </div>
            )}
          </>
        )}
      </>
    );
  };
  const renderSheetMenuSkeleton = () => {
    return (
      <div className="flex items-center space-x-1 min-h-10 w-full py-1.5">
        <div className="flex space-x-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={`tab-${i}`} className="h-7 w-28 rounded-md" />
          ))}
        </div>
      </div>
    );
  };
  const renderFilterDisplaySkeleton = () => {
    return (
      <div className="min-h-10 flex items-center justify-start px-4 py-1">
        <Skeleton className="h-5 w-60" />
      </div>
    );
  };
  // Skeleton loader for grid
  const renderSkeletonLoader = () => {
    return (
      <div className="w-full h-full p-4" data-testid="skeleton-loader">
        <div className="w-full h-full flex flex-col">
          {/* Header skeleton */}
          <div className="flex justify-between items-center mb-4">
            <Skeleton className="h-8 w-36" />
            <Skeleton className="h-8 w-24" />
          </div>

          {/* Table skeleton */}
          <div className="flex flex-col flex-grow">
            {/* Header row */}
            <div className="flex mb-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={`header-${i}`} className="h-10 flex-1 mx-1" />
              ))}
            </div>

            {/* Data rows */}
            {Array.from({ length: 10 }).map((_, rowIndex) => (
              <div key={`row-${rowIndex}`} className="flex mb-2">
                {Array.from({ length: 5 }).map((_, colIndex) => (
                  <Skeleton
                    key={`cell-${rowIndex}-${colIndex}`}
                    className="h-8 flex-1 mx-1"
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // Note: Avoid hardcoding viewport-based heights here. The grid section
  // should flex to fill the remaining space below the header controls to
  // prevent content from scrolling under the header when there are few rows.

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-gray-50 h-full">
      {/* Header Section */}

      <div className="flex items-center px-1 pb-1 justify-between relative">
        <div className="absolute top-[1px] left-0 right-0 h-[1px] bg-border"></div>
        <div className="absolute bottom-[7px] left-0 right-0 h-[1px] bg-border "></div>
        {/* Prevent micro movements from occuring when transitioning */}
        <div className="flex-grow w-0 overflow-auto flex items-center space-x-1 min-h-[43px]">
          <div className="ml-1 pb-0.5">
            {showViewInput ? (
              <div className="flex items-center ml-2">
                {/* Separated component to prevent performance loss and slow type */}
                <ViewNameInput
                  initialValue={newViewName}
                  onSave={(value) => {
                    if (project) {
                      setNewViewName(value);
                      updateProjectViewCreationState(project as string, {
                        viewName: value,
                      });
                    }
                  }}
                  disabled={
                    isLoadingForCurrentProject ||
                    rowsLoading ||
                    isProjectTransitioning
                  }
                  placeholder={t("sheet_handler.new_view_placeholder")}
                />
              </div>
            ) : (
              <Button
                variant="default"
                size="icon"
                disabled={!project || isLoadingForCurrentProject}
                aria-label="Add new view"
                className="h-7 w-7 rounded-md my-1.5 ml-2 mr-1 bg-primary disabled:opacity-20 disabled:bg-gray-50 disabled:text-foreground hover:bg-orange-600 hover:text-background"
                onClick={handleViewButtonClick}
              >
                <Plus className="h-4 w-4" />
              </Button>
            )}
          </div>
          <div className="flex pb-0.5">
            {/* Left Scroll Button */}
            <Button
              variant="ghost"
              size="icon"
              disabled={!canScrollLeft}
              className="h-7 w-7 mr-2 my-1.5 rounded-md bg-transparent disabled:opacity-20"
              onClick={handleScrollLeft}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            {/* Right Scroll Button */}
            <Button
              variant="ghost"
              size="icon"
              disabled={!canScrollRight}
              className="h-7 w-7 mr-2 my-1.5 rounded-md bg-transparent disabled:opacity-20"
              onClick={handleScrollRight}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <ScrollArea
            ref={scrollAreaRef}
            type="scroll"
            className="h-full w-full"
          >
            {/* Sheet menu */}
            {sheetsLoading && isProjectTransitioning ? (
              renderSheetMenuSkeleton()
            ) : sheet ? (
              <SheetMenu
                sheets={sheets}
                sheet={sheet}
                setSheet={setSheet}
                disableInteraction={isProjectTransitioning}
                creatingSheetId={creatingSheetId}
              />
            ) : null}
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </div>
      </div>

      {/* Current Filter Display */}
      <div
        className={`${!showQueryBuilder ? "max-h-[42px] pb-1.5" : "min-h-0"}  max-w-full items-center flex justify-between z-20`}
      >
        <div className="flex flex-grow gap-2 flex-wrap">
          {isProjectTransitioning && !showQueryBuilder
            ? renderFilterDisplaySkeleton()
            : !showQueryBuilder && (
                <FilterDisplay
                  filterString={sheet?.filter}
                  filterConditions={t("sheet_handler.filter_condition_label")}
                />
              )}
          {/* Column visibility manager (always visible) */}
        </div>
        {!showQueryBuilder && (
          <div className="flex pl-2 pr-3 items-center bg-transparent mr-1 pb-[3.5px] pt-[3.5px] relative">
            <ColumnVisibilityManager
              columns={columns}
              hiddenColumns={localHiddenColumns}
              toggleColumnVisibility={toggleColumnVisibility}
              updateAllHiddenColumns={updateAllHiddenColumns}
            />
          </div>
        )}
      </div>

      {/* Visual Query Builder */}

      {showQueryBuilder && (
        <div className="flex items-center flex-row pr-1 pb-0.5">
          <div className="flex flex-1">
            <VisualQueryBuilder
              // Key for rerendering the query builder with empty data on project change.
              // Data is injected after that to preserve tokens and loading states
              key={`query-builder-${project}`}
              viewName={newViewName}
              fields={fieldNames}
              onSave={handleQueryBuilderSave}
              onCancel={handleQueryBuilderCancel}
              loading={isLoadingForCurrentProject}
              isAddingCondition={isAddingCondition}
              setIsAddingCondition={setIsAddingCondition}
              constructedQueryVisible={constructedQueryVisible}
              setConstructedQueryVisible={setConstructedQueryVisible}
              initialState={
                project ? projectQueryStates[project as string] : null
              }
              onStateChange={(state) => {
                if (project && !isLoadingForCurrentProject) {
                  updateProjectQueryState(project as string, state);
                }
              }}
              projectColumns={columns}
            />
          </div>
          <div
            className={`flex flex-2 relative pr-3 items-center ${isAddingCondition && !constructedQueryVisible ? "pb-[56px]" : isAddingCondition && constructedQueryVisible ? "pb-[157px]" : !isAddingCondition && constructedQueryVisible ? "pb-[105px]" : "pb-1"}`}
          >
            <ColumnVisibilityManager
              columns={columns}
              hiddenColumns={localHiddenColumns}
              toggleColumnVisibility={toggleColumnVisibility}
              updateAllHiddenColumns={updateAllHiddenColumns}
            />
          </div>
        </div>
      )}

      {/* Grid Container with relative positioning for overlays */}
      <div
        className="no-scrollbar w-full overflow-auto relative flex-1 min-h-0"
        ref={gridContainerRef}
      >
        {/* Gray Overlay when Query Builder is open */}
        {/* {showQueryBuilder && (
          <div
            className="absolute bg-gray-500/20 backdrop-blur-[5px] z-10"
            style={{
              width: overlayDimensions.width - 32 || "100%",
              height: overlayDimensions.height || "100%",
              top: overlayDimensions.top + 4,
              left: overlayDimensions.left + 16,
            }}
          />
        )} */}

        {/* Skeleton Loader when view is being created */}
        {/* Keeping this for now, possible future use */}
        {/* {isCreatingView && (
          <div
            className="absolute bg-gray-50 z-20 p-4"
            style={{
              width: overlayDimensions.width - 32 || "100%",
              height: overlayDimensions.height || "100%",
              top: overlayDimensions.top + 4,
              left: overlayDimensions.left + 16,
            }}
          >
            {renderSkeletonLoader()}
          </div>
        )} */}

        {/* Grid  */}
        <div className="relative w-full h-full">{renderGridContent()}</div>
      </div>
    </div>
  );
};

export default SheetHandler;

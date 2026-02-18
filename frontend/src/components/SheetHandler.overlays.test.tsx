import { render, screen, waitFor } from "@testing-library/react";
import { it, expect, vi, describe, beforeEach, afterEach, Mock } from "vitest";
import SheetHandler from "./SheetHandler";
import { useDataContext } from "@/context/DataContext";
import usePaginatedRows from "@/utils/usePaginatedRows";
import { useGridReducer } from "@/reducers/GridReducer";
import { Id, Doc } from "convex/_generated/dataModel";
import { DataContextProps } from "@/interfaces/interfaces";
import { Rectangle } from "@glideapps/glide-data-grid";
import { CellStates } from "@/utils/CellState";
import { ConvexReactClient } from "convex/react";
import { SheetHandlerProps } from "@/interfaces/interfaces";

// --- MOCKS ---
vi.mock("./Grid", () => ({
  default: () => <div data-testid="grid-component" />,
}));
vi.mock("./SheetMenu", () => ({
  default: () => <div data-testid="sheet-menu" />,
}));
vi.mock("./visualQueryBuilder/visualQueryBuilder", () => ({
  default: () => <div data-testid="visual-query-builder" />,
}));
vi.mock("./viewNameInput/viewNameInput", () => ({
  default: (props: any) => (
    <input data-testid="view-name-input" defaultValue="New View" {...props} />
  ),
}));
vi.mock("@/context/DataContext");
vi.mock("@/utils/usePaginatedRows");
vi.mock("@/reducers/GridReducer");
vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>();
  return {
    ...actual, // preserves initReactI18next and other exports
    useTranslation: () => ({
      t: (key: string) => key,
      i18n: { changeLanguage: () => Promise.resolve() },
    }),
  };
});
vi.mock("convex/react", () => ({ useMutation: () => [vi.fn()] }));

// --- MOCK DATA ---
const mockProject: Doc<"project"> = {
  _id: "project1" as Id<"project">,
  _creationTime: Date.now(),
  name: "Project One",
  owner: "test-user-id",
};

const mockSheet: Doc<"sheet"> = {
  _id: "sheet1" as Id<"sheet">,
  _creationTime: Date.now(),
  name: "Sheet One",
  project_id: mockProject._id,
  filter: "1=1",
  hidden: [],
  rows_in_sheet_counter: 1,
};

const mockColumn: Doc<"column"> = {
  _id: "col1" as Id<"column">,
  _creationTime: Date.now(),
  name: "Column A",
  project_id: mockProject._id,
  created_on_sheet_id: mockSheet._id,
  cell_state: new CellStates(1).toArrayBuffer(),
};

const mockRow: Doc<"row"> = {
  _id: "row1" as Id<"row">,
  _creationTime: Date.now(),
  project_id: mockProject._id,
  order: 1,
  row_number: 1,
  cells: [],
};

describe("SheetHandler", () => {
  let mockDataContext: DataContextProps;
  let mockPaginatedRows: ReturnType<typeof usePaginatedRows>;
  let mockGridReducer: ReturnType<typeof useGridReducer>;

  beforeEach(() => {
    window.ResizeObserver = vi.fn(() => ({
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn(),
    }));

    mockGridReducer = {
      state: {
        filteredColumns: [mockColumn._id],
        hiddenColumns: [],
        columnWidths: new Map(),
        visibleRegion: {} as Rectangle,
        headerDropdownVisible: false,
        headerDropdownPosition: { x: 0, y: 0 },
        clickedCell: null,
        popupStyle: {
          top: 0,
          left: 0,
          visibility: "hidden",
          opacity: 0,
          width: "0",
          maxWidth: "0",
        },
        isProgrammaticPopupUpdate: false,
      },
      actions: {
        setFilteredColumns: vi.fn(),
        setHiddenColumns: vi.fn(),
        setVisibleRegion: vi.fn(),
        setHeaderDropdownVisible: vi.fn(),
        setHeaderDropdownPosition: vi.fn(),
        setClickedCell: vi.fn(),
        setPopupStyle: vi.fn(),
        updatePopupStyle: vi.fn(),
        setIsProgrammaticPopupUpdate: vi.fn(),
        updateColumnWidths: vi.fn(),
        setColumnWidths: vi.fn(),
      },
    };

    mockPaginatedRows = {
      results: [
        {
          rows: [mockRow],
          indexKeys: [],
          hasMore: false,
          sheetId: mockSheet._id,
        },
      ],
      scrollDown: vi.fn(),
      scrollUp: vi.fn(),
      loading: false,
      initialLoading: false,
      pageLoading: false,
    };

    mockDataContext = {
      projects: [mockProject],
      sheets: [mockSheet],
      columns: [mockColumn],
      project: mockProject._id,
      sheet: mockSheet,
      projectGrouping: [],
      loading: false,
      logs: [],
      jobs: [],
      workspace: null,
      serviceCredentials: null,
      serviceCredentialsLoading: false,
      loadingColumnsSet: new Set<Id<"column">>(),
      failedColumnsSet: new Set<Id<"column">>(),
      systemPrompt: null,
      fetchedSystemPromptLoading: false,
      isEmpty: { projects: false, sheets: false, columns: false, logs: false },
      dataState: "has-data",
      setProject: vi.fn(),
      selectDefaultProject: vi.fn(),
      setSheet: vi.fn(),
      convex: {} as ConvexReactClient,
      logsResults: [],
      logsLoading: false,
      jobsResults: [],
      jobsLoading: false,
      savedPrompts: [],
      savedJsonSchemas: [],
      promptsAndJsonSchemasLoading: false,
      refreshAllPromptsAndJsonSchemas: vi.fn(),
      hasMoreProjects: false,
      hasMoreSheets: false,
      loadMoreProjects: vi.fn(),
      loadMoreSheets: vi.fn(),
      creatingSheetId: null,
      loadingViewProjects: {},
      handleCreateView: vi.fn(),
      handleNewView: vi.fn(),
      setLoadingViewProjects: vi.fn(),
    };

    (useDataContext as Mock).mockReturnValue(mockDataContext);
    (usePaginatedRows as Mock).mockReturnValue(mockPaginatedRows);
    (useGridReducer as Mock).mockReturnValue(mockGridReducer);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const renderSheetHandler = (props?: Partial<SheetHandlerProps>) =>
    render(
      <SheetHandler
        project={props?.project ?? mockDataContext.project}
        sheets={props?.sheets ?? mockDataContext.sheets}
        sheet={props?.sheet ?? (mockDataContext.sheet as Doc<"sheet">)}
        setSheet={vi.fn()}
        onNewColumnButtonClick={vi.fn()}
        setClickedColumnId={vi.fn()}
        clickedColumnId={null}
        openShowPromptModal={vi.fn()}
        handleCreateViewsFromDeepDive={vi.fn()}
        switchToNewSheet={true}
        setSwitchToNewSheet={vi.fn()}
      />,
    );

  describe("Loading overlays and different messages for projects, sheets and columns state", () => {
    it("should render the Grid when data is available", async () => {
      renderSheetHandler();
      await waitFor(() => {
        expect(screen.getByTestId("grid-component")).toBeInTheDocument();
      });
    });

    it("should render the skeleton loader when a new view is being created", () => {
      (useDataContext as Mock).mockReturnValue({
        ...mockDataContext,
        creatingSheetId: mockSheet._id,
      });
      renderSheetHandler();
      expect(screen.getByTestId("skeleton-loader")).toBeInTheDocument();
    });

    it("should render the skeleton loader when rows are loading", () => {
      (usePaginatedRows as Mock).mockReturnValue({
        ...mockPaginatedRows,
        results: [],
        loading: true,
        initialLoading: true,
        pageLoading: false,
      });
      (useDataContext as Mock).mockReturnValue({
        ...mockDataContext,
        sheet: { ...mockSheet, rows_in_sheet_counter: 5 },
      });
      renderSheetHandler();
      expect(screen.getByTestId("skeleton-loader")).toBeInTheDocument();
    });

    it('should render the "No Projects" overlay when there are no projects', () => {
      (useDataContext as Mock).mockReturnValue({
        ...mockDataContext,
        projects: [],
        project: null,
      });
      renderSheetHandler({ project: null });
      expect(screen.getByTestId("no-projects-message")).toBeInTheDocument();
    });

    it('should render the "Empty Project" overlay when a project has no sheets', async () => {
      (useDataContext as Mock).mockReturnValue({
        ...mockDataContext,
        projects: [mockProject],
        project: mockProject._id,
        sheets: [],
        sheet: undefined,
        isEmpty: {
          ...mockDataContext.isEmpty,
          sheets: true,
        },
        dataState: "no-sheets",
      });

      render(
        <SheetHandler
          project={mockProject._id}
          sheets={[]}
          sheet={null}
          setSheet={vi.fn()}
          onNewColumnButtonClick={vi.fn()}
          setClickedColumnId={vi.fn()}
          clickedColumnId={null}
          openShowPromptModal={vi.fn()}
          handleCreateViewsFromDeepDive={vi.fn()}
          switchToNewSheet={true}
          setSwitchToNewSheet={vi.fn()}
        />,
      );
    });

    it('should render the "Empty Sheet" overlay when a sheet has no rows', async () => {
      const emptySheet = { ...mockSheet, rows_in_sheet_counter: 0 };
      (useDataContext as Mock).mockReturnValue({
        ...mockDataContext,
        sheet: emptySheet,
        sheets: [emptySheet],
        columns: [],
        isEmpty: { ...mockDataContext.isEmpty, columns: true },
        dataState: "has-data",
      });
      (usePaginatedRows as Mock).mockReturnValue({
        results: [],
        scrollDown: vi.fn(),
        scrollUp: vi.fn(),
        loading: false,
        initialLoading: false,
        pageLoading: false,
      });
      renderSheetHandler({ sheet: emptySheet });
      await waitFor(() => {
        expect(screen.getByTestId("empty-sheet-message")).toBeInTheDocument();
      });
    });
  });
});

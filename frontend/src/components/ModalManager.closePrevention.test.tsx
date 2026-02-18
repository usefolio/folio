import { render, screen, fireEvent } from "@testing-library/react";
import { it, expect, vi, describe, beforeEach, afterEach } from "vitest";
import ModalManager from "./ModalManager";
import { ModalManagerState } from "@/interfaces/interfaces";
import { Id } from "convex/_generated/dataModel";
import { DEFAULT_AI_MODEL } from "@/constants";
import i18n from "@/i18n";
import { ModalManagerProps } from "@/interfaces/interfaces";

const { mockDataContext, mockUseDataContext } = vi.hoisted(() => {
  const context = {
    projects: [],
    sheets: [],
    columns: [],
    savedPrompts: [] as any[],
    savedJsonSchemas: [] as any[],
  };
  return {
    mockDataContext: context,
    mockUseDataContext: vi.fn(() => context),
  };
});

// Mock child components to isolate ModalManager's logic
vi.mock("@/components/modalConfig/columnModalConfig", () => ({
  default: () => <div data-testid="column-modal-config" />,
}));
vi.mock("@/components/modalConfig/newProjectModalConfig", () => ({
  default: () => <div data-testid="new-project-modal-config" />,
}));
vi.mock("@/components/modalConfig/exportModalConfig", () => ({
  default: () => <div data-testid="export-modal-config" />,
}));
vi.mock("@/components/modalConfig/settingsModalConfig", () => ({
  default: () => <div data-testid="settings-modal-config" />,
}));

// Mock hooks and services
vi.mock("@/hooks/useFreshToken", () => ({
  useFreshToken: () => vi.fn().mockResolvedValue("test-token"),
}));
vi.mock("@/context/DataContext", () => ({
  useDataContext: mockUseDataContext,
}));
vi.mock("@/context/RetryContext", () => ({
  useRetry: () => ({ setRetryData: vi.fn() }),
}));
vi.mock("@/context/JamsocketContext", () => ({
  useJamsocket: () => ({ isSessionReady: true, sessionBackendUrl: "" }),
}));
vi.mock("react-i18next", () => ({
  // Keep the existing mock for useTranslation
  useTranslation: () => ({
    t: (key: string) => key,
  }),
  // Add a placeholder mock for initReactI18next
  initReactI18next: {
    type: "3rdParty",
    init: () => {}, // A simple no-op function
  },
}));
vi.mock("convex/react", () => ({
  useMutation: vi.fn().mockReturnValue(vi.fn()),
  useConvex: vi.fn().mockReturnValue(vi.fn()),
}));
vi.mock("react-router", () => ({
  useLocation: vi.fn().mockReturnValue("/"),
}));
vi.mock(import("@/utils/Logger"), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
  };
});

// The initial reducer state
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
  exaNumResults: 10,
  isExaLoading: false,
  exaSearchType: "news_article",
  sqlQuery: "",
  exaActionType: "search",
  exaFindSimilarUrl: "",
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
};

describe("ModalManager - Prevent Close Logic", () => {
  let mockCloseModal: () => void;
  let mockActions: any;
  let mockState: any;

  // Base props required by ModalManager
  const baseProps: Omit<ModalManagerProps, "state" | "actions"> = {
    isModalOpen: true,
    modalType: "column",
    sheet: {
      _id: "sheet1" as Id<"sheet">,
      _creationTime: Date.now(),
      name: "Default Test Sheet",
      project_id: "project1" as Id<"project">,
      filter: "1=1",
      hidden: [],
    },
    project_id: "project1" as Id<"project">,
    modalData: null,
    modalSessionIdRef: { current: 0 },
    closeModal: vi.fn(), // Provide a default mock
    handleNewView: vi.fn(),
    handleCreateView: vi.fn(),
    setLoadingViewProjects: vi.fn(),
  };

  beforeEach(() => {
    // Reset mocks and state before each test
    mockCloseModal = vi.fn();
    mockState = JSON.parse(JSON.stringify(initialState));
    mockDataContext.savedPrompts = [];
    mockUseDataContext.mockImplementation(() => mockDataContext);

    // Aall the actions the component might call.
    mockActions = {
      clearColumnModalData: vi.fn(),
      clearSelection: vi.fn(),
      setCreationFlowType: vi.fn(),
      setSearchResultsCount: vi.fn(),
      setSteps: vi.fn(),
      setSavedPrompts: vi.fn(),
      setPromptsLoaded: vi.fn(),
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const renderModalManager = (
    customState = {},
    customProps: Partial<ModalManagerProps> = {},
  ) => {
    const state = { ...mockState, ...customState };

    const props: ModalManagerProps = {
      ...baseProps,
      state,
      actions: mockActions,
      closeModal: mockCloseModal,
      ...customProps,
    };

    return { ...render(<ModalManager {...props} />), props };
  };

  describe("for New Project Modal", () => {
    it("should prevent closing via ESC key when uploading", () => {
      const { container } = renderModalManager(
        { isUploading: true },
        { modalType: "newProject" },
      );
      fireEvent.keyDown(container, { key: "Escape", code: "Escape" });
      expect(mockCloseModal).not.toHaveBeenCalled();
    });

    it("should prevent closing via ESC key when loading", () => {
      const { container } = renderModalManager(
        { isLoading: true },
        { modalType: "newProject" },
      );
      fireEvent.keyDown(container, { key: "Escape", code: "Escape" });
      expect(mockCloseModal).not.toHaveBeenCalled();
    });

    it('should ALLOW closing via the "X" button even when uploading', () => {
      renderModalManager({ isUploading: true }, { modalType: "newProject" });
      const closeButton = screen.getByRole("button", { name: /close/i });
      fireEvent.click(closeButton);
      expect(mockCloseModal).toHaveBeenCalledTimes(1);
    });

    it("should allow closing via ESC key when idle", () => {
      const { container } = renderModalManager(
        { isUploading: false, isLoading: false },
        { modalType: "newProject" },
      );
      fireEvent.keyDown(container, { key: "Escape", code: "Escape" });
      expect(mockCloseModal).toHaveBeenCalledTimes(1);
    });

    it("should not clear selection again when saved prompts update while new project modal is open", () => {
      const { rerender, props } = renderModalManager(
        {},
        { modalType: "newProject", isModalOpen: true },
      );
      expect(mockActions.clearSelection).toHaveBeenCalledTimes(1);

      mockDataContext.savedPrompts = [
        {
          columnName: "Existing prompt",
          projectId: "project1",
          promptOptions: initialState.promptOptions,
        },
      ];
      mockUseDataContext.mockImplementation(() => mockDataContext);

      rerender(<ModalManager {...props} />);
      expect(mockActions.clearSelection).toHaveBeenCalledTimes(1);
    });
  });

  describe("for Column Modal", () => {
    it("should prevent closing via ESC key when form is dirty (columnName)", () => {
      const { container } = renderModalManager(
        { columnName: "new-column-name" },
        { modalType: "column" },
      );
      fireEvent.keyDown(container, { key: "Escape", code: "Escape" });
      expect(mockCloseModal).not.toHaveBeenCalled();
    });

    it("should prevent closing via ESC key when form is dirty (userPrompt)", () => {
      const { container } = renderModalManager(
        {
          promptOptions: { ...initialState.promptOptions, userPrompt: "hello" },
        },
        { modalType: "column" },
      );
      fireEvent.keyDown(container, { key: "Escape", code: "Escape" });
      expect(mockCloseModal).not.toHaveBeenCalled();
    });

    it("should prevent closing via ESC key when form is dirty (responseOptions)", () => {
      const { container } = renderModalManager(
        {
          promptOptions: {
            ...initialState.promptOptions,
            promptType: "schema",
            schemaType: "singleTag",
            responseOptions: ["tag1"],
          },
        },
        { modalType: "column" },
      );
      fireEvent.keyDown(container, { key: "Escape", code: "Escape" });
      expect(mockCloseModal).not.toHaveBeenCalled();
    });

    it('should ALLOW closing via the "X" button even when form is dirty', () => {
      renderModalManager(
        { columnName: "new-column-name" },
        { modalType: "column" },
      );
      const closeButton = screen.getByRole("button", { name: /close/i });
      fireEvent.click(closeButton);
      expect(mockCloseModal).toHaveBeenCalledTimes(1);
    });

    it("should allow closing via ESC key when form is clean", () => {
      const { container } = renderModalManager({}, { modalType: "column" });
      fireEvent.keyDown(container, { key: "Escape", code: "Escape" });
      expect(mockCloseModal).toHaveBeenCalledTimes(1);
    });
  });
});

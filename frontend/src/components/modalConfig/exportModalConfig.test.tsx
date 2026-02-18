import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { it, expect, vi, describe, beforeEach, afterEach, Mock } from "vitest";
import ExportModalConfig from "./exportModalConfig";
import { useAction } from "convex/react";
import { Id, Doc } from "convex/_generated/dataModel";

// Mock dependencies
vi.mock("lucide-react", async (importOriginal) => {
  const original = (await importOriginal()) as any;
  return {
    ...original,
    Loader2: (props: any) => <div data-testid="loading-spinner" {...props} />,
  };
});
vi.mock("convex/react", () => ({
  useAction: vi.fn(),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const mockListColumns = vi.fn().mockResolvedValue({
  columns: ["Column A", "Column B"], // Match the actual API response format
});

// Mock useBackendClient hook
vi.mock("@/hooks/useBackendClient", () => ({
  useBackendClient: () => ({
    listColumns: mockListColumns,
  }),
}));

// Mock the utility function as it's not part of this component's logic
vi.mock("@/utils/exportUtils", () => ({
  getInitialColumnSelections: (cols: any[]) => {
    const selections: Record<string, boolean> = {};
    cols.forEach((col) => (selections[col._id] = true));
    return selections;
  },
}));

// Mock child components
vi.mock("@/components/ui/checkbox", () => ({
  Checkbox: (props: any) => <input type="checkbox" {...props} />,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
const mockFetchAllDataForExport = vi.fn();

describe("ExportModalConfig", () => {
  let mockState: any;
  let mockActions: any;
  let mockCloseModal: () => void;

  const sampleColumns = [
    { _id: "col1", name: "Column A" },
    { _id: "col2", name: "Column B" },
  ] as Doc<"column">[];

  const sampleSheets = [
    { _id: "sheet1", name: "View 1" },
    { _id: "sheet2", name: "View 2" },
  ] as Doc<"sheet">[];

  beforeEach(() => {
    vi.clearAllMocks();
    (useAction as Mock).mockReturnValue(mockFetchAllDataForExport);
    mockListColumns.mockClear();
    mockListColumns.mockResolvedValue({
      columns: ["Column A", "Column B"],
    });
    mockFetchAllDataForExport.mockResolvedValue({
      columns: sampleColumns,
      sheets: sampleSheets,
    });

    mockState = {
      exportSelectedColumns: {},
      exportSelectedViews: {},
      exportActiveTab: "columns",
      userHasSetColumnsSelection: false,
      userHasSetViewsSelection: false,
      exportDownloadUrl: null,
    };

    mockActions = {
      setExportActiveTab: vi.fn(),
      selectAllExportColumns: vi.fn(),
      deselectAllExportColumns: vi.fn(),
      selectAllExportViews: vi.fn(),
      deselectAllExportViews: vi.fn(),
      toggleExportColumn: vi.fn(),
      toggleExportView: vi.fn(),
      setInitialExportColumns: vi.fn(),
      setInitialExportViews: vi.fn(),
      setExportDownloadUrl: vi.fn(),
    };

    mockCloseModal = vi.fn();
  });

  const renderComponent = (customState = {}) => {
    const props = {
      state: { ...mockState, ...customState },
      actions: mockActions,
      projectId: "proj1" as Id<"project">,
      closeModal: mockCloseModal,
    };
    return render(<ExportModalConfig {...props} />);
  };

  describe("Initial State and Data Loading", () => {
    it("should display a loading spinner while fetching initial data", () => {
      // Prevent the mock from resolving immediately
      mockFetchAllDataForExport.mockReturnValue(new Promise(() => {}));
      renderComponent();
      expect(screen.getByTestId("loading-spinner")).toBeInTheDocument(); // Assuming Loader2 has a role of status
    });

    it("should fetch data on mount and set initial selections", async () => {
      renderComponent();

      // Verify the fetch action was called
      expect(mockFetchAllDataForExport).toHaveBeenCalledWith({
        projectId: "proj1",
      });

      await waitFor(() => {
        expect(mockListColumns).toHaveBeenCalledWith({
          convex_project_id: "proj1",
        });
      });

      // Wait for the component to update after fetching
      await waitFor(() => {
        expect(mockActions.setInitialExportColumns).toHaveBeenCalledWith({
          col1: true,
          col2: true,
        });
      });
      await waitFor(() => {
        expect(mockActions.setInitialExportViews).toHaveBeenCalledWith({
          sheet1: true,
          sheet2: true,
        });
      });

      // Wait for the columns to be displayed (both fetching states must be false)
      await waitFor(() => {
        expect(screen.getByText("Column A")).toBeInTheDocument();
      }, { timeout: 3000 });
    });

    it("should disable columns that are missing from the data warehouse", async () => {
      mockListColumns.mockResolvedValueOnce({ columns: ["Column A"] });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText("Column A")).toBeInTheDocument();
      });

      const columnACheckbox = screen.getByLabelText("Column A");
      const columnBCheckbox = screen.getByLabelText("Column B");

      expect(columnACheckbox).not.toBeDisabled();
      expect(columnBCheckbox).toBeDisabled();
    });
  });

  describe("Download Overlay and Delayed Close", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });
    it("should display the overlay with the correct link when exportDownloadUrl is provided", () => {
      const downloadUrl = "https://example.com/download/file.xlsx";
      renderComponent({ exportDownloadUrl: downloadUrl });
      expect(
        screen.getByText("modal_manager.export_modal_config.download_ready"),
      ).toBeInTheDocument();
      const downloadLink = screen.getByText(
        "modal_manager.export_modal_config.click_to_get_data",
      );
      expect(downloadLink).toHaveAttribute("href", downloadUrl);
    });

    it("should close the modal 5 seconds after the download link is clicked", () => {
      const downloadUrl = "https://example.com/download/file.xlsx";
      renderComponent({ exportDownloadUrl: downloadUrl });
      const downloadLink = screen.getByText(
        "modal_manager.export_modal_config.click_to_get_data",
      );
      fireEvent.click(downloadLink);
      expect(mockCloseModal).not.toHaveBeenCalled();
      vi.advanceTimersByTime(5000);
      expect(mockCloseModal).toHaveBeenCalledTimes(1);
    });

    it("should clean up the timer if the component unmounts", () => {
      const downloadUrl = "https://example.com/download/file.xlsx";
      const { unmount } = renderComponent({ exportDownloadUrl: downloadUrl });
      const downloadLink = screen.getByText(
        "modal_manager.export_modal_config.click_to_get_data",
      );
      fireEvent.click(downloadLink);
      unmount();
      vi.advanceTimersByTime(5000);
      expect(mockCloseModal).not.toHaveBeenCalled();
    });
  });
});

import { renderHook, act } from "@testing-library/react";
import { vi, describe, beforeEach, it, expect } from "vitest";
import usePaginatedRows from "./usePaginatedRows";
import { Id } from "../../convex/_generated/dataModel";
import { useQueries } from "convex/react";

// Mock useQueries from Convex
vi.mock("convex/react", () => ({
  useQueries: vi.fn(),
}));

describe("usePaginatedRows hook", () => {
  // Set up a mock sheet ID for the tests
  const sheetId = "mockSheetId" as Id<"sheet">;
  const mockUseQueries = vi.mocked(useQueries);

  beforeEach(() => {
    // Clear previous calls to the mock before each test
    mockUseQueries.mockClear();
  });

  it("Should initialize with default state", () => {
    // Results at the start have no queries
    mockUseQueries.mockReturnValue({});
    const { result } = renderHook(() => usePaginatedRows(sheetId));

    // Check if the default state matches expectations
    expect(result.current.results).toEqual([
      { rows: [], indexKeys: [], hasMore: false, sheetId },
    ]);
  });

  it("Should handle query results", () => {
    // Simulating a query result with some example data
    mockUseQueries.mockReturnValue({
      "0": {
        rows: [{ id: 1, name: "Row 1" }],
        indexKeys: [1],
        hasMore: true,
        sheetId,
      },
    });

    const { result } = renderHook(() => usePaginatedRows(sheetId));

    // Verify that the results contain the expected row data
    expect(result.current.results).toEqual([
      {
        rows: [{ id: 1, name: "Row 1" }],
        indexKeys: [1],
        hasMore: true,
        sheetId,
      },
    ]);
  });

  it("Should add a new query on scrollDown", () => {
    // First query result
    mockUseQueries.mockReturnValueOnce({
      "0": {
        rows: [{ id: 1, name: "Row 1" }],
        indexKeys: [1],
        hasMore: true,
        sheetId,
      },
    });

    const { result, rerender } = renderHook(() => usePaginatedRows(sheetId));

    // Simulate scrolling down
    act(() => {
      result.current.scrollDown();
    });

    // Second query result
    mockUseQueries.mockReturnValueOnce({
      "1": {
        rows: [{ id: 2, name: "Row 2" }],
        indexKeys: [2],
        hasMore: false,
        sheetId,
      },
    });

    rerender();

    // Check if the combined results now have both rows
    expect(result.current.results).toHaveLength(2);
  });

  it("Should not add anything if there are no more results on scrollDown", () => {
    // Simulate query result with hasMore set to false, no more results available
    mockUseQueries.mockReturnValueOnce({
      "0": {
        rows: [{ id: 1, name: "Row 1" }],
        indexKeys: [1],
        hasMore: false,
        sheetId,
      },
    });

    const { result } = renderHook(() => usePaginatedRows(sheetId));

    // Simulate scrolling down when there's no more data
    act(() => {
      result.current.scrollDown();
    });

    // Verify that no additional queries were triggered
    // Should be just one call
    expect(mockUseQueries).toHaveBeenCalledTimes(1);
  });

  it("Should handle scrollUp", () => {
    // Simulate initial query result
    mockUseQueries.mockReturnValueOnce({
      "0": {
        rows: [{ id: 1, name: "Row 1" }],
        indexKeys: [1],
        hasMore: true,
        sheetId,
      },
    });

    const { result, rerender } = renderHook(() => usePaginatedRows(sheetId));

    // Simulate scrolling up
    act(() => {
      result.current.scrollUp();
    });

    rerender();

    // Check if an additional query was triggered for the previous page
    // Should be 2 because initial and scroll up
    expect(mockUseQueries).toHaveBeenCalledTimes(2);
  });
});

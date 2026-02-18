import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useBackendClient } from "./useBackendClient";
import { WorkflowNode, JamsocketContextState } from "@/interfaces/interfaces";
import { Id } from "../../convex/_generated/dataModel";
import { api } from "../../convex/_generated/api";
import { ConvexReactClient } from "convex/react";
import { LLMModel } from "@/types/types";
import { useTranslation } from "react-i18next";
import { useJamsocket } from "@/context/JamsocketContext";
import { useConvex } from "convex/react";
import { useFreshToken } from "@/hooks/useFreshToken";

// Mocks for Hook Dependencies
vi.mock("@/hooks/useFreshToken");
vi.mock("react-i18next");
vi.mock("@/context/DataContext");
vi.mock("@/context/JamsocketContext");
vi.mock("convex/react");
// Mocks for Service Logic
vi.mock("@/utils/Logger", () => ({
  Logger: vi.fn().mockImplementation(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

vi.mock("@/utils/workflowUtils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/utils/workflowUtils")>();
  return {
    ...actual, // Use actual implementations by default
    WorkflowJsonCleaner: {
      cleanAndValidate: vi.fn((json: string) => JSON.parse(json)),
    },
    findNodeById: vi.fn(),
    createPromptOptions: vi.fn((node) => ({
      model: (node.model || "gpt-4o") as LLMModel,
      userPrompt: node.summary || "",
      promptInputColumns: node.inputCols || [],
      promptType:
        node.type === "tag" || node.type === "extract" ? "schema" : "noSchema",
      schemaType:
        node.type === "tag"
          ? node.tagMode || "singleTag"
          : node.type === "extract"
            ? "freeForm"
            : undefined,
      responseOptions:
        node.type === "tag" && node.tags
          ? node.tags.split(",").map((t: string) => t.trim())
          : undefined,
      responseSchema:
        node.type === "extract" ? node.responseSchema || {} : undefined,
    })),
  };
});

vi.mock("@/utils/promptUtils", () => ({
  encodePrompt: vi.fn((prompt) => JSON.stringify(prompt)),
  encodeJsonSchema: vi.fn((schema) => JSON.stringify(schema)),
}));

describe("useBackendClient › importWorkflow", () => {
  const mockProjectId = "proj_123" as Id<"project">;
  const mockDefaultViewId = "sheet_abc" as Id<"sheet">;

  const mockCurrentWorkflowData: WorkflowNode[] = [
    {
      id: `view-backend-${mockDefaultViewId}`,
      label: "Default",
      convexId: mockDefaultViewId,
      isView: true,
      expanded: true,
      children: [],
    },
  ];

  const mutationMockFn = vi.fn();
  const mockConvexClient = {
    mutation: mutationMockFn,
  } as unknown as ConvexReactClient;

  beforeEach(async () => {
    vi.clearAllMocks();

    const mockGetToken = vi.fn().mockResolvedValue("test-token");
    vi.mocked(useFreshToken).mockReturnValue(mockGetToken);

    vi.mocked(useTranslation).mockReturnValue({
      t: (key: string) => {
        if (key === "global.default") {
          return "Default";
        }
        return key;
      },
    } as ReturnType<typeof useTranslation>);

    const mockJamsocket: JamsocketContextState = {
      isMainSessionReady: true,
      projectBackendUrls: new Map(),
      spawningProjects: new Set(),
      performanceMetrics: new Map(),
    };
    vi.mocked(useJamsocket).mockReturnValue(mockJamsocket);

    // This mock now only contains the properties that useBackendClient actually uses.
    vi.mocked(useConvex).mockReturnValue(mockConvexClient);

    const workflowUtils = await import("@/utils/workflowUtils");
    vi.mocked(workflowUtils.findNodeById).mockImplementation((_nodes, id) =>
      id === `view-backend-${mockDefaultViewId}`
        ? mockCurrentWorkflowData[0]
        : null,
    );
  });

  describe("Valid JSON Import", () => {
    it("should successfully import a valid workflow JSON", async () => {
      const validWorkflowJson = JSON.stringify([
        {
          label: "Default",
          isView: true,
          children: [
            { label: "Col 1", type: "summary", summary: "Prompt 1" },
            { label: "Col 2", type: "tag", tags: "a,b" },
          ],
        },
      ]);
      mutationMockFn.mockResolvedValue("new_mock_id");

      const { result } = renderHook(() => useBackendClient());
      const importResult = await result.current.importWorkflow({
        jsonData: validWorkflowJson,
        project_id: mockProjectId,
        defaultViewId: mockDefaultViewId,
        currentWorkflowData: mockCurrentWorkflowData,
      });

      expect(importResult.errors).toHaveLength(0);
      expect(importResult.nodeCount).toBe(3);
      expect(importResult.importedStructure[0].children).toHaveLength(2);
      expect(mutationMockFn).toHaveBeenCalledTimes(3);
    });
  });

  describe("Malformed but Recoverable JSON", () => {
    it("should import a column with a missing name", async () => {
      const jsonWithMissingName = JSON.stringify([
        {
          label: "Default",
          isView: true,
          children: [{ label: "", type: "ask", summary: "A prompt" }],
        },
      ]);
      mutationMockFn.mockResolvedValue("new_mock_id");

      const { result } = renderHook(() => useBackendClient());
      await result.current.importWorkflow({
        jsonData: jsonWithMissingName,
        project_id: mockProjectId,
        defaultViewId: mockDefaultViewId,
        currentWorkflowData: mockCurrentWorkflowData,
      });

      expect(mutationMockFn).toHaveBeenCalledWith(
        api.columns.createNewColumn,
        expect.objectContaining({ name: "" }), // Verify it passes the empty name
      );
    });

    it("should import a column with a missing prompt/summary", async () => {
      const jsonWithMissingSummary = JSON.stringify([
        {
          label: "Default",
          isView: true,
          children: [{ label: "Malformed Col", summary: "", type: "summary" }],
        },
      ]);
      mutationMockFn.mockResolvedValue("new_mock_id");

      const { result } = renderHook(() => useBackendClient());
      await result.current.importWorkflow({
        jsonData: jsonWithMissingSummary,
        project_id: mockProjectId,
        defaultViewId: mockDefaultViewId,
        currentWorkflowData: mockCurrentWorkflowData,
      });

      expect(mutationMockFn).toHaveBeenCalledWith(
        api.columns.createNewColumn,
        expect.objectContaining({
          name: "Malformed Col",
          column_type: "noSchema",
        }),
      );
    });
  });

  describe("Invalid and Unrecoverable JSON", () => {
    it("should fail on completely invalid JSON syntax", async () => {
      const invalidJson = "{ not json }";
      const workflowUtils = await import("@/utils/workflowUtils");
      vi.mocked(
        workflowUtils.WorkflowJsonCleaner.cleanAndValidate,
      ).mockImplementation(() => {
        throw new Error("Invalid JSON syntax");
      });

      const { result } = renderHook(() => useBackendClient());
      await expect(
        result.current.importWorkflow({
          jsonData: invalidJson,
          project_id: mockProjectId,
          defaultViewId: mockDefaultViewId,
          currentWorkflowData: mockCurrentWorkflowData,
        }),
      ).rejects.toThrow("Invalid JSON syntax");
    });
  });
});

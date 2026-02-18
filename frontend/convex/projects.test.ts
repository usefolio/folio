
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Doc, Id } from "./_generated/dataModel";
import { mapDbColumnToWorkflowNode } from "./projects";
import { encodePrompt } from "@/utils/promptUtils";
import { PromptOptions, JSONSchema, LLMModelEnum} from "@/types/types";
import { buildWorkflowTree, searchExa } from "./projects";
import { QueryBuilderState } from "@/interfaces/interfaces";
import { convertToCsv } from "@/utils/CsvUtils";


const mockId = <T extends "column" | "sheet">(tableName: T): Id<T> =>
    `test-${tableName}-id-${Math.random()}` as Id<T>;
  
  // --- MOCK DATA SETUP ---
  
  const mockParentSheetId = mockId("sheet");
  
  // Mock Column Document Factory
  const createMockDbColumn = (
    name: string,
    promptOptions: Partial<PromptOptions>,
    overrides: Partial<Doc<"column">> = {},
  ): Doc<"column"> => {
    const prompt = promptOptions.promptType
      ? encodePrompt(promptOptions as PromptOptions)
      : undefined;
  
    return {
      _id: mockId("column"),
      _creationTime: Date.now(),
      name,
      project_id: "test-project-id" as Id<"project">,
      created_on_sheet_id: mockParentSheetId,
      column_type: promptOptions.promptType || "noSchema",
      column_subtype: promptOptions.promptType === "schema"
      // Cast to the specific part of the PromptOptions union to safely access schemaType.
      ? (promptOptions as Extract<PromptOptions, { promptType: "schema" }>)
          .schemaType
      : null,
      prompt,
      cell_state: new ArrayBuffer(0),
      ...overrides,
    };
  };
  vi.mock("@/utils/CsvUtils", () => ({
    convertToCsv: vi.fn(),
  }));
  // Tests for mapDbColumnToWorkflowNode

describe("mapDbColumnToWorkflowNode", () => {
  it("should correctly map a 'summary' column", () => {
    const prompt: PromptOptions = {
      promptType: "noSchema",
      userPrompt: "Summarize the text",
      model: LLMModelEnum.GPT4O,
      promptInputColumns: ["content"],
      ask: false,
    };
    const dbColumn = createMockDbColumn("Summary Column", prompt);
    const result = mapDbColumnToWorkflowNode(dbColumn, mockParentSheetId);

    expect(result).not.toBeNull();
    expect(result?.type).toBe("summary");
    expect(result?.summary).toBe("Summarize the text");
    expect(result?.model).toBe("gpt-4o");
    expect(result?.inputCols).toEqual(["content"]);
    expect(result?.isView).toBe(false);
  });

  it("should correctly map a 'singleTag' column", () => {
    const prompt: PromptOptions = {
      promptType: "schema",
      schemaType: "singleTag",
      userPrompt: "Classify sentiment",
      responseOptions: ["Positive", "Negative", "Neutral"],
      model: LLMModelEnum.GPT35Turbo,
      promptInputColumns: [],
    };
    const dbColumn = createMockDbColumn("Sentiment", prompt);
    const result = mapDbColumnToWorkflowNode(dbColumn, mockParentSheetId);

    expect(result).not.toBeNull();
    expect(result?.type).toBe("tag");
    expect(result?.tagMode).toBe("singleTag");
    expect(result?.tags).toBe("Negative, Neutral, Positive");
    expect(result?.convexSheetId).toBe(mockParentSheetId);
  });

  it("should correctly map an 'extract' column", () => {
    const schema: JSONSchema = {
      type: "object",
      properties: { invoice_id: { type: "string" }, amount: { type: "number" } },
    };
    const prompt: PromptOptions = {
      promptType: "schema",
      schemaType: "freeForm",
      userPrompt: "Extract invoice details",
      responseSchema: schema,
      model: LLMModelEnum.GPT4O,
      promptInputColumns: ["ocr_text"],
    };
    const dbColumn = createMockDbColumn("Invoice Details", prompt);
    const result = mapDbColumnToWorkflowNode(dbColumn, mockParentSheetId);

    expect(result).not.toBeNull();
    expect(result?.type).toBe("extract");
    expect(result?.responseSchema).toEqual(schema);
    expect(result?.summary).toBe("Extract invoice details");
  });

  it("should return null for a column with a non-workflow type", () => {
    const dbColumn = createMockDbColumn(
      "Unsupported",
      {},
      {
        //@ts-expect-error - Expect error because we are intentionally passing wrong type
        column_type: "some_other_type",
      },
    );
    const result = mapDbColumnToWorkflowNode(dbColumn, mockParentSheetId);
    expect(result).toBeNull();
  });

  it("should fall back to column name for summary if userPrompt is missing", () => {
    const prompt: PromptOptions = {
      promptType: "noSchema",
      userPrompt: "",
      model: LLMModelEnum.GPT4O,
      promptInputColumns: [],
    };
    const dbColumn = createMockDbColumn("Column Without Prompt", prompt);
    const result = mapDbColumnToWorkflowNode(dbColumn, mockParentSheetId);

    expect(result).not.toBeNull();
    expect(result?.summary).toBe("Column Without Prompt");
  });

  it("should handle a malformed prompt by treating it as a default summary column", () => {
    const dbColumn = createMockDbColumn(
      "Malformed",
      {},
      {
        prompt: "this-is-not-base64-and-will-fail-decode",
        column_type: "noSchema",
      },
    );
    const result = mapDbColumnToWorkflowNode(dbColumn, mockParentSheetId);

    expect(result).not.toBeNull();
    expect(result?.type).toBe("summary");
    expect(result?.summary).toBe("Malformed"); // Falls back to column name
  });
});

// Test for buildWorkflowTree

describe("buildWorkflowTree", () => {
    // Mock Data Setup ---
    const mockProject = { _id: "p1" } as Doc<"project">;
    const mockSheet1Id = mockId("sheet");
    const mockSheet2Id = mockId("sheet");
  
    const mockSheets: Doc<"sheet">[] = [
      {
        _id: mockSheet1Id,
        _creationTime: Date.now(),
        name: "Contacts",
        project_id: "p1" as Id<"project">,
        filter: "status = 'active'",
        hidden: [],
      },
      {
        _id: mockSheet2Id,
        _creationTime: Date.now(),
        name: "Companies",
        project_id: "p1" as Id<"project">,
        filter: "1=1",
        hidden: [],
      },
    ];
  
    const mockColumns: Doc<"column">[] = [
      createMockDbColumn("Contact Summary", { promptType: "noSchema", model: LLMModelEnum.GPT4O }, { created_on_sheet_id: mockSheet1Id }),
      createMockDbColumn("Company Details", {
        promptType: "schema", schemaType: "freeForm", model: LLMModelEnum.GPT4O,
        responseSchema: { type: "object", properties: { name: { type: "string" } } }
      }, { created_on_sheet_id: mockSheet2Id }),
    ];
  
    // Test Cases
  
    it("should construct the correct parent-child hierarchy", () => {
      const tree = buildWorkflowTree(mockProject, mockSheets, mockColumns);
  
      expect(tree).toHaveLength(2);
  
      const contactsNode = tree.find((n) => n.label === "Contacts");
      expect(contactsNode).toBeDefined();
      expect(contactsNode?.isView).toBe(true);
      expect(contactsNode?.children).toHaveLength(1);
      expect(contactsNode?.children[0].label).toBe("Contact Summary");
  
      const companiesNode = tree.find((n) => n.label === "Companies");
      expect(companiesNode).toBeDefined();
      expect(companiesNode?.children).toHaveLength(1);
    });
  
    it("should merge saved UI state from project_workflow", () => {
    const contactSummaryColumn = mockColumns.find(c => c.name === "Contact Summary")!;
      const customQueryState: QueryBuilderState = {
        tokens: [{ field: "name", operator: "CONTAINS", value: "test", isEditing: false }],
        currentCondition: { field: "", operator: "=", value: "", isEditing: false },
        showOperators: false,
      };
  
      const savedWorkflow = [
        { convexId: mockSheet1Id, expanded: false, isView: true },
        { convexId: mockSheet2Id, children: [
            { convexId: contactSummaryColumn._id, expanded: false }
        ], expanded: true, isView: true, queryBuilderState: customQueryState },
      ];
  
      const mockProjectWithWorkflow = {
        _id: "p1",
        project_workflow: JSON.stringify(savedWorkflow),
      } as Doc<"project">;
  
      const tree = buildWorkflowTree(mockProjectWithWorkflow, mockSheets, mockColumns);
      const contactsNode = tree.find((n) => n.convexId === mockSheet1Id);
      const companiesNode = tree.find((n) => n.convexId === mockSheet2Id);
      const contactSummaryNode = contactsNode?.children.find(c => c.convexId === contactSummaryColumn._id);
  
      expect(contactsNode?.expanded).toBe(false);
      expect(companiesNode?.queryBuilderState).toEqual(customQueryState);
      expect(contactSummaryNode?.expanded).toBe(false);
    });
  
    it("should return an empty array if there are no sheets", () => {
      const tree = buildWorkflowTree(mockProject, [], mockColumns);
      expect(tree).toHaveLength(0);
    });
  
    it("should create view nodes with empty children if there are no columns", () => {
      const tree = buildWorkflowTree(mockProject, mockSheets, []);
  
      expect(tree).toHaveLength(2);
      expect(tree[0].children).toHaveLength(0);
      expect(tree[1].children).toHaveLength(0);
    });
  
    it("should handle malformed project_workflow JSON gracefully", () => {
      const mockProjectWithBadWorkflow = {
        _id: "p1",
        project_workflow: "this-is-not-valid-json",
      } as Doc<"project">;
  
      // The function should not crash and should return the default tree.
      const tree = buildWorkflowTree(mockProjectWithBadWorkflow, mockSheets, mockColumns);
      
      expect(tree).toHaveLength(2);
      // Check that default state is used, not a crashed state
      const contactsNode = tree.find((n) => n.convexId === mockSheet1Id);
      expect(contactsNode?.expanded).toBe(true); // Should be the default `true`
    });
  
    it("should ignore saved state for sheets that no longer exist", () => {
      const nonExistentSheetId = "deleted-sheet-id";
      const savedWorkflow = [
        // This state is for a sheet that isn't in our mockSheets array
        { convexId: nonExistentSheetId, expanded: false, isView: true },
        // This state is for a valid sheet
        { convexId: mockSheet1Id, expanded: false, isView: true },
      ];
  
       const mockProjectWithStaleState = {
        _id: "p1",
        project_workflow: JSON.stringify(savedWorkflow),
      } as Doc<"project">;
  
      // Should not crash and should apply the valid state
      const tree = buildWorkflowTree(mockProjectWithStaleState, mockSheets, mockColumns);
      const contactsNode = tree.find((n) => n.convexId === mockSheet1Id);
      expect(contactsNode?.expanded).toBe(false); // The valid state was applied
      expect(tree.find((n) => n.convexId === nonExistentSheetId)).toBeUndefined(); // The stale node was not added
    });
  });
  describe("searchExa action", () => {
    // Store the original environment variable
    const originalExaApiKey = process.env.EXA_AI_KEY;
    // Cast the Convex RegisteredAction to a callable for testing purposes.
    const invokeSearchExa = searchExa as unknown as (ctx: any, args: any) => Promise<any>;
  
    beforeEach(() => {
      // Mock the global fetch function before each test
      vi.spyOn(global, "fetch");
      // Set a mock API key for most tests
      process.env.EXA_AI_KEY = "test-api-key";
    });
  
    afterEach(() => {
      // Restore the original fetch and environment variable after each test
      vi.restoreAllMocks();
      process.env.EXA_AI_KEY = originalExaApiKey;
    });
  
    it("should throw an error if the Exa API key is not configured", async () => {
      // Unset the environment variable for this specific test
      delete process.env.EXA_AI_KEY;
  
      const args = {
        query: "test",
        actionType: "search" as const,
        category: "general",
        numResults: 1,
      };
  
      // Expect the promise to be rejected with a specific error message
      await expect(invokeSearchExa(null as any, args)).rejects.toThrow(
        "Exa API key is not configured.",
      );
    });
  
    it("should handle a 400 Bad Request from the Exa API", async () => {
      const errorResponse = {
        ok: false,
        status: 400,
        text: () => Promise.resolve("Bad Request: Invalid parameter provided."),
      };
      (fetch as any).mockResolvedValue(errorResponse);
  
      const args = {
        query: "invalid-query-for-testing",
        actionType: "search" as const,
        category: "general",
        numResults: 5,
      };
  
      // Assert that the function throws the correctly formatted error
      await expect(invokeSearchExa(null as any, args)).rejects.toThrow(
        "Exa API Error: 400 Bad Request: Invalid parameter provided.",
      );
    });
  
    it("should handle a 401 Unauthorized error from the Exa API", async () => {
      const errorResponse = {
        ok: false,
        status: 401,
        text: () => Promise.resolve("Unauthorized: Invalid API key."),
      };
      (fetch as any).mockResolvedValue(errorResponse);
  
      const args = {
        actionType: "findSimilar" as const,
        url: "http://example.com",
        category: "general",
        numResults: 3,
      };
  
      await expect(invokeSearchExa(null as any, args)).rejects.toThrow(
        "Exa API Error: 401 Unauthorized: Invalid API key.",
      );
    });
  
    it("should handle a 500 Internal Server Error from the Exa API", async () => {
      const errorResponse = {
        ok: false,
        status: 500,
        text: () => Promise.resolve("An unexpected error occurred on the server."),
      };
      (fetch as any).mockResolvedValue(errorResponse);
  
      const args = {
        query: "test query",
        actionType: "search" as const,
        category: "news",
        numResults: 10,
      };
  
      await expect(invokeSearchExa(null as any, args)).rejects.toThrow(
        "Exa API Error: 500 An unexpected error occurred on the server.",
      );
    });
  
    it("should successfully return data for a valid search request", async () => {
      const mockApiResponse = {
        results: [
          {
            url: "https://example.com",
            title: "Example Domain",
            publishedDate: "2023-01-01",
            text: "This is the content of the example domain.",
          },
        ],
      };
  
      const successResponse = {
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockApiResponse),
      };
      (fetch as any).mockResolvedValue(successResponse);
      (convertToCsv as any).mockReturnValue(
        "url,title,publishedDate,text\nhttps://example.com,Example Domain,2023-01-01,This is the content of the example domain.",
      );
  
      const args = {
        query: "example",
        actionType: "search" as const,
        category: "general",
        numResults: 1,
      };
      const result = await invokeSearchExa(null as any, args);
  
      // Verify the structure and content of the successful return
      expect(result.resultsCount).toBe(1);
      expect(result.csvData).toContain("https://example.com");
      expect(result.fileName).toMatch(/^example_\d{4}-\d{2}-\d{2}\.csv$/);
      // Ensure fetch was called with the correct parameters
      expect(fetch).toHaveBeenCalledWith("https://api.exa.ai/search", expect.any(Object));
    });

    it("sanitizes the filename when the query contains invalid characters", async () => {
      const mockApiResponse = { results: [] };
      const successResponse = {
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockApiResponse),
      };
      (fetch as any).mockResolvedValue(successResponse);
      (convertToCsv as any).mockReturnValue("url,title\n");

      const args = {
        query: "report: 2024/2025?*",
        actionType: "search" as const,
        category: "general",
        numResults: 1,
      };
      const result = await invokeSearchExa(null as any, args);
      // Should contain date suffix and .csv
      expect(result.fileName.endsWith(".csv")).toBe(true);
      expect(/\d{4}-\d{2}-\d{2}\.csv$/.test(result.fileName)).toBe(true);
      // Should not contain characters disallowed for filenames
      expect(result.fileName).not.toMatch(/[<>:"/\\|?*]/);
    });
  });

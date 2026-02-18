import { describe, test, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useBackendClient } from "./useBackendClient";
import { StructuredOutputPrompt, TextGenerationPrompt } from "@/types/types";
import { useTranslation } from "react-i18next";
import { useDataContext } from "@/context/DataContext";
import { Id, Doc } from "convex/_generated/dataModel";
import { ConvexReactClient } from "convex/react";
import { DataContextProps } from "@/interfaces/interfaces";
import { useJamsocket } from "@/context/JamsocketContext";
import { JamsocketContextState } from "@/interfaces/interfaces";
import { useFreshToken } from "@/hooks/useFreshToken";
import { DEFAULT_SYSTEM_PROMPT } from "@/constants";

// Mocks for Hook Dependencies
vi.mock("@/hooks/useFreshToken");
vi.mock("react-i18next");
vi.mock("@/context/DataContext");
vi.mock("@/context/JamsocketContext");
vi.mock("@/utils/Logger", () => ({
  Logger: vi.fn().mockImplementation(() => ({
    debug: vi.fn(),
  })),
}));

// Type guards to help TypeScript narrow down the prompt type during tests
function isTextGenerationPrompt(
  prompt: unknown,
): prompt is TextGenerationPrompt {
  return !!(prompt as TextGenerationPrompt).messages;
}

function isStructuredPrompt(prompt: unknown): prompt is StructuredOutputPrompt {
  return !!(prompt as StructuredOutputPrompt).response_format;
}

describe("useBackendClient › generatePrompt", () => {
  // Set up the required mocks for the useBackendClient hook
  beforeEach(() => {
    vi.clearAllMocks();

    const mockGetToken = vi.fn().mockResolvedValue("test-token");
    vi.mocked(useFreshToken).mockReturnValue(mockGetToken);

    vi.mocked(useTranslation).mockReturnValue({
      t: (key: string) => key,
    } as ReturnType<typeof useTranslation>);

    // A complete mock for DataContext that satisfies the DataContextProps type
    const mockDataContext: DataContextProps = {
      convex: { mutation: vi.fn() } as unknown as ConvexReactClient,
      project: "test_project" as Id<"project">,
      sheet: undefined,
      columns: [],
      serviceCredentials: [],
      systemPrompt: {
        value: DEFAULT_SYSTEM_PROMPT,
      } as Doc<"system_settings">,
      projects: [],
      projectGrouping: [],
      sheets: [],
      loading: false,
      logs: [],
      jobs: [],
      workspace: null,
      serviceCredentialsLoading: false,
      loadingColumnsSet: new Set<Id<"column">>(),
      failedColumnsSet: new Set<Id<"column">>(),
      fetchedSystemPromptLoading: false,
      isEmpty: {
        projects: false,
        sheets: false,
        columns: false,
        logs: false,
      },
      dataState: "has-data",
      setProject: vi.fn(),
      selectDefaultProject: vi.fn(),
      setSheet: vi.fn(),
      hasMoreProjects: false,
      hasMoreSheets: false,
      jobsLoading: false,
      jobsResults: [],
      logsLoading: false,
      logsResults: [],
      promptsAndJsonSchemasLoading: false,
      refreshAllPromptsAndJsonSchemas: vi.fn(),
      savedJsonSchemas: [],
      savedPrompts: [],
      projectsLoading: false,
      sheetsLoading: false,
      handleCreateView: vi.fn(),
      handleNewView: vi.fn(),
      setLoadingViewProjects: vi.fn(),
      loadingViewProjects: {},
      creatingSheetId: null,
    };
    vi.mocked(useDataContext).mockReturnValue(mockDataContext);
  });
  const mockJamsocketState: JamsocketContextState = {
    isMainSessionReady: true,
    projectBackendUrls: new Map(),
    spawningProjects: new Set(),
    performanceMetrics: new Map(),
  };
  vi.mocked(useJamsocket).mockReturnValue(mockJamsocketState);
  /**
   * Test the default behavior using CategoryPrompt.
   * Change the base prompt in the service to see different default results.
   */
  test("should generate a default StructuredOutputPrompt", () => {
    const { result: hookResult } = renderHook(() => useBackendClient());
    const result = hookResult.current.generatePrompt({
      promptType: "schema",
      schemaType: "singleTag",
      responseOptions: ["Option1", "Option2", "Option3"],
      model: "gpt-4o",
      userPrompt: "Classify the call into categories.",
      promptInputColumns: ["text"],
    });

    if (isStructuredPrompt(result)) {
      expect(result.user_prompt_template).toBe(
        "Classify the call into categories.",
      );
      expect(result.response_format.json_schema.name).toBe("Classification");
    } else {
      throw new Error(
        "Expected a StructuredOutput prompt but got TextGeneration prompt",
      );
    }
  });

  /**
   * Modify enumTags to test how the categories change.
   * Change the array to `["NewTag1", "NewTag2"]` and verify the output by using toEqual(["NewTag1", "NewTag2"]).
   */
  test("should generate a StructuredOutputPrompt with custom enum tags", () => {
    const { result: hookResult } = renderHook(() => useBackendClient());
    const result = hookResult.current.generatePrompt({
      promptType: "schema",
      model: "gpt-4o",
      schemaType: "singleTag",
      userPrompt: "Classify the call into categories.",
      responseOptions: ["CustomTag1", "CustomTag2"],
      promptInputColumns: ["text"],
    });

    if (isStructuredPrompt(result)) {
      expect(
        result?.response_format?.json_schema?.schema?.properties
          ?.extraction_keyword?.enum,
      ).toEqual(["CustomTag1", "CustomTag2"]);
    } else {
      throw new Error(
        "Expected a StructuredOutputPrompt but got TextGenerationPrompt",
      );
    }
  });

  /**
   * Test the default Text Generation prompt generation.
   * Adjust options like userPromptTemplate or systemPrompt for different results, don't forget to change what expect() does.
   */
  test("should generate a default TextGenerationPrompt", () => {
    const { result: hookResult } = renderHook(() => useBackendClient());
    const result = hookResult.current.generatePrompt({
      promptType: "noSchema",
      model: "gpt-4o",
      userPrompt: "Please summarize the input data.",
      promptInputColumns: [],
    });

    if (isTextGenerationPrompt(result)) {
      expect(result.model).toBe("gpt-4o");
      expect(result.messages[0].role).toBe("system");
    } else {
      throw new Error(
        "Expected a TextGenerationPrompt but got StructuredOutputPrompt",
      );
    }
  });

  /**
   * Modify the userPromptTemplate
   * Change the prompts to something completely different if you want. Remember about expect() function.
   */
  test("should generate a TextGenerationPrompt with a custom user prompt", () => {
    const { result: hookResult } = renderHook(() => useBackendClient());
    const result = hookResult.current.generatePrompt({
      promptType: "noSchema",
      userPrompt: "Analyze this call for sentiment.",
      model: "gpt-4o",
      promptInputColumns: ["text"],
    });

    if (isTextGenerationPrompt(result)) {
      expect(result.messages[1].content[0].text).toContain(
        "Analyze this call for sentiment.",
      );
    } else {
      throw new Error(
        "Expected a TextGenerationPrompt but got StructuredOutputPrompt",
      );
    }
  });
});

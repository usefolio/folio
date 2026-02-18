import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { decodePromptBackend, base64ToUtf8String } from "./convexByteUtils";
import {
  LLMModelEnum,
  TextGenerationPromptOptions,
  SingleTagPromptOptions,
  MultiTagPromptOptions,
  JsonOutputPromptOptions,
  PromptOptions,
} from "@/types/types";

describe("decodePromptBackend", () => {
  beforeEach(() => {
    console.log("=== Starting new test ===");
  });

  afterEach(() => {
    console.log("Test completed");
  });

  // Helper function to encode a string to base64 (matching the format expected by the function)
  const encodeToBase64 = <T>(obj: T): string => {
    const json = JSON.stringify(obj);
    const bytes = new TextEncoder().encode(json);
    const binaryString = Array.from(bytes, (byte) =>
      String.fromCharCode(byte),
    ).join("");
    return btoa(binaryString);
  };

  describe("base64ToUtf8String helper", () => {
    it("should decode valid base64 to UTF-8 string", () => {
      console.log("TEST: base64ToUtf8String - valid base64");
      const testString = "Hello, World!";
      const base64 = btoa(testString);
      const result = base64ToUtf8String(base64);
      expect(result).toBe(testString);
    });

    it("should decode complex JSON object", () => {
      console.log("TEST: base64ToUtf8String - complex JSON");
      const testObj = { test: "value", nested: { prop: 123 } };
      const encoded = encodeToBase64(testObj);
      const decoded = base64ToUtf8String(encoded);
      expect(JSON.parse(decoded)).toEqual(testObj);
    });
  });

  describe("Default behavior", () => {
    it("should return default options when input is null", () => {
      console.log("TEST: Default behavior - null input");
      const result = decodePromptBackend(null);
      console.log("Result:", result);

      expect(result).toEqual({
        promptType: "noSchema",
        userPrompt: "",
        model: LLMModelEnum.GPT4O,
        promptInputColumns: [],
        ask: false,
      } as TextGenerationPromptOptions);
    });

    it("should return default options when input is undefined", () => {
      console.log("TEST: Default behavior - undefined input");
      const result = decodePromptBackend(undefined);

      expect(result).toEqual({
        promptType: "noSchema",
        userPrompt: "",
        model: LLMModelEnum.GPT4O,
        promptInputColumns: [],
        ask: false,
      } as TextGenerationPromptOptions);
    });

    it("should return default options when input is empty string", () => {
      console.log("TEST: Default behavior - empty string");
      const result = decodePromptBackend("");

      expect(result).toEqual({
        promptType: "noSchema",
        userPrompt: "",
        model: LLMModelEnum.GPT4O,
        promptInputColumns: [],
        ask: false,
      } as TextGenerationPromptOptions);
    });
  });

  describe("Text Generation (noSchema) prompts", () => {
    it("should decode a basic noSchema prompt", () => {
      console.log("TEST: Text Generation - basic noSchema");
      const promptData = {
        promptType: "noSchema",
        userPrompt: "Generate a summary",
        model: LLMModelEnum.GPT41,
        promptInputColumns: ["col1", "col2"],
        ask: false,
      };

      const encoded = encodeToBase64(promptData);
      console.log("Encoded base64:", encoded);

      const result = decodePromptBackend(
        encoded,
      ) as TextGenerationPromptOptions;
      console.log("Decoded result:", result);

      expect(result).toEqual(promptData);
    });

    it("should decode a noSchema prompt with ask=true", () => {
      console.log("TEST: Text Generation - noSchema with ask=true");
      const promptData = {
        promptType: "noSchema",
        userPrompt: "Answer this question",
        model: LLMModelEnum.GPT4O_MINI,
        promptInputColumns: ["question"],
        ask: true,
      };

      const encoded = encodeToBase64(promptData);
      const result = decodePromptBackend(
        encoded,
      ) as TextGenerationPromptOptions;

      expect(result).toEqual(promptData);
    });

    it("should use default values for missing fields in noSchema prompt", () => {
      console.log("TEST: Text Generation - missing fields");
      const promptData = {
        promptType: "noSchema",
      };

      const encoded = encodeToBase64(promptData);
      const result = decodePromptBackend(
        encoded,
      ) as TextGenerationPromptOptions;

      expect(result).toEqual({
        promptType: "noSchema",
        userPrompt: "",
        model: LLMModelEnum.GPT4O,
        promptInputColumns: [],
        ask: false,
      });
    });
  });

  describe("Single Tag prompts", () => {
    it("should decode a singleTag prompt correctly", () => {
      console.log("TEST: Single Tag - decode correctly");
      const promptData: PromptOptions = {
        promptType: "schema",
        schemaType: "singleTag",
        userPrompt: "Classify this item",
        model: LLMModelEnum.GPT41_MINI,
        promptInputColumns: ["description"],
        responseOptions: ["Category A", "Category B", "Category C"],
      };

      const encoded = encodeToBase64(promptData);
      const result = decodePromptBackend(encoded) as SingleTagPromptOptions;

      expect(result.promptType).toBe("schema");
      expect(result.schemaType).toBe("singleTag");
      expect(result.userPrompt).toBe("Classify this item");
      expect(result.model).toBe(LLMModelEnum.GPT41_MINI);
      expect(result.promptInputColumns).toEqual(["description"]);
      expect(result.responseOptions).toEqual([
        "Category A",
        "Category B",
        "Category C",
      ]);
    });

    it("should handle empty responseOptions for singleTag", () => {
      console.log("TEST: Single Tag - empty responseOptions");
      const promptData: Partial<SingleTagPromptOptions> = {
        promptType: "schema",
        schemaType: "singleTag",
        userPrompt: "Classify this",
        model: LLMModelEnum.GPT4O,
        promptInputColumns: [],
      };

      const encoded = encodeToBase64(promptData);
      const result = decodePromptBackend(encoded) as SingleTagPromptOptions;

      expect(result.responseOptions).toEqual([]);
      expect(result.promptInputColumns).toEqual([]);
    });
  });

  describe("Multi Tag prompts", () => {
    it("should decode a multiTag prompt correctly", () => {
      console.log("TEST: Multi Tag - decode correctly");
      const promptData: PromptOptions = {
        promptType: "schema",
        schemaType: "multiTag",
        userPrompt: "Tag this content",
        model: LLMModelEnum.GPT45_PREVIEW,
        promptInputColumns: ["content", "metadata"],
        responseOptions: ["Tag1", "Tag2", "Tag3", "Tag4"],
      };

      const encoded = encodeToBase64(promptData);
      const result = decodePromptBackend(encoded) as MultiTagPromptOptions;

      expect(result.promptType).toBe("schema");
      expect(result.schemaType).toBe("multiTag");
      expect(result.userPrompt).toBe("Tag this content");
      expect(result.model).toBe(LLMModelEnum.GPT45_PREVIEW);
      expect(result.promptInputColumns).toEqual(["content", "metadata"]);
      expect(result.responseOptions).toEqual(["Tag1", "Tag2", "Tag3", "Tag4"]);
    });
  });

  describe("JSON Output (freeForm) prompts", () => {
    it("should decode a freeForm prompt with responseSchema", () => {
      console.log("TEST: JSON Output - with responseSchema");
      const promptData: PromptOptions = {
        promptType: "schema",
        schemaType: "freeForm",
        userPrompt: "Extract structured data",
        model: LLMModelEnum.GPT4O,
        promptInputColumns: ["raw_data"],
        responseSchema: {
          type: "object",
          properties: {
            name: { type: "string" },
            age: { type: "number" },
          },
          required: ["name"],
        },
      };

      const encoded = encodeToBase64(promptData);
      const result = decodePromptBackend(encoded) as JsonOutputPromptOptions;

      expect(result.promptType).toBe("schema");
      expect(result.schemaType).toBe("freeForm");
      expect(result.userPrompt).toBe("Extract structured data");
      expect(result.model).toBe(LLMModelEnum.GPT4O);
      expect(result.promptInputColumns).toEqual(["raw_data"]);
      expect(result.responseSchema).toEqual({
        type: "object",
        properties: {
          name: { type: "string" },
          age: { type: "number" },
        },
        required: ["name"],
      });
    });

    it("should return default options for freeForm without responseSchema", () => {
      console.log("TEST: JSON Output - freeForm without responseSchema");
      const promptData = {
        promptType: "schema",
        schemaType: "freeForm",
        userPrompt: "Extract data",
        model: LLMModelEnum.GPT4O,
      };

      const encoded = encodeToBase64(promptData);
      const result = decodePromptBackend(encoded);
      console.log("Result:", result);

      // Should return clean defaults
      expect(result).toEqual({
        promptType: "noSchema",
        userPrompt: "", // No error message, just empty
        model: LLMModelEnum.GPT4O,
        promptInputColumns: [],
        ask: false,
      });
    });
  });

  describe("Error handling", () => {
    it("should return default options for invalid base64 string", () => {
      console.log("TEST: Error handling - invalid base64");
      const result = decodePromptBackend("invalid-base64!@#$");
      console.log("Result:", result);

      expect(result).toEqual({
        promptType: "noSchema",
        userPrompt: "", // No error message
        model: LLMModelEnum.GPT4O,
        promptInputColumns: [],
        ask: false,
      });
    });

    it("should return default options for invalid JSON after base64 decode", () => {
      console.log("TEST: Error handling - invalid JSON");
      const invalidJson = "not a json {]";
      const bytes = new TextEncoder().encode(invalidJson);
      const binaryString = Array.from(bytes, (byte) =>
        String.fromCharCode(byte),
      ).join("");
      const encoded = btoa(binaryString);

      const result = decodePromptBackend(encoded);
      console.log("Result:", result);

      expect(result).toEqual({
        promptType: "noSchema",
        userPrompt: "", // No error message
        model: LLMModelEnum.GPT4O,
        promptInputColumns: [],
        ask: false,
      });
    });

    it("should return default options for missing promptType", () => {
      console.log("TEST: Error handling - missing promptType");
      const promptData = {
        userPrompt: "Some prompt",
        model: LLMModelEnum.GPT4O,
      };

      const encoded = encodeToBase64(promptData);
      const result = decodePromptBackend(encoded);
      console.log("Result:", result);

      expect(result).toEqual({
        promptType: "noSchema",
        userPrompt: "", // No error message
        model: LLMModelEnum.GPT4O,
        promptInputColumns: [],
        ask: false,
      });
    });

    it("should return default options for invalid promptType", () => {
      console.log("TEST: Error handling - invalid promptType");
      const promptData = {
        promptType: "invalidType",
        userPrompt: "Some prompt",
      };

      const encoded = encodeToBase64(promptData);
      const result = decodePromptBackend(encoded);
      console.log("Result:", result);

      expect(result).toEqual({
        promptType: "noSchema",
        userPrompt: "", // No error message
        model: LLMModelEnum.GPT4O,
        promptInputColumns: [],
        ask: false,
      });
    });

    it("should return default options for invalid schemaType for schema promptType", () => {
      console.log("TEST: Error handling - invalid schemaType");
      const promptData = {
        promptType: "schema",
        schemaType: "invalidSchemaType",
        userPrompt: "Some prompt",
      };

      const encoded = encodeToBase64(promptData);
      const result = decodePromptBackend(encoded);
      console.log("Result:", result);

      expect(result).toEqual({
        promptType: "noSchema",
        userPrompt: "", // No error message
        model: LLMModelEnum.GPT4O,
        promptInputColumns: [],
        ask: false,
      });
    });

    it("should return default options for missing schemaType for schema promptType", () => {
      console.log("TEST: Error handling - missing schemaType");
      const promptData = {
        promptType: "schema",
        userPrompt: "Some prompt",
      };

      const encoded = encodeToBase64(promptData);
      const result = decodePromptBackend(encoded);
      console.log("Result:", result);

      expect(result).toEqual({
        promptType: "noSchema",
        userPrompt: "", // No error message
        model: LLMModelEnum.GPT4O,
        promptInputColumns: [],
        ask: false,
      });
    });
  });

  describe("Model fallback behavior", () => {
    it("should fallback to GPT4O when model is not specified", () => {
      console.log("TEST: Model fallback - no model specified");
      const promptData = {
        promptType: "noSchema",
        userPrompt: "Test prompt",
      };

      const encoded = encodeToBase64(promptData);
      const result = decodePromptBackend(encoded);

      expect(result.model).toBe(LLMModelEnum.GPT4O);
    });

    it("should preserve specified model", () => {
      console.log("TEST: Model fallback - preserve specified model");
      const promptData = {
        promptType: "noSchema",
        userPrompt: "Test prompt",
        model: LLMModelEnum.GPT35Turbo,
      };

      const encoded = encodeToBase64(promptData);
      const result = decodePromptBackend(encoded);

      expect(result.model).toBe(LLMModelEnum.GPT35Turbo);
    });
  });

  describe("Edge cases", () => {
    it("should handle very large prompt data", () => {
      console.log("TEST: Edge cases - large data");
      const largeArray = Array(1000).fill("column");
      const promptData = {
        promptType: "noSchema",
        userPrompt: "A".repeat(10000),
        model: LLMModelEnum.GPT4O,
        promptInputColumns: largeArray,
        ask: false,
      };

      const encoded = encodeToBase64(promptData);
      const result = decodePromptBackend(
        encoded,
      ) as TextGenerationPromptOptions;

      expect(result.userPrompt.length).toBe(10000);
      expect(result.promptInputColumns.length).toBe(1000);
    });

    it("should handle base64 with UTF-8 characters", () => {
      console.log("TEST: Edge cases - UTF-8 characters");
      const promptData = {
        promptType: "noSchema",
        userPrompt: "Test with emojis 🎉 and special chars: ñáéíóú",
        model: LLMModelEnum.GPT4O,
        promptInputColumns: [],
        ask: false,
      };

      const encoded = encodeToBase64(promptData);
      const result = decodePromptBackend(
        encoded,
      ) as TextGenerationPromptOptions;

      expect(result.userPrompt).toBe(
        "Test with emojis 🎉 and special chars: ñáéíóú",
      );
    });
  });

  describe("Integration with base64ToUtf8String", () => {
    it("should throw error with helpful message for malformed base64", () => {
      console.log("TEST: Integration - malformed base64");
      try {
        base64ToUtf8String("definitely!!!not%%%base64");
        expect.fail("Should have thrown an error");
      } catch (error) {
        if (error instanceof Error) {
          console.log("Caught error:", error.message);
          expect(error.message).toContain("Invalid base64 string");
        } else {
          expect.fail("Unexpected error type");
        }
      }
    });
  });
});

import { DEFAULT_AI_MODEL } from "../constants";
import { FormBuilderSchema, PromptOptions } from "../types/types";
import i18n from "i18next";

/* ---------- tiny Base-64 helpers that handle full-Unicode ---------- */

function utf8ToBase64(s: string): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(s)));
}

function base64ToUtf8(b64: string): string {
  const latin1 = atob(b64); // Base-64 → bytes string
  const bytes = Uint8Array.from(latin1, (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes); // bytes → JS string
}

/* ---------- prompt encode / decode ---------- */

export function encodePrompt(opts: PromptOptions): string {
  const normalizedPrompt = {
    promptType: opts.promptType,
    schemaType: opts.promptType === "schema" ? opts.schemaType : "noSchema",
    userPrompt: (opts.userPrompt || "").trim(),
    model: opts.model,
    promptInputColumns: [...(opts.promptInputColumns || [])].sort(),
    responseOptions:
      opts.promptType === "schema" &&
      (opts.schemaType === "singleTag" || opts.schemaType === "multiTag")
        ? [...(opts.responseOptions || [])].sort()
        : undefined,
    responseSchema:
      opts.promptType === "schema" &&
      opts.schemaType === "freeForm" &&
      opts.responseSchema
        ? deepSort(opts.responseSchema)
        : undefined,
    ask: opts.promptType === "noSchema" ? opts.ask : undefined,
  };

  Object.keys(normalizedPrompt).forEach((k) => {
    if (normalizedPrompt[k as keyof typeof normalizedPrompt] === undefined) {
      delete normalizedPrompt[k as keyof typeof normalizedPrompt];
    }
  });

  return utf8ToBase64(JSON.stringify(normalizedPrompt));
}

export function decodePrompt(b64: string): PromptOptions {
  try {
    const json = base64ToUtf8(b64);
    const parsed = JSON.parse(json);
    if (!parsed.promptType) throw new Error("Invalid prompt");
    return parsed as PromptOptions;
  } catch (e) {
    console.error("decodePrompt:", e);
    return {
      promptType: "noSchema",
      userPrompt: "",
      model: DEFAULT_AI_MODEL,
      promptInputColumns: [],
      ask: false,
    };
  }
}

/* ---------- deep sort (unchanged) ---------- */

export function deepSort(obj: any): any {
  if (Array.isArray(obj)) return obj.map(deepSort);
  if (obj && typeof obj === "object") {
    const out: Record<string, any> = {};
    Object.keys(obj)
      .sort()
      .forEach((k) => (out[k] = deepSort(obj[k])));
    return out;
  }
  return obj;
}

/* ---------- template encode / decode ---------- */

export function encodeJsonSchema(jsonSchema: FormBuilderSchema): string {
  const normalized = deepSort(jsonSchema);
  return utf8ToBase64(JSON.stringify(normalized));
}

export function decodeJsonSchema(b64: string): any {
  try {
    const json = base64ToUtf8(b64);
    return JSON.parse(json);
  } catch (e) {
    console.error("decodeTemplate:", e);
    return { type: "object", properties: {} };
  }
}
// Create default prompt options
export const createDefaultPromptOptions = (
  promptType: "StructuredOutput" | "TextGeneration" | "ask" | "json" | "crawl",
): PromptOptions => {
  const baseOptions = {
    model: DEFAULT_AI_MODEL,
    userPrompt: "",
    promptInputColumns: [],
    ask: false,
    isCrawl: false,
  };

  switch (promptType) {
    case "StructuredOutput":
      return {
        ...baseOptions,
        promptType: "schema",
        schemaType: "singleTag",
        responseOptions: [],
      };
    case "TextGeneration":
      return {
        ...baseOptions,
        userPrompt: i18n.t(
          "modal_manager.column_modal_config.summarize_content",
        ),
        promptType: "noSchema",
        isCrawl: false,
      };
    case "ask":
      return {
        ...baseOptions,
        promptType: "noSchema",
        ask: true,
        isCrawl: false,
      };
    case "json":
      return {
        ...baseOptions,
        userPrompt: i18n.t("modal_manager.column_modal_config.extract_from"),
        promptType: "schema",
        schemaType: "freeForm",
        responseSchema: { type: "object", properties: {} },
      };
    case "crawl":
      return {
        ...baseOptions,
        promptType: "noSchema",
        isCrawl: true,
      };
    default:
      // Fallback to a safe default
      return {
        ...baseOptions,
        promptType: "schema",
        schemaType: "singleTag",
        responseOptions: [],
      };
  }
};

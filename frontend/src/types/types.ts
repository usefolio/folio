import { Id, Doc } from "../../convex/_generated/dataModel";
import type { CustomCell } from "@glideapps/glide-data-grid";
import {
  LoadingCellProps,
  FileCellProps,
  ErrorCellProps,
  ViewCreationRequest,
  ColumnProcessRequest,
} from "../interfaces/interfaces";

export type JSONSchema = {
  name?: string;
  schema?: JSONSchema;
  category?: JSONSchema;
  type?: string; // "string", "object", etc.
  properties?: Record<string, JSONSchema>;
  required?: string[];
  enum?: string[];
  items?: JSONSchema | JSONSchema[];
  strict?: boolean;
};

type ResponseFormat = {
  type: string;
  json_schema: JSONSchema;
};

type TextContent = {
  type: "text";
  text: string;
};

type Message = {
  role: "system" | "user" | "assistant"; // Define allowed roles
  content: TextContent[];
};

export enum LLMModelEnum {
  GPT41 = "gpt-4.1",
  GPT41_MINI = "gpt-4.1-mini",
  GPT41_NANO = "gpt-4.1-nano",
  GPT45_PREVIEW = "gpt-4.5-preview",
  GPT4O = "gpt-4o",
  GPT4O_MINI = "gpt-4o-mini",
  GPT4O_MINI_SEARCH = "gpt-4o-mini-search-preview",
  GPT35Turbo = "gpt-3.5-turbo",
  GPT5 = "gpt-5",
  GPT_O3 = "o3",
  GEMINI_25_FLASH = "gemini-2.5-flash",
}

export type LLMModel = `${LLMModelEnum}`;
export type TextGenerationPrompt = {
  model: string;
  messages: Message[];
  extraction_keyword: string;
};

export type StructuredOutputPrompt = {
  model: string;
  system_prompt: string;
  user_prompt_template: string;
  response_format: ResponseFormat;
  extraction_keyword: string;
};

export type SavedPrompt = {
  // The name of the column associated with the prompt
  columnName: string;
  projectId: string;
  projectName: string;
  promptOptions: PromptOptions;
  sourceSheetId?: Id<"sheet">;
};

export type ColumnVisibilityManagerProps = {
  columns: { _id: Id<"column">; name: string }[];
  hiddenColumns: Id<"column">[]; // Current hidden columns from SheetHandler
  toggleColumnVisibility: (columnId: Id<"column">, isVisible: boolean) => void; // Function from SheetHandler
  updateAllHiddenColumns: (hiddenColumns: Id<"column">[]) => void; // Function from SheetHandler
};
export type LoadingCell = CustomCell<LoadingCellProps>;

export type ErrorCell = CustomCell<ErrorCellProps>;
export type FileCell = CustomCell<FileCellProps>;
// The property being updated on the rule object within the Visual Query Builder
export type RuleKey = "column" | "operator" | "value" | "type";
// Logs
export type LogEntry = Doc<"log">;
export type LogLevel = LogEntry["severity"];
export type LogLevelLogger = "debug" | "info" | "warn" | "error";
export type TimeWindow = "5m" | "1h" | "24h" | "custom";
/**
 * This interface defines all the possible options that can be passed to generate a prompt.
 * It provides flexibility to override or customize the base prompt.
 */
export type PromptOptions =
  | TextGenerationPromptOptions
  | SingleTagPromptOptions
  | MultiTagPromptOptions
  | JsonOutputPromptOptions;
export interface BasePromptOptions {
  model: LLMModel;
  userPrompt: string;
  promptInputColumns: string[];
  ask?: boolean;
  isCrawl?: boolean;
}

/**
 * Options specific to Text Generation prompts.
 * This is used when the prompt type is TextGenerationPrompt.
 */
export interface TextGenerationPromptOptions extends BasePromptOptions {
  promptType: "noSchema";
}
export interface SingleTagPromptOptions extends BasePromptOptions {
  promptType: "schema";
  schemaType: "singleTag";
  responseOptions: string[]; // The valid enum items to choose from
  responseSchema?: never; // Not allowed here
}

export interface MultiTagPromptOptions extends BasePromptOptions {
  promptType: "schema";
  schemaType: "multiTag";
  responseOptions: string[]; // The valid enum items
  responseSchema?: never; // Not allowed here
}
export interface JsonOutputPromptOptions extends BasePromptOptions {
  promptType: "schema";
  schemaType: "freeForm";
  responseOptions?: never; // Not allowed here
  responseSchema: JSONSchema; // Must be present
}

export type Condition = {
  field: string;
  operator: string;
  value: string;
  isEditing: boolean;
};

export type LogicalOperator = "AND" | "OR";

export type Token = Condition | LogicalOperator | "(" | ")";

export type ModelInfo = {
  id: string;
  name: string;
  tokensUsed: number;
};

export type ProviderName = "openai" | "fal" | "marker" | "google_gemini";

const MODEL_PROVIDER_MAP: Record<LLMModelEnum, ProviderName> = {
  [LLMModelEnum.GPT41]: "openai",
  [LLMModelEnum.GPT41_MINI]: "openai",
  [LLMModelEnum.GPT41_NANO]: "openai",
  [LLMModelEnum.GPT45_PREVIEW]: "openai",
  [LLMModelEnum.GPT4O]: "openai",
  [LLMModelEnum.GPT4O_MINI]: "openai",
  [LLMModelEnum.GPT4O_MINI_SEARCH]: "openai",
  [LLMModelEnum.GPT35Turbo]: "openai",
  [LLMModelEnum.GPT5]: "openai",
  [LLMModelEnum.GPT_O3]: "openai",
  [LLMModelEnum.GEMINI_25_FLASH]: "google_gemini",
};

export const getProviderForModel = (model: LLMModel): ProviderName => {
  const enumKey = model as LLMModelEnum;
  return MODEL_PROVIDER_MAP[enumKey] ?? "openai";
};

const PROVIDER_DISPLAY_NAMES: Record<ProviderName, string> = {
  openai: "OpenAI",
  fal: "FAL",
  marker: "Marker",
  google_gemini: "Google Gemini",
};

export const getProviderDisplayName = (provider: ProviderName): string =>
  PROVIDER_DISPLAY_NAMES[provider] ?? provider;

export type ProviderInfo = {
  id: ProviderName;
  name: string;
  key: string;
  lastModified: Date;
  tokensUsed: number;
  models?: ModelInfo[];
};
export interface FormField {
  id: string;
  name: string;
  type: FieldType;
  children: FormField[];
  isExpanded?: boolean;
  description?: string;
}

export type FieldType = "text" | "number" | "email" | "tel" | "date" | "group";
// Union type for all workflow requests
export type WorkflowRequest = ViewCreationRequest | ColumnProcessRequest;

export type WorkflowType = "template" | "literal";

export type JsonSchemaBuilderTemplate = {
  id: string;
  name: string;
  schema: JSONSchema;
  isBuiltIn?: boolean;
  projectId?: Id<"project">;
};

export type BackendSavedJsonSchemas = {
  id: string;
  name: string;
  schema: JSONSchema;
  projectId: Id<"project">;
};

export type FormBuilderSchema = JSONSchema & {
  fields: FormField[];
};

export type UISavedJsonSchema = {
  id: string;
  name: string;
  schema: JSONSchema & { fields: FormField[] }; // Schema enhanced with fields for UI
  projectId: Id<"project">;
};

// Billing plans
export type BillingPlanId = "basic" | "premium" | "pro";

// Type guard to validate backend plan ids
export const isBillingPlanId = (value: unknown): value is BillingPlanId =>
  value === "basic" || value === "premium" || value === "pro";

// Normalizes backend values to a BillingPlanId (accepts canonical names)
export const normalizeBillingPlan = (
  value: unknown,
): BillingPlanId | null => {
  if (value === "basic" || value === "premium" || value === "pro")
    return value as BillingPlanId;
  return null;
};

// Resolves a plan id from a billing summary object (plan_id or plan_name),
// defaulting to "basic" for unknown or free tiers.
export const resolvePlanIdFromSummary = (
  summary:
    | {
        plan_id?: BillingPlanId | string | null;
        plan_name?: string | null;
      }
    | null,
): BillingPlanId => {
  const pid = (summary?.plan_id || "").toString().toLowerCase();
  if (pid === "premium") return "premium";
  if (pid === "pro") return "pro";
  if (pid === "basic") return "basic";
  const name = (summary?.plan_name || "").toLowerCase();
  if (name === "premium") return "premium";
  if (name === "pro") return "pro";
  return "basic";
};

// Generic per-upload limit type used across the app
export type UploadLimit = number | "unlimited";

export type ModalType =
  | "column"
  | "newProject"
  | "showPrompt"
  | "export"
  | "settings"
  | "summary"
  | "schedule"
  | "alert"
  | null;

// Updated token type to include formatted parts
export type FilterToken = {
  type: "condition" | "operator" | "parenthesis";
  value: string;
  // For conditions, split into parts for formatting
  parts?: {
    field: string;
    operator: string;
    value: string;
  };
};

// Scheduling modal types
export type DestinationType = "email" | "api";
export type OutputFormat = "csv" | "markdown" | "pdf";
export type IntervalUnit = "minutes" | "hours" | "days";

export type ScheduledActionData = {
  searchQuery: string;
  workflow: string;
  interval: number;
  intervalUnit: IntervalUnit;
  destinationType: DestinationType;
  destination: string;
  outputFormat: OutputFormat;
  prompt?: PromptOptions;
  model?: string;
};
// Alert type
export type AlertData = {
  name: string;
  description?: string;
  conditions: string;
  queryBuilderState?: string;
  frequency: "immediate" | "hourly" | "daily" | "weekly";
  email: string;
};
// Alert validation errors
export type AlertFormErrors = {
  alertName?: string;
  email?: string;
};

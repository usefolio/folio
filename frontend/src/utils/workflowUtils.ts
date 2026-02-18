import { PromptOptions } from "@/types/types";
import { ColumnType, ColumnSubType } from "@/types/columns";
import { QueryBuilderState } from "@/interfaces/interfaces";
import { WorkflowNode } from "@/interfaces/interfaces";
import { TFunction } from "i18next";
import { DEFAULT_AI_MODEL } from "@/constants";
import { LLMModel } from "@/types/types";

export function mapNodeTypeToPromptType(type?: string): "schema" | "noSchema" {
  switch (type) {
    case "tag":
    case "extract":
      return "schema";
    case "summary":
    case "ask":
    default:
      return "noSchema";
  }
}

export function mapNodeTypeToSchemaType(
  type?: string,
): "singleTag" | "multiTag" | "freeForm" | undefined {
  switch (type) {
    case "tag":
      return "singleTag";
    case "extract":
      return "freeForm";
    default:
      return undefined;
  }
}

export function mapPromptTypeToNodeType(
  prompt: PromptOptions,
): "tag" | "summary" | "ask" | "extract" {
  if (prompt.promptType === "schema") {
    if (prompt.schemaType === "singleTag" || prompt.schemaType === "multiTag")
      return "tag";
    if (prompt.schemaType === "freeForm") return "extract";
  }
  return prompt.ask ? "ask" : "summary";
}

export function mapNodeTypeToColumnType(type?: string): ColumnType {
  switch (type) {
    case "tag":
    case "extract":
      return "schema";
    case "summary":
    case "ask":
      return "noSchema";
    default:
      return null;
  }
}

export function mapNodeTypeToColumnSubtype(
  type?: string,
  tagMode?: "singleTag" | "multiTag",
): ColumnSubType {
  switch (type) {
    case "tag":
      return tagMode || "singleTag"; // Use the tagMode if provided
    case "extract":
      return "freeForm";
    case "summary":
    case "ask":
    default:
      return null;
  }
}
/**
 * Generates a pre-configured QueryBuilderState for views.
 * This function creates the initial query state for tag views with a LIKE operator.
 * This is currently in stasis as we disallowed editing views that are already added to the workflow
 * Has to be modified to support all created views in workflow not only views created from tags.
 */
export const generateQueryBuilderState = (
  field: string,
  value: string,
): QueryBuilderState => {
  return {
    tokens: [
      { field: field, operator: "LIKE", value: value, isEditing: false },
    ],
    currentCondition: { field: "", operator: "", value: "", isEditing: true },
    showOperators: false,
  };
};
// Generate default state for the workflow
export const createDefaultQueryBuilderStateBackend = () => ({
  tokens: [],
  currentCondition: { field: "", operator: "=", value: "", isEditing: false },
  showOperators: false,
  isAddingCondition: false,
  constructedQueryVisible: false,
});
/**
 * Validates a column node
 */
export const validateColumnNode = (
  node: WorkflowNode,
  t: TFunction,
): string | null => {
  if (!node.label) {
    return t("workflow.validation.column_missing_name");
  }
  if (!node.summary || node.summary === "") {
    return t("workflow.validation.column_missing_prompt", { name: node.label });
  }
  if (!node.inputCols || node.inputCols.length === 0) {
    return t("workflow.validation.no_mentions_error_message", {
      name: node.label,
    });
  }
  switch (node.type) {
    case "tag":
      if (!node.tags) {
        return t("workflow.validation.tag_missing_options", {
          name: node.label,
        });
      }
      break;
    case "extract":
      if (
        !node.responseSchema ||
        Object.keys(node.responseSchema.properties || {}).length === 0
      ) {
        return t("workflow.validation.extract_missing_schema", {
          name: node.label,
        });
      }
      break;
  }
  return null;
};

/**
 * UPDATED: Validates a view node
 */
export const validateViewNode = (
  node: WorkflowNode,
  t: TFunction,
): string | null => {
  if (!node.label) {
    return t("workflow.validation.view_missing_name");
  }
  if (!node.sql_condition || node.sql_condition.trim() === "") {
    return t("workflow.validation.view_missing_condition", {
      name: node.label,
    });
  }
  return null;
};
/**
 * Clean and validate workflow JSON data
 * Handles various escaping issues and ensures valid JSON structure
 */
export class WorkflowJsonCleaner {
  /**
   * Clean a JSON string by fixing common escaping issues
   */
  static cleanJsonString(jsonString: string): string {
    try {
      // First, try to parse as-is
      JSON.parse(jsonString);
      return jsonString;
    } catch (_error) {
      // If parsing fails, apply cleaning
      return this.applyCleaningStrategies(jsonString);
    }
  }

  /**
   * Apply various cleaning strategies to fix JSON issues
   */
  private static applyCleaningStrategies(jsonString: string): string {
    let cleaned = jsonString;

    // Strategy 1: Fix escaped quotes
    cleaned = this.fixEscapedQuotes(cleaned);

    // Strategy 2: Fix SQL conditions specifically
    cleaned = this.fixSqlConditions(cleaned);

    // Strategy 3: Validate and fix structure
    cleaned = this.validateAndFixStructure(cleaned);

    return cleaned;
  }

  /**
   * Fix various quote escaping issues
   */
  private static fixEscapedQuotes(str: string): string {
    // Replace double-escaped quotes with single-escaped
    let fixed = str.replace(/\\\\"/g, '\\"');

    // Replace unnecessary escaped single quotes
    fixed = fixed.replace(/\\'/g, "'");

    return fixed;
  }

  /**
   * Fix SQL condition fields specifically
   */
  private static fixSqlConditions(jsonString: string): string {
    // Parse SQL conditions more carefully
    const sqlConditionRegex = /"sql_condition"\s*:\s*"([^"\\]*(\\.[^"\\]*)*)"/g;

    return jsonString.replace(sqlConditionRegex, (_match, content) => {
      // Clean the SQL condition content
      const cleaned = content
        .replace(/\\\\/g, "\\") // \\ -> \
        .replace(/\\'/g, "'") // \' -> '
        .replace(/\\"/g, '"'); // \" -> "

      // Properly escape only double quotes for JSON
      const escaped = cleaned.replace(/"/g, '\\"');

      return `"sql_condition":"${escaped}"`;
    });
  }

  /**
   * Validate and fix JSON structure
   */
  private static validateAndFixStructure(jsonString: string): string {
    try {
      // Attempt to parse and identify specific issues
      const parsed = JSON.parse(jsonString);
      return JSON.stringify(parsed);
    } catch (_error) {
      // If still failing, try more aggressive fixes
      return this.aggressiveFix(jsonString);
    }
  }

  /**
   * More aggressive fixing for severely malformed JSON
   */
  private static aggressiveFix(jsonString: string): string {
    // Remove any BOM characters
    let fixed = jsonString.replace(/^\uFEFF/, "");

    // Fix common JSON syntax errors
    fixed = fixed
      .replace(/,\s*}/g, "}") // Remove trailing commas before }
      .replace(/,\s*]/g, "]") // Remove trailing commas before ]
      .replace(/}\s*{/g, "},{") // Add comma between objects
      .replace(/]\s*\[/g, "],["); // Add comma between arrays

    // Try to parse again
    try {
      const parsed = JSON.parse(fixed);
      return JSON.stringify(parsed);
    } catch (error) {
      throw new Error(
        `Unable to clean JSON: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }
  /**
   * Remove duplicate columns within each view
   */
  static removeDuplicateColumns(workflowData: WorkflowNode[]): WorkflowNode[] {
    return workflowData.map((node) => this.deduplicateNode(node));
  }

  /**
   * Remove duplicate columns from a single node and its children
   */
  private static deduplicateNode(node: WorkflowNode): WorkflowNode {
    const deduped: WorkflowNode = { ...node };

    // If this is a view with children, deduplicate the columns
    if (node.isView && node.children && node.children.length > 0) {
      const seen = new Map<string, WorkflowNode>();
      const uniqueChildren: WorkflowNode[] = [];

      for (const child of node.children) {
        // Create a unique key based on label, type, and summary
        const key = `${child.label}-${child.type}-${child.summary || ""}`;

        if (!seen.has(key)) {
          seen.set(key, child);
          // Recursively deduplicate the child as well
          uniqueChildren.push(this.deduplicateNode(child));
        } else {
          console.log(
            `Removing duplicate column "${child.label}" from view "${node.label}"`,
          );
        }
      }

      deduped.children = uniqueChildren;
    } else if (node.children && node.children.length > 0) {
      // Recursively process non-view nodes
      deduped.children = node.children.map((child) =>
        this.deduplicateNode(child),
      );
    }

    return deduped;
  }
  /**
   * Remove Convex-specific IDs from workflow data
   */
  static removeConvexIds(workflowData: WorkflowNode[]): WorkflowNode[] {
    return workflowData.map((node) => this.cleanNode(node));
  }

  /**
   * Clean a single workflow node
   */
  private static cleanNode(node: WorkflowNode): WorkflowNode {
    const cleaned: WorkflowNode = {
      ...node,
      convexId: undefined,
      convexSheetId: undefined,
    };

    // Recursively clean children
    if (cleaned.children && cleaned.children.length > 0) {
      cleaned.children = cleaned.children.map((child) => this.cleanNode(child));
    }

    return cleaned;
  }

  /**
   * Validate workflow structure
   */
  static validateWorkflow(data: WorkflowNode[]) {
    if (!Array.isArray(data)) {
      return false;
    }

    return data.every((node) => this.isValidNode(node));
  }

  /**
   * Check if a node is valid - now more lenient to allow incomplete nodes
   */
  private static isValidNode(node: WorkflowNode): node is WorkflowNode {
    // Basic structure validation
    if (typeof node !== "object" || !node) {
      return false;
    }

    // Only require id to be present - label and other fields can be missing
    // This allows importing incomplete workflows that can be fixed in the UI
    if (!node.id) {
      return false;
    }

    // If it has children, validate them recursively
    if (node.children) {
      if (!Array.isArray(node.children)) {
        return false;
      }
      return node.children.every((child: WorkflowNode) =>
        this.isValidNode(child),
      );
    }

    return true;
  }

  /**
   * Main entry point for cleaning and validating workflow JSON
   */
  static cleanAndValidate(
    jsonString: string,
    options?: { removeDuplicates?: boolean },
  ): WorkflowNode[] {
    // Step 1: Clean the JSON string
    const cleanedString = this.cleanJsonString(jsonString);

    // Step 2: Parse the JSON
    const parsed = JSON.parse(cleanedString);

    // Step 3: Validate the structure
    if (!this.validateWorkflow(parsed)) {
      throw new Error("Invalid workflow structure");
    }
    // Step 4: Remove Convex IDs
    let cleaned = this.removeConvexIds(parsed);
    // Step 5: Deduplicate entries, enabled by default
    if (options?.removeDuplicates !== false) {
      cleaned = this.removeDuplicateColumns(cleaned);
    }
    return cleaned;
  }
}

export const generateClientNodeId = (prefix: string = "cNode"): string =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;

export const findNodeById = (
  nodes: WorkflowNode[],
  id: string,
): WorkflowNode | null => {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.isView && node.children?.length) {
      const found = findNodeById(node.children, id);
      if (found) return found;
    }
  }
  return null;
};

export const updateNodesRecursively = (
  nodes: WorkflowNode[],
  nodeId: string,
  updater: (node: WorkflowNode) => WorkflowNode,
): WorkflowNode[] => {
  return nodes.map((node) => {
    if (node.id === nodeId) return updater(node);
    if (node.isView && node.children?.length) {
      return {
        ...node,
        children: updateNodesRecursively(node.children, nodeId, updater),
      };
    }
    return node;
  });
};

export const createPromptOptions = (
  node: Partial<WorkflowNode>,
): PromptOptions | undefined => {
  const model = (node.model || DEFAULT_AI_MODEL) as LLMModel;
  const userPrompt = node.summary || "";
  const inputCols = node.inputCols || [];
  switch (node.type) {
    case "tag": {
      if (!node.tags) {
        return {
          model,
          promptType: "schema" as const,
          userPrompt,
          responseOptions: [""],
          schemaType: node.tagMode,
          promptInputColumns: inputCols,
        } as PromptOptions;
      }
      const responseOptions = node.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const tagOptionsBase = {
        model,
        promptType: "schema" as const,
        userPrompt,
        responseOptions,
        promptInputColumns: inputCols,
      };
      return node.tagMode === "multiTag"
        ? ({
            ...tagOptionsBase,
            schemaType: "multiTag" as const,
          } as PromptOptions)
        : ({
            ...tagOptionsBase,
            schemaType: "singleTag" as const,
          } as PromptOptions);
    }
    case "extract":
      if (!node.responseSchema) return undefined;
      return {
        model,
        promptType: "schema" as const,
        schemaType: "freeForm" as const,
        userPrompt,
        responseSchema: node.responseSchema,
        promptInputColumns: inputCols,
      } as PromptOptions;
    case "summary":
    case "ask":
      return {
        model,
        promptType: "noSchema" as const,
        userPrompt,
        promptInputColumns: inputCols,
        ask: node.type === "ask",
      } as PromptOptions;
    default:
      console.warn(
        `createPromptOptions: Unknown node type "${node.type}" for node label "${node.label}"`,
      );
      return undefined;
  }
};

export const createDefaultQueryBuilderState = (): QueryBuilderState => ({
  tokens: [],
  currentCondition: { field: "", operator: "=", value: "", isEditing: false },
  showOperators: false,
  isAddingCondition: false,
  constructedQueryVisible: false,
});

export const countNodes = (nodes: WorkflowNode[]): number => {
  let count = 0;
  const traverse = (nodeList: WorkflowNode[]) => {
    nodeList.forEach((node) => {
      count++;
      if (node.isView && node.children) {
        traverse(node.children);
      }
    });
  };
  traverse(nodes);
  return count;
};

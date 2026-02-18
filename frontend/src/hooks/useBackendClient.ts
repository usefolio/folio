import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useJamsocket } from "@/context/JamsocketContext";
import { BackendClient } from "@/backend/BackendClient";
import { api } from "../../convex/_generated/api";
import { encodeJsonSchema, encodePrompt, deepSort } from "@/utils/promptUtils";
import type { Id, Doc } from "convex/_generated/dataModel";
import type { ColumnSubType, ColumnType } from "@/types/columns";
import type {
  ServiceCredential,
  SheetObject,
  WorkflowNode,
} from "@/interfaces/interfaces";
import type { BillingSummary } from "@/types/billing";
import type {
  WorkflowRequest,
  WorkflowType,
  PromptOptions,
  FormBuilderSchema,
  TextGenerationPrompt,
  StructuredOutputPrompt,
  SingleTagPromptOptions,
  MultiTagPromptOptions,
  JsonOutputPromptOptions,
} from "@/types/types";
import {
  createPromptOptions,
  mapNodeTypeToColumnSubtype,
  mapNodeTypeToColumnType,
  WorkflowJsonCleaner,
  countNodes,
} from "@/utils/workflowUtils";
import { DEFAULT_SYSTEM_PROMPT } from "@/constants";
import { Logger } from "@/utils/Logger";
import { useConvex } from "convex/react";
import { useFreshToken } from "@/hooks/useFreshToken";

// (intentionally no caching here; each consumer fetches independently)

interface UploadResponse {
  columns: Id<"column">[];
  job_id: string;
  rows?: string[];
}
interface CreateViewResponse {
  items_to_process: number;
}
interface FetchUploadUrlResponse {
  url: string;
  guid: string;
}
interface FetchBulkUploadUrlsResponse {
  urls: Record<string, string>;
}

export interface RunWorkflowResponse {
  workflow_id: string;
  status: string;
  message?: string;
}

/**
 * A centralized hook for all backend interactions.
 * This hook consolidates logic for communicating with both the Convex backend
 * and external processing services (via Jamsocket or without depending on the configuration). It provides a memoized API
 * object to prevent re-creation on every render, ensuring stable function references.
 */

export const useBackendClient = () => {
  const getToken = useFreshToken();
  const { t } = useTranslation();
  const { projectBackendUrls } = useJamsocket();
  const convex = useConvex();
  const client = useMemo(() => new BackendClient({ convex, t }), [convex, t]);
  const defaultBackendUrl = import.meta.env.VITE_URL_PROCESSING_BACKEND;
  const isViteEnv = typeof import.meta.env !== "undefined";
  const convexHttpUrl = isViteEnv
    ? (import.meta.env.VITE_CONVEX_URL?.replace(/\.cloud$/, ".site") ?? "")
    : (process.env.CONVEX_URL?.replace(/\.cloud$/, ".site") ?? "");
  /**
   * An internal helper function to create a log entry in the database.
   * This abstracts the api.logs.create mutation call.
   * project_id - The ID of the project where the log will be added.
   * text - The main content of the log message.
   * type - The type of the log (e.g., 'success', 'error').
   * details - Optional additional details for the log entry.
   */
  const createLog = async (
    // The ID of the project where the log will be added
    project_id: Id<"project">,
    // Text of the log
    message: string,
    // Type of the log (info, error, warning)
    severity: "ERROR" | "WARN" | "INFO" | "DEBUG" | "TRACE",
    details?: string,
    service?: string,
    attributes?: any,
  ) => {
    try {
      const mutation = await convex.mutation(api.logs.create, {
        project_id: project_id,
        message: message,
        severity: severity,
        details: details,
        service: service,
        attributes: attributes,
      });
      return mutation;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t("global.unknown_error");
      throw new Error(
        t("services.create_log_service.log_creation_error", {
          error: message,
        }),
      );
    }
  };

  /**
   * A helper that builds a structured prompt object for the AI model.
   * This function is synchronous and acts as a builder based on provided options.
   * options - The configuration for the prompt.
   * customSystemPrompt - An optional override for the default system prompt.
   * returns a StructuredOutputPrompt or TextGenerationPrompt object.
   */
  const generatePrompt = (
    options: PromptOptions,
    customSystemPrompt?: string,
  ): StructuredOutputPrompt | TextGenerationPrompt => {
    const logger = new Logger({
      service: "useBackendClient - generatePrompt",
    });

    const { userPrompt, model } = options;
    const SYSTEM_PROMPT = customSystemPrompt || DEFAULT_SYSTEM_PROMPT;
    const extraction_keyword = "extraction_keyword"; // This just needs to be a consistent string

    // This internal function builds the final prompt structure
    function buildPrompt(): StructuredOutputPrompt | TextGenerationPrompt {
      if (options.promptType === "schema") {
        if (options.schemaType === "singleTag") {
          const tagOptions = options as SingleTagPromptOptions;
          const responseOptions = tagOptions.responseOptions || [];
          return {
            model: model,
            system_prompt: SYSTEM_PROMPT,
            user_prompt_template: userPrompt,
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "Classification",
                schema: {
                  type: "object",
                  properties: {
                    [extraction_keyword]: {
                      type: "string",
                      enum: responseOptions,
                    },
                  },
                  required: [extraction_keyword],
                },
              },
            },
            extraction_keyword: extraction_keyword,
          };
        }
        if (options.schemaType === "multiTag") {
          const tagOptions = options as MultiTagPromptOptions;
          const responseOptions = tagOptions.responseOptions || [];
          return {
            model: model,
            system_prompt: SYSTEM_PROMPT,
            user_prompt_template: userPrompt,
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "Classification",
                schema: {
                  type: "object",
                  properties: {
                    [extraction_keyword]: {
                      type: "array",
                      items: { type: "string", enum: responseOptions },
                    },
                  },
                  required: [extraction_keyword],
                },
              },
            },
            extraction_keyword: extraction_keyword,
          };
        }
        if (options.schemaType === "freeForm") {
          const jsonOptions = options as JsonOutputPromptOptions;
          return {
            model: model,
            system_prompt:
              "You are an AI assistant that extracts structured information from text based on a provided JSON schema.",
            user_prompt_template:
              userPrompt ||
              "Extract the structured information according to the schema.",
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "DataExtraction",
                schema: jsonOptions.responseSchema,
                strict: true,
              },
            },
            extraction_keyword: extraction_keyword,
          };
        }
        throw new Error(
          t("services.generate_prompt.unsupported_schema_type", {
            schemaType: (options as any).schemaType,
          }),
        );
      } else if (options.promptType === "noSchema") {
        return {
          model: model,
          messages: [
            {
              role: "system",
              content: [{ type: "text", text: SYSTEM_PROMPT }],
            },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `Please follow the instruction in the following prompt: ${userPrompt}`,
                },
              ],
            },
          ],
          extraction_keyword: extraction_keyword,
        };
      } else {
        throw new Error(
          t("services.generate_prompt.unsupported_prompt_type", {
            promptType: (options as any).promptType,
          }),
        );
      }
    }

    const finalPrompt = buildPrompt();
    logger.debug("Generated Prompt Structure:", {
      structure: JSON.stringify(finalPrompt, null, 2),
    });
    return finalPrompt;
  };
  const clientApiEndpoints = useMemo(() => {
    const getBackendUrlForProject = (projectId: Id<"project">): string => {
      return projectBackendUrls.get(projectId) || defaultBackendUrl;
    };

    return {
      createLog: createLog,
      generatePrompt: generatePrompt,
      /**
       * Fetches full billing summary from the processing backend.
       */
      getBillingSummary: async () => {
        const token = await getToken();
        if (!token) throw new Error(t("global.auth_token_not_found"));
        if (!defaultBackendUrl)
          throw new Error(
            t("services.use_backend_client.missing_context", {
              context: "getBillingSummary - missing processing backend URL",
            }),
          );
        return client.request<BillingSummary>(
          defaultBackendUrl,
          "/billing/summary",
          undefined,
          token,
          "GET",
        );
      },
      /**
       * Provisions a demo billing plan for the current user.
       */
      setupDemoPlan: async (payload: Record<string, unknown> = {}) => {
        const token = await getToken();
        if (!token) throw new Error(t("global.auth_token_not_found"));
        if (!defaultBackendUrl)
          throw new Error(
            t("services.use_backend_client.missing_context", {
              context: "setupDemoPlan - missing processing backend URL",
            }),
          );
        return client.request<BillingSummary>(
          defaultBackendUrl,
          "/billing/demo",
          payload,
          token,
        );
      },
      /**
       * Creates a new column, sends the processing request to the backend,
       * and updates the new column's cells with the results. Replaces columnService.ts
       */
      createProject: async (projectName: string) => {
        const token = await getToken({ template: "convex" });
        if (!token) throw new Error("Authentication token not found");
        return client.request<{ projectId: Id<"project"> }>(
          convexHttpUrl,
          "/projects",
          { name: projectName },
          token,
          "POST",
        );
      },

      deleteProject: async (projectId: Id<"project">) => {
        const token = await getToken({ template: "convex" });
        if (!token) throw new Error("Authentication token not found");
        return client.request(
          convexHttpUrl,
          `/projects`,
          { projectId },
          token,
          "DELETE",
        );
      },

      createSheet: async (
        name: string,
        filter: string,
        projectId: Id<"project">,
        hiddenColumns: Id<"column">[],
      ) => {
        const token = await getToken({ template: "convex" });
        if (!token) throw new Error("Authentication token not found");
        return client.request<{ sheetId: Id<"sheet"> }>(
          convexHttpUrl,
          "/sheets",
          { name, filter, projectId, hiddenColumns },
          token,
          "POST",
        );
      },

      deleteSheet: async (sheetId: Id<"sheet">) => {
        const token = await getToken({ template: "convex" });
        if (!token) throw new Error("Authentication token not found");
        return client.request(
          convexHttpUrl,
          `/sheets`,
          { sheetId },
          token,
          "DELETE",
        );
      },

      createColumn: async (args: {
        columnName: string;
        promptOptions: PromptOptions;
        project_id: Id<"project">;
        sheet: Doc<"sheet">;
        serviceCredentials: ServiceCredential[] | null;
        systemPrompt: Doc<"system_settings">;
      }) => {
        if (!args.project_id || !args.sheet || !convexHttpUrl)
          throw new Error(
            t("services.use_backend_client.missing_context", {
              context:
                "createColumn - missing project id or convex callback url or sheet data",
            }),
          );
        const token = await getToken();
        const convexToken = await getToken({ template: "convex" });
        if (!token || !convexToken)
          throw new Error(t("global.auth_token_not_found"));

        const { columnName, promptOptions } = args;
        const columnPrompt = generatePrompt(
          promptOptions,
          args.systemPrompt?.value,
        );
        const encodedPromptVal = encodePrompt(promptOptions);

        let columnType: ColumnType;
        let columnSubType: ColumnSubType | null;
        let encodedJsonSchema: string | undefined;

        if (promptOptions.promptType === "schema") {
          columnType = "schema";
          if (promptOptions.schemaType === "freeForm") {
            columnSubType = "freeForm";
            encodedJsonSchema = encodeJsonSchema(
              deepSort(promptOptions.responseSchema),
            );
          } else {
            columnSubType = promptOptions.schemaType;
          }
        } else {
          columnType = "noSchema";
          columnSubType = null;
        }

        let newColumnId: Id<"column"> | null = null;
        try {
          newColumnId = await client.request(
            convexHttpUrl,
            `/columns`,
            {
              name: columnName,
              column_type: columnType,
              column_subtype: columnSubType,
              project_id: args.project_id,
              prompt: encodedPromptVal,
              jsonSchema: encodedJsonSchema,
              created_on_sheet_id: args.sheet._id,
            },
            convexToken,
            "POST",
          );

          const apiKeys: Record<string, string> = {};
          args.serviceCredentials?.forEach((cred) => {
            apiKeys[cred.service] = cred.apiKey;
          });

          const payload = {
            convex_project_id: args.project_id,
            convex_column_id: newColumnId,
            column_name: columnName,
            prompt: columnPrompt,
            sql_condition: args.sheet.filter ?? "",
            callback_url: convexHttpUrl,
            output_name: columnPrompt.extraction_keyword,
            prompt_input_columns: promptOptions.promptInputColumns,
            api_keys: apiKeys,
          };

          const baseUrl = getBackendUrlForProject(args.project_id);
          const responseData = await client.request<{ cell_states: string }>(
            baseUrl,
            "/process",
            payload,
            token,
          );

          const cell_states = JSON.parse(responseData.cell_states);
          await convex.mutation(api.columns.setColumnCells, {
            column: String(newColumnId) as Id<"column">,
            states: cell_states.buffer,
          });
          await createLog(
            args.project_id,
            t("services.create_column_service.log_success_create_column", {
              columnName,
              promptType: columnType,
              prompt: promptOptions.userPrompt,
            }),
            "INFO",
            "",
            "createColumnService",
            {},
          );
          return newColumnId;
        } catch (error) {
          if (newColumnId)
            await client.request(
              convexHttpUrl,
              `/columns`,
              { columnId: newColumnId },
              convexToken,
              "DELETE",
            );
          const message =
            error instanceof Error ? error.message : t("global.unknown_error");
          await createLog(
            args.project_id!,
            t("services.create_column_service.log_error_create_column", {
              columnName,
              promptType: promptOptions.promptType,
              prompt: promptOptions.userPrompt,
              error: message,
            }),
            "ERROR",
            "",
            "createColumnService",
          );
          throw error;
        }
      },

      deleteColumn: async (columnId: Id<"column">) => {
        const token = await getToken({ template: "convex" });
        if (!token) throw new Error("Authentication token not found");
        return client.request(
          convexHttpUrl,
          `/columns`,
          { columnId },
          token,
          "DELETE",
        );
      },
      /**
       * Calculates the estimated cost of running an enrichment for a new column
       * by calling the backend's estimation endpoint. Replaces calculateCostService.ts
       */
      calculateCost: async (args: {
        columnName: string;
        promptOptions: PromptOptions;
        signal: AbortSignal;
        project_id: Id<"project">;
        sheet: Doc<"sheet">;
      }) => {
        if (!args.project_id || !args.sheet || !convexHttpUrl)
          throw new Error(
            t("services.use_backend_client.missing_context", {
              context:
                "calculateCost - missing project id or convex callback url or sheet data",
            }),
          );
        const token = await getToken();
        if (!token) throw new Error(t("global.auth_token_not_found"));

        const columnPrompt = generatePrompt(args.promptOptions);
        const payload = {
          convex_project_id: args.project_id,
          convex_column_id: "jd73kcvrs4dhnstpkz8trkhq9n7cr1hu" as Id<"column">,
          column_name: args.columnName,
          prompt: columnPrompt,
          sql_condition: args.sheet.filter ?? "",
          callback_url: convexHttpUrl,
          output_name: columnPrompt.extraction_keyword,
          prompt_input_columns: args.promptOptions.promptInputColumns,
        };

        const baseUrl = getBackendUrlForProject(args.project_id);
        return client.request<{ total_tokens: number; total_price: number }>(
          baseUrl,
          "/process/estimate_cost",
          payload,
          token,
          "POST",
          args.signal,
        );
      },
      /**
       * Triggers the backend to create a new view (sheet) with set sqlCondition. Replaces viewService.ts
       */
      createView: async (args: {
        viewName: string;
        filterCondition: string;
        newSheetId: Id<"sheet">;
        project_id: Id<"project">;
      }) => {
        // The hook no longer uses `sheet` from context for this call.
        if (!args.project_id || !convexHttpUrl)
          throw new Error(
            t("services.use_backend_client.missing_context", {
              context: "createView - missing project id or convex callback url",
            }),
          );
        const token = await getToken();
        if (!token) throw new Error(t("global.auth_token_not_found"));

        const payload = {
          convex_project_id: args.project_id,
          convex_sheet_id: args.newSheetId,
          sql_filter: args.filterCondition,
          callback_url: convexHttpUrl,
        };

        const baseUrl = getBackendUrlForProject(args.project_id);
        try {
          const response_body = await client.request<CreateViewResponse>(
            baseUrl,
            "/create_view",
            payload,
            token,
          );
          await createLog(
            args.project_id,
            t("services.create_view_service.log_successful_view_creation", {
              view_name: args.viewName,
              nr_of_rows: response_body.items_to_process.toString(),
            }),
            "INFO",
            "",
            "createViewService",
          );
          return response_body;
        } catch (error) {
          const message =
            error instanceof Error ? error.message : t("global.unknown_error");
          await createLog(
            args.project_id,
            t("services.create_view_service.request_error", { error: message }),
            "ERROR",
            `filter condition: ${args.filterCondition}`,
            "createViewService",
          );
          throw error;
        }
      },
      /**
       * Requests an export of selected data from the backend.
       * The backend will process the data and return a download URL. Replaces exportService.ts
       */
      exportData: async (args: {
        sheet_objects: SheetObject[];
        signal: AbortSignal;
        project_id: Id<"project">;
      }) => {
        if (!args.project_id || !convexHttpUrl)
          throw new Error(
            t("services.use_backend_client.missing_context", {
              context: "exportData - missing project id or convex callback url",
            }),
          );
        const token = await getToken();
        if (!token) throw new Error(t("global.auth_token_not_found"));

        const payload = {
          convex_project_id: args.project_id,
          callback_url: convexHttpUrl,
          sheet_objects: args.sheet_objects,
        };

        const baseUrl = getBackendUrlForProject(args.project_id);
        return client.request<{ url: string }>(
          baseUrl,
          "/export",
          payload,
          token,
          "POST",
          args.signal,
        );
      },
      /**
       * Sends a complete workflow (a series of view and process requests) to the backend for execution.
       * Replaces runWorkflowService.ts
       */
      runWorkflow: async (args: {
        requests: WorkflowRequest[];
        workflowType: WorkflowType;
        signal: AbortSignal;
        project_id: Id<"project">;
      }) => {
        if (!args.project_id || !convexHttpUrl)
          throw new Error(
            t("services.use_backend_client.missing_context", {
              context:
                "runWorkflow - missing project id or convex callback url",
            }),
          );
        const token = await getToken();
        if (!token) throw new Error(t("global.auth_token_not_found"));

        const payload = {
          requests: args.requests,
          workflow_type: args.workflowType,
          callback_url: convexHttpUrl,
        };

        const baseUrl = getBackendUrlForProject(args.project_id);
        return client.request<RunWorkflowResponse>(
          baseUrl,
          "/run_workflow",
          payload,
          token,
          "POST",
          args.signal,
        );
      },
      /**
       * Fetches a secure, signed URL from the backend for direct file uploading.
       */
      fetchUploadUrl: async (args: {
        file: File;
        project_id: Id<"project">;
      }) => {
        if (!args.project_id)
          throw new Error(
            t("services.use_backend_client.missing_context", {
              context: "fetchUplodUrl - missing project id",
            }),
          );
        const token = await getToken();
        if (!token) throw new Error(t("global.auth_token_not_found"));

        const isStructured =
          args.file.name.toLowerCase().endsWith(".csv") ||
          args.file.name.toLowerCase().endsWith(".parquet");
        // Sanitize the filename for object storage safety
        const { sanitizeFileName } = await import("@/utils/fileNameUtils");
        const safeName = sanitizeFileName(args.file.name);
        const payload = isStructured
          ? { fileName: safeName }
          : { fileName: safeName, content_type: args.file.type };

        const baseUrl = getBackendUrlForProject(args.project_id);
        return client.request<FetchUploadUrlResponse>(
          baseUrl,
          "/asset_storage/upload_url",
          payload,
          token,
        );
      },
      /**
       * Fetches multiple secure, signed URLs for bulk file uploading.
       */
      fetchBulkUploadUrls: async (args: {
        fileType: string;
        count: number;
        project_id: Id<"project">;
      }) => {
        if (!args.project_id)
          throw new Error(
            t("services.use_backend_client.missing_context", {
              context: "fetchBulkUploadUrls - missing project id",
            }),
          );
        const token = await getToken();
        if (!token) throw new Error(t("global.auth_token_not_found"));
        const payload = { count: args.count, content_type: args.fileType };
        const baseUrl = getBackendUrlForProject(args.project_id);
        return client.request<FetchBulkUploadUrlsResponse>(
          baseUrl,
          "/asset_storage/bulk_upload_url",
          payload,
          token,
        );
      },
      /**
       * Notifies the backend to process a file that has already been uploaded via a signed URL.
       */
      uploadFileWithId: async (args: {
        projectId: Id<"project">;
        fileId: string;
        fileName: string;
      }): Promise<UploadResponse> => {
        if (!convexHttpUrl)
          throw new Error(
            t("services.use_backend_client.missing_context", {
              context: "uploadFileWithId - missing convex callback url",
            }),
          );
        const token = await getToken();
        if (!token) throw new Error(t("global.auth_token_not_found"));

        const { sanitizeFileName } = await import("@/utils/fileNameUtils");
        const safeName = sanitizeFileName(args.fileName);
        const payload = {
          convex_project_id: args.projectId,
          file_name: safeName,
          callback_url: convexHttpUrl,
          file_id: args.fileId,
        };
        const baseUrl = getBackendUrlForProject(args.projectId);
        try {
          const responseData = await client.request<UploadResponse>(
            baseUrl,
            "/upload_dataset/with_id",
            JSON.stringify(payload),
            token,
          );
          await createLog(
            args.projectId,
            t("services.upload_file_service.log_success_file_upload", {
              fileName: safeName,
              columns: responseData.columns.length,
            }),
            "INFO",
            "",
            "uploadFileWithIdService",
          );
          return {
            columns: responseData.columns || null,
            rows: responseData.rows,
            job_id: responseData.job_id,
          };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : t("global.unknown_error");
          await createLog(
            args.projectId,
            t("services.upload_file_service.log_error_file_upload", {
              fileName: safeName,
              error: message,
            }),
            "ERROR",
            "",
            "uploadFileWithIdService",
          );
          throw error;
        }
      },
      /**
       * Handles bulk file uploads using multiple IDs.
       */
      uploadFileWithMultipleIds: async (args: {
        projectId: Id<"project">;
        fileIds: string[];
        fileNames: string;
        fileType: string;
      }): Promise<UploadResponse> => {
        if (!convexHttpUrl)
          throw new Error(
            t("services.use_backend_client.missing_context", {
              context:
                "uploadFileWithMultipleIds - missing convex callback url",
            }),
          );
        const token = await getToken();
        if (!token) throw new Error(t("global.auth_token_not_found"));

        const payload = {
          convex_project_id: args.projectId,
          callback_url: convexHttpUrl,
          file_ids: args.fileIds,
          file_type: args.fileType,
        };
        const baseUrl = getBackendUrlForProject(args.projectId);
        try {
          const responseData = await client.request<UploadResponse>(
            baseUrl,
            "/upload_dataset/with_ids",
            JSON.stringify(payload),
            token,
          );
          await createLog(
            args.projectId,
            t("services.upload_file_service.log_success_file_upload", {
              fileName: args.fileNames,
              columns: (responseData.columns || []).length.toString(),
            }),
            "INFO",
            "",
            "uploadFileWithMultipleIdsService",
          );
          return {
            columns: responseData.columns || null,
            rows: responseData.rows,
            job_id: responseData.job_id,
          };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : t("global.unknown_error");
          await createLog(
            args.projectId,
            t("services.upload_file_service.log_error_file_upload", {
              fileName: args.fileNames,
              error: message,
            }),
            "ERROR",
            "",
            "uploadFileWithMultipleIds",
          );
          throw error;
        }
      },
      /**
       * Fetches a secure, signed URL for downloading a file.
       */
      getDownloadUrl: async (args: {
        fileName: string;
        signal: AbortSignal;
        project_id: Id<"project">;
      }) => {
        if (!args.project_id)
          throw new Error(
            t("services.use_backend_client.missing_context", {
              context: "getDownloadUrl - missing project id",
            }),
          );
        const token = await getToken();
        if (!token) throw new Error(t("global.auth_token_not_found"));
        const payload = { filename: args.fileName };
        const baseUrl = getBackendUrlForProject(args.project_id);
        const data = await client.request<{ url: string }>(
          baseUrl,
          "/asset_storage/download_url",
          payload,
          token,
          "POST",
          args.signal,
        );
        return data.url;
      },
      /**
       * Directly uploads a file to a pre-signed URL using XMLHttpRequest to support progress tracking.
       */
      uploadToSignedUrl: client.uploadToSignedUrl.bind(client),
      /**
       * Fetches the list of columns that exist in the backend for export validation.
       */
      listColumns: async (args: {
        convex_project_id: Id<"project">;
      }) => {
        if (!args.convex_project_id)
          throw new Error(
            t("services.use_backend_client.missing_context", {
              context: "listColumns - missing project id",
            }),
          );
        const token = await getToken();
        if (!token) throw new Error(t("global.auth_token_not_found"));

        const payload = {
          convex_project_id: args.convex_project_id,
        };

        const baseUrl = getBackendUrlForProject(args.convex_project_id);
        return client.request<{ columns: string[] }>(
          baseUrl,
          "/columns/list",
          payload,
          token,
        );
      },
      /**
       * Handles the entire process of importing a workflow from a JSON string.
       * It parses the JSON, creates corresponding sheets and columns in the database,
       * and saves the final workflow structure. Replaces importWorkflowService.ts
       */
      importWorkflow: async (args: {
        jsonData: string;
        project_id: Id<"project">;
        defaultViewId: Id<"sheet"> | null;
        currentWorkflowData: WorkflowNode[];
        progressCallback?: (progress: {
          current: number;
          total: number;
          message: string;
        }) => void;
      }) => {
        const logger = new Logger({
          service: "useBackendClient - importWorkflow",
        });

        const errors: string[] = [];
        let createdCount = 0;

        try {
          const importedNodes = WorkflowJsonCleaner.cleanAndValidate(
            args.jsonData,
          );
          const totalNodes = countNodes(importedNodes);

          const existingViewsByLabel = new Map<string, WorkflowNode>();
          const collectViews = (nodes: WorkflowNode[]) => {
            nodes.forEach((node) => {
              if (node.isView && node.label) {
                existingViewsByLabel.set(node.label, node);
              }
            });
          };
          collectViews(args.currentWorkflowData);

          const originalClientNodeIdToNewConvexIdMap = new Map<
            string,
            string
          >();

          const processAndCreateNodeRecursive = async (
            originalNode: WorkflowNode,
            parentViewNewConvexId?: Id<"sheet">,
          ): Promise<WorkflowNode | null> => {
            createdCount++;

            if (args.progressCallback) {
              args.progressCallback({
                current: createdCount,
                total: totalNodes,
                message: `Processing: ${originalNode.label || "node"}`,
              });
            }

            const processedNode: WorkflowNode = JSON.parse(
              JSON.stringify(originalNode),
            );
            let newConvexId: Id<"sheet"> | Id<"column"> | undefined;

            try {
              if (processedNode.isView) {
                const existingView = existingViewsByLabel.get(
                  processedNode.label,
                );
                const existingChildren = existingView?.children || [];

                if (existingView && existingView.convexId) {
                  logger.debug(
                    `Found existing view "${processedNode.label}", merging children.`,
                  );
                  newConvexId = existingView.convexId as Id<"sheet">;
                } else {
                  logger.debug(`Creating new sheet: ${processedNode.label}`);
                  newConvexId = await convex.mutation(api.sheets.create, {
                    text: processedNode.label || t("workflow.new_view"),
                    project_id: args.project_id,
                    filter: processedNode.sql_condition || "1=1",
                    hidden: [],
                  });
                }

                processedNode.convexId = newConvexId;
                if (originalNode.id) {
                  originalClientNodeIdToNewConvexIdMap.set(
                    originalNode.id,
                    newConvexId,
                  );
                }

                const newChildren = await Promise.all(
                  (originalNode.children || []).map((child) =>
                    processAndCreateNodeRecursive(
                      child,
                      newConvexId as Id<"sheet">,
                    ),
                  ),
                );

                processedNode.children = [
                  ...existingChildren,
                  ...(newChildren.filter(Boolean) as WorkflowNode[]),
                ];
              } else {
                let actualParentSheetConvexId = parentViewNewConvexId;

                if (
                  !actualParentSheetConvexId &&
                  processedNode.convexSheetId &&
                  originalClientNodeIdToNewConvexIdMap.has(
                    processedNode.convexSheetId,
                  )
                ) {
                  actualParentSheetConvexId =
                    originalClientNodeIdToNewConvexIdMap.get(
                      processedNode.convexSheetId,
                    ) as Id<"sheet">;
                }

                if (!actualParentSheetConvexId) {
                  const errorMsg = `Column "${processedNode.label}" missing valid parent sheet. Skipping.`;
                  errors.push(errorMsg);
                  logger.warn(errorMsg);
                  return null;
                }

                logger.debug(
                  `Creating column: ${processedNode.label} under sheet ${actualParentSheetConvexId}`,
                );

                const promptOptions = createPromptOptions(processedNode);
                const colType = mapNodeTypeToColumnType(processedNode.type);
                const colSubtype = mapNodeTypeToColumnSubtype(
                  processedNode.type,
                  processedNode.tagMode,
                );

                newConvexId = await convex.mutation(
                  api.columns.createNewColumn,
                  {
                    name: processedNode.label || "",
                    column_type: (colType || "noSchema") as ColumnType,
                    column_subtype: colSubtype as ColumnSubType | null,
                    project_id: args.project_id,
                    created_on_sheet_id: actualParentSheetConvexId,
                    prompt: promptOptions
                      ? encodePrompt(promptOptions)
                      : undefined,
                    jsonSchema: processedNode.responseSchema
                      ? encodeJsonSchema(
                          processedNode.responseSchema as FormBuilderSchema,
                        )
                      : undefined,
                  },
                );

                processedNode.convexId = newConvexId;
                processedNode.convexSheetId = actualParentSheetConvexId;
                if (originalNode.id) {
                  originalClientNodeIdToNewConvexIdMap.set(
                    originalNode.id,
                    newConvexId,
                  );
                }
                processedNode.children = [];
              }

              processedNode.id = processedNode.isView
                ? `view-backend-${newConvexId}`
                : `col-backend-${newConvexId}`;
              if (processedNode.expanded === undefined) {
                processedNode.expanded = !!processedNode.isView;
              }
              return processedNode;
            } catch (error) {
              const errorMsg = `Failed to create ${
                processedNode.isView ? "view" : "column"
              } "${processedNode.label}": ${
                error instanceof Error
                  ? error.message
                  : t("global.unknown_error")
              }`;
              errors.push(errorMsg);
              logger.error(errorMsg);
              throw error;
            }
          };

          // Process all nodes from the imported file and store them in a map.
          const processedNodesMap = new Map<string, WorkflowNode>();
          for (const rootOriginalNode of importedNodes) {
            if (!rootOriginalNode.isView) {
              const errorMsg = `Root node "${rootOriginalNode.label}" is not a view. Skipping.`;
              errors.push(errorMsg);
              logger.warn(errorMsg);
              continue;
            }
            try {
              const processedRoot =
                await processAndCreateNodeRecursive(rootOriginalNode);
              if (processedRoot && processedRoot.label) {
                processedNodesMap.set(processedRoot.label, processedRoot);
              }
            } catch (error) {
              const errorMsg = `Failed to process root node "${
                rootOriginalNode.label
              }": ${error instanceof Error ? error.message : "Unknown error"}`;
              errors.push(errorMsg);
              logger.error(errorMsg);
            }
          }

          // Build the final workflow array, preserving the original order.
          const finalMergedWorkflow: WorkflowNode[] = [];
          for (const originalNode of args.currentWorkflowData) {
            if (
              originalNode.isView &&
              originalNode.label &&
              processedNodesMap.has(originalNode.label)
            ) {
              // This view was merged. Use the new version from the map.
              finalMergedWorkflow.push(
                processedNodesMap.get(originalNode.label)!,
              );
              // Remove it from the map so we don't add it again later.
              processedNodesMap.delete(originalNode.label);
            } else {
              // This view was not part of the import. Preserve it as is.
              finalMergedWorkflow.push(originalNode);
            }
          }

          // Add any brand new views (that were in the import file but not in the original workflow) to the end.
          for (const newViewNode of processedNodesMap.values()) {
            finalMergedWorkflow.push(newViewNode);
          }

          // Save the final, correctly ordered structure to the database.
          if (finalMergedWorkflow.length > 0) {
            logger.debug("Saving imported workflow structure to database");
            await convex.mutation(api.projects.saveProjectWorkflow, {
              projectId: args.project_id,
              workflowData: JSON.stringify(finalMergedWorkflow),
            });
          }

          logger.info(
            `Import completed. Processed ${createdCount} nodes with ${
              errors.length
            } warnings/errors.`,
          );

          // Return the final, correctly ordered structure.
          return {
            importedStructure: finalMergedWorkflow,
            nodeCount: createdCount,
            errors,
          };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : t("global.unknown_error");
          logger.error(`Import workflow failed: ${message}`);
          throw new Error(message);
        }
      },
    };
  }, [
    client,
    getToken,
    convexHttpUrl,
    projectBackendUrls,
    defaultBackendUrl,
    convex,
    t,
    createLog,
    generatePrompt,
  ]);

  return clientApiEndpoints;
};

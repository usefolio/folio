import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import UniversalModal from "./UniversalModal";
import ColumnModalConfig from "./modalConfig/columnModalConfig";
import { ModalManagerProps } from "../interfaces/interfaces";
import {
  FormBuilderSchema,
  SavedPrompt,
  PromptOptions,
  ScheduledActionData,
  JsonOutputPromptOptions,
  AlertData,
  getProviderForModel,
} from "../types/types";
import { DialogClose } from "@radix-ui/react-dialog";
import { api } from "../../convex/_generated/api";
import NewProjectModalConfig from "./modalConfig/newProjectModalConfig";
import { useAccess } from "@/hooks/useAccess";
import { AccessTooltip } from "./accessTooltip";
import {
  showErrorNotification,
  showSuccessNotification,
} from "./notification/NotificationHandler";
import { useTranslation } from "react-i18next";
import { useDataContext } from "../context/DataContext";
import { useLogger } from "../utils/Logger";
import { Button } from "./ui/button";
import { PrimaryActionButton, SecondaryIconButton } from "./ui/actionButtons";
import { Loader2, Plus, X, Clock, Download, Info, Sparkles } from "lucide-react";
import {
  FileWithProgress,
  MentionsComponentRef,
  GroupedPrompts,
  type Step,
} from "../interfaces/interfaces";
import { Id, Doc } from "convex/_generated/dataModel";
import { determineFileType } from "@/utils/fileValidation";
import { DISALLOWED_PROJECT_NAME_CHARS } from "@/utils/projectNameUtils";
import ExportModalConfig from "./modalConfig/exportModalConfig";
import {
  transformExportSelections,
  hasSelectedColumns,
  hasSelectedViews,
} from "../utils/exportUtils";
import SettingsModalConfig from "./modalConfig/settingsModalConfig";
import { encodePrompt } from "@/utils/promptUtils";
import { useBackendClient } from "@/hooks/useBackendClient";
import SummaryModalSettings from "./modalConfig/summaryModalConfig";
import { SchedulingModalConfig } from "./modalConfig/schedulingModalConfig";
import { DEFAULT_AI_MODEL } from "@/constants";
import { useLocation } from "react-router";
import { AlertModalConfig } from "./modalConfig/alertModalConfig";
import { useFreshToken } from "@/hooks/useFreshToken";
import { useQuery } from "convex/react";

const ModalManager: React.FC<ModalManagerProps> = ({
  isModalOpen,
  modalType,
  closeModal,
  project_id,
  modalData,
  state,
  actions,
  modalSessionIdRef,
}) => {
  const logger = useLogger("src/ModalManager.tsx");
  const getToken = useFreshToken();
  const backendClient = useBackendClient();
  const {
    projects,
    sheets,
    sheet,
    serviceCredentials,
    columns,
    workspace,
    convex,
    setProject,
    savedPrompts: contextSavedPrompts,
    savedJsonSchemas: contextSavedJsonSchemas,
    refreshAllPromptsAndJsonSchemas,
    handleCreateView,
    setLoadingViewProjects,
    systemPrompt,
  } = useDataContext();
  // States from reducer
  const {
    columnName,
    promptOptions,
    isLoading,
    promptNameError,
    promptInputOverlayValidationError,
    selectedPrompt,
    promptsLoaded,
    fileSubmitDisabled,
    exportSelectedColumns,
    exportSelectedViews,
    isExporting,
    isUploading,
    savedPrompts,
    tagTextAreaValue,
  } = state;
  const { t } = useTranslation();
  const requiredService = useMemo(
    () => getProviderForModel(promptOptions.model || DEFAULT_AI_MODEL),
    [promptOptions.model],
  );
  const access = useAccess(
    requiredService ? [{ kind: "service", service: requiredService }] : [],
  );
  const chatAvailability = useQuery(api.chat.getChatAvailability, {}) as
    | { exaKeyConfigured?: boolean }
    | undefined;
  const isExaSearchUnavailable = chatAvailability?.exaKeyConfigured === false;
  const location = useLocation();
  const mentionsRef = useRef<MentionsComponentRef | null>(null);
  const promptOptionsRef = useRef(promptOptions);
  const columnCreationInFlightRef = useRef(false);
  const searchHandlerRef = useRef<(() => Promise<void>) | null>(null);
  const hasInitializedNewProjectRef = useRef(false);
  const [localMentionsTextAreaValueState, setLocalMentionsTextAreaValueState] =
    useState(promptOptions.userPrompt);
  const [promptSearch, setPromptSearch] = useState("");
  const [localTagTextareaValue, setLocalTagTextareaValue] =
    useState(tagTextAreaValue);
  const validColumnNames = useMemo(() => {
    return new Set(columns.map((col) => col.name));
  }, [columns]);
  const getCompatiblePromptType = (promptOptions: PromptOptions) => {
    // Handle new schema types
    if (promptOptions?.promptType === "schema") {
      if (
        promptOptions?.schemaType === "singleTag" ||
        promptOptions?.schemaType === "multiTag"
      ) {
        return "StructuredOutput";
      } else if (promptOptions?.schemaType === "freeForm") {
        return "json";
      }
    } else if (promptOptions?.promptType === "noSchema") {
      if (promptOptions?.ask === true) {
        return "ask";
      }
      return "TextGeneration";
    }

    // For completely unrecognized formats, return null
    return null;
  };
  const filteredSavedPrompts = useMemo(() => {
    if (!savedPrompts || savedPrompts.length === 0) return [];
    if (promptOptions.isCrawl) return [];

    const currentCompatibleType = getCompatiblePromptType(promptOptions);

    return (
      savedPrompts
        .filter((prompt) => {
          const savedPromptCompatibleType = getCompatiblePromptType(
            prompt.promptOptions,
          );
          return savedPromptCompatibleType === currentCompatibleType;
        })
        // 2. Filter by the search term
        .filter(
          (prompt) =>
            prompt.columnName
              .toLowerCase()
              .includes(promptSearch.toLowerCase()) ||
            prompt.projectName
              .toLowerCase()
              .includes(promptSearch.toLowerCase()),
        )
    );
  }, [savedPrompts, promptOptions, promptSearch]);

  const groupedSavedPrompts = useMemo<GroupedPrompts>(() => {
    return filteredSavedPrompts.reduce((acc, prompt) => {
      let sheetName: string;

      if (prompt.sourceSheetId) {
        // Find the sheet name using the ID
        const sourceSheet = sheets.find((s) => s._id === prompt.sourceSheetId);
        sheetName = sourceSheet ? sourceSheet.name : t("global.default");
      } else {
        // Fallback for prompts not associated with a specific sheet
        sheetName = t("global.default");
      }

      if (!acc[sheetName]) {
        acc[sheetName] = [];
      }
      acc[sheetName].push(prompt);
      return acc;
    }, {} as GroupedPrompts);
  }, [filteredSavedPrompts, sheets]);

  const buildStepsForMode = useCallback(
    (mode: "upload" | "search"): Step[] => {
      const steps: Step[] = [];

      if (mode === "search") {
        steps.push({
          step: t("modal_manager.new_project_modal_config.steps.searching"),
          status: "pending",
          description: "",
          index: 0,
          kind: "search",
        });
      }

      const baseIndex = steps.length;
      steps.push(
        {
          step: t("reducers.modal_manager_reducer.create_project_step"),
          status: "pending",
          description: "",
          index: baseIndex + 0,
          kind: "createProject",
        },
        {
          step: t("reducers.modal_manager_reducer.upload_file_step"),
          status: "pending",
          description: "",
          index: baseIndex + 1,
          kind: "upload",
        },
        {
          step: t("reducers.modal_manager_reducer.process_data_step"),
          status: "pending",
          description: "",
          index: baseIndex + 2,
          kind: "processData",
        },
        {
          step: t("reducers.modal_manager_reducer.create_view_step"),
          status: "pending",
          description: "",
          index: baseIndex + 3,
          kind: "createView",
        },
      );

      return steps;
    },
    [t],
  );

  const initializeCreationFlow = useCallback(
    (mode: "upload" | "search") => {
      const steps = buildStepsForMode(mode);
      actions.setSteps(steps);
      actions.resetSteps();
      actions.setCreationFlowType(mode);
      actions.setSearchResultsCount(null);
    },
    [actions, buildStepsForMode],
  );

  const resetToDefaultCreationFlow = useCallback(() => {
    initializeCreationFlow("upload");
  }, [initializeCreationFlow]);
  const handleSelectSavedPrompt = useCallback(
    (value: string) => {
      if (value === "none") {
        // Reset the modal state to default values
        actions.setSelectedSavedPrompt("none");

        // Set default prompt options with new type structure
        actions.setPromptOptions({
          model: DEFAULT_AI_MODEL,
          userPrompt: "",
          promptType: "schema",
          schemaType: "singleTag",
          responseOptions: [],
          promptInputColumns: [],
        });

        actions.setIsEditingTagTextArea(false);
        actions.setPromptNameError(null);
        actions.setTagTextAreaOriginalInput("");
        actions.setTagTextareaValue("");
        setLocalMentionsTextAreaValueState("");
        setLocalTagTextareaValue("");
        actions.setPromptInputOverlayValidationError("");
        mentionsRef.current?.updateOverlaySafely("");
        return;
      }

      actions.setSelectedSavedPrompt(value);

      // Find the selected saved prompt
      const [columnName, projectId] = value.split("-");
      const selected = savedPrompts.find(
        (prompt) =>
          prompt.columnName === columnName && prompt.projectId === projectId,
      );

      // If there is a saved prompt, handle it based on its type
      if (selected) {
        const userPrompt = selected.promptOptions.userPrompt?.trim() || "";
        const model = selected.promptOptions.model || DEFAULT_AI_MODEL;
        const promptInputColumns =
          selected.promptOptions.promptInputColumns || [];

        if (
          selected.promptOptions.promptType === "noSchema" &&
          selected.promptOptions.ask
        ) {
          actions.setPromptOptions({
            model,
            userPrompt,
            promptType: "noSchema",
            promptInputColumns,
            ask: true,
          });
          setLocalMentionsTextAreaValueState(userPrompt);
          mentionsRef.current?.updateOverlaySafely(userPrompt);
        } else if (
          selected.promptOptions.promptType === "noSchema" &&
          !selected.promptOptions.ask &&
          !selected.promptOptions.isCrawl
        ) {
          actions.setPromptOptions({
            model,
            userPrompt,
            promptType: "noSchema",
            promptInputColumns,
            ask: false,
            isCrawl: false,
          });
          setLocalMentionsTextAreaValueState(userPrompt);
          mentionsRef.current?.updateOverlaySafely(userPrompt);
        } else if (
          selected.promptOptions.promptType === "schema" &&
          (selected.promptOptions.schemaType === "singleTag" ||
            selected.promptOptions.schemaType === "multiTag")
        ) {
          const responseOptions = selected.promptOptions.responseOptions || [];
          const isMultiTag = selected.promptOptions.schemaType === "multiTag";

          actions.setPromptOptions({
            model,
            userPrompt,
            promptType: "schema",
            schemaType: isMultiTag ? "multiTag" : "singleTag",
            responseOptions,
            promptInputColumns,
          });
          setLocalMentionsTextAreaValueState(userPrompt);
          actions.setIsEditingTagTextArea(false);
          actions.setTagTextAreaOriginalInput(responseOptions.join(", ") || "");
          actions.setTagTextareaValue(responseOptions.join(", ") || "");
          setLocalTagTextareaValue(responseOptions.join(", ") || "");
          mentionsRef.current?.updateOverlaySafely(userPrompt);
        } else if (
          selected.promptOptions.promptType === "schema" &&
          selected.promptOptions.schemaType === "freeForm"
        ) {
          const optionsToSet = {
            model,
            userPrompt,
            promptType: "schema" as const,
            schemaType: "freeForm" as const,
            promptInputColumns,
            responseSchema: (promptOptions as JsonOutputPromptOptions)
              .responseSchema,
          };
          actions.setPromptOptions(optionsToSet);
          setLocalMentionsTextAreaValueState(userPrompt);
          mentionsRef.current?.updateOverlaySafely(userPrompt);
        }
      }
    },
    [
      actions,
      savedPrompts,
      promptOptions,
      mentionsRef.current?.updateOverlaySafely,
      localTagTextareaValue,
    ],
  );
  // Helper functions for each step
  const getErrorMessage = (error: unknown): string => {
    return error instanceof Error ? error.message : String(error);
  };
  const DATASET_UPLOAD_RETRY_DELAYS_MS = [0, 500, 1000, 2000] as const;
  const RETRYABLE_DATASET_ERROR_PATTERNS = [
    "no such key",
    "not found",
    "does not exist",
    "unable to locate",
    "not yet available",
  ];
  const delay = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms));
  const shouldRetryDatasetUpload = (error: unknown): boolean => {
    const message = getErrorMessage(error).toLowerCase();
    return RETRYABLE_DATASET_ERROR_PATTERNS.some((pattern) =>
      message.includes(pattern),
    );
  };
  const runDatasetUploadWithRetry = async <T,>(
    uploadOperation: () => Promise<T>,
  ): Promise<T> => {
    let lastError: unknown;

    for (let attempt = 0; attempt < DATASET_UPLOAD_RETRY_DELAYS_MS.length; attempt += 1) {
      const waitMs = DATASET_UPLOAD_RETRY_DELAYS_MS[attempt];
      if (waitMs > 0) {
        await delay(waitMs);
      }

      try {
        return await uploadOperation();
      } catch (error) {
        lastError = error;
        const hasAttemptsLeft =
          attempt < DATASET_UPLOAD_RETRY_DELAYS_MS.length - 1;
        if (!hasAttemptsLeft || !shouldRetryDatasetUpload(error)) {
          throw error;
        }

        logger.warn("Retrying dataset upload after transient storage error", {
          attempt: attempt + 1,
          error: getErrorMessage(error),
        });
      }
    }

    throw new Error(getErrorMessage(lastError));
  };
  const createProject = async (projectName: string) => {
    try {
      const response = await backendClient.createProject(projectName);
      return String(response);
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      throw new Error(
        t("modal_manager.main.project_creation_error", { error: errorMessage }),
      );
    }
  };
  const handleFileUpload = async (
    files: FileWithProgress[],
    projectName: string,
    _template: string,
    creationMode: "upload" | "search" = "upload",
  ) => {
    const sessionId = modalSessionIdRef.current;
    if (!files || files.length === 0) {
      logger.debug("No files to upload");
      return;
    }

    logger.debug("Files to upload:", { fileCount: files.length });

    const isSearchFlow = creationMode === "search";
    const createProjectStepIndex = isSearchFlow ? 1 : 0;
    const uploadStepIndex = createProjectStepIndex + 1;
    const processStepIndex = uploadStepIndex + 1;
    const createViewStepIndex = processStepIndex + 1;

    // Mark first step as loading before any async preflight work so the tracker
    // shows immediate progress when the modal switches into loading mode.
    actions.setStepStatus({ index: createProjectStepIndex, status: "loading" });
    actions.setIsLoading(true);

    let token: string | null = null;
    try {
      token = await getToken();
    } catch (error) {
      logger.error("Failed to fetch token for file upload", { error });
      actions.setIsLoading(false);
      showErrorNotification(
        t("global.error"),
        getErrorMessage(error),
      );
      return;
    }

    if (!token) {
      actions.setIsLoading(false);
      showErrorNotification(
        t("modal_manager.main.authorization_error_title"),
        t("global.authorization_error_message"),
      );
      return;
    }
    // Disallow project creation if user has no openai key
    if (!access.ok) {
      actions.setIsLoading(false);
      showErrorNotification(
        t("global.service_credential_missing"),
        t("global.service_credential_missing_message", {
          service: "openai",
        }),
      );
      return;
    }
    // Show file
    actions.setShowFileTable(true);
    let project_id: string | null | undefined;
    try {
      actions.setIsUploading(true);

      // Create a new project
      project_id = await createProject(projectName);
      actions.setStepStatus({ index: createProjectStepIndex, status: "success" });

      // Upload all files simultaneously
      actions.setStepStatus({ index: uploadStepIndex, status: "loading" });

      // Filter files that need uploading
      const filesToUpload = files.filter(
        (fileWithProgress) => fileWithProgress.status === "pending",
      );

      // Process based on amount of files
      let results = [];

      if (filesToUpload.length === 1) {
        // Single file upload
        results = await handleSingleFileUpload(
          filesToUpload[0],
          project_id as Id<"project">,
          { upload: uploadStepIndex, process: processStepIndex },
        );
      } else {
        // Multiple files upload
        results = await handleMultipleFilesUpload(
          filesToUpload,
          project_id as Id<"project">,
          { upload: uploadStepIndex, process: processStepIndex },
        );
      }
      // Check results
      const allSuccessful = results.every((result) => result.success);
      const anySuccessful = results.some((result) => result.success);
      if (allSuccessful) {
        const { sanitizeFileName } = await import("@/utils/fileNameUtils");
        actions.setStepStatus({ index: processStepIndex, status: "success" });
        actions.setShowFileTable(false);
        if (files.length > 1) {
          showSuccessNotification(
            t("modal_manager.main.project_created_title"),
            t("modal_manager.main.all_files_upload_success_message", {
              count: files.length,
            }),
          );
        } else {
          showSuccessNotification(
            t("modal_manager.main.project_created_title"),
            t("modal_manager.main.file_upload_success_message", {
              fileName: sanitizeFileName(files[0].file.name),
            }),
          );
        }
      } else if (anySuccessful) {
        actions.setStepStatus({ index: uploadStepIndex, status: "warning" });
        actions.setStepStatus({ index: processStepIndex, status: "warning" });
        actions.setShowFileTable(false);
        // Format error details for notifications
        const failedFiles = results.filter((result) => !result.success);
        const { sanitizeFileName } = await import("@/utils/fileNameUtils");
        const errorDetails =
          t("modal_manager.main.multiple_files_failed", {
            count: failedFiles.length,
          }) +
          "\n" +
          failedFiles
            .map(
              (file) =>
                `• ${sanitizeFileName(
                  files.find((f) => f.id === file.fileId)?.file.name || "Unknown",
                )}: ${file.error}`,
            )
            .join("\n");

        showSuccessNotification(
          t("modal_manager.main.project_created_title"),
          t("modal_manager.main.some_files_upload_success_message", {
            successCount: results.filter((r) => r.success).length,
            failCount: failedFiles.length,
          }),
          errorDetails,
        );
      } else {
        actions.setStepStatus({ index: uploadStepIndex, status: "error" });
        actions.setStepStatus({ index: processStepIndex, status: "error" });

        // Format error details for notifications
        if (!anySuccessful) {
          await backendClient.deleteProject(project_id as Id<"project">);
          setTimeout(() => {
            setProject(projects[0]._id);
          }, 0);
        }
        const failedFiles = results.filter((result) => !result.success);
        const { sanitizeFileName } = await import("@/utils/fileNameUtils");
        const errorDetails =
          t("modal_manager.main.multiple_files_failed", {
            count: failedFiles.length,
          }) +
          "\n" +
          failedFiles
            .map(
              (file) =>
                `• ${sanitizeFileName(
                  files.find((f) => f.id === file.fileId)?.file.name || "Unknown",
                )}: ${file.error}`,
            )
            .join("\n");
        if (files.length > 1) {
          showErrorNotification(
            t("global.error"),
            t("modal_manager.main.all_files_upload_failed_message", {
              count: files.length,
            }),
            errorDetails,
          );
        } else {
          showErrorNotification(
            t("global.error"),
            t("modal_manager.main.project_creation_error", {
              error: failedFiles[0].error,
            }),
          );
        }
      }
      if (location.pathname === "/" || location.pathname === "/workflow") {
        setProject(project_id as Id<"project">);
      }

      if (allSuccessful || anySuccessful) {
        actions.setStepStatus({ index: createViewStepIndex, status: "loading" });
        try {
          handleCreateView(
            t("global.default"),
            "1=1",
            project_id as Id<"project">,
            false,
            false,
          );

          actions.setStepStatus({ index: createViewStepIndex, status: "success" });

          setLoadingViewProjects((prev) => {
            const newState = { ...prev };
            newState[project_id as string] = false;
            return newState;
          });
        } catch (error) {
          logger.error(String(error));
          actions.setStepStatus({ index: createViewStepIndex, status: "error" });
        }
      }

      // Reset the upload state
      if (modalSessionIdRef.current === sessionId && isModalOpen) {
        setTimeout(() => {
          closeModal();
          actions.setIsLoading(false);
          actions.setIsUploading(false);
          resetToDefaultCreationFlow();
        }, 4000);
      }
    } catch (error) {
      if (isModalOpen) {
        actions.setIsLoading(false);
        actions.setIsUploading(false);
        resetToDefaultCreationFlow();
        closeModal();
      }
      console.error("Error processing files:", error);
      await backendClient.deleteProject(project_id as Id<"project">);
      setTimeout(() => {
        setProject(projects[0]._id);
      }, 0);
      showErrorNotification(
        t("global.error"),
        t("modal_manager.main.error_processing_files", {
          error: getErrorMessage(error),
        }),
      );
    }
  };
  // Single file upload
  const handleSingleFileUpload = async (
    fileWithProgress: FileWithProgress,
    project_id: Id<"project">,
    stepIndexes: { upload: number; process: number },
  ) => {
    const file = fileWithProgress.file;
    const fileId = fileWithProgress.id;

    try {
      // Update status to uploading
      actions.updateFileStatus(fileId, "uploading", 0);

      // Get upload URL
      const { url, guid } = await backendClient.fetchUploadUrl({
        file,
        project_id: project_id,
      });

      // Upload to signed URL
      await backendClient.uploadToSignedUrl(
        url,
        file,
        t,
        (progress: number) => {
          actions.updateFileStatus(fileId, "uploading", progress);
        },
      );

      actions.setStepStatus({ index: stepIndexes.upload, status: "success" });
      actions.setStepStatus({ index: stepIndexes.process, status: "loading" });
      // Process file with project ID
      // Use robust extension detection to support names with multiple dots
      const { getFileExtension } = await import("@/utils/fileValidation");
      const ext = getFileExtension(file.name);
      if (ext === "parquet" || ext === "csv") {
        const { sanitizeFileName } = await import("@/utils/fileNameUtils");
        const safeName = sanitizeFileName(file.name);
        await runDatasetUploadWithRetry(() =>
          backendClient.uploadFileWithId({
            projectId: project_id,
            fileId: guid,
            fileName: safeName,
          }),
        );
      } else {
        const fileType = determineFileType([fileWithProgress]);
        const { sanitizeFileName } = await import("@/utils/fileNameUtils");
        await runDatasetUploadWithRetry(() =>
          backendClient.uploadFileWithMultipleIds({
            projectId: project_id,
            fileIds: [guid],
            fileNames: sanitizeFileName(file.name), // display only; backend ignores for with_ids
            fileType,
          }),
        );
      }

      actions.updateFileStatus(fileId, "completed", 100);
      // Mark as completed
      return [{ fileId, success: true, error: null }];
    } catch (error) {
      actions.updateFileStatus(fileId, "error", 0, getErrorMessage(error));
      console.error(`Error uploading file ${file.name}:`, error);
      return [{ fileId, success: false, error }];
    }
  };

  // Multiple files upload
  const handleMultipleFilesUpload = async (
    filesToUpload: FileWithProgress[],
    project_id: Id<"project">,
    stepIndexes: { upload: number; process: number },
  ) => {
    try {
      // Update all files to 10% progress
      filesToUpload.forEach((file) =>
        actions.updateFileStatus(file.id, "uploading", 0),
      );

      // Bulk fetch URLs for all files
      const { urls: guidsAndUrls } = await backendClient.fetchBulkUploadUrls({
        fileType: filesToUpload[0].file.type,
        count: filesToUpload.length,
        project_id: project_id,
      });

      const urlEntries = Object.entries(guidsAndUrls);
      // Process files in parallel with Promise.all
      const uploadPromises = filesToUpload.map(
        async (fileWithProgress, index) => {
          const { file, id: fileId } = fileWithProgress;
          try {
            if (index < urlEntries.length) {
              const [guid, url] = urlEntries[index];
              await backendClient.uploadToSignedUrl(
                url,
                file,
                t,
                (progress: number) => {
                  actions.updateFileStatus(fileId, "uploading", progress);
                },
              );
              actions.updateFileStatus(fileId, "completed", 100);
              return { fileId: guid, success: true, error: null };
            } else {
              const errorMessage = `No URL available for file ${file.name}`;
              actions.updateFileStatus(fileId, "error", 0, errorMessage);
              console.error(errorMessage);
              return { fileId, success: false, error: errorMessage };
            }
          } catch (error) {
            // Mark as error
            actions.updateFileStatus(
              fileId,
              "error",
              0,
              getErrorMessage(error),
            );
            console.error(`Error uploading file ${file.name}:`, error);
            return { fileId, success: false, error };
          }
        },
      );

      const filesUploaded = await Promise.all(uploadPromises);
      actions.setStepStatus({ index: stepIndexes.upload, status: "success" });
      actions.setStepStatus({ index: stepIndexes.process, status: "loading" });

      const filesIdsForDatasetCreation = filesUploaded
        .filter((file) => file.success)
        .map((file) => file.fileId)
        .filter((guid): guid is string => guid !== undefined);

      if (filesIdsForDatasetCreation.length === 0) {
        return filesUploaded;
      }

      const fileType = determineFileType(filesToUpload);
      const { sanitizeFileName } = await import("@/utils/fileNameUtils");
      const fileNames = filesToUpload
        .map((file) => sanitizeFileName(file.file.name))
        .join(" ,");

      await runDatasetUploadWithRetry(() =>
        backendClient.uploadFileWithMultipleIds({
          projectId: project_id,
          fileIds: filesIdsForDatasetCreation,
          fileNames,
          fileType,
        }),
      );

      return filesUploaded;
    } catch (error) {
      // If bulk operation fails, mark all files as error
      filesToUpload.forEach((file) => {
        actions.updateFileStatus(file.id, "error", 0, getErrorMessage(error));
      });

      console.error("Error in bulk upload operation:", error);
      return filesToUpload.map((file) => ({
        fileId: file.id,
        success: false,
        error,
      }));
    }
  };
  const validateProjectName = useCallback(
    (projectName: string): boolean => {
      const projectExists = projects.some(
        (project) => project.name.toLowerCase() === projectName.toLowerCase(),
      );

      if (projectExists) {
        return false;
      }
      return true;
    },
    [projects],
  );
  const validateFileName = useCallback(
    (name: string) => {
      if (!name.trim()) {
        return t(
          "modal_manager.new_project_modal_config.file_name_empty_error",
        );
      }
      const matches = name.match(DISALLOWED_PROJECT_NAME_CHARS);
      if (matches) {
        const uniqueInvalidChars = [...new Set(matches)].join(", ");
        return t(
          "modal_manager.new_project_modal_config.invalid_characters_error",
          {
            chars: uniqueInvalidChars,
          },
        );
      }
      return null;
    },
    [t],
  );
  const generateAvailableProjectName = useCallback(
    (baseName: string): string => {
      const trimmedBase = baseName.trim();
      const fallbackName = trimmedBase
        ? trimmedBase
        : t("modal_manager.new_project_modal_config.default_search_project_name");

      if (validateProjectName(fallbackName)) {
        return fallbackName;
      }

      let suffix = 1;
      const maxLength = 30;
      let candidate = fallbackName;

      while (!validateProjectName(candidate) && suffix < 100) {
        const suffixText = `-${suffix}`;
        const trimmed = fallbackName.slice(
          0,
          Math.max(1, maxLength - suffixText.length),
        );
        candidate = `${trimmed}${suffixText}`;
        suffix += 1;
      }

      return candidate;
    },
    [t, validateProjectName],
  );
  const handleSearchFlowStarted = useCallback(() => {
    initializeCreationFlow("search");
    actions.setIsLoading(true);
    actions.setStepStatus({ index: 0, status: "loading" });
  }, [actions, initializeCreationFlow]);

  const handleSearchFlowFailed = useCallback(
    (description?: string) => {
      actions.setStepStatus({
        index: 0,
        status: "error",
        ...(description ? { description } : {}),
      });
      actions.setIsLoading(false);
      resetToDefaultCreationFlow();
    },
    [actions, resetToDefaultCreationFlow],
  );

  const handleSearchFlowCompleted = useCallback(
    async ({
      file,
      projectName,
      resultsCount,
    }: {
      file: FileWithProgress;
      projectName: string;
      resultsCount: number;
    }) => {
      actions.setStepStatus({
        index: 0,
        status: "success",
        description: t(
          "modal_manager.new_project_modal_config.steps.searching_with_results",
          { count: resultsCount },
        ),
      });
      actions.setError(null);
      actions.setSearchResultsCount(resultsCount);
      const availableName = generateAvailableProjectName(projectName);
      actions.setProjectName(availableName);
      actions.setSelectedFiles([file]);

      const fileNameError = validateFileName(availableName);
      if (fileNameError) {
        actions.setError(fileNameError);
        actions.setStepStatus({
          index: 1,
          status: "error",
          description: fileNameError,
        });
        actions.setIsLoading(false);
        resetToDefaultCreationFlow();
        return;
      }

      await handleFileUpload([
        file,
      ], availableName, state.jsonSchema, "search");
    },
    [
      actions,
      generateAvailableProjectName,
      handleFileUpload,
      resetToDefaultCreationFlow,
      state.jsonSchema,
      t,
      validateFileName,
    ],
  );
  const checkIfTagsEmpty = (): boolean => {
    // Only validate tags if we're in structured prompt mode (Tag Data)
    if (
      promptOptions.promptType === "schema" &&
      (promptOptions.schemaType === "singleTag" ||
        promptOptions.schemaType === "multiTag")
    ) {
      // Check if responseOptions array exists and is not empty
      return (
        !promptOptions.responseOptions ||
        promptOptions.responseOptions.length === 0
      );
    }
    return false; // Not applicable for other prompt types
  };
  const handleFileSubmit = async (_e: React.MouseEvent) => {
    if (state.activeTab === "exa") {
      if (searchHandlerRef.current) {
        await searchHandlerRef.current();
      } else {
        logger.warn("Search handler is not available for the search tab submission.");
      }
      return;
    }
    if (
      (state.activeTab === "upload" &&
        (!state.selectedFiles ||
          (state.selectedFiles as FileWithProgress[]).length === 0)) ||
      (state.activeTab === "datawarehouse" && !state.isQueryEntered)
    ) {
      actions.setError("Please provide the required information");
      return;
    }

    const fileNameError = validateFileName(state.projectName);
    const projectNameDuplicate = !validateProjectName(state.projectName);

    if (fileNameError) {
      actions.setError(fileNameError);
      return;
    }

    if (projectNameDuplicate) {
      actions.setError(
        t("modal_manager.new_project_modal_config.project_exists_text"),
      );
      return;
    }

    switch (state.activeTab) {
      case "upload":
        initializeCreationFlow("upload");
        await handleFileUpload(
          state.selectedFiles as FileWithProgress[],
          state.projectName,
          state.jsonSchema,
          "upload",
        );
        break;
      case "datawarehouse":
        break;
      default:
        break;
    }
  };

  // New column with prompt
  const handleCreateColumn = async () => {
    if (columnCreationInFlightRef.current) {
      return;
    }
    // Check if the fields are filled
    if (!columnName) {
      showErrorNotification(
        t("modal_manager.main.validation_error_title"),
        t("modal_manager.main.validation_error_column_message"),
      );
      return;
    }
    if (!promptOptions.userPrompt) {
      showErrorNotification(
        t("modal_manager.main.validation_error_title"),
        t("modal_manager.main.validation_error_prompt_message"),
      );
      return;
    }
    // Disallow enrichment if user has no openai key
    if (!access.ok) {
      showErrorNotification(
        t("global.service_credential_missing"),
        t("global.service_credential_missing_message", {
          service: "openai",
        }),
      );
      return;
    }
    // Additional validation
    if (
      promptOptions.promptType === "schema" &&
      (promptOptions.schemaType === "singleTag" ||
        promptOptions.schemaType === "multiTag") &&
      (!promptOptions.responseOptions ||
        promptOptions.responseOptions.length === 0)
    ) {
      showErrorNotification(
        t("modal_manager.main.validation_error_title"),
        t("modal_manager.column_modal_config.no_options_error_message"),
      );
      return;
    }

    // response schema empty validation
    if (
      promptOptions.promptType === "schema" &&
      promptOptions.schemaType === "freeForm" &&
      Object.keys(promptOptions.responseSchema.properties as {}).length === 0
    ) {
      showErrorNotification(
        t("modal_manager.main.validation_error_title"),
        t("modal_manager.column_modal_config.no_fields"),
      );
      return;
    }

    if (!project_id) {
      logger.error(
        "Error: project_id is null or undefined. Cannot create column.",
      );
      return;
    }

    const currentProject = projects.find(
      (project) => project._id === project_id,
    );
    if (!currentProject) {
      logger.error(`Project with ID ${project_id} not found.`);
      showErrorNotification("Project Error", "Unable to find the project.");
      return;
    }

    // Check for duplicates
    const existingPrompts = contextSavedPrompts;

    // Prepare the new promptOptions for consistent signature generation
    let optionsForNewSignature: PromptOptions = promptOptions;
    if (
      promptOptions.promptType === "schema" &&
      promptOptions.schemaType === "freeForm" &&
      promptOptions.responseSchema
    ) {
      const { fields, ...pureSchema } =
        promptOptions.responseSchema as FormBuilderSchema;
      optionsForNewSignature = {
        ...promptOptions,
        responseSchema: pureSchema,
      };
    }

    const newPromptOptionsSignature = encodePrompt(optionsForNewSignature);
    const isDuplicate = existingPrompts.some((savedPrompt: SavedPrompt) => {
      const existingPromptOptionsSignature = encodePrompt(
        savedPrompt.promptOptions,
      );
      if (
        savedPrompt.columnName === columnName &&
        savedPrompt.projectId === project_id
      ) {
        return existingPromptOptionsSignature === newPromptOptionsSignature;
      }
      return false;
    });

    if (isDuplicate) {
      showErrorNotification(
        t("modal_manager.main.duplicate_prompt_error_title"),
        t("modal_manager.main.duplicate_prompt_error_message"),
      );
      return;
    }
    // Check for input columns
    if (promptOptions.promptInputColumns.length === 0) {
      showErrorNotification(
        t("modal_manager.main.no_mentions_error_title"),
        t("modal_manager.column_modal_config.no_mentions_error_message"),
      );
      return;
    }

    // Set loading state
    columnCreationInFlightRef.current = true;
    actions.setIsLoading(true);
    // Set retry data for next attempt if an error occurs
    let columnId;
    try {
      columnId = await backendClient.createColumn({
        columnName,
        promptOptions,
        project_id,
        sheet: sheet as Doc<"sheet">,
        serviceCredentials,
        systemPrompt: systemPrompt as Doc<"system_settings">,
      });

      // Reset inputs and close the modal
      closeModal();
      actions.setColumnName("");
      actions.setSelectedSavedPrompt("none");

      if (refreshAllPromptsAndJsonSchemas) {
        await refreshAllPromptsAndJsonSchemas();
      }

      // Show success notification
      showSuccessNotification(
        t("modal_manager.main.column_creation_success_title"),
        t("modal_manager.main.column_creation_success_message"),
      );
    } catch (error) {
      // Handle errors
      if (columnId) {
        await backendClient.deleteColumn(columnId);
      }
      logger.error("Error creating column:", { error: error });
      const errorMessage =
        error instanceof Error
          ? error.message
          : t("modal_manager.main.error_unknown");

      closeModal();
      actions.setColumnName("");
      actions.setSelectedSavedPrompt("none");

      showErrorNotification(
        t("modal_manager.main.column_creation_error_title"),
        t("modal_manager.main.column_creation_error_message", {
          error: errorMessage,
        }),
      );
    } finally {
      actions.setIsLoading(false);
      columnCreationInFlightRef.current = false;
    }
  };
  useEffect(() => {
    // When the prompt in the main reducer changes (e.g., when loading a saved prompt),
    // update the local state that is passed to the MentionsComponent.
    if (localMentionsTextAreaValueState !== promptOptions.userPrompt) {
      setLocalMentionsTextAreaValueState(promptOptions.userPrompt);
    }
  }, [promptOptions.userPrompt]);
  // Initialize the modal

  useEffect(() => {
    if (modalType === "column" && isModalOpen) {
      // Set the prompts from context instead of localStorage
      actions.setSavedPrompts(contextSavedPrompts);
      actions.setPromptsLoaded(true);
      return;
    }
    actions.setPromptsLoaded(false);
  }, [actions, contextSavedPrompts, isModalOpen, modalType]);

  useEffect(() => {
    if (modalType === "newProject") {
      if (!hasInitializedNewProjectRef.current) {
        actions.clearSelection();
        hasInitializedNewProjectRef.current = true;
      }
      return;
    }
    hasInitializedNewProjectRef.current = false;
  }, [actions, modalType]);

  useEffect(() => {
    if (promptsLoaded && !selectedPrompt) {
      actions.setSelectedSavedPrompt("none");
      actions.setPromptInputOverlayValidationError("");
      actions.setTagTextareaValue("");
      actions.setTagTextAreaOriginalInput("");
    }
  }, [promptsLoaded, selectedPrompt]);

  useEffect(() => {
    if (
      modalType === "showPrompt" &&
      modalData?.columnPrompt &&
      typeof modalData.columnPrompt !== "string"
    ) {
      const { columnName, columnPrompt } = modalData;
      // Use existing actions to set the state for ColumnModalConfig to read
      actions.setColumnName(columnName);
      actions.setPromptOptions(columnPrompt.promptOptions);
    }
  }, [modalType, modalData, actions]);

  const exportData = async () => {
    actions.setIsExporting(true);
    const controller = new AbortController();

    try {
      // Check if we have any selected views
      if (!hasSelectedViews(exportSelectedViews)) {
        showErrorNotification(
          t("modal_manager.main.export_error_title"),
          t("modal_manager.export_modal_config.no_views_selected", {
            defaultValue: "Please select at least one view to export.",
          }),
        );
        actions.setIsExporting(false);
        return;
      }

      // Check if we have any selected columns
      if (!hasSelectedColumns(exportSelectedColumns)) {
        showErrorNotification(
          t("modal_manager.main.export_error_title"),
          t("modal_manager.export_modal_config.no_columns_selected", {
            defaultValue: "Please select at least one column to export.",
          }),
        );
        actions.setIsExporting(false);
        return;
      }

      // Transform the selections
      const transformedData = transformExportSelections(
        exportSelectedViews,
        exportSelectedColumns,
        sheets,
        columns,
      );

      // Log the transformed data for debugging
      logger.debug("Transformed export data:", {
        projectId: project_id,
        viewCount: Object.values(transformedData).length,
        views: Object.values(transformedData).map((view) => ({
          name: view.name,
          columnCount: view.column_names.length,
          columns: view.column_names,
        })),
      });

      const exportUrl = await backendClient.exportData({
        sheet_objects: transformedData,
        signal: controller.signal,
        project_id: project_id as Id<"project">,
      });
      actions.setExportDownloadUrl(exportUrl);
      actions.setIsExporting(false);
    } catch (error) {
      actions.setIsExporting(false);
      const errorMessage =
        error instanceof Error
          ? error.message
          : t("modal_manager.main.error_unknown");

      showErrorNotification(
        t("modal_manager.main.export_error_title"),
        t("modal_manager.main.export_error_message", {
          error: errorMessage,
        }),
      );
      closeModal();
    }
  };
  // Configuration for the UniversalModal based on the types (currently view type, column type, new project type and show Prompt)
  const onApiKeySave = async (providerId: string, key: string) => {
    try {
      logger.debug(`Saving API key for provider: ${providerId}`);

      if (!key) {
        logger.warn(
          `Attempted to save an empty API key for provider: ${providerId}`,
        );
        showErrorNotification(
          t("modal_manager.settings_modal_config.key_error_title"),
          t("modal_manager.settings_modal_config.key_empty_error_message", {
            provider: providerId,
          }),
        );
        return;
      }

      const token = await getToken();
      if (!token) {
        showErrorNotification(
          t("modal_manager.main.authorization_error_title"),
          t("global.authorization_error_message"),
        );
        return;
      }

      let currentWorkspace = workspace;

      // Create default workspace
      if (!currentWorkspace) {
        showErrorNotification(
          t("modal_manager.settings_modal_config.workspace_error_title"),
          t("modal_manager.settings_modal_config.workspace_error_message"),
        );
        return;
      }

      await convex.mutation(api.service_credentials.saveServiceCredential, {
        workspaceId: currentWorkspace?._id as Id<"workspace">,
        service: providerId,
        apiKey: key,
      });

      showSuccessNotification(
        t("modal_manager.settings_modal_config.key_saved_title"),
        t("modal_manager.settings_modal_config.key_saved_message", {
          provider: providerId,
        }),
      );
    } catch (error) {
      logger.error(`Error saving API key for ${providerId}:`, { error: error });

      showErrorNotification(
        t("modal_manager.settings_modal_config.key_error_title"),
        t("modal_manager.settings_modal_config.key_error_message", {
          provider: providerId,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  };
  const handleSaveAlert = async (data: AlertData) => {
    if (!project_id) {
      return;
    }
    actions.setIsLoading(true);
    try {
      await convex.mutation(api.alerts.create, {
        project_id,
        ...data,
      });
      showSuccessNotification(
        "Alert Created",
        "Your new alert has been saved successfully.",
      );
      closeModal();
    } catch (error) {
      logger.error("Failed to save alert", { error });
      showErrorNotification("Error saving alert", getErrorMessage(error));
    } finally {
      actions.setIsLoading(false);
    }
  };
  const preventClose = useMemo(() => {
    if (modalType === "newProject") {
      // prevent closing if modal is busy.
      return isLoading || isUploading;
    }
    if (modalType === "column") {
      // prevent closing if the modal is busy OR if the form is filled.

      if (isLoading) {
        return true;
      }
      const isDirty =
        columnName.trim() !== "" ||
        promptOptions.userPrompt.trim() !== "" ||
        (promptOptions.promptType === "schema" &&
          (promptOptions.schemaType === "singleTag" ||
            promptOptions.schemaType === "multiTag") &&
          promptOptions.responseOptions &&
          promptOptions.responseOptions.length > 0) ||
        (promptOptions.promptType === "schema" &&
          promptOptions.schemaType === "freeForm" &&
          promptOptions.responseSchema &&
          promptOptions.responseSchema.properties &&
          Object.keys(promptOptions.responseSchema.properties).length > 0);
      return isDirty;
    }
    // For other modals (like 'Show Prompt'), do not prevent closing.
    return false;
  }, [modalType, isLoading, isUploading, columnName, promptOptions]);

  const columnCreationDisabled = useMemo(() => {
    if (
      isLoading ||
      !!promptNameError ||
      !!promptInputOverlayValidationError ||
      checkIfTagsEmpty() ||
      // Disable in crawl mode for now
      promptOptions.isCrawl
    ) {
      return true;
    } else {
      return false;
    }
  }, [
    promptNameError,
    isLoading,
    promptInputOverlayValidationError,
    checkIfTagsEmpty,
    promptOptions.isCrawl,
  ]);
  const isSearchTabActive = state.activeTab === "exa";
  const missingProjectName =
    state.activeTab !== "exa" && !state.projectName.trim();
  const primaryActionLabel = isSearchTabActive
    ? t("modal_manager.main.search_button")
    : t("modal_manager.main.create_button");
  const primaryActionIcon = isLoading ? (
    <Loader2 className="h-4 w-4 animate-spin" />
  ) : isSearchTabActive ? (
    <Sparkles className="h-4 w-4" />
  ) : (
    <Plus className="h-4 w-4" />
  );
  const primaryActionDisabled =
    isLoading ||
    !!state.error ||
    (state.activeTab === "upload" && !state.selectedFiles) ||
    (state.activeTab === "datawarehouse" && !state.isQueryEntered) ||
    (isSearchTabActive && isExaSearchUnavailable) ||
    missingProjectName ||
    fileSubmitDisabled ||
    !access.ok;
  const handleSaveSchedule = async (data: ScheduledActionData) => {
    actions.setIsLoading(true);
    let prompt = data?.prompt;
    if (prompt) {
      prompt.promptType = "noSchema";
      prompt.ask = false;
      prompt.isCrawl = false;
    }
    try {
      await convex.mutation(api.scheduled_actions.create, {
        ...data,
        prompt: prompt ? encodePrompt(prompt) : undefined,
        isActive: true, // Set as active by default
        createdAt: new Date().toISOString(),
      });
      showSuccessNotification(
        t(
          "modal_manager.schedule_modal_config.schedule_saved_successfully_title",
        ),
        t(
          "modal_manager.schedule_modal_config.schedule_saved_successfully_subtitle",
        ),
      );
      closeModal();
      actions.setSelectedSavedPrompt("none");
    } catch (error) {
      logger.error("Failed to save schedule", { error });
      showErrorNotification(t("global.error"), getErrorMessage(error));
    } finally {
      actions.setIsLoading(false);
    }
  };

  const modalConfig = {
    column: {
      title: t("modal_manager.main.create_column_title"),
      subtitle: null,
      headerElement: (
        <DialogClose
          asChild
          className="!mt-0 bg-gray-50 h-6 w-6 text-center flex items-center justify-center"
        >
          <Button
            variant="ghost"
            size="iconXs"
            shape="square"
            onClick={closeModal}
            className="bg-gray-50"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </Button>
        </DialogClose>
      ),
      content: (
        <ColumnModalConfig
          // Pass all the lifted state and functions down
          state={state}
          actions={actions}
          projectId={project_id}
          savedJsonSchemas={contextSavedJsonSchemas}
          mentionsRef={mentionsRef}
          promptOptionsRef={promptOptionsRef}
          localMentionsTextAreaValueState={localMentionsTextAreaValueState}
          setLocalMentionsTextAreaValueState={
            setLocalMentionsTextAreaValueState
          }
          promptSearch={promptSearch}
          setPromptSearch={setPromptSearch}
          validColumnNames={validColumnNames}
          filteredSavedPrompts={filteredSavedPrompts}
          groupedSavedPrompts={groupedSavedPrompts}
          handleSelectSavedPrompt={handleSelectSavedPrompt}
          localTagTextareaValue={localTagTextareaValue}
          setLocalTagTextareaValue={setLocalTagTextareaValue}
        />
      ),
      footer: (
        <div className="flex items-center justify-end space-x-2">
          <SecondaryIconButton
            icon={<Clock className="w-4 h-4" />}
            disabled
          >
            {t("modal_manager.main.schedule_button")}
          </SecondaryIconButton>
          <AccessTooltip access={access}>
            {isLoading ? (
              <PrimaryActionButton disabled icon={<Loader2 className="w-4 h-4 animate-spin" /> }>
                {t("modal_manager.main.create_column_button")}
              </PrimaryActionButton>
            ) : (
              <PrimaryActionButton icon={<Plus className="w-4 h-4" />} onClick={handleCreateColumn} disabled={columnCreationDisabled}>
                {t("modal_manager.main.create_column_button")}
              </PrimaryActionButton>
            )}
          </AccessTooltip>
        </div>
      ),
    },
    newProject: {
      title: t("modal_manager.main.upload_file_title"),
      subtitle: null,
      headerElement: (
        <DialogClose
          asChild
          className="!mt-0 bg-gray-50 h-6 w-6 text-center flex items-center justify-center"
        >
          <Button
            variant="ghost"
            size="iconXs"
            shape="square"
            onClick={closeModal}
            className="bg-gray-50"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </Button>
        </DialogClose>
      ),
      content: (
        <NewProjectModalConfig
          isLoading={state.isLoading}
          stepsStatus={state.stepsStatus}
          validateFileName={validateFileName}
          actions={actions}
          state={state}
          onSearchStarted={handleSearchFlowStarted}
          onSearchFailed={handleSearchFlowFailed}
          onSearchCompleted={handleSearchFlowCompleted}
          setSearchHandler={(handler) => {
            searchHandlerRef.current = handler;
          }}
        />
      ),
      footer: (
        <div className="flex items-center justify-end p-0 border-t shrink-0">
          <AccessTooltip access={access}>
            <PrimaryActionButton
              onClick={handleFileSubmit}
              disabled={primaryActionDisabled}
              icon={primaryActionIcon}
            >
              {primaryActionLabel}
            </PrimaryActionButton>
          </AccessTooltip>
        </div>
      ),
    },
    export: {
      title: t("modal_manager.main.export_modal_title"),
      subtitle: null,
      headerElement: (
        <DialogClose
          asChild
          className="!mt-0 bg-gray-50 h-6 w-6 text-center flex items-center justify-center"
        >
          <Button
            variant="ghost"
            size="iconXs"
            shape="square"
            onClick={closeModal}
            className="bg-gray-50"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </Button>
        </DialogClose>
      ),
      content: (
        <ExportModalConfig
          actions={actions}
          state={state}
          projectId={project_id as Id<"project">}
          closeModal={closeModal}
        />
      ),
      footer: (
        <div>
          <Button
            variant="default"
            className="h-8 px-4 rounded-md hover:bg-orange-600"
            onClick={exportData}
            // Disable if either no columns or no views are selected, or if export is in progress
            disabled={
              isExporting ||
              !hasSelectedColumns(exportSelectedColumns) ||
              !hasSelectedViews(exportSelectedViews)
            }
          >
            {isExporting ? (
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                {t("modal_manager.main.export_button")}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Download className="w-4 h-4 mr-2" />
                {t("modal_manager.main.export_button")}
              </div>
            )}
          </Button>
        </div>
      ),
    },
    showPrompt: {
      title: (
        <>
          {t("modal_manager.main.prompt_for_column_title")}
          <span className="font-normal text-md"> {modalData?.columnName}</span>
        </>
      ),
      subtitle: null,
      headerElement: (
        <DialogClose
          asChild
          className="!mt-0 bg-gray-50 h-6 w-6 text-center flex items-center justify-center"
        >
          <Button
            variant="ghost"
            size="icon"
            onClick={closeModal}
            className="w-6 h-6 bg-gray-50 rounded-md"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </Button>
        </DialogClose>
      ),
      content:
        modalData?.columnPrompt &&
        typeof modalData.columnPrompt !== "string" ? (
          <ColumnModalConfig
            state={state}
            actions={actions}
            projectId={project_id}
            savedJsonSchemas={contextSavedJsonSchemas}
            mentionsRef={mentionsRef}
            promptOptionsRef={promptOptionsRef}
            localMentionsTextAreaValueState={localMentionsTextAreaValueState}
            setLocalMentionsTextAreaValueState={
              setLocalMentionsTextAreaValueState
            }
            promptSearch={promptSearch}
            setPromptSearch={setPromptSearch}
            validColumnNames={validColumnNames}
            filteredSavedPrompts={filteredSavedPrompts}
            groupedSavedPrompts={groupedSavedPrompts}
            handleSelectSavedPrompt={handleSelectSavedPrompt}
            localTagTextareaValue={localTagTextareaValue}
            setLocalTagTextareaValue={setLocalTagTextareaValue}
            isReadOnly={true}
            useCostEstimation={false}
          />
        ) : (
          <div className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
            <Info className="w-10 h-10 mb-4 text-primary" />
            <p className="font-semibold text-sm">
              {t("modal_manager.main.no_prompt_title")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("modal_manager.main.no_prompt_message", {
                columnName: modalData?.columnName || "this",
              })}
            </p>
          </div>
        ),
      footer: null,
    },
    settings: {
      title: t("modal_manager.main.settings"),
      subtitle: null,
      headerElement: (
        <DialogClose
          asChild
          className="!mt-0 bg-gray-50 h-6 w-6 text-center flex items-center justify-center"
        >
          <Button
            variant="ghost"
            onClick={closeModal}
            size="iconXs"
            shape="square"
            className="bg-gray-50"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </Button>
        </DialogClose>
      ),
      content: <SettingsModalConfig onApiKeySave={onApiKeySave} />,
      footer: null,
    },
    summary: {
      title: t("modal_manager.main.summary"),
      subtitle: null,
      headerElement: (
        <DialogClose
          asChild
          className="!mt-0 bg-gray-50 h-6 w-6 text-center flex items-center justify-center"
        >
          <Button
            variant="ghost"
            onClick={closeModal}
            size="icon"
            className="w-6 h-6 bg-gray-50 rounded-md"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </Button>
        </DialogClose>
      ),
      content: <SummaryModalSettings />,
      footer: null,
    },
    alert: {
      title: "Create Alert",
      subtitle: "Get notified when your data meets specific criteria.",
      headerElement: (
        <DialogClose
          asChild
          className="!mt-0 bg-muted/40 h-6 w-6 text-center flex items-center justify-center"
        >
          <Button
            variant="ghost"
            onClick={closeModal}
            size="icon"
            className="w-6 h-6 bg-gray-100 rounded-md"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </Button>
        </DialogClose>
      ),
      content: (
        <AlertModalConfig
          onSave={handleSaveAlert}
          onCancel={closeModal}
          isLoading={isLoading}
        />
      ),
      footer: null, // The config component provides its own footer
    },
    schedule: {
      title: t("modal_manager.schedule_modal_config.schedule_title"),
      subtitle: t("modal_manager.schedule_modal_config.schedule_subtitle"),
      headerElement: (
        <DialogClose asChild>
          <Button
            variant="ghost"
            size="iconXs"
            shape="square"
            onClick={closeModal}
            className="bg-gray-50"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </Button>
        </DialogClose>
      ),
      content: (
        <SchedulingModalConfig
          onSave={handleSaveSchedule}
          onCancel={closeModal}
          isLoading={isLoading}
          state={state}
          actions={actions}
          projectId={project_id}
          columns={columns}
          savedJsonSchemas={contextSavedJsonSchemas}
          mentionsRef={mentionsRef}
          promptOptionsRef={promptOptionsRef}
          localMentionsTextAreaValueState={localMentionsTextAreaValueState}
          setLocalMentionsTextAreaValueState={
            setLocalMentionsTextAreaValueState
          }
          promptSearch={promptSearch}
          setPromptSearch={setPromptSearch}
          validColumnNames={validColumnNames}
          filteredSavedPrompts={filteredSavedPrompts}
          groupedSavedPrompts={groupedSavedPrompts}
          handleSelectSavedPrompt={handleSelectSavedPrompt}
          localTagTextareaValue={localTagTextareaValue}
          setLocalTagTextareaValue={setLocalTagTextareaValue}
        />
      ),
      footer: null,
    },
  };

  // Get the modal configuration and set a default one
  const { title, content, footer, subtitle, headerElement } =
    modalConfig[modalType || "newProject"];

  //Return the UniversalModal component
  return (
    <UniversalModal
      isOpen={isModalOpen}
      subtitle={subtitle || ""}
      headerElement={headerElement || null}
      title={title}
      content={content}
      footer={footer}
      closeModal={closeModal}
      modalType={modalType}
      modalSubtype={
        promptOptions.promptType === "schema" ? promptOptions.schemaType : ""
      }
      isTableVisible={state.showFileTable}
      preventClose={preventClose}
      activeTab={state.activeTab}
      exaSearchType={state.exaSearchType}
      exaActionType={state.exaActionType}
    />
  );
};

export default ModalManager;

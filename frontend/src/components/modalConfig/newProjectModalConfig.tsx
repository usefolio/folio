import React, { useRef, useEffect, useLayoutEffect, useState } from "react";
import {
  Connector,
  FileWithProgress,
  NewProjectModalConfigProps,
} from "../../interfaces/interfaces";
import { validateFileSelection } from "@/utils/fileValidation";
import { useTranslation } from "react-i18next";
import { useCallback } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import {
  FileSpreadsheet,
  Trash2,
  Loader2,
  ArrowRight,
  Database,
  FileJson,
  FileText,
  RotateCcw,
  Check,
  Calendar as CalendarIcon,
} from "lucide-react";
import { format } from "date-fns";
import { ProgressTracker } from "./progressTracker";
import FileStatusTable from "./fileStatusTable";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SecondaryIconButton } from "@/components/ui/actionButtons";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { RadioGroup } from "../ui/radio-group";
import { Label } from "../ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  SelectItem,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
} from "@/components/ui/select";
import { Input } from "../ui/input";
import { Step } from "../../interfaces/interfaces";
import FloatingLabelInput from "../form/floatingLabelInput";
import FloatingLabelSelect from "../form/floatingLabelSelect";
import { v4 as uuidv4 } from "uuid";
import { useAction, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { DateRange } from "react-day-picker";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { sanitizeProjectName } from "@/utils/projectNameUtils";
import { useBillingBalance } from "@/hooks/useBillingBalance";
import { type BillingPlanId, resolvePlanIdFromSummary, type UploadLimit } from "@/types/types";
import { type FileInvalidReason, type FileUploadStatus } from "@/interfaces/interfaces";
import { applyPlanLimit } from "@/utils/uploadLimits";
import WarningAlert from "@/components/ui/warningAlert";

// Temporary constants for Exa search result bounds.
// Centralize while product decides on final limits.
const EXA_MIN_RESULTS = 1;
const EXA_MAX_RESULTS = 100;

// Centralized per-plan upload limits
// For now we cap per-upload file count to 2 across all plans
const PLAN_UPLOAD_LIMITS: Record<BillingPlanId, UploadLimit> = Object.freeze({
  basic: 20,
  premium: 100,
  pro: 1000,
});



const NewProjectModalConfig: React.FC<NewProjectModalConfigProps> = ({
  isLoading,
  stepsStatus,
  validateFileName,
  accept = [".csv", ".parquet", ".pdf", ".mp3", ".xml"],
  actions,
  state,
  onSearchStarted,
  onSearchFailed,
  onSearchCompleted,
  setSearchHandler,
}) => {
  const { t } = useTranslation();
  const { summary } = useBillingBalance();
  const [isTableAnimating, setIsTableAnimating] = useState(false);
  const [hasInvalidFiles, setHasInvalidFiles] = useState(false);
  const [numResultsInput, setNumResultsInput] = useState(
    String(state.exaNumResults),
  );
  // Date selection state
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  // PROJECT NAME = FILE NAME IN THIS CASE
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      actions.setProjectName(e.target.value);
      actions.setError(validateFileName(e.target.value));
    },
    [actions.setProjectName, actions.setError],
  );
  const hasLoadedRef = useRef(false);
  const [stableSteps, setStableSteps] = useState<Step[]>(() =>
    stepsStatus.map((step) => ({ ...step })),
  );
  const [numberOfResults, setNumberOfResults] = useState<number | null>(null); // State for results count
  const searchExaAction = useAction(api.projects.searchExa);
  const chatAvailability = useQuery(api.chat.getChatAvailability, {}) as
    | { exaKeyConfigured?: boolean; exaReason?: string }
    | undefined;
  const isExaSearchDisabled = chatAvailability?.exaKeyConfigured === false;
  const exaUnavailableReason =
    chatAvailability?.exaReason ?? "EXA_AI_KEY is not set in the environment.";
  // Handle file table visibility animation
  useEffect(() => {
    if (state.showFileTable !== undefined) {
      setIsTableAnimating(true);

      const timer = setTimeout(() => {
        setIsTableAnimating(false);
      }, 400);

      return () => clearTimeout(timer);
    }
  }, [state.showFileTable]);

  useEffect(() => {
    setNumResultsInput(String(state.exaNumResults));
  }, [state.exaNumResults]);

  useLayoutEffect(() => {
    if (isLoading) {
      // When loading starts or steps change, update stable copy
      setStableSteps(stepsStatus.map((step) => ({ ...step })));
    }
  }, [isLoading, stepsStatus]);
  // Set hasLoaded flag when first time entering loading state
  useEffect(() => {
    if (isLoading && !hasLoadedRef.current) {
      hasLoadedRef.current = true;
    }
  }, [isLoading]);
  useEffect(() => {
    if (state.exaSearchType !== "news_article") {
      setDateRange(undefined);
    }
  }, [state.exaSearchType]);
  const MAX_FILE_SIZE = 5000 * 1024 * 1024; // 100MB in bytes

  const onDrop = useCallback(
    (acceptedFiles: File[], fileRejections: FileRejection[] = []) => {
      if (acceptedFiles.length > 0 || (fileRejections && fileRejections.length > 0)) {
        // Determine file-limit based on billing plan (centralized)
        const planId = resolvePlanIdFromSummary(summary);
        const planLabel = t(`billing.plans.${planId}`);
        const limit = PLAN_UPLOAD_LIMITS[planId];

        // Convert Files to FileWithProgress objects (do not slice by plan; we mark over-limit later)
        const newFilesWithProgress = acceptedFiles.map((file) => ({
          id: uuidv4(),
          file,
          status: "pending" as FileUploadStatus,
          progress: 0,
          isInvalid: false,
          invalidReason: null,
        }));

        if (!state.projectName) {
          const rawName = acceptedFiles[0].name;
          const lastDot = rawName.lastIndexOf(".");
          const base = lastDot > 0 ? rawName.slice(0, lastDot) : rawName;
          // Remove periods from the prefilled project name
          const baseWithoutDots = base.replace(/\./g, " ");
          const projectName = sanitizeProjectName(baseWithoutDots).substring(
            0,
            30,
          );
          actions.setProjectName(projectName);
        }

        // Map invalid-type rejections into invalid FileWithProgress entries
        const invalidTypeRejections = (fileRejections || []).filter((rej) =>
          (rej.errors || []).some((e) => e.code === "file-invalid-type"),
        );
        const rejectedAsInvalid: FileWithProgress[] = invalidTypeRejections.map(
          (rej: FileRejection) => ({
            id: uuidv4(),
            file: rej.file as File,
            status: "pending" as FileUploadStatus,
            progress: 0,
            isInvalid: true,
            invalidReason: "invalid-file-type" as FileInvalidReason,
          }),
        );

        // Combine with existing files if any
        let combinedFiles: FileWithProgress[] = [...newFilesWithProgress, ...rejectedAsInvalid];
        if (
          state.selectedFiles &&
          (state.selectedFiles as FileWithProgress[]).length > 0
        ) {
          combinedFiles = [
            ...(state.selectedFiles as FileWithProgress[]),
            ...newFilesWithProgress,
            ...rejectedAsInvalid,
          ];
        }

        // Run validations on all files
        const validationResult = validateFileSelection(combinedFiles);

        const { files: filesAfterLimit, overLimitCount } = applyPlanLimit(
          validationResult.markedFiles,
          limit,
        );

        actions.setSelectedFiles(filesAfterLimit);
        setHasInvalidFiles(
          validationResult.hasInvalidFiles || overLimitCount > 0 || invalidTypeRejections.length > 0,
        );

        // Derive top-level error message priority:
        // 1) If any invalid-type rejection exists, list all unsupported types
        // 2) else show validationResult.errorMessage (mixed files or single-file type constraints)
        if (invalidTypeRejections.length > 0) {
          const invalidExts = Array.from(
            new Set(
              invalidTypeRejections.map((rej) => {
                const name = rej.file?.name || "";
                if (name && name.includes(".")) {
                  return name.split(".").pop()?.toLowerCase() || "unknown";
                }
                return rej.file?.type || "unknown";
              }),
            ),
          );
          const messageKey =
            invalidExts.length > 1
              ? "modal_manager.new_project_modal_config.invalid_file_types_error"
              : "modal_manager.new_project_modal_config.invalid_file_type_error";
          actions.setError(
            t(messageKey, {
              type: invalidExts[0],
              types: invalidExts.join(", "),
            }),
          );
          actions.setShowFileTable(true);
        } else if (overLimitCount > 0) {
          const limStr = limit === "unlimited" ? "∞" : String(limit);
          actions.setError(
            t("modal_manager.new_project_modal_config.file_limit_reached_error", {
              plan: planLabel,
              limit: limStr,
            }),
          );
          actions.setShowFileTable(true);
        } else if (validationResult.errorMessage) {
          actions.setError(validationResult.errorMessage);
          actions.setShowFileTable(true);
        } else {
          actions.setError(null);
        }

        // Handle file-too-large errors from rejections (does not add to table)
        const tooLarge = (fileRejections || [])
          .flatMap((rej) => rej.errors || [])
          .find((e) => e.code === "file-too-large");
        if (tooLarge && invalidTypeRejections.length === 0 && !validationResult.errorMessage) {
          actions.setError(
            t("modal_manager.new_project_modal_config.file_too_large_error", {
              size: "5000MB",
            }),
          );
          actions.setShowFileTable(true);
        }
      }
    },
    [state.projectName, state.selectedFiles, summary],
  );

  // Format file size
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  // Calculate total file size
  const calculateTotalFileSize = (files: FileWithProgress[]): number => {
    return files.reduce((total, file) => total + file.file.size, 0);
  };

  const mapAcceptFormats = (formats: string[]) => {
    const mimeMapping: Record<string, string[]> = {
      ".csv": ["text/csv"],
      ".parquet": ["application/vnd.apache.parquet"],
      ".json": ["application/json"],
      ".xml": ["application/xml"],
      ".txt": ["text/plain"],
      ".pdf": ["application/pdf"],
      ".png": ["image/png"],
      ".jpg": ["image/jpeg"],
      ".jpeg": ["image/jpeg"],
      ".mp3": ["audio/mpeg"],
    };

    return formats.reduce<Record<string, string[]>>((acc, ext) => {
      const mimeType = mimeMapping[ext];
      if (mimeType) {
        mimeType.forEach((type) => {
          acc[type] = [ext];
        });
      }
      return acc;
    }, {});
  };
  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    maxSize: MAX_FILE_SIZE,
    accept: mapAcceptFormats(accept),
    maxFiles: 10000,
    noClick: true,
    // onDropRejected handled via onDrop's second param to avoid race conditions
  });
  const exaSearchTypes = [
    {
      value: "company",
      label: t("modal_manager.new_project_modal_config.company"),
    },
    {
      value: "news_article",
      label: t("modal_manager.new_project_modal_config.news_article"),
    },
    {
      value: "github",
      label: t("modal_manager.new_project_modal_config.github"),
    },
    {
      value: "personal_site",
      label: t("modal_manager.new_project_modal_config.personal_site"),
    },
    {
      value: "linkedin_profile",
      label: t("modal_manager.new_project_modal_config.linkedin_profile"),
    },
  ];
  const getExaSearchErrorMessage = useCallback(
    (rawMessage?: string) => {
      const genericMessage = t(
        "modal_manager.new_project_modal_config.search_error_generic",
      );

      if (!rawMessage) {
        return genericMessage;
      }

      const statusMatch = rawMessage.match(/Exa API Error:\s*(\d{3})/i);
      if (statusMatch) {
        const statusCode = Number(statusMatch[1]);
        if (statusCode >= 400 && statusCode < 500) {
          return t("modal_manager.new_project_modal_config.search_error_exa_4xx");
        }
        if (statusCode >= 500) {
          return t("modal_manager.new_project_modal_config.search_error_exa");
        }
      }

      const convexSearchExaPattern = /\[CONVEX\s+[^)]*\(projects:searchExa\)\]/i;
      const includesExaApiError = rawMessage.toLowerCase().includes("exa api error");

      if (convexSearchExaPattern.test(rawMessage) || includesExaApiError) {
        return t("modal_manager.new_project_modal_config.search_error_exa");
      }

      return rawMessage;
    },
    [t],
  );
  const handleExaSubmit = useCallback(async () => {
    if (isExaSearchDisabled) return;
    if (state.exaActionType === "search" && !state.exaQuery.trim()) return;
    if (
      state.exaActionType === "findSimilar" &&
      !state.exaFindSimilarUrl.trim()
    )
      return;

    actions.setIsExaLoading(true);
    actions.setError(null);
    setNumberOfResults(null);
    onSearchStarted?.();

    try {
      const { csvData, resultsCount, fileName } = await searchExaAction({
        actionType: state.exaActionType,
        query: state.exaQuery,
        url: state.exaFindSimilarUrl,
        category: state.exaSearchType,
        numResults: state.exaNumResults,
        startDate: dateRange?.from?.toISOString(),
        endDate: dateRange?.to?.toISOString(),
      });
      if (resultsCount === 0 || !csvData) {
        const noResultsMessage = t(
          "modal_manager.new_project_modal_config.no_results_found",
        );
        setNumberOfResults(0);
        actions.setError(noResultsMessage);
        onSearchFailed?.(noResultsMessage);
        return;
      }
      const csvFile = new File([csvData], fileName, {
        type: "text/csv",
      });
      const fileWithProgress: FileWithProgress = {
        id: uuidv4(),
        file: csvFile,
        status: "pending",
        progress: 0,
      };

      const rawProjectName =
        state.exaActionType === "search"
          ? state.exaQuery
          : (() => {
              try {
                return new URL(state.exaFindSimilarUrl).hostname;
              } catch {
                return state.exaFindSimilarUrl;
              }
            })();
      const projectName = sanitizeProjectName(rawProjectName).substring(0, 30);
      setNumberOfResults(resultsCount);
      onSearchCompleted?.({
        file: fileWithProgress,
        projectName,
        resultsCount,
      });
    } catch (error) {
      console.error("Exa search failed:", error);
      const errorMessage =
        error instanceof Error
          ? getExaSearchErrorMessage(error.message)
          : t("modal_manager.new_project_modal_config.search_error_generic");
      actions.setError(errorMessage);
      onSearchFailed?.(errorMessage);
    } finally {
      actions.setIsExaLoading(false);
    }
  }, [
    actions,
    dateRange,
    getExaSearchErrorMessage,
    onSearchCompleted,
    onSearchFailed,
    onSearchStarted,
    searchExaAction,
    state.exaActionType,
    state.exaFindSimilarUrl,
    state.exaNumResults,
    state.exaQuery,
    state.exaSearchType,
    isExaSearchDisabled,
    t,
  ]);

  useEffect(() => {
    setSearchHandler?.(handleExaSubmit);
    return () => setSearchHandler?.(null);
  }, [handleExaSubmit, setSearchHandler]);

  const handleQuerySubmit = () => {
    if (!state.sqlQuery.trim()) return;

    actions.setIsQueryLoading(true);
    setTimeout(() => {
      actions.setIsQueryLoading(false);
      actions.setIsQueryEntered(true);
      actions.setProjectName("datawarehouse_data");
    }, 1000);
  };
  const inputAndSelectRenderer = () => {
    return (
      <>
        <FloatingLabelInput
          label={t("modal_manager.new_project_modal_config.project_name")}
          value={state.projectName}
          onChange={handleInputChange}
          placeholder={t(
            "modal_manager.new_project_modal_config.project_name_placeholder",
          )}
        />
      </>
    );
  };
  const removeButtonRenderer = () => {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={actions.clearSelection}
        className="h-6 w-6 p-0 rounded-md"
        disabled={hasUploadingFiles}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    );
  };

  const toggleFileTable = () => {
    if (state.showFileTable) {
      // When hiding the table:
      // 1. Start animation first
      // 2. Delay the actual state change until animation completes
      setIsTableAnimating(true);

      // Delay hiding the table to allow opacity animation to complete
      setTimeout(() => {
        actions.setShowFileTable(false);

        // Keep animation state for a bit longer to ensure modal resize happens after fade-out
        setTimeout(() => {
          setIsTableAnimating(false);
        }, 350);
      }, 300);
    } else {
      // When showing the table:
      // 1. Set animation state
      setIsTableAnimating(true);
      // 2. Change state immediately to show table
      actions.setShowFileTable(true);

      // Reset animation state after transition completes
      setTimeout(() => {
        setIsTableAnimating(false);
      }, 400);
    }
  };

  const handleRemoveFile = (id: string) => {
    actions.removeFile(id);

    // Get remaining files after removal
    if (!state.selectedFiles) {
      return;
    }

    const remainingFiles = (state.selectedFiles as FileWithProgress[]).filter(
      (file) => file.id !== id,
    );

    // If all files are removed, clear the selection
    if (remainingFiles.length === 0) {
      actions.clearSelection();
      setHasInvalidFiles(false);
      actions.setError(null);
      return;
    }

    // Special handling for parquet and csv files - if just the the invalid one was removed,
    // Ensure the remaining one is now valid
    const hasParquetFile = remainingFiles.some((file) =>
      file.file.name.toLowerCase().endsWith(".parquet"),
    );
    const hasCsvFile = remainingFiles.some((file) =>
      file.file.name.toLowerCase().endsWith(".csv"),
    );

    if (
      (hasParquetFile && remainingFiles.length === 1) ||
      (hasCsvFile && remainingFiles.length === 1)
    ) {
      // Single file remaining - should be valid
      const updatedFile = {
        ...remainingFiles[0],
        isInvalid: false,
        invalidReason: null,
      };
      actions.setSelectedFiles([updatedFile]);
      setHasInvalidFiles(false);
      actions.setError(null);
      return;
    }

    // For other cases, revalidate the remaining files
    const validationResult = validateFileSelection(remainingFiles);

    // Re-apply plan limit after removal
    const planId = resolvePlanIdFromSummary(summary);
    const planLabel = t(`billing.plans.${planId}`);
    const limit = PLAN_UPLOAD_LIMITS[planId];
    const { files: filesAfterLimit, overLimitCount } = applyPlanLimit(
      validationResult.markedFiles,
      limit,
    );

    actions.setSelectedFiles(filesAfterLimit);
    setHasInvalidFiles(
      validationResult.hasInvalidFiles || overLimitCount > 0,
    );

    if (overLimitCount > 0) {
      const limStr = limit === "unlimited" ? "∞" : String(limit);
      actions.setError(
        t("modal_manager.new_project_modal_config.file_limit_reached_error", {
          plan: planLabel,
          limit: limStr,
        }),
      );
    } else if (validationResult.errorMessage) {
      actions.setError(validationResult.errorMessage);
    } else {
      actions.setError(null);
    }
  };
  const stepsForTracker =
    isLoading
      ? stepsStatus
      : stableSteps.length > 0
        ? stableSteps
        : stepsStatus;
  const getFileTypeIcon = (fileName: string) => {
    const extension = fileName.split(".").pop()?.toLowerCase();
    switch (extension) {
      case "csv":
      case "xlsx":
      case "xls":
        return <FileSpreadsheet className="w-6 h-6 text-muted-foreground" />;
      case "json":
        return <FileJson className="w-6 h-6 text-muted-foreground" />;
      default:
        return <FileText className="w-6 h-6 text-muted-foreground" />;
    }
  };

  // Check if any files are currently uploading
  const hasUploadingFiles = React.useMemo(() => {
    if (!state.selectedFiles) return false;
    return (state.selectedFiles as FileWithProgress[]).some(
      (file) => file.status === "uploading",
    );
  }, [state.selectedFiles]);

  // Determine if submit should be disabled (due to uploading, invalid files, or errors)
  const isSubmitDisabled = React.useMemo(() => {
    const baseDisabled = hasUploadingFiles || hasInvalidFiles || !!state.error;
    if (state.activeTab === "exa") {
      const missingSearchInput =
        (state.exaActionType === "search" && !state.exaQuery.trim()) ||
        (state.exaActionType === "findSimilar" &&
          !state.exaFindSimilarUrl.trim());
      return (
        baseDisabled ||
        state.isExaLoading ||
        missingSearchInput ||
        isExaSearchDisabled
      );
    }
    return baseDisabled;
  }, [
    hasUploadingFiles,
    hasInvalidFiles,
    isExaSearchDisabled,
    state.activeTab,
    state.error,
    state.exaActionType,
    state.exaFindSimilarUrl,
    state.exaQuery,
    state.isExaLoading,
  ]);

  // Expose isSubmitDisabled as part of the component's API
  useEffect(() => {
    if (actions.setSubmitDisabled) {
      actions.setSubmitDisabled(isSubmitDisabled);
    }
  }, [actions, isSubmitDisabled]);

  useEffect(() => {
    if (!state.selectedFiles) {
      actions.setShowFileTable(false);
    }
  }, [state.selectedFiles]);
  const validateUrl = (url: string): boolean => {
    if (!url) return true; // Don't show error for empty input
    // Prepend protocol for validation if missing, making it more robust
    const urlWithProtocol = /^(https?|ftp):\/\//i.test(url)
      ? url
      : `https://${url}`;
    const urlPattern = new RegExp(
      "^(https?|ftp)://" + // protocol
        "((([a-z\\d]([a-z\\d-]*[a-z\\d])*)\\.)+[a-z]{2,}|" + // domain name
        "((\\d{1,3}\\.){3}\\d{1,3}))" + // OR ip (v4) address
        "(\\:\\d+)?(\\/[-a-z\\d%_.~+]*)*" + // port and path
        "(\\?[;&a-z\\d%_.~+=-]*)?" + // query string
        "(\\#[-a-z\\d_]*)?$",
      "i",
    );
    return urlPattern.test(urlWithProtocol);
  };

  const handleUrlInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newUrl = e.target.value;
    actions.setExaFindSimilarUrl(newUrl);
    if (!validateUrl(newUrl)) {
      actions.setError(
        t("modal_manager.new_project_modal_config.invalid_url_error"),
      );
    } else {
      actions.setError(null);
    }
  };

  const handleExaClear = () => {
    if (state.exaActionType === "search") {
      actions.setExaQuery("");
    } else {
      actions.setExaFindSimilarUrl("");
    }
    // Also clear any potential validation errors
    actions.setError(null);
  };
  // Progress section shown during uploads
  const renderUploadProgress = () => {
    if (!state.isUploading || !state.selectedFiles) return null;

    return (
      <div className="mt-4 mb-2 border-t pt-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium">Upload Progress</h3>
        </div>
        <div className="p-3 bg-gray-50 border rounded-sm">
          <ProgressTracker
            steps={stepsForTracker}
            files={state.selectedFiles as FileWithProgress[]}
            viewTable={state.showFileTable}
            toggleFileTable={toggleFileTable}
          />
        </div>
      </div>
    );
  };

  // Render file info text
  const renderFileInfo = () => {
    const files = state.selectedFiles as FileWithProgress[];
    if (!files || files.length === 0) return null;

    const totalSize = calculateTotalFileSize(files);
    const formattedTotalSize = formatFileSize(totalSize);

    if (files.length === 1) {
      // Show filename for single file
      return (
        <div className="flex flex-col">
          <span className="text-xs truncate max-w-[200px]">
            {files[0].file.name}
          </span>
          <span className="text-xs text-gray-400">{formattedTotalSize}</span>
        </div>
      );
    } else {
      // Show count for multiple files
      return (
        <div className="flex flex-col">
          <span className="text-xs truncate max-w-[200px]">
            {files.length} {t("modal_manager.new_project_modal_config.files")}
          </span>
          <span className="text-xs text-gray-400">{formattedTotalSize}</span>
        </div>
      );
    }
  };

  return (
    <>
      {!isLoading ? (
        <Tabs
          value={state.activeTab}
          defaultValue="upload"
          className="flex-grow flex flex-col"
          onValueChange={(value) => {
            const nextTab = value as "upload" | "exa" | "datawarehouse";
            if (state.activeTab === "exa" && nextTab !== "exa") {
              actions.setError(null);
              setNumberOfResults(null);
            }
            actions.setActiveTab(nextTab);
          }}
        >
          <TabsList className="flex w-full bg-white p-0 relative h-full">
            <TabsTrigger
              value="upload"
              className="flex-1 data-[state=active]:text-black data-[state=active]:border-b-2 data-[state=active]:border-primary text-gray-500 rounded-none border-b border-gray-200"
            >
              {t("modal_manager.new_project_modal_config.upload_file_tab")}
            </TabsTrigger>
            <div className="w-px bg-gray-200 self-stretch my-2" />
            <TabsTrigger
              value="exa"
              className="flex-1 data-[state=active]:text-black data-[state=active]:border-b-2 data-[state=active]:border-primary text-gray-500 rounded-none border-b border-gray-200"
            >
              {t("modal_manager.new_project_modal_config.search_tab_label")}
            </TabsTrigger>
            <div className="w-px bg-gray-200 self-stretch my-2" />
            <TabsTrigger
              value="datawarehouse"
              disabled
              className="flex-1 data-[state=active]:text-black data-[state=active]:border-b-2 data-[state=active]:border-primary text-gray-500 rounded-none border-b border-gray-200"
            >
              {t("modal_manager.new_project_modal_config.data_warehouse_tab")}
            </TabsTrigger>
          </TabsList>
          <TabsContent
            value="upload"
            className="flex-grow flex flex-col h-full data-[state=active]:p-6"
          >
            <div className="flex flex-col h-full">
              {/* File Upload Area */}
              <div className="flex-1">
                {!state.selectedFiles ? (
                  <div
                    {...getRootProps()}
                    className={cn(
                      "relative overflow-hidden border-2 border-dotted rounded-sm p-6 text-center cursor-pointer transition-colors flex flex-col justify-center items-center",
                      isDragActive
                        ? "border-primary bg-primary/5"
                        : "border-muted bg-muted",
                      state.error && "border-destructive",
                    )}
                  >
                    <div className="pointer-events-none absolute inset-0 bg-[url('/file_upload_img.png')] bg-center bg-no-repeat bg-[length:240px_auto] opacity-30 blur-[1px]" />
                    <input {...getInputProps()} />
                    <div className="relative z-10 flex flex-col items-center gap-2">
                      <p className="text-sm text-muted-foreground">
                        {t(
                          "modal_manager.new_project_modal_config.drag_drop_text",
                        )}
                        <span
                          className="text-primary cursor-pointer hover:underline"
                          onClick={open}
                        >
                          {t(
                            "modal_manager.new_project_modal_config.click_to_select",
                          )}
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t(
                          "modal_manager.new_project_modal_config.max_file_size",
                          {
                            size: "5GB",
                          },
                        )}
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="border rounded-sm">
                      <div className="flex items-center justify-between p-2 border-b">
                        <div className="flex items-center">
                          {getFileTypeIcon(
                            (state.selectedFiles as FileWithProgress[])[0].file
                              .name,
                          )}
                          <div className="ml-2">{renderFileInfo()}</div>
                        </div>
                        <div className="flex flex-row items-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={toggleFileTable}
                            className="rounded-md mr-1 text-xs font-normal px-3 h-5"
                            disabled={hasUploadingFiles}
                          >
                            {state.showFileTable ? (
                              <span className="flex items-center">
                                {t(
                                  "modal_manager.new_project_modal_config.hide_files",
                                )}
                              </span>
                            ) : (
                              <span className="flex items-center">
                                {t(
                                  "modal_manager.new_project_modal_config.view_files",
                                )}
                              </span>
                            )}
                          </Button>

                          <div className="flex flex-row items-center">
                            {/* Show file table if toggled or if uploads are happening */}
                            {removeButtonRenderer()}
                          </div>
                        </div>
                      </div>
                      <div className="p-2 space-y-2">
                        {/* File table with animation control */}
                        <div
                          className="file-table-container"
                          style={{
                            maxHeight: state.showFileTable ? "300px" : "0",
                            opacity: state.showFileTable ? "1" : "0",
                            overflow: "hidden",
                            transform: `translateY(${state.showFileTable ? "0" : "-10px"})`,
                            transformOrigin: "top",
                            transition:
                              "max-height 350ms ease-in-out, opacity 300ms ease-in-out, transform 300ms ease-in-out",
                            // Add a slight delay to opacity when hiding to let height animation start first
                            transitionDelay: state.showFileTable
                              ? "0ms"
                              : "0ms, 50ms, 0ms",
                            // Hide scrollbar during animation
                            marginRight: isTableAnimating ? "-17px" : "0",
                            paddingRight: isTableAnimating ? "17px" : "0",
                          }}
                        >
                          {/* Keep table in THE DOM during transition to allow for fade-out animation */}
                          {(state.showFileTable || isTableAnimating) && (
                            <FileStatusTable
                              files={state.selectedFiles as FileWithProgress[]}
                              isUploading={hasUploadingFiles}
                              removeFile={handleRemoveFile}
                              isVisible={state.showFileTable}
                            />
                          )}
                        </div>
                        {inputAndSelectRenderer()}
                      </div>
                    </div>

                    {/* Always show file progress if uploads are in progress */}
                    {renderUploadProgress()}
                  </>
                )}

                {state.error && (
                  <div className="mt-2 w-full">
                    <WarningAlert className="w-full" message={state.error} />
                  </div>
                )}
              </div>
            </div>
          </TabsContent>
          <TabsContent
            value="exa"
            className="flex-grow flex flex-col h-full data-[state=active]:py-0 data-[state=active]:px-4 mb-0"
          >
            <div className="flex flex-col h-full">
              {/* Action Type Radio Group */}
              <RadioGroup
                className="flex flex-row justify-start gap-4 mb-3"
                value={state.exaActionType}
                onValueChange={(value: "search" | "findSimilar") =>
                  actions.setExaActionType(value as "search" | "findSimilar")
                }
              >
                {/* Search Option */}
                <label
                  htmlFor="exaAction_search"
                  className="flex items-center cursor-pointer"
                >
                  <input
                    type="radio"
                    name="exaActionType"
                    id="exaAction_search"
                    value="search"
                    checked={state.exaActionType === "search"}
                    disabled={isExaSearchDisabled}
                    onChange={(e) =>
                      actions.setExaActionType(
                        e.target.value as "search" | "findSimilar",
                      )
                    }
                    className="hidden peer"
                  />
                  <div className="w-4 h-4 flex items-center justify-center border peer-checked:bg-[#FF6B00] peer-checked:border-[#FF6B00] rounded-none border-[#FF6B00]">
                    <Check
                      strokeWidth={3}
                      className={`w-3 h-3 text-white font-bold ${
                        state.exaActionType === "search"
                          ? "opacity-100"
                          : "opacity-0"
                      }`}
                    />
                  </div>
                  <Label
                    className="ml-2 font-medium text-sm cursor-pointer"
                    htmlFor="exaAction_search"
                  >
                    {t("modal_manager.new_project_modal_config.search")}
                  </Label>
                </label>

                {/* Find Similar Option */}
                <label
                  htmlFor="exaAction_findSimilar"
                  className="flex items-center cursor-pointer"
                >
                  <input
                    type="radio"
                    name="exaActionType"
                    id="exaAction_findSimilar"
                    value="findSimilar"
                    checked={state.exaActionType === "findSimilar"}
                    disabled={isExaSearchDisabled}
                    onChange={(e) =>
                      actions.setExaActionType(
                        e.target.value as "search" | "findSimilar",
                      )
                    }
                    className="hidden peer"
                  />
                  <div className="w-4 h-4 flex items-center justify-center border peer-checked:bg-[#FF6B00] peer-checked:border-[#FF6B00] rounded-none border-[#FF6B00]">
                    <Check
                      strokeWidth={3}
                      className={`w-3 h-3 text-white font-bold ${
                        state.exaActionType === "findSimilar"
                          ? "opacity-100"
                          : "opacity-0"
                      }`}
                    />
                  </div>
                  <Label
                    className="ml-2 font-medium text-sm cursor-pointer"
                    htmlFor="exaAction_findSimilar"
                  >
                    {t("modal_manager.new_project_modal_config.find_similar")}
                  </Label>
                </label>
              </RadioGroup>
              {/* Main bordered container */}
              <div className="relative border rounded-md p-2 h-full flex flex-col">
                {/* Textarea fills the available space */}
                <div className="flex-grow">
                  {state.exaActionType === "search" ? (
                    <Textarea
                      value={state.exaQuery}
                      onChange={(e) => actions.setExaQuery(e.target.value)}
                      disabled={isExaSearchDisabled}
                      placeholder={t(
                        "modal_manager.new_project_modal_config.query_placeholder",
                      )}
                      className="w-full h-full border-none resize-none focus-visible:ring-0 focus-visible:ring-transparent p-0"
                    />
                  ) : (
                    <Input
                      value={state.exaFindSimilarUrl}
                      onChange={handleUrlInputChange}
                      disabled={isExaSearchDisabled}
                      placeholder={t(
                        "modal_manager.new_project_modal_config.url_placeholder",
                      )}
                      className="w-full h-auto border-none focus-visible:ring-0 focus-visible:ring-transparent p-0"
                    />
                  )}
                  {/* <Textarea
                    value={state.exaQuery}
                    onChange={(e) => actions.setExaQuery(e.target.value)}
                    placeholder={t(
                      "modal_manager.new_project_modal_config.query_placeholder",
                    )}
                    className="w-full h-full border-none resize-none focus-visible:ring-0 focus-visible:ring-transparent p-0"
                  /> */}
                </div>

                {/* Spacer div to push controls to the bottom */}
                <div className="mt-4 flex-shrink-0" />

                {/* Controls and Buttons Row */}
                <div className="flex items-center justify-between flex-shrink-0">
                  {/* Left side: Category and Number of Results */}
                  <div className="flex items-center space-x-1 mr-1">
                    {state.exaActionType === "search" && (
                      <div className="grid w-full max-w-sm items-center gap-1.5">
                        <label className="text-xs font-normal text-muted-foreground">
                          {t(
                            "modal_manager.new_project_modal_config.search_type",
                          )}
                        </label>
                        <Select
                          value={state.exaSearchType}
                          onValueChange={actions.setExaSearchType}
                          disabled={isExaSearchDisabled}
                        >
                          <SelectTrigger className="w-32 rounded-md h-8">
                            <SelectValue
                              placeholder={t(
                                "modal_manager.new_project_modal_config.search_category",
                              )}
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {exaSearchTypes.map((type) => (
                              <SelectItem key={type.value} value={type.value}>
                                {type.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    <div className="grid w-full max-w-sm items-center gap-1.5">
                      <label className="text-xs font-normal text-muted-foreground">
                        {t(
                          "modal_manager.new_project_modal_config.number_of_results_short",
                        )}
                      </label>
                      <Input
                        type="number"
                        value={numResultsInput}
                        disabled={isExaSearchDisabled}
                        onChange={(e) => {
                          const str = e.target.value;
                          setNumResultsInput(str);
                          // Update state immediately for valid values (including stepper +/-)
                          const parsed = parseInt(str, 10);
                          if (
                            !isNaN(parsed) &&
                            parsed >= EXA_MIN_RESULTS &&
                            parsed <= EXA_MAX_RESULTS
                          ) {
                            actions.setExaNumResults(parsed);
                          }
                        }}
                        onBlur={(e) => {
                          let value = parseInt(e.target.value, 10);
                          if (isNaN(value) || value < EXA_MIN_RESULTS) {
                            value = EXA_MIN_RESULTS;
                          } else if (value > EXA_MAX_RESULTS) {
                            value = EXA_MAX_RESULTS;
                          }
                          setNumResultsInput(String(value));
                          actions.setExaNumResults(value);
                        }}
                        min={EXA_MIN_RESULTS}
                        max={EXA_MAX_RESULTS}
                        className="w-[3.8rem] rounded-md h-8 p-2"
                        aria-label={t(
                          "modal_manager.new_project_modal_config.number_of_results",
                        )}
                      />
                    </div>
                    {state.exaSearchType === "news_article" &&
                      state.exaActionType === "search" && (
                        <div className="grid w-full max-w-sm items-center gap-1.5">
                          <label className="text-xs font-normal text-muted-foreground">
                            {t(
                              "modal_manager.new_project_modal_config.date_range",
                            )}
                          </label>
                          <Popover>
                            <PopoverTrigger asChild>
                          <Button
                            id="date"
                            variant="outline"
                            size="compact"
                            shape="square"
                            disabled={isExaSearchDisabled}
                            className={cn(
                              "w-auto justify-start text-left font-normal",
                              !dateRange && "text-muted-foreground",
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                                {dateRange?.from ? (
                                  dateRange.to ? (
                                    <>
                                      {format(dateRange.from, "LLL dd, y")} -{" "}
                                      {format(dateRange.to, "LLL dd, y")}
                                    </>
                                  ) : (
                                    format(dateRange.from, "LLL dd, y")
                                  )
                                ) : (
                                  <span>
                                    {t(
                                      "modal_manager.new_project_modal_config.pick_a_date",
                                    )}
                                  </span>
                                )}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent
                              className="w-auto p-0"
                              align="start"
                              side="top"
                              sideOffset={4}
                            >
                              <Calendar
                                mode="range"
                                defaultMonth={dateRange?.from}
                                selected={dateRange}
                                onSelect={setDateRange}
                                numberOfMonths={1}
                                fixedWeeks
                                className="!rounded-md"
                                disabled={{ after: new Date() }}
                              />
                            </PopoverContent>
                          </Popover>
                        </div>
                      )}
                  </div>

                  {/* Right side: Action Buttons */}
                  <div className="flex items-center space-x-1 mt-[1.45rem]">
                    <SecondaryIconButton
                      icon={<RotateCcw className="h-4 w-4" />}
                      onClick={handleExaClear}
                      disabled={state.isExaLoading || isExaSearchDisabled}
                    >
                      {t("modal_manager.new_project_modal_config.clear")}
                    </SecondaryIconButton>
                    {state.isExaLoading && (
                      <div className="flex items-center text-xs text-muted-foreground gap-1">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {t("modal_manager.new_project_modal_config.searching")}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Results Count and Error Message */}
              <div className="mt-2 space-y-2">
                {isExaSearchDisabled && (
                  <WarningAlert className="w-full" message={exaUnavailableReason} />
                )}
                {numberOfResults !== null && (
                  <p className="text-sm text-muted-foreground">
                    {t(
                      "modal_manager.new_project_modal_config.results_found",
                      { count: numberOfResults },
                    )}
                  </p>
                )}
                {state.error && (
                  <WarningAlert className="w-full" message={state.error} />
                )}
              </div>
            </div>
          </TabsContent>
          <TabsContent
            value="datawarehouse"
            className="flex-grow flex flex-col h-full data-[state=active]:p-6"
          >
            <div className="flex flex-col h-full">
              {!isLoading && (
                <>
                  {!state.isQueryEntered ? (
                    <div className="space-y-4">
                      <FloatingLabelSelect
                        label={t(
                          "modal_manager.new_project_modal_config.connector_label",
                        )}
                        value={state.selectedConnector.name}
                        onValueChange={(value: string) => {
                          const selectedConnector = state.connectors.find(
                            (c: Connector) => c.name === value,
                          );

                          if (selectedConnector) {
                            actions.setSelectedConnector(
                              selectedConnector.name,
                            );
                          } else {
                            console.warn(
                              "Selected connector not found, defaulting to first connector.",
                            );
                            actions.setSelectedConnector(
                              state.connectors[0].name,
                            );
                          }
                        }}
                      >
                        {state.connectors.map((connector) => (
                          <SelectItem
                            key={connector.name}
                            value={connector.name}
                          >
                            <div className="flex items-center justify-between w-full">
                              <div className="flex items-center">
                                <div
                                  className={`w-2 h-2 rounded-full mr-2 ${state.selectedConnector.isAlive ? "bg-green-500" : "bg-red-500"}`}
                                />
                                <span>{connector.name} </span>
                              </div>
                              <span className="text-xs text-gray-400 ml-1">
                                {connector.lastSync}
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      </FloatingLabelSelect>
                      <div className="relative mt-4">
                        <Textarea
                          value={state.sqlQuery}
                          onChange={(e) => actions.setSqlQuery(e.target.value)}
                          className="min-h-[100px] pt-6 pb-2 px-3 text-sm rounded-md peer"
                        />
                        <label className="absolute top-1 left-3 text-xs text-gray-500 transition-all peer-placeholder-shown:top-2.5 peer-placeholder-shown:text-sm peer-focus:top-1 peer-focus:text-xs">
                          {t(
                            "modal_manager.new_project_modal_config.sql_query_label",
                          )}
                        </label>
                        <Button
                          type="button"
                          className="absolute right-2 bottom-2 h-7 w-7 p-0 bg-gray-200 hover:bg-gray-300"
                          onClick={handleQuerySubmit}
                          disabled={
                            !state.sqlQuery.trim() || state.isQueryLoading
                          }
                        >
                          {state.isQueryLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin text-gray-600" />
                          ) : (
                            <ArrowRight className="h-4 w-4 text-gray-600" />
                          )}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="border rounded-sm">
                      <div className="flex items-center justify-between p-2 border-b">
                        <div className="flex items-center">
                          <Database className="w-6 h-6 text-muted-foreground" />
                          <div
                            className={`w-2 h-2 rounded-full mx-2 ${state.selectedConnector.isAlive ? "bg-green-500" : "bg-red-500"}`}
                          />
                          <span className="text-xs ml-2 truncate max-w-[200px]">
                            {state.selectedConnector.name}
                          </span>
                        </div>
                        <div className="flex items-center">
                          {removeButtonRenderer()}
                        </div>
                      </div>
                      <div className="p-2 space-y-2">
                        {inputAndSelectRenderer()}
                      </div>
                    </div>
                  )}

                  {state.error && (
                    <div className="mt-2 w-full">
                      <WarningAlert className="w-full" message={state.error} />
                    </div>
                  )}
                </>
              )}
            </div>
          </TabsContent>
        </Tabs>
      ) : (
        <div className="p-6 overflow-auto flex items-center justify-center">
          <div className="w-full">
            {/* The loading states are pre-stabilized and don't animate on first mount */}
            <ProgressTracker
              steps={stepsForTracker}
              files={state.selectedFiles as FileWithProgress[]}
              viewTable={state.showFileTable}
              toggleFileTable={toggleFileTable}
            />
          </div>
        </div>
      )}
    </>
  );
};

export default React.memo(NewProjectModalConfig);

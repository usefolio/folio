import { memo } from "react";
import { Loader2, Check, XCircle, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Step } from "../../interfaces/interfaces";
import FileStatusTable from "./fileStatusTable";
import { FileWithProgress } from "../../interfaces/interfaces";
import { Button } from "../ui/button";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp } from "lucide-react";
// This component renders a single indicator with proper animation handling
const StepIndicator = memo(
  ({
    step,
    files,
    viewTable,
    toggleFileTable,
  }: {
    step: Step;
    files?: FileWithProgress[];
    viewTable: boolean;
    toggleFileTable: () => void;
  }) => {
    const { t } = useTranslation();
    const isUploadStep = step.kind === "upload";

    return (
      <div className="flex items-center mb-2">
        {step.status === "loading" ? (
          <div className="w-5 h-5 mr-2 shrink-0 flex items-center justify-center">
            <Loader2 className="w-5 h-5 text-primary animate-spin block [transform-origin:50%_50%] [transform-box:fill-box]" />
          </div>
        ) : step.status === "success" ? (
          <div className="w-5 h-5 mr-2 rounded-full bg-[linear-gradient(135deg,#34d399,#059669)] shadow-[0_1px_1px_rgba(5,150,105,0.12)] flex items-center justify-center">
            <Check className="w-3 h-3 text-white" strokeWidth={3.5} />
          </div>
        ) : step.status === "error" ? (
          <XCircle className="w-5 h-5 mr-2 text-red-500" />
        ) : step.status === "warning" ? (
          <AlertTriangle className="w-5 h-5 mr-2 text-amber-500" />
        ) : (
          <div className="w-5 h-5 mr-2 rounded-full border-2 border-gray-300" />
        )}
        <span
          className={cn(
            "text-sm",
            step.status === "loading"
              ? "text-primary font-semibold"
              : step.status === "success"
                ? "text-green-500"
                : step.status === "error"
                  ? "text-red-500"
                  : step.status === "warning"
                    ? "text-amber-500"
                    : "text-gray-500",
          )}
        >
          {isUploadStep && files && files.length > 1
            ? `${step.step}s`
            : step.step}
        </span>{" "}
        {isUploadStep && (
          <div className="ml-2 mb-0.5">
            <Button
              variant="ghost"
              onClick={toggleFileTable}
              className="rounded-md text-xs font-normal px-3 h-5"
            >
              {viewTable ? (
                <span className="flex items-center">
                  {t("modal_manager.new_project_modal_config.hide_files")}{" "}
                  <ChevronUp className="ml-2" />
                </span>
              ) : (
                <span className="flex items-center">
                  {t("modal_manager.new_project_modal_config.view_files")}{" "}
                  <ChevronDown className="ml-2" />
                </span>
              )}
            </Button>
          </div>
        )}
      </div>
    );
  },
);

// The main progress tracker component
const ProgressTracker = memo(
  ({
    steps,
    files,
    viewTable,
    toggleFileTable,
  }: {
    steps: Step[];
    files?: FileWithProgress[];
    viewTable: boolean;
    toggleFileTable: () => void;
  }) => {
    return (
      <div className="space-y-4">
        {steps.map((step, index) => (
          <div key={`${step.step}-${index}`}>
            <StepIndicator
              step={step}
              files={files}
              viewTable={viewTable}
              toggleFileTable={toggleFileTable}
            />
            <p
              className={cn(
                "text-xs ml-7",
                step.status === "loading"
                  ? "text-gray-500"
                  : step.status === "success"
                    ? "text-green-600"
                    : step.status === "error"
                      ? "text-red-600"
                      : step.status === "warning"
                        ? "text-amber-500"
                        : "text-gray-400",
              )}
            >
              {step.description}
            </p>

            {/* Insert FileStatusTable after the uploading step */}
            {step.kind === "upload" && files && files.length > 0 && (
              <>
                {viewTable && (
                  <div className="flex mt-2 mb-2 self-start flex-grow flex-1">
                    <FileStatusTable
                      files={files}
                      isUploading={true}
                      removeFile={() => {}}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    );
  },
);

// Export for use in NewProjectModalConfig
export { ProgressTracker, StepIndicator };

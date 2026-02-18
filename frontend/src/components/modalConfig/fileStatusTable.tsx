import React from "react";
import { Progress } from "../ui/progress";
import {
  FileText,
  CheckCircle,
  AlertCircle,
  X,
  AlertTriangle,
} from "lucide-react";
import { FileWithProgress } from "../../interfaces/interfaces";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

interface FileStatusTableProps {
  files: FileWithProgress[];
  isUploading: boolean;
  removeFile: (id: string) => void;
  isVisible?: boolean;
}

const FileStatusTable: React.FC<FileStatusTableProps> = ({
  files,
  isUploading,
  removeFile,
  isVisible = true,
}) => {
  const { t } = useTranslation();
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  // Helper to get appropriate error message based on invalidReason
  const getInvalidReasonText = (invalidReason: string | null) => {
    if (invalidReason === "multiple-parquet") {
      return t("file_status_table.extra_file");
    } else if (invalidReason === "multiple-csv") {
      return t("file_status_table.extra_file");
    } else if (invalidReason === "limit-exceeded") {
      return t("file_status_table.over_limit");
    } else {
      return t("file_status_table.wrong_type");
    }
  };

  return (
    <div
      className="space-y-1 w-full"
      style={{
        opacity: isVisible ? 1 : 0,
        transition: "opacity 300ms ease-in-out, transform 300ms ease-in-out",
        transform: isVisible ? "translateY(0)" : "translateY(-10px)",
        transitionDelay: isVisible ? "50ms" : "0ms",
      }}
    >
      <div className="border border-gray-200 bg-white shadow-sm rounded-md">
        <div
          className="grid grid-cols-[36px_1fr_100px_100px_36px] gap-2 px-3 py-2 bg-gray-50 text-xs font-semibold text-gray-600 border-b border-gray-200 z-50 sticky top-0"
          style={{
            opacity: isVisible ? 1 : 0,
            transition: "opacity 250ms ease-in-out",
            transitionDelay: "50ms",
          }}
        >
          <div className="w-5"></div>
          <div>{t("file_status_table.name")}</div>
          <div>{t("file_status_table.size")}</div>
          <div>{t("file_status_table.status")}</div>
          <div className="w-5"></div>
        </div>

        <div
          className="overflow-y-auto"
          style={{
            maxHeight: "200px",
            scrollbarWidth: "thin", // Firefox
            msOverflowStyle: "none", // IE/Edge
          }}
        >
          {/* File rows */}
          {files.map((fileWithProgress, index) => (
            <div
              key={fileWithProgress.id}
              className={cn(
                "grid grid-cols-[36px_1fr_100px_100px_36px] gap-2 items-center px-3 py-2 hover:bg-gray-50 border-b border-gray-100 last:border-b-0",
                fileWithProgress.isInvalid && "bg-red-50 hover:bg-red-100",
              )}
              style={{
                opacity: isVisible ? 1 : 0,
                transform: isVisible ? "translateY(0)" : "translateY(10px)",
                transition:
                  "opacity 250ms ease-in-out, transform 250ms ease-in-out",
                transitionDelay: isVisible ? `${100 + index * 50}ms` : "0ms",
              }}
            >
              <div className="flex items-center justify-center">
                {fileWithProgress.isInvalid ? (
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                ) : (
                  <FileText className="h-3.5 w-3.5 text-gray-400" />
                )}
              </div>
              <div
                className={cn(
                  "truncate pr-2 text-sm",
                  fileWithProgress.isInvalid && "text-amber-700 font-medium",
                )}
                title={fileWithProgress.file.name}
              >
                {fileWithProgress.file.name}
              </div>
              <div className="text-xs text-gray-500">
                {formatFileSize(fileWithProgress.file.size)}
              </div>
              <div className="text-xs">
                {fileWithProgress.isInvalid ? (
                  <span className="text-amber-600 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    {getInvalidReasonText(
                      fileWithProgress.invalidReason as string,
                    )}
                  </span>
                ) : (
                  <>
                    {fileWithProgress.status === "pending" && (
                      <span className="text-gray-500">
                        {t("file_status_table.ready")}
                      </span>
                    )}
                    {fileWithProgress.status === "uploading" && (
                      <div className="flex items-center gap-1">
                        <Progress
                          value={fileWithProgress.progress}
                          indicatorColor="bg-primary rounded-md"
                          className="h-1.5 w-16"
                        />
                        <span className="text-gray-500">
                          {Math.round(fileWithProgress.progress)}%
                        </span>
                      </div>
                    )}
                    {fileWithProgress.status === "completed" && (
                      <span className="text-green-500 flex items-center gap-1">
                        <CheckCircle className="h-3 w-3" />
                        {t("file_status_table.complete")}
                      </span>
                    )}
                    {fileWithProgress.status === "error" && (
                      <span className="text-red-500 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {t("file_status_table.failed")}
                      </span>
                    )}
                  </>
                )}
              </div>
              <div className="flex items-center justify-center">
                {fileWithProgress.status !== "uploading" && !isUploading && (
                  <button
                    onClick={() => removeFile(fileWithProgress.id)}
                    className="flex h-5 w-5 items-center justify-center text-gray-400 hover:text-gray-600"
                    disabled={isUploading}
                    aria-label={t("file_status_table.clear_completed")}
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default FileStatusTable;

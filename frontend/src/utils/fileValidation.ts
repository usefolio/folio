// fileValidationHelpers.ts
import {
  FileWithProgress,
  FileValidationResult,
} from "@/interfaces/interfaces";
import i18n from "@/i18n";

// Function to get file extension from file name
export const getFileExtension = (fileName: string): string => {
  return fileName.split(".").pop()?.toLowerCase() || "";
};

// Function to group files by type and find the dominant type
export const analyzeDominantFileType = (files: FileWithProgress[]) => {
  // Count occurrences of each file type
  const fileTypeCounts: Record<string, number> = {};

  files.forEach((fileObj) => {
    const extension = getFileExtension(fileObj.file.name);
    fileTypeCounts[extension] = (fileTypeCounts[extension] || 0) + 1;
  });

  // Find the most common file type
  let dominantType = "";
  let maxCount = 0;

  Object.entries(fileTypeCounts).forEach(([type, count]) => {
    if (count > maxCount) {
      dominantType = type;
      maxCount = count;
    }
  });

  // Mark files that don't match the dominant type
  const markedFiles = files.map((fileObj) => {
    const extension = getFileExtension(fileObj.file.name);
    return {
      ...fileObj,
      isInvalid: extension !== dominantType,
      invalidReason:
        extension !== dominantType ? ("different-type" as const) : null,
    };
  });

  // Count invalid files
  const invalidFiles = markedFiles.filter((file) => file.isInvalid);

  return {
    dominantType,
    markedFiles,
    hasInvalidFiles: invalidFiles.length > 0,
    invalidCount: invalidFiles.length,
    totalCount: files.length,
  };
};

// Function to validate files that should only have one instance
export const validateSingleFileTypes = (files: FileWithProgress[]) => {
  const singleInstanceTypes = ["parquet", "csv"];

  for (const fileType of singleInstanceTypes) {
    const matchingFiles = files.filter(
      (fileObj) => getFileExtension(fileObj.file.name) === fileType,
    );

    if (matchingFiles.length > 1) {
      // Mark all but the first file of this type as invalid
      const markedFiles = files.map((fileObj) => {
        const extension = getFileExtension(fileObj.file.name);
        return {
          ...fileObj,
          isInvalid:
            extension === fileType && fileObj.id !== matchingFiles[0].id,
          invalidReason:
            extension === fileType && fileObj.id !== matchingFiles[0].id
              ? (`multiple-${fileType}` as const)
              : null,
        };
      });

      return {
        markedFiles,
        hasInvalidFiles: true,
        invalidCount: matchingFiles.length - 1,
        fileType,
        errorType: `multiple-${fileType}`,
      };
    }
  }

  return {
    markedFiles: files,
    hasInvalidFiles: false,
    invalidCount: 0,
    fileType: null,
    errorType: null,
  };
};

// Function to check if total file size exceeds maximum limit
export const validateTotalFileSize = (
  files: FileWithProgress[],
  maxSizeMB: number = 5000,
): {
  isValid: boolean;
  totalSize: number;
  errorMessage: string | null;
} => {
  const totalSizeBytes = files.reduce(
    (total, file) => total + file.file.size,
    0,
  );
  const totalSizeMB = totalSizeBytes / (1024 * 1024);

  if (totalSizeMB > maxSizeMB) {
    return {
      isValid: false,
      totalSize: totalSizeBytes,
      errorMessage: i18n.t("file_validation.max_total_size_exceeded", {
        maxSize: maxSizeMB,
      }),
    };
  }

  return {
    isValid: true,
    totalSize: totalSizeBytes,
    errorMessage: null,
  };
};

export const validateFileSelection = (
  files: FileWithProgress[],
): FileValidationResult => {
  if (!files || files.length === 0) {
    return {
      markedFiles: [],
      hasInvalidFiles: false,
      errorMessage: null,
    };
  }

  const fileSizeCheck = validateTotalFileSize(files);
  if (!fileSizeCheck.isValid) {
    return {
      markedFiles: files,
      hasInvalidFiles: true,
      errorMessage: fileSizeCheck.errorMessage,
    };
  }

  // Preserve files that were pre-marked invalid (e.g., unsupported type)
  const preInvalidFiles = files.filter((f) => f.isInvalid);
  const candidateFiles = files.filter((f) => !f.isInvalid);

  // Run single-file constraints only on valid candidates
  const singleFileCheck = validateSingleFileTypes(candidateFiles);
  if (singleFileCheck.hasInvalidFiles) {
    let errorMessage;
    if (singleFileCheck.fileType === "parquet") {
      errorMessage = i18n.t("file_validation.only_one_parquet");
    } else if (singleFileCheck.fileType === "csv") {
      errorMessage = i18n.t("file_validation.only_one_csv");
    }

    // Merge back pre-invalid files untouched with newly marked candidates
    const merged = [
      ...preInvalidFiles,
      ...(singleFileCheck.markedFiles as FileWithProgress[]),
    ];
    return {
      markedFiles: merged,
      hasInvalidFiles: true,
      errorMessage: errorMessage as string,
    };
  }

  // Analyze dominant type only among the valid candidates
  const fileTypeAnalysis = analyzeDominantFileType(candidateFiles);
  if (fileTypeAnalysis.hasInvalidFiles) {
    const merged = [...preInvalidFiles, ...fileTypeAnalysis.markedFiles];
    return {
      markedFiles: merged,
      hasInvalidFiles: true,
      dominantType: fileTypeAnalysis.dominantType,
      errorMessage: i18n.t("file_validation.mixed_files", {
        fileType: fileTypeAnalysis.dominantType,
      }),
    };
  }

  // No new invalids found among candidates; re-attach any pre-invalid files
  if (preInvalidFiles.length > 0) {
    const merged = [...preInvalidFiles, ...candidateFiles];

    // If unsupported types are present, surface a descriptive error message
    const unsupported = preInvalidFiles.filter(
      (f) => f.invalidReason === "invalid-file-type",
    );
    let errorMessage: string | null = null;
    if (unsupported.length > 0) {
      const exts = Array.from(
        new Set(
          unsupported.map((f) => {
            const name = f.file.name || "";
            if (name.includes(".")) return getFileExtension(name);
            const mimeType = f.file.type || "";
            return mimeType || "unknown";
          }),
        ),
      );
      errorMessage =
        exts.length > 1
          ? i18n.t(
              "modal_manager.new_project_modal_config.invalid_file_types_error",
              { types: exts.join(", ") },
            )
          : i18n.t(
              "modal_manager.new_project_modal_config.invalid_file_type_error",
              { type: exts[0] },
            );
    }

    return {
      markedFiles: merged,
      hasInvalidFiles: true,
      errorMessage,
    };
  }

  return {
    markedFiles: files,
    hasInvalidFiles: false,
    errorMessage: null,
  };
};

// Determines the file type based on file extensions from an array of files.
// All files are expected to be of the same type due to prior validation.

export const determineFileType = (
  files: FileWithProgress[],
): "audio" | "image" | "pdf" => {
  if (!files || files.length === 0) {
    return "pdf"; // Default if no files
  }

  // Get the extension from the first file using helper
  const extension = getFileExtension(files[0].file.name);

  // Audio file types
  if (
    ["mp3", "wav", "ogg", "aac", "m4a", "flac", "wma", "aiff"].includes(
      extension,
    )
  ) {
    return "audio";
  }

  // Image file types
  if (
    ["jpg", "jpeg", "png", "gif", "bmp", "webp", "tiff", "svg"].includes(
      extension,
    )
  ) {
    return "image";
  }

  // Default to PDF for all other types
  return "pdf";
};

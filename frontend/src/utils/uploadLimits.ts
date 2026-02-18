import type { FileWithProgress, FileInvalidReason } from "@/interfaces/interfaces";
import type { UploadLimit } from "@/types/types";

/**
 * Applies a per-upload plan limit to a list of files. Valid files beyond the
 * provided limit are marked as over-limit (invalid) without removing them.
 */
export const applyPlanLimit = (
  files: FileWithProgress[],
  limit: UploadLimit,
): { files: FileWithProgress[]; overLimitCount: number } => {
  if (limit === "unlimited") return { files, overLimitCount: 0 };
  let seenValid = 0;
  const limitNum = limit as number;
  const remapped = files.map((f) => {
    if (!f.isInvalid) {
      if (seenValid < limitNum) {
        seenValid += 1;
        return f;
      }
      return {
        ...f,
        isInvalid: true,
        invalidReason: "limit-exceeded" as FileInvalidReason,
      };
    }
    return f;
  });
  const over = remapped.filter((f) => f.invalidReason === "limit-exceeded").length;
  return { files: remapped, overLimitCount: over };
};

import type { Doc, Id } from "../../convex/_generated/dataModel";
import type { JobState } from "@/types/jobs";

export const IN_FLIGHT_JOB_STATES: readonly JobState[] = [
  "SCHEDULED",
  "PENDING",
  "IN_PROGRESS",
] as const;

const parseTimestamp = (value?: string): number | null => {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const getJobTimestamp = (job: Doc<"job">): number => {
  const updated = parseTimestamp(job.job.updatedAt);
  if (updated !== null) return updated;

  const created = parseTimestamp(job.job.createdAt);
  if (created !== null) return created;

  return job._creationTime ?? 0;
};

export const isJobStateInFlight = (state: JobState): boolean =>
  IN_FLIGHT_JOB_STATES.includes(state);

const getLatestJobByColumn = (
  jobs: Doc<"job">[],
): Map<Id<"column">, Doc<"job">> => {
  const latestJobByColumn = new Map<Id<"column">, Doc<"job">>();

  for (const job of jobs) {
    const columnId = job.column_id;
    if (!columnId) continue;

    const existing = latestJobByColumn.get(columnId);
    if (!existing) {
      latestJobByColumn.set(columnId, job);
      continue;
    }

    const existingTimestamp = getJobTimestamp(existing);
    const currentTimestamp = getJobTimestamp(job);

    if (currentTimestamp >= existingTimestamp) {
      latestJobByColumn.set(columnId, job);
    }
  }

  return latestJobByColumn;
};

export const computeColumnsBlockedByJobs = (
  jobs: Doc<"job">[],
): Set<Id<"column">> => {
  const latestJobByColumn = getLatestJobByColumn(jobs);
  const blockedColumns = new Set<Id<"column">>();

  for (const [columnId, job] of latestJobByColumn.entries()) {
    if (isJobStateInFlight(job.job.state)) {
      blockedColumns.add(columnId);
    }
  }

  return blockedColumns;
};

export const computeColumnsFailedByJobs = (
  jobs: Doc<"job">[],
): Set<Id<"column">> => {
  const latestJobByColumn = getLatestJobByColumn(jobs);
  const failedColumns = new Set<Id<"column">>();

  for (const [columnId, job] of latestJobByColumn.entries()) {
    if (job.job.state === "FAILURE") {
      failedColumns.add(columnId);
    }
  }

  return failedColumns;
};

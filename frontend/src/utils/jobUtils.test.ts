import { describe, expect, it } from "vitest";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import {
  computeColumnsBlockedByJobs,
  computeColumnsFailedByJobs,
  isJobStateInFlight,
} from "./jobUtils";
import type { JobState } from "@/types/jobs";

interface CreateJobOptions {
  jobId: string;
  columnId?: string;
  state: JobState;
  updatedAt?: string;
  createdAt?: string;
  creationTime?: number;
}

const createJob = ({
  jobId,
  columnId,
  state,
  updatedAt,
  createdAt,
  creationTime = Date.now(),
}: CreateJobOptions): Doc<"job"> => ({
  _id: jobId as Id<"job">,
  project_id: "project-1" as Id<"project">,
  column_id: columnId ? (columnId as Id<"column">) : undefined,
  sheet_id: undefined,
  _creationTime: creationTime,
  job: {
    id: jobId,
    type: "ENRICHING_DATA",
    state,
    createdBy: "tester",
    createdAt: createdAt ?? new Date(creationTime).toISOString(),
    updatedAt: updatedAt ?? new Date(creationTime).toISOString(),
    parameters: undefined,
    progress: undefined,
    logs: undefined,
    errorReason: null,
    cancellationReason: null,
    scheduledStartAt: null,
    expectedCompletionAt: null,
    tokenUsage: undefined,
  },
}) satisfies Doc<"job">;

describe("jobUtils", () => {
  it("identifies active job states", () => {
    expect(isJobStateInFlight("IN_PROGRESS")).toBe(true);
    expect(isJobStateInFlight("PENDING")).toBe(true);
    expect(isJobStateInFlight("SCHEDULED")).toBe(true);
    expect(isJobStateInFlight("SUCCESS")).toBe(false);
    expect(isJobStateInFlight("FAILURE")).toBe(false);
  });

  it("marks a column when the latest job is in flight", () => {
    const columnId = "col-1";
    const oldJob = createJob({
      jobId: "job-old",
      columnId,
      state: "SUCCESS",
      creationTime: Date.now() - 10_000,
    });
    const activeJob = createJob({
      jobId: "job-new",
      columnId,
      state: "IN_PROGRESS",
      creationTime: Date.now(),
    });

    const blocked = computeColumnsBlockedByJobs([oldJob, activeJob]);
    expect(blocked.has(columnId as Id<"column">)).toBe(true);
  });

  it("does not mark a column when the latest job has finished", () => {
    const columnId = "col-2";
    const activeJob = createJob({
      jobId: "job-active",
      columnId,
      state: "IN_PROGRESS",
      creationTime: Date.now() - 5_000,
    });
    const successJob = createJob({
      jobId: "job-success",
      columnId,
      state: "SUCCESS",
      creationTime: Date.now(),
    });

    const blocked = computeColumnsBlockedByJobs([activeJob, successJob]);
    expect(blocked.has(columnId as Id<"column">)).toBe(false);
  });

  it("ignores jobs that are not tied to a column", () => {
    const columnId = "col-3";
    const columnJob = createJob({
      jobId: "job-column",
      columnId,
      state: "SUCCESS",
    });
    const sheetJob = createJob({
      jobId: "job-sheet",
      state: "IN_PROGRESS",
    });

    const blocked = computeColumnsBlockedByJobs([columnJob, sheetJob]);
    expect(blocked.size).toBe(0);
  });

  it("falls back to createdAt when updatedAt is not parsable", () => {
    const columnId = "col-4";
    const earlierJob = createJob({
      jobId: "job-1",
      columnId,
      state: "SUCCESS",
      creationTime: Date.now() - 10_000,
      updatedAt: "not-a-date",
      createdAt: new Date(Date.now() - 10_000).toISOString(),
    });
    const laterJob = createJob({
      jobId: "job-2",
      columnId,
      state: "IN_PROGRESS",
      creationTime: Date.now() - 5_000,
      updatedAt: "still-not-a-date",
      createdAt: new Date(Date.now() - 5_000).toISOString(),
    });

    const blocked = computeColumnsBlockedByJobs([earlierJob, laterJob]);
    expect(blocked.has(columnId as Id<"column">)).toBe(true);
  });

  it("flags a column when the latest job failed", () => {
    const columnId = "col-5";
    const successfulJob = createJob({
      jobId: "job-success",
      columnId,
      state: "SUCCESS",
      creationTime: Date.now() - 10_000,
    });
    const failedJob = createJob({
      jobId: "job-failed",
      columnId,
      state: "FAILURE",
      creationTime: Date.now(),
    });

    const failedColumns = computeColumnsFailedByJobs([successfulJob, failedJob]);
    expect(failedColumns.has(columnId as Id<"column">)).toBe(true);
  });

  it("does not mark a column as failed once a newer successful job completes", () => {
    const columnId = "col-6";
    const failedJob = createJob({
      jobId: "job-failed",
      columnId,
      state: "FAILURE",
      creationTime: Date.now() - 5_000,
    });
    const recoveryJob = createJob({
      jobId: "job-success",
      columnId,
      state: "SUCCESS",
      creationTime: Date.now(),
    });

    const failedColumns = computeColumnsFailedByJobs([failedJob, recoveryJob]);
    expect(failedColumns.has(columnId as Id<"column">)).toBe(false);
  });
});

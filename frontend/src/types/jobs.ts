import { z } from "zod";

// JobState enum schema
export const JobStateSchema = z.enum([
  "SCHEDULED",
  "PENDING",
  "IN_PROGRESS",
  "SUCCESS",
  "PARTIAL_SUCCESS",
  "FAILURE",
  "CANCELED",
]);
export type JobState = z.infer<typeof JobStateSchema>;

// JobType enum schema
export const JobTypeSchema = z.enum(["ENRICHING_DATA", "FILTERING_DATA"]);
export type JobType = z.infer<typeof JobTypeSchema>;

// EnrichmentParameters schema
const EnrichmentParametersSchema = z.object({
  prompt: z.string().optional(),
  model: z.string().optional(),
  response_options: z.array(z.string()).optional(),
  filter: z.string().optional(),
});
export type EnrichmentParameters = z.infer<typeof EnrichmentParametersSchema>;

// DataFilteringParameters schema
const DataFilteringParametersSchema = z.object({
  filter: z.string().optional(),
});
export type DataFilteringParameters = z.infer<
  typeof DataFilteringParametersSchema
>;

// Discriminated Union for `parameters`
const ParametersSchema = z
  .union([EnrichmentParametersSchema, DataFilteringParametersSchema])
  .optional();

// JobLog schema
export const JobLogSchema = z.object({
  timestamp: z.string(), // ISO 8601 date string
  message: z.string(),
  partialErrors: z
    .array(
      z.object({
        rowId: z.string().optional(),
        error: z.string().optional(),
      }),
    )
    .optional()
    .nullable(),
});
export type JobLog = z.infer<typeof JobLogSchema>;

// JobProgress schema
export const JobProgressSchema = z.object({
  completedCount: z.number().nullable(),
  totalCount: z.number().nullable(),
});
export type JobProgress = z.infer<typeof JobProgressSchema>;

// JobTokenUsage schema
export const JobTokenUsageSchema = z.object({
  totalTokens: z.number(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  totalCost: z.number(),
});
export type JobTokenUsage = z.infer<typeof JobTokenUsageSchema>;

// Job schema
export const JobSchema = z.object({
  id: z.string(), // Unique job identifier (GUID)
  type: JobTypeSchema,
  state: JobStateSchema,
  parameters: ParametersSchema,
  createdBy: z.string(),
  createdAt: z.string(), // ISO 8601 date string
  updatedAt: z.string(), // ISO 8601 date string
  progress: JobProgressSchema.optional(),
  logs: z.array(JobLogSchema).optional().nullable(),
  errorReason: z.string().nullable().optional(),
  cancellationReason: z.string().nullable().optional(),
  scheduledStartAt: z.string().nullable().optional(),
  expectedCompletionAt: z.string().nullable().optional(),
  tokenUsage: JobTokenUsageSchema.optional(),
});
export type Job = z.infer<typeof JobSchema>;

export const UpdateJobSchema = JobSchema.pick({
  state: true,
  updatedAt: true,
  progress: true,
  logs: true,
  errorReason: true,
  cancellationReason: true,
  scheduledStartAt: true,
  expectedCompletionAt: true,
  tokenUsage: true,
});

export type UpdateJob = z.infer<typeof UpdateJobSchema>;

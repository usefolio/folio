import { httpAction } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import { apiMutation, authenticatedQuery } from "./middleware";
import { Id } from "./_generated/dataModel";
import { JobSchema, UpdateJobSchema } from "../src/types/jobs";
import { zodToConvex } from "convex-helpers/server/zod";
import { getPage } from "convex-helpers/server/pagination";
import schema from "./schema";

export const get = authenticatedQuery({
  args: {},
  handler: async (ctx) => {
    // Get projects the user has access to
    const projectsUserHasAccessTo = await ctx.db
      .query("project")
      .filter((q) => q.eq(q.field("owner"), ctx.identity.id))
      .collect();

    // Get jobs only from those projects
    const jobs = await Promise.all(
      projectsUserHasAccessTo.map((project) =>
        ctx.db
          .query("job")
          .filter((q) => q.eq(q.field("project_id"), project._id))
          .collect(),
      ),
    );

    return jobs.flat();
  },
});

// Paginated jobs query for a specific project
export const getJobsBatch = authenticatedQuery({
  args: {
    projectId: v.optional(v.id("project")),
    startIndexKey: v.optional(v.array(v.any())),
    startInclusive: v.optional(v.boolean()),
    limit: v.optional(v.number()),
    order: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
  },
  handler: async (ctx, args) => {
    if (!args.projectId) {
      return {
        jobs: [],
        indexKeys: [],
        hasMore: false,
        projectId: null,
      };
    }
    const project = await ctx.db.get(args.projectId);
    if (!project || project.owner !== ctx.identity.id) {
      throw new Error("User not authorized to access this project");
    }
    const limit = args.limit ?? 50;
    const order = args.order ?? "asc";

    // Set up index keys
    const startIndexKey = args.startIndexKey
      ? args.startIndexKey
      : [args.projectId];

    const endIndexKey = [args.projectId];

    // Use getPage helper
    const { page, hasMore, indexKeys } = await getPage(ctx, {
      table: "job",
      index: "project_id",
      schema,
      startIndexKey,
      startInclusive: args.startInclusive ?? false,
      endIndexKey,
      endInclusive: false,
      absoluteMaxRows: limit,
      order: order,
    });

    return {
      jobs: page,
      indexKeys: indexKeys,
      hasMore: hasMore,
      projectId: args.projectId,
    };
  },
});

export const insert = apiMutation({
  args: {
    project_id: v.id("project"),
    column_id: v.optional(v.id("column")),
    sheet_id: v.optional(v.id("sheet")),
    job: zodToConvex(JobSchema),
  },
  handler: async (ctx, args) => {
    const jobId = await ctx.db.insert("job", {
      project_id: args.project_id,
      column_id: args.column_id,
      sheet_id: args.sheet_id,
      job: args.job,
    });

    return jobId;
  },
});

export const update = apiMutation({
  args: {
    job_id: v.id("job"),
    job: zodToConvex(UpdateJobSchema),
  },
  handler: async (ctx, args) => {
    const job_current = await ctx.db.get(args.job_id);

    if (job_current === null) {
      throw new Error(`Job with ID ${args.job_id} not found.`);
    }

    console.log("job_updated", args.job);

    // Create a new job object by merging only provided fields
    const updatedFields = Object.fromEntries(
      Object.entries(args.job).filter(([_, value]) => value !== undefined),
    );

    // Ensure `updatedAt` is always updated
    updatedFields.updatedAt = new Date().toISOString();

    // Perform the update
    await ctx.db.patch(args.job_id, {
      job: {
        ...job_current.job, // Keep existing fields
        ...updatedFields, // Merge in only provided fields
      },
    });
  },
});

export const insertJobFromHttp = httpAction(async (ctx, req) => {
  const { project_id, column_id, sheet_id, job_object, apiKey } =
    await req.json();

  const job_json_object = JSON.parse(job_object);
  const parsedJob = JobSchema.parse(job_json_object);

  const job = await ctx.runMutation(api.jobs.insert, {
    project_id: project_id as Id<"project">,
    column_id: column_id as Id<"column">,
    sheet_id: sheet_id as Id<"sheet">,
    job: parsedJob,
    apiKey: apiKey,
  });

  const response = {
    job: job,
  };
  const jsonString = JSON.stringify(response);

  return new Response(jsonString, {
    status: 200,
  });
});

export const updateJobFromHttp = httpAction(async (ctx, req) => {
  const { job_id, job_object, apiKey } = await req.json();

  const job_json_object = JSON.parse(job_object);
  const parsedJob = UpdateJobSchema.parse(job_json_object);

  const job = await ctx.runMutation(api.jobs.update, {
    job_id: job_id as Id<"job">,
    job: parsedJob,
    apiKey: apiKey,
  });

  const response = {
    job: job,
  };
  const jsonString = JSON.stringify(response);

  return new Response(jsonString, {
    status: 200,
  });
});

import { v } from "convex/values";
import { authenticatedMutation, authenticatedQuery } from "./middleware";
import { paginationOptsValidator } from "convex/server";

// Get all logs for a project
export const get = authenticatedQuery({
  args: {},
  handler: async (ctx) => {
    const projectsUserHasAccessTo = await ctx.db
      .query("project")
      .filter((q) => q.eq(q.field("owner"), ctx.identity.id))
      .collect();

    const logs = (
      await Promise.all(
        (projectsUserHasAccessTo ?? []).map((_project) =>
          ctx.db
            .query("log")
            .filter((q) => q.eq(q.field("project_id"), _project._id))
            .collect(),
        ),
        // TODO: Although this sort happens in the convex function and it should be relatively ok when used in combination with
        // pagination, its still not ideal.
      )
    )
      .flat()
      .sort((a, b) => b.timestamp - a.timestamp);

    return logs;
  },
});
export const getPaginated = authenticatedQuery({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("log")
      .withIndex("by_owner_and_timestamp", (q) => q.eq("owner", ctx.identity.subject as string))
      .order("desc") // Get newest logs first
      .paginate(args.paginationOpts);
  },
});
// Perhaps will be used for something in the future
// // Paginated logs query for a specific project
// export const getLogsBatch = authenticatedQuery({
//   args: {
//     projectId: v.optional(v.id("project")),
//     startIndexKey: v.optional(v.array(v.any())),
//     startInclusive: v.optional(v.boolean()),
//     limit: v.optional(v.number()),
//     order: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
//   },
//   handler: async (ctx, args) => {
//     if (!args.projectId) {
//       return {
//         logs: [],
//         indexKeys: [],
//         hasMore: false,
//         projectId: null,
//       };
//     }
//     const project = await ctx.db.get(args.projectId);
//     if (!project || project.owner !== ctx.identity.id) {
//       throw new Error("User not authorized to access logs for this project");
//     }
//     const limit = args.limit ?? 50;
//     const order = args.order ?? "asc";

//     // Set up index keys
//     const startIndexKey = args.startIndexKey
//       ? args.startIndexKey
//       : [args.projectId];

//     const endIndexKey = [args.projectId];

//     // Use getPage helper
//     const { page, hasMore, indexKeys } = await getPage(ctx, {
//       table: "log",
//       index: "project_id",
//       schema,
//       startIndexKey,
//       startInclusive: args.startInclusive ?? false,
//       endIndexKey,
//       endInclusive: false,
//       absoluteMaxRows: limit,
//       order: order,
//     });

//     // Add timestamp-based sorting, newer logs first
//     const sortedLogs = [...page].sort((a, b) => b.timestamp - a.timestamp);

//     return {
//       logs: sortedLogs,
//       indexKeys: indexKeys,
//       hasMore: hasMore,
//       projectId: args.projectId,
//     };
//   },
// });

export const create = authenticatedMutation({
  args: {
    project_id: v.id("project"),
    message: v.string(),
    severity: v.union(
      v.literal("ERROR"), 
      v.literal("WARN"), 
      v.literal("INFO"), 
      v.literal("DEBUG"), 
      v.literal("TRACE")
    ),
    details: v.optional(v.string()),
    service: v.optional(v.string()),
    attributes: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.project_id);
    if (!project || project.owner !== ctx.identity.id) {
      throw new Error("User not authorized to create logs for this project");
    }
    const to_insert = {
      ...args,
      owner: ctx.identity.id as string,
      timestamp: new Date().getTime(),
    };
    return await ctx.db.insert("log", to_insert);
  },
});

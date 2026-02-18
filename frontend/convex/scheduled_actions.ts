import { v } from "convex/values";
import { authenticatedMutation, authenticatedQuery } from "./middleware";
import { paginationOptsValidator } from "convex/server";

export const create = authenticatedMutation({
  args: {
    searchQuery: v.string(),
    workflow: v.string(),
    interval: v.number(),
    intervalUnit: v.union(v.literal("minutes"), v.literal("hours"), v.literal("days")),
    destinationType: v.union(v.literal("email"), v.literal("api")),
    destination: v.string(),
    outputFormat: v.union(v.literal("csv"), v.literal("markdown"), v.literal("pdf")),
    prompt: v.optional(v.string()),
    model: v.optional(v.string()),
    isActive: v.boolean(),
    createdAt: v.string(),
  },
  handler: async (ctx, args) => {
    const scheduledActionId = await ctx.db.insert("scheduled_actions", {
      ...args,
      owner: ctx.identity.subject as string, // Save the owner
      totalRuns: 0,
    });
    return scheduledActionId;
  },
});

export const getPaginated = authenticatedQuery({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("scheduled_actions")
      .withIndex("by_owner", (q) => q.eq("owner", ctx.identity.id as string))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const toggleIsActive = authenticatedMutation({
  args: { 
    id: v.id("scheduled_actions"), 
    isActive: v.boolean() 
  },
  handler: async (ctx, args) => {
    const existingAction = await ctx.db.get(args.id);
    if (!existingAction || existingAction.owner !== ctx.identity.id) {
      throw new Error("Action not found or you don't have permission to modify it.");
    }
    await ctx.db.patch(args.id, { isActive: args.isActive });
  },
});

export const deleteAction = authenticatedMutation({
  args: { id: v.id("scheduled_actions") },
  handler: async (ctx, args) => {
    const existingAction = await ctx.db.get(args.id);
    if (!existingAction || existingAction.owner !== ctx.identity.id) {
      throw new Error("Action not found or you don't have permission to delete it.");
    }
    await ctx.db.delete(args.id);
  },
});
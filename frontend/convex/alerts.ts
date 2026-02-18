import { v } from "convex/values";
import { authenticatedMutation, authenticatedQuery } from "./middleware";
import { paginationOptsValidator } from "convex/server";


export const create = authenticatedMutation({
  args: {
    project_id: v.id("project"),
    name: v.string(),
    description: v.optional(v.string()),
    conditions: v.string(),
    queryBuilderState: v.optional(v.string()),
    frequency: v.union(v.literal("immediate"), v.literal("hourly"), v.literal("daily"), v.literal("weekly")),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const alertId = await ctx.db.insert("alerts", {
      ...args,
      owner: ctx.identity.subject as string,
      isActive: true, // Alerts are active by default
      createdAt: new Date().toISOString(),
      totalTriggers: 0,
    });
    return alertId;
  },
});

export const getPaginated = authenticatedQuery({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("alerts")
      .withIndex("by_owner", (q) => q.eq("owner", ctx.identity.id as string))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const toggleIsActive = authenticatedMutation({
  args: { 
    id: v.id("alerts"), 
    isActive: v.boolean() 
  },
  handler: async (ctx, args) => {
    const existingAlert = await ctx.db.get(args.id);
    if (!existingAlert || existingAlert.owner !== ctx.identity.id) {
      throw new Error("Alert not found or you don't have permission to modify it.");
    }
    await ctx.db.patch(args.id, { isActive: args.isActive });
  },
});

export const deleteAlert = authenticatedMutation({
  args: { id: v.id("alerts") },
  handler: async (ctx, args) => {
    const existingAlert = await ctx.db.get(args.id);
    if (!existingAlert || existingAlert.owner !== ctx.identity.id) {
      throw new Error("Alert not found or you don't have permission to delete it.");
    }
    await ctx.db.delete(args.id);
  },
});
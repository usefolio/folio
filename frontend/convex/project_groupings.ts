import { v } from "convex/values";
import {
  apiMutation,
  authenticatedMutation,
  authenticatedQuery,
} from "./middleware";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";

export const create = authenticatedMutation({
  args: {
    name: v.string(),
    owner: v.string(),
  },
  handler: async (ctx, args) => {
    const taskId = await ctx.db.insert("project_grouping", {
      name: args.name,
      owner: args.owner,
    });
    return taskId;
  },
});

export const list = authenticatedQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("project_grouping")
      .withIndex("by_owner", (q) => q.eq("owner", ctx.identity.id as string))
      .collect();
  },
});

export const createApi = apiMutation({
    args: {
        name: v.string(),
        owner: v.string(),
        synced: v.boolean()
    },
    handler: async (ctx, args) => {
        const taskId = await ctx.db.insert("project_grouping", {
            name: args.name,
            owner: args.owner,
            type: args.synced ? "synced" : undefined
        });
        return taskId
    },
});

export const createProjectGroupingFromHttp = httpAction(async (ctx, req) => {
    const { name, owner, synced, apiKey } = await req.json();

    const taskId = await ctx.runMutation(
        api.project_groupings.createApi,
        {
            name: name,
            owner: owner,
            apiKey: apiKey,
            synced: synced
        }
    );

    const response = {
        "project_grouping_id": taskId
    }

    return new Response(JSON.stringify(response), {
        status: 200
    })
})


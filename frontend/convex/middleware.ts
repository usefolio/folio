import { v } from "convex/values";
import { mutation, query, action } from "./_generated/server";
import {
  customMutation,
  customQuery,
  customAction
} from "convex-helpers/server/customFunctions";

// Use `apiMutation` instead of `mutation` to apply this behavior.
export const apiMutation = customMutation(mutation, {
  // This is the expanded customization simplified by `customCtx` above
  // You can specify arguments that the customization logic consumes
  args: { apiKey: v.string() },
  // Similar to the `args` and `handler` for a normal function, the
  // args validated above define the shape of `args` below.
  input: async (_, { apiKey }) => {
    // Add a simple check against a single API_KEY.
    if (apiKey !== process.env.IMPORT_DATA_API_KEY)
      throw new Error("Invalid API key");
    // We return what parameters to ADD to the modified function parameters.
    // In this case, we aren't modifying ctx or args
    return { ctx: {}, args: { apiKey: apiKey } };
  },
});

// Use `apiQuery` instead of `query` to apply this behavior.
export const apiQuery = customQuery(query, {
  // You can specify arguments that the customization logic consumes
  args: { apiKey: v.string() },
  // Similar to the `args` and `handler` for a normal function, the
  // args validated above define the shape of `args` below.
  input: async (_, { apiKey }) => {
    // Add a simple check against a single API_KEY.
    if (apiKey !== process.env.IMPORT_DATA_API_KEY)
      throw new Error("Invalid API key");
    // We return what parameters to ADD to the modified function parameters.
    // In this case, we aren't modifying ctx or args
    return { ctx: {}, args: { apiKey: apiKey } };
  },
});

export const authenticatedQuery = customQuery(query, {
  args: {},
  input: async (ctx, { }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null || identity === undefined) {
      throw new Error("Not authenticated");
    }
    if (identity.id === null) {
      throw new Error("Missing claims in the authentication token.");
    }
    return { ctx: { identity: identity }, args: {} };
  },
});

export const authenticatedMutation = customMutation(mutation, {
  args: {},
  input: async (ctx, { }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Not authenticated");
    }
    return { ctx: { identity: identity }, args: {} };
  },
});

export const apiAction = customAction(action, {
  args: { apiKey: v.string() },
  input: async (_, { apiKey }) => {
    if (apiKey !== process.env.IMPORT_DATA_API_KEY)
      throw new Error("Invalid API key");
    return { ctx: {}, args: { apiKey } };
  },
});
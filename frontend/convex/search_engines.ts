import { v } from "convex/values";
import { action } from "./_generated/server"
import { authenticatedQuery, authenticatedMutation } from "./middleware";

// Define the specific types to be used in arguments, matching the schema
const EngineTypeLiterals = v.union(
  v.literal("opensearch"),
  v.literal("solr"),
  v.literal("typesense"),
  v.literal("meilisearch"),
  v.literal("quickwit"),
  v.literal("milvus"),
  v.literal("weaviate"),
  v.literal("qdrant"),
  v.literal("vespa")
);

const ContentTypeLiterals = v.union(
  v.literal("text"),
  v.literal("pdf"),
  v.literal("image")
);

// --- QUERIES ---

export const get = authenticatedQuery({
  args: { workspaceId: v.id("workspace") },
  handler: async (ctx, { workspaceId }) => {
    // TODO: Add authorization to ensure the user is part of the workspace
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("User is not authenticated.");
    }

    return await ctx.db
      .query("search_engines")
      .withIndex("by_workspace", (q) => q.eq("workspace_id", workspaceId))
      .collect();
  },
});

// --- MUTATIONS ---

export const saveConfiguration = authenticatedMutation({
  args: {
    workspaceId: v.id("workspace"),
    // Engines to be created or updated
    engines: v.array(
      v.object({
        id: v.string(), // Frontend ID: "new-..." for creation, Convex ID for update
        engineType: EngineTypeLiterals,
        name: v.string(),
        contentTypes: v.array(ContentTypeLiterals),
        config: v.any(),
      }),
    ),
    // List of Convex IDs for engines to be deleted
    deletedIds: v.array(v.id("search_engines")),
  },
  handler: async (ctx, { workspaceId, engines, deletedIds }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("User is not authenticated.");
    }
    // Process deletions
    for (const id of deletedIds) {
      await ctx.db.delete(id);
    }

    // Process creations and updates
    for (const engine of engines) {
      const { id, ...data } = engine;
      if (id.startsWith("new-")) {
        // Create: Insert a new document
        await ctx.db.insert("search_engines", {
          workspace_id: workspaceId,
          ...data,
        });
      } else {
        // Update: Patch an existing document
        await ctx.db.patch(id as any, data);
      }
    }
    return true;
  },
});

// --- ACTIONS ---

export const testConnection = action({
  args: { engineConfig: v.any() },
  handler: async (_ctx, { engineConfig }) => {
    // This is a placeholder for a real connection test.
    // In a real scenario, you would use 'fetch' or a library to connect
    // to the engine's endpoint from the server-side action.
    await new Promise((resolve) => setTimeout(resolve, 800));

    if (engineConfig.name.toLowerCase().includes("error")) {
      return {
        status: "error",
        error: "Failed to resolve host: Invalid or unreachable endpoint.",
      };
    }

    const responseTime = 50 + Math.random() * 200;
    return {
      status: "success",
      responseTime: Math.round(responseTime),
      latencyWarning: responseTime > 200,
    };
  },
});
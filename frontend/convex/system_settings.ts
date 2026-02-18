import { v } from "convex/values";
import { authenticatedMutation, authenticatedQuery } from "./middleware";
// Save system prompt to Convex
export const saveSystemPrompt = authenticatedMutation({
  args: { 
    workspaceId: v.id("workspace"),
    prompt: v.string() 
  },
  handler: async (ctx, args) => {
    const { workspaceId, prompt } = args;
    
    // Check if a system prompt already exists for this workspace
    const existingSettings = await ctx.db
      .query("system_settings")
      .withIndex("by_workspace_and_type", (q) => 
        q.eq("workspace_id", workspaceId).eq("type", "system_prompt")
      )
      .first();
    
    const now = new Date().toISOString();
    
    if (existingSettings) {
      // Update existing record
      await ctx.db.patch(existingSettings._id, { 
        value: prompt,
        lastModified: now 
      });
      return existingSettings._id;
    } else {
      // Create new record
      const newSettingId = await ctx.db.insert("system_settings", {
        workspace_id: workspaceId,
        type: "system_prompt",
        value: prompt,
        lastModified: now
      });
      return newSettingId;
    }
  },
});

// Get system prompt for a workspace
export const getSystemPrompt = authenticatedQuery({
  args: { workspaceId: v.id("workspace") },
  handler: async (ctx, args) => {
    const { workspaceId } = args;
    
    const settings = await ctx.db
      .query("system_settings")
      .withIndex("by_workspace_and_type", (q) => 
        q.eq("workspace_id", workspaceId).eq("type", "system_prompt")
      )
      .first();
    
    return settings
  },
});
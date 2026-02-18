import { authenticatedMutation, authenticatedQuery } from "./middleware";
import { v } from "convex/values";

// get of create conversation history
export const getOrCreateConversation = authenticatedMutation({
    args: {
      project_id: v.id("project"),
      sheet_id: v.id("sheet"),
    },
    handler: async (ctx, args) => {
      // Get user from Convex auth context
      const identity = await ctx.auth.getUserIdentity();
      if (!identity) {
        throw new Error("User not authenticated");
      }
      const userId = identity.id as string
  
      // Check if conversation exists
      const existing = await ctx.db
        .query("chat_conversation")
        .withIndex("by_owner_and_project", (q) =>
          q.eq("owner", userId).eq("project_id", args.project_id)
        )
        .filter((q) => q.eq(q.field("sheet_id"), args.sheet_id))
        .first();
  
      if (existing) {
        return existing._id;
      }
  
      // Create new conversation
      const conversationId = await ctx.db.insert("chat_conversation", {
        project_id: args.project_id,
        sheet_id: args.sheet_id,
        owner: userId,
        last_message_at: Date.now(),
      });
  
      return conversationId;
    },
  });
  // Save a message to the conversation
  export const saveMessage = authenticatedMutation({
    args: {
      conversation_id: v.id("chat_conversation"),
      role: v.union(v.literal("user"), v.literal("assistant")),
      content: v.string(),
      mentioned_columns: v.optional(v.array(v.string())),
    },
    handler: async (ctx, args) => {
      // Save the message
      const messageId = await ctx.db.insert("chat_message", {
        conversation_id: args.conversation_id,
        role: args.role,
        content: args.content,
        createdAt: Date.now(),
        mentioned_columns: args.mentioned_columns,
      });
  
      // Update conversation's last message time
      await ctx.db.patch(args.conversation_id, {
        last_message_at: Date.now(),
      });
  
      // Update title if this is the first message
      const conversation = await ctx.db.get(args.conversation_id);
      if (conversation && !conversation.title && args.role === "user") {
        // Use first 50 chars of first message as title
        const title = args.content.substring(0, 50) + (args.content.length > 50 ? "..." : "");
        await ctx.db.patch(args.conversation_id, { title });
      }
  
      return messageId;
    },
  });
  
  // Get all messages for a conversation
  export const getConversationMessages = authenticatedQuery({
    args: {
      conversation_id: v.id("chat_conversation"),
    },
    handler: async (ctx, args) => {
      const messages = await ctx.db
        .query("chat_message")
        .withIndex("by_conversation", (q) =>
          q.eq("conversation_id", args.conversation_id)
        )
        .collect();
  
      return messages.sort((a, b) => a.createdAt - b.createdAt);
    },
  });
  
  // Clear conversation history
  export const clearConversation = authenticatedMutation({
    args: {
      conversation_id: v.id("chat_conversation"),
    },
    handler: async (ctx, args) => {
      // Delete all messages
      const messages = await ctx.db
        .query("chat_message")
        .withIndex("by_conversation", (q) =>
          q.eq("conversation_id", args.conversation_id)
        )
        .collect();
  
      for (const message of messages) {
        await ctx.db.delete(message._id);
      }
  
      // Update conversation
      await ctx.db.patch(args.conversation_id, {
        title: undefined,
        last_message_at: Date.now(),
      });
    },
  });
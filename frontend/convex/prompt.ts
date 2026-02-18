import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from 'ai';
import { action } from "./_generated/server";
import { v } from "convex/values";

export const enhance = action({
    args: {
        prompt: v.string(),
    },
    handler: async (ctx, { prompt }) => {
        // 2. Add an authentication check, since this is now a public endpoint.
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) {
            throw new Error("User must be authenticated to enhance prompts.");
        }

        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            throw new Error("OPENAI_API_KEY is not set in the environment.");
        }

        const openaiWithKey = createOpenAI({
            apiKey: apiKey,
        });

        const systemPrompt = `You are an AI assistant that rephrases user prompts to be more effective for large language models. Your response should be only the improved prompt, without any explanations, conversational filler, or markdown formatting. The goal is to make the original prompt clearer, more specific, and more detailed to get a better result from another AI.`;
        
        const { text } = await generateText({
            model: openaiWithKey.chat("gpt-4o-mini"),
            system: systemPrompt,
            prompt: prompt,
        });

        return { enhancedText: text };
    }
});
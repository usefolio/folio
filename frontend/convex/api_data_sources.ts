import { v } from "convex/values";
import { action } from "./_generated/server";
import { authenticatedMutation, authenticatedQuery } from "./middleware";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from 'ai';
import { USE_REAL_TEST_FOR_API_SOURCE } from "@/constants";

type TestActionResult = {
  status: "success" | "error";
  url?: string;
  statusCode?: number;
  latency?: number;
  rawData?: any;
  error?: string;
};

// Queries
export const getById = authenticatedQuery({
  args: { id: v.id("api_data_sources") },
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id);
  },
});
export const list = authenticatedQuery({
  args: { workspaceId: v.id("workspace") },
  handler: async (ctx, { workspaceId }) => {
    return await ctx.db
      .query("api_data_sources")
      .withIndex("by_workspace", (q) => q.eq("workspace_id", workspaceId))
      .order("desc")
      .collect();
  },
});

// Mutations
export const create = authenticatedMutation({
  args: {
    workspaceId: v.id("workspace"),
    source: v.any(), // APIDataSource from the client
  },
  handler: async (ctx, { workspaceId, source }) => {
    const { id, ...rest } = source; // remove the temporary frontend id
    return await ctx.db.insert("api_data_sources", {
      workspace_id: workspaceId,
      ...rest,
    });
  },
});

export const update = authenticatedMutation({
  args: {
    id: v.id("api_data_sources"),
    source: v.any(), // APIDataSource from the client
  },
  handler: async (ctx, { id, source }) => {
    const { _id, _creationTime, workspace_id, ...rest } = source;
    return await ctx.db.patch(id, rest);
  },
});

export const remove = authenticatedMutation({
  args: { id: v.id("api_data_sources") },
  handler: async (ctx, { id }) => {
    return await ctx.db.delete(id);
  },
});

// Actions
export const runTest = action({
  args: { config: v.any(), testQuery: v.string() },
  handler: async (_ctx, { config, testQuery }): Promise<TestActionResult> => {
    // Build the final URL for the API request
    if(USE_REAL_TEST_FOR_API_SOURCE){
        let finalUrl = config.url;
    const queryParams = new URLSearchParams();
    if (config.urlParameters && config.urlParameters.length > 0) {
      config.urlParameters.forEach((param: any) => {
        if (param.key) {
          const value = param.value.replace("{SEARCH_QUERY}", testQuery);
          queryParams.set(param.key, value);
        }
      });
      finalUrl = `${config.url}?${queryParams.toString()}`;
    }

    // Make the real network request
    const startTime = Date.now();
    let apiResponse;
    let responseJson;

    try {
      apiResponse = await fetch(finalUrl, {
        method: config.bodyJson ? 'POST' : 'GET',
        headers: config.headers.reduce((acc: any, h: any) => {
            if(h.key) acc[h.key] = h.value;
            return acc;
        }, {}),
        body: config.bodyJson || undefined,
      });

      if (!apiResponse.ok) {
        throw new Error(`API returned status ${apiResponse.status}: ${apiResponse.statusText}`);
      }
      responseJson = await apiResponse.json();

    } catch (error) {
      return { status: "error", error: (error as Error).message };
    }
    
    const latency = Date.now() - startTime;

    // Return the RAW, untransformed data
    return {
      status: "success",
      url: finalUrl,
      statusCode: apiResponse.status,
      latency: latency,
      rawData: responseJson, // Send the raw data back to the client
    };
    }else{
        await new Promise((resolve) => setTimeout(resolve, 1000 + Math.random() * 1000));

    if (Math.random() < 0.05) {
      return { status: "error", statusCode: 429, error: "Rate limit exceeded." };
    }
    if (Math.random() < 0.1) {
      return { status: "error", statusCode: 500, error: "Internal server error from API." };
    }

    let testUrl = config.url;
    if (config.urlParameters.length > 0) {
      const queryParams = new URLSearchParams();
      config.urlParameters.forEach((param: any) => {
        if (param.key) {
          queryParams.set(param.key, param.value.replace("{SEARCH_QUERY}", testQuery));
        }
      });
      testUrl = `${config.url}?${queryParams.toString()}`;
    }

    const mockData = Array.from({ length: 20 }, (_, i) => ({
      id: `item-${i}`,
      title: `Sample Article ${i + 1} for query '${testQuery}'`,
      author: `user${i + 1}`,
      url: `https://example.com/article-${i}`,
      points: Math.floor(Math.random() * 100),
      created: new Date(Date.now() - Math.random() * 86400000).toISOString(),
    }));
    
    return {
      status: "success",
      url: testUrl,
      statusCode: 200,
      latency: Math.floor(150 + Math.random() * 300),
      rawData:{ hits: mockData}
    };
    }
    
  },
});

export const generateExampleResponse = action({
    args: {
        name: v.string(),
        url: v.string(),
        columns: v.string(),
        urlParameters: v.optional(v.any()),
        headers: v.optional(v.any()),
        bodyJson: v.optional(v.string()),
    },
    handler: async (ctx, { name, url, columns, urlParameters, headers, bodyJson }) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) {
            throw new Error("User must be authenticated.");
        }

        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            throw new Error("OPENAI_API_KEY is not set in the environment.");
        }

        const openai = createOpenAI({ apiKey });

        const systemPrompt = `You are an expert API mocking assistant. Your task is to generate a realistic, pretty-printed JSON response that a real API would likely return. The response must be a JSON object containing a root-level array key (e.g., "data", "results", "hits"). This array should contain as many objects as you deem necessary. Each of these objects must contain keys that can be mapped to the required output columns. Generate plausible data for these keys based on all the provided context about the API call (name, URL, parameters, headers, body). Your response must be ONLY the raw JSON text, with no conversational filler, explanations, or markdown formatting.`;
        
        // Build a rich, detailed prompt with all available context
        let userPrompt = `I need a mock JSON response for the following API data source. Generate a realistic response based on all the details provided.\n\n--- API CONTEXT ---\nName: ${name}\nEndpoint URL: ${url}\nRequired Output Columns: ${columns}`;

        if (urlParameters && urlParameters.length > 0 && urlParameters[0].key) {
            const paramsString = urlParameters.map((p: {key: string, value: string}) => `${p.key}=${p.value}`).join(', ');
            userPrompt += `\nURL Parameters: ${paramsString}`;
        }

        if (headers && headers.length > 0 && headers[0].key) {
            const headersString = headers.map((h: {key: string, value: string}) => `${h.key}: ${h.value}`).join(', ');
            userPrompt += `\nHTTP Headers: ${headersString}`;
        }

        if (bodyJson) {
            userPrompt += `\nRequest Body (JSON): ${bodyJson}`;
        }
        userPrompt += `\n--- END CONTEXT ---`;


        const { text } = await generateText({
            model: openai.chat("gpt-4o-mini"),
            system: systemPrompt,
            prompt: userPrompt,
        });

        try {
            JSON.parse(text);
            return { exampleResponse: text };
        } catch (e) {
            console.error("AI generated invalid JSON:", text, e);
            return { exampleResponse: `{ "error": "Failed to generate valid JSON", "data": [] }` };
        }
    }
});
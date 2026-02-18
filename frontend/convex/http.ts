import { httpRouter } from "convex/server";
import { createColumnFromHttp, getBySheetFromHttp, updateColumnStateFromHttp } from "./columns";
import { createRowBulkFromHttp, createRowFromHttp } from "./rows";
import { createRelationshipFromHttp } from "./relationships";
import { createSheetFromHttp } from "./sheets";
import { createProjectFromHttp, getProjectExportDataHttp, getWorkflowRequestHttp } from "./projects";
import { insertJobFromHttp, updateJobFromHttp } from "./jobs";
import { createProjectGroupingFromHttp } from "./project_groupings";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";
import { DEFAULT_AI_MODEL } from "@/constants";
const http = httpRouter();
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
const optionsHandler = httpAction(async () => new Response(null, { status: 204, headers: corsHeaders }));
// This helper function converts the agent's stream into a type
// which the manual formatter can loop over.
async function* streamToAsyncIterable(
  stream: ReadableStream<string>
): AsyncIterable<string> {
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        return;
      }
      yield value;
    }
  } finally {
    reader.releaseLock();
  }
}
/**
 * A manual function to create a ReadableStream in the text/event-stream format.
 * This function takes the raw text stream from the AI and wraps each chunk
 * in the required "data: ...\n\n" SSE format.
 * textStream The AsyncIterable<string> from the AI SDK's streamText result.
 * returns a ReadableStream ready to be sent to the client.
 * Used because native ai function to convert to stream has issues in the current implementation
 */
function createManualSseStream(textStream: AsyncIterable<string>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
      async start(controller) {
          try {
              for await (const chunk of textStream) {
                  if (chunk) {
                      // This format is very specific.
                      const vercelFormattedChunk = `0:${JSON.stringify(chunk)}\n`;
                      controller.enqueue(encoder.encode(vercelFormattedChunk));
                  }
              }
          } catch (e) {
              console.error("Error within the manual stream generation:", e);
              const errorMessage = e instanceof Error ? e.message : "An unknown error occurred in the stream.";
              // If an error occurs here, it should be sent to the client.
              const errorChunk = `2:${JSON.stringify({ error: errorMessage })}\n`;
              controller.enqueue(encoder.encode(errorChunk));
          } finally {
              controller.close();
          }
      },
  });
}

http.route({
  path: "/projects",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return new Response("Unauthorized", { status: 401 });
    const { name } = await request.json();
    const result = await ctx.runAction(internal.http_actions.createProject, { name, owner: identity.subject });
    return new Response(JSON.stringify(result), { status: 200, headers: corsHeaders });
  }),
});
http.route({
  path: "/projects",
  method: "DELETE",
  handler: httpAction(async (ctx, request) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return new Response("Unauthorized", { status: 401 });
    const { projectId } = await request.json();
    const result = await ctx.runAction(internal.http_actions.deleteProjectAndChildren, { projectId });
    return new Response(JSON.stringify(result), { status: 200, headers: corsHeaders });
  }),
});
http.route({ path: "/projects", method: "OPTIONS", handler: optionsHandler });

// SHEETS
http.route({
  path: "/sheets",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return new Response("Unauthorized", { status: 401 });
    const { name, projectId, filter, hiddenColumns } = await request.json();
    const result = await ctx.runAction(internal.http_actions.createSheet, { name, projectId, filter, hiddenColumns });
    return new Response(JSON.stringify(result), { status: 200, headers: corsHeaders });
  }),
});
http.route({
  path: "/sheets",
  method: "DELETE",
  handler: httpAction(async (ctx, request) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return new Response("Unauthorized", { status: 401 });
    const { sheetId } = await request.json();
    const result = await ctx.runAction(internal.http_actions.deleteSheet, { sheetId });
    return new Response(JSON.stringify(result), { status: 200, headers: corsHeaders });
  }),
});
http.route({ path: "/sheets", method: "OPTIONS", handler: optionsHandler });

// COLUMNS
http.route({
  path: "/columns",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return new Response("Unauthorized", { status: 401 });
    const body = await request.json();
    const result = await ctx.runAction(internal.http_actions.createColumn, { ...body});
    return new Response(JSON.stringify(result), { status: 200, headers: corsHeaders });
  }),
});
http.route({
  path: "/columns",
  method: "DELETE",
  handler: httpAction(async (ctx, request) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return new Response("Unauthorized", { status: 401 });
    const { columnId } = await request.json();
    const result = await ctx.runAction(internal.http_actions.deleteColumn, { columnId });
    return new Response(JSON.stringify(result), { status: 200, headers: corsHeaders });
  }),
});
http.route({ path: "/columns", method: "OPTIONS", handler: optionsHandler });
http.route({
  path: "/createColumn",
  method: "POST",
  handler: createColumnFromHttp,
});

http.route({
  path: "/createRow",
  method: "POST",
  handler: createRowFromHttp,
});

http.route({
  path: "/createRowBulk",
  method: "POST",
  handler: createRowBulkFromHttp,
});

http.route({
  path: "/getBySheet",
  method: "POST",
  handler: getBySheetFromHttp,
});

http.route({
  path: "/updateColumnState",
  method: "POST",
  handler: updateColumnStateFromHttp
});

http.route({
  path: "/createRelationships",
  method: "POST",
  handler: createRelationshipFromHttp
})

http.route({
  path: "/createSheet",
  method: "POST",
  handler: createSheetFromHttp
})

http.route({
  path: "/createProjectGrouping",
  method: "POST",
  handler: createProjectGroupingFromHttp
})

http.route({
  path: "/createProject",
  method: "POST",
  handler: createProjectFromHttp
})

http.route({
  path: "/insertJob",
  method: "POST",
  handler: insertJobFromHttp
})

http.route({
  path: "/updateJob",
  method: "POST",
  handler: updateJobFromHttp
})

http.route({
  path: "/getProjectDataForExport",
  method: "POST",
  handler: getProjectExportDataHttp
})

http.route({
  path: "/getProjectWorkflow",
  method: "POST",
  handler: getWorkflowRequestHttp
})
// NOTE:
// This is an `httpAction` instead of a regular `action` for a critical reason:
// To achieve the real-time, word-by-word "streaming" effect in the chat UI,
// we must use a technology called Server-Sent Events (SSE). SSE requires a persistent
// HTTP connection that only an `httpAction` can provide. A regular Convex `action`
// is designed to return a single, complete response and cannot stream data back to the client.
// The Vercel AI SDK's `useChat` hook, which manages the streaming UI, is built to
// communicate exclusively over HTTP. This is the standard, modern architecture for this feature.
http.route({
  path: "/chat",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    // Define CORS headers once to reuse them
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Convex-Auth, Authorization",
    };

    try {
      // 1. Authenticate the user
      const identity = await ctx.auth.getUserIdentity();
      if (!identity) {
        // Add CORS headers to the 401 response
        return new Response("Not authenticated", {
          status: 401,
          headers: corsHeaders,
        });
      }
      
      // Get the body
      const { messages, dataContext, model } = await req.json();

      // Get the API key
      const importDataApiKey = process.env.IMPORT_DATA_API_KEY;
      if (!importDataApiKey) {
        return new Response("IMPORT_DATA_API_KEY is not set in the environment.", {
          status: 500,
          headers: corsHeaders,
        });
      }

      if (!process.env.OPENAI_API_KEY?.trim()) {
        return new Response("OPENAI_API_KEY is not set in the environment.", {
          status: 500,
          headers: corsHeaders,
        });
      }

      // Generate system prompt
      const instructions = await ctx.runAction(internal.chat.generateSystemPrompt, {
        dataContext,
        apiKey: importDataApiKey,
      });
      
      // Stream response directly without Convex Agent (removed due to missing generated agent component)
      const result = await streamText({
        model: openai.chat(model || DEFAULT_AI_MODEL),
        messages,
        system: instructions,
        temperature: 1,
      });

      const textStream = result.textStream;

      // Format and return the successful stream response
      const iterableStream = streamToAsyncIterable(textStream);
      const finalStream = createManualSseStream(iterableStream);

      return new Response(finalStream, {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          ...corsHeaders,
        },
      });
    } catch (error) {
      // 9. Catch any other errors and return a 500 response with CORS headers
      console.error("Chat HTTP Action Error:", error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : "An internal server error occurred.";
      return new Response(errorMessage, {
        status: 500,
        headers: corsHeaders,
      });
    }
  }),
});
// Options route for chat
http.route({
  path: "/chat",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Convex-Auth, Authorization",
      },
    });
  }),
});

export default http

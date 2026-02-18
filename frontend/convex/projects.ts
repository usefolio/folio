
import { httpAction } from "./_generated/server";
import { v } from "convex/values";
import {
  apiMutation,
  apiQuery,
  authenticatedMutation,
  authenticatedQuery,
} from "./middleware";
import { api, components, internal } from "./_generated/api";
import { ShardedCounter } from "@convex-dev/sharded-counter";
import { paginationOptsValidator } from "convex/server";
import { getPage } from "convex-helpers/server/pagination";
import { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import { internalQuery } from "./_generated/server";
import { decodePromptBackend } from "@/utils/convexByteUtils";
import { ColumnProcessRequest, QueryBuilderState, WorkflowNode } from '@/interfaces/interfaces';
import { DEFAULT_AI_MODEL, DEFAULT_SYSTEM_PROMPT } from "@/constants";
import { JSONSchema, LLMModel, StructuredOutputPrompt, TextGenerationPrompt, WorkflowRequest } from "@/types/types";
import { action } from "./_generated/server";
import { convertToCsv } from "@/utils/CsvUtils";
import { sanitizeProjectName, suggestProjectName } from "@/utils/projectNameUtils";
import { sanitizeFileName } from "@/utils/fileNameUtils";

const counter = new ShardedCounter(components.shardedCounter);
// TODO: Move to frontend when redoing the workflows
/**
 * Creates a default, empty state for the query builder UI.
 * This is used internally when a new view node is created from a DB sheet
 * that doesn't have a pre-existing UI state saved.
 * @returns {QueryBuilderState} The default query builder state.
 */
const createDefaultQueryBuilderState = (): QueryBuilderState => ({
  tokens: [],
  currentCondition: { field: "", operator: "=", value: "", isEditing: false },
  showOperators: false,
  isAddingCondition: false,
  constructedQueryVisible: false,
});

export const getWorkflowRequest = apiQuery({
  args: {
    projectId: v.id("project"),
  },
  handler: async (ctx, args) => {

    const DEFAULT_MODEL = DEFAULT_AI_MODEL;
    const requests: WorkflowRequest[] = [];
    const convexUrl = process.env.CONVEX_CLOUD_URL;
    if (!convexUrl) {
      console.error("Export Error: VITE_CONVEX_URL not defined.");
      return [];
    }
    const callbackUrl = convexUrl.replace(/\.cloud$/, ".site");
    const systemPromptText = DEFAULT_SYSTEM_PROMPT;

    const processNodeForExport = (
      node: WorkflowNode,
      parentSqlCondition?: string,
    ) => {
      const currentTimestamp = new Date().toISOString();
      if (node.isView && node.convexId) {
        requests.push({
          timestamp: currentTimestamp,
          path: "/create_view",
          request_data: {
            convex_project_id: args.projectId,
            convex_sheet_id: node.convexId as Id<"sheet">,
            sql_filter: node.sql_condition || "1=1",
            callback_url: callbackUrl,
          },
        });
        if (node.children)
          node.children.forEach((child) =>
            processNodeForExport(child, node.sql_condition),
          );
      } else if (
        !node.isView &&
        node.convexId &&
        node.convexSheetId &&
        node.summary &&
        node.summary.length > 0 &&
        node.label
      ) {
        const model = (node.model || DEFAULT_MODEL) as LLMModel;
        let determinedExtractionKeyword = "default_keyword";
        if (node.type === "tag")
          determinedExtractionKeyword = "extraction_keyword";
        else if (node.type === "extract")
          determinedExtractionKeyword = "extracted_data";
        else if (node.type === "summary" || node.type === "ask")
          determinedExtractionKeyword = "text_completion";

        const baseRequestData: Omit<
          ColumnProcessRequest["request_data"],
          "prompt" | "extraction_keyword"
        > = {
          convex_project_id: args.projectId,
          convex_column_id: node.convexId as Id<"column">,
          column_name: node.label,
          sql_condition: parentSqlCondition || "1=1",
          output_name: determinedExtractionKeyword,
          prompt_input_columns: node.inputCols || [],
          workflow_id: null,
          api_keys: {},
          callback_url: callbackUrl,
        };
        let promptPayload:
          | TextGenerationPrompt
          | StructuredOutputPrompt
          | undefined = undefined;
        if (node.type === "tag") {
          const tags =
            node.tags
              ?.split(",")
              .map((t) => t.trim())
              .filter(Boolean) || [];
          const properties: Record<string, JSONSchema> = {};
          properties[determinedExtractionKeyword] =
            node.tagMode === "multiTag"
              ? { type: "array", items: { type: "string", enum: tags } }
              : { type: "string", enum: tags };
          promptPayload = {
            model,
            system_prompt: systemPromptText,
            user_prompt_template: node.summary,
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "Classification",
                schema: {
                  type: "object",
                  properties: properties,
                  required: [determinedExtractionKeyword],
                },
              },
            },
            extraction_keyword: determinedExtractionKeyword,
          };
        } else if (node.type === "extract") {
          const schemaForExtract = node.responseSchema || {
            type: "object",
            properties: {},
            required: [],
          };
          promptPayload = {
            model,
            system_prompt: systemPromptText,
            user_prompt_template: node.summary,
            response_format: {
              type: "json_schema",
              json_schema: { name: "ExtractedData", schema: schemaForExtract },
            },
            extraction_keyword: determinedExtractionKeyword,
          };
        } else if (node.type === "summary" || node.type === "ask") {
          promptPayload = {
            model,
            messages: [
              {
                role: "system",
                content: [{ type: "text", text: systemPromptText }],
              },
              { role: "user", content: [{ type: "text", text: node.summary }] },
            ],
            extraction_keyword: determinedExtractionKeyword,
          } as TextGenerationPrompt;
        } else {
          console.warn(
            `Export: Skipping request for node ${node.label} due to unhandled type: ${node.type}`,
          );
          return;
        }
        if (promptPayload)
          requests.push({
            timestamp: currentTimestamp,
            path: "/process",
            request_data: {
              ...baseRequestData,
              extraction_keyword: determinedExtractionKeyword,
              prompt: promptPayload,
            },
          });
      }
    };

    const project = await ctx.db.get(args.projectId);
    if (!project) {
      return [];
    }
    
    const dbSheetsList = await ctx.db
      .query("sheet")
      .withIndex("by_project", (q) => q.eq("project_id", args.projectId))
      .order("asc")
      .collect();

    const dbColumnsList = await ctx.db
      .query("column")
      .withIndex("project_id", (q) => q.eq("project_id", args.projectId))
      .collect();

    const workflowTree = buildWorkflowTree(project, dbSheetsList, dbColumnsList)

    workflowTree.forEach((node) => processNodeForExport(node));

    return JSON.stringify({ requests: requests }, null, 2);
  }
})  

export const get = authenticatedQuery({
  args: {},
  handler: async (ctx) => {
    const projects = await ctx.db
      .query("project")
      .withIndex("by_owner", (q) => q.eq("owner", ctx.identity.id as string))
      .collect();

    let projects_to_return = [];
    for (const project of projects) {
      if (project === null) {
        continue;
      }
      const _total_rows_when_last_viewed = project.total_rows_when_last_viewed
        ? project.total_rows_when_last_viewed
        : 0;
      let _total_rows = await counter.for(project._id).count(ctx);
      // this new rows number is what shows in the configured data syncs next to the project name
      const new_rows = _total_rows - _total_rows_when_last_viewed;
      const project_with_total_new_rows = {
        ...project,
        total_new_rows: new_rows,
      };
      projects_to_return.push(project_with_total_new_rows);
    }

    return projects_to_return;
  },
});

// This query is used to fetch data display information that helps the backend
// export data to excel spreadheets. For example, if we have several views where 
// the data is filtered in a specific way, we should replicate the functionality in
// excel.
export const getProjectExportData = apiQuery({
  args: {
    project_id: v.id("project"),
  },
  handler: async (ctx, args) => {
    const sheets = await ctx.db
      .query("sheet")
      .filter((q) => q.eq(q.field("project_id"), args.project_id))
      .collect();

    type SheetObject = {
      name: string;
      condition: string;
      column_names: string[];
    }

    const sheetsToReturn: SheetObject[] = [];
    for (const sheet of sheets) {
      if (sheet === null) {
        continue;
      }

      const projectColumns = await ctx.runQuery(internal.columns.getBySheet, {
        project_id: args.project_id
      });

      const columns = []
      for (const column of projectColumns ?? []) {
        if (!sheet.hidden.includes(column._id)) {
          columns.push(column.name);
        }
        if (column === null) {
          continue;
        }
      }

      const sheetObject: SheetObject = {
        name: sheet.name,
        condition: sheet.filter,
        column_names: columns
      }

      sheetsToReturn.push(sheetObject);
    }
    
    return sheetsToReturn;
  }
})

export const getPaginated = authenticatedQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const numItems = args.paginationOpts.numItems ?? 50;
    const userId = ctx.identity.id as string;

    // Handle cursor conversion
    let startIndexKey: any[] = [userId];

    if (args.paginationOpts.cursor) {
      try {
        // Parse it if it is a strigified object/array
        const parsedCursor = JSON.parse(args.paginationOpts.cursor as string);
        startIndexKey = Array.isArray(parsedCursor)
          ? parsedCursor
          : [userId, parsedCursor];
      } catch (_e) {
        // If not, use direct value
        startIndexKey = [userId, args.paginationOpts.cursor];
      }
    }

    const endIndexKey = [userId];

    const { page, hasMore, indexKeys } = await getPage(ctx, {
      table: "project",
      index: "by_owner",
      schema,
      startIndexKey,
      startInclusive: false,
      endIndexKey,
      endInclusive: false,
      absoluteMaxRows: numItems,
      order: "desc",
    });

    // Add counters to projects as in the original
    const projectsWithCounter = await Promise.all(
      page.map(async (project) => {
        const totalRowsLastViewed = project.total_rows_when_last_viewed ?? 0;
        const totalRows = await counter.for(project._id).count(ctx);
        const totalNewRows = totalRows - totalRowsLastViewed;

        return {
          ...project,
          total_new_rows: totalNewRows,
        };
      }),
    );

    // Prepare the cursor for the next page
    const nextCursor =
      hasMore && indexKeys.length > 0
        ? JSON.stringify(indexKeys[indexKeys.length - 1])
        : null;

    return {
      page: projectsWithCounter,
      isDone: !hasMore,
      continueCursor: nextCursor,
    };
  },
});
// Delete a project
export const deleteProject = authenticatedMutation({
  args: {
    projectId: v.id("project"),
  },
  handler: async (ctx, args) => {
    const { projectId } = args;
    
    // Get the project to check ownership
    const project = await ctx.db.get(projectId);
    if (!project) {
      throw new Error(`Project with ID ${projectId} not found.`);
    }
    
    if (project.owner !== ctx.identity.id) {
      throw new Error("User not authorized to delete this project");
    }
    
    // Delete the project
    await ctx.db.delete(projectId);
    
    return { success: true };
  },
});
export const saveProjectWorkflow = authenticatedMutation({
  args: {
    projectId: v.id("project"),
    workflowData: v.string(), // JSON string
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) {
      throw new Error("Project not found");
    }
    
    if (project.owner !== ctx.identity.id) {
      throw new Error("Unauthorized");
    }

    await ctx.db.patch(args.projectId, {
      project_workflow: args.workflowData,
    });

    return { success: true };
  },
});

// Load workflow data for project
export const loadProjectWorkflow = authenticatedQuery({
  args: {
    projectId: v.id("project"),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) {
      throw new Error("Project not found");
    }
    
    if (project.owner !== ctx.identity.id) {
      throw new Error("Unauthorized");
    }

    return project.project_workflow || null;
  },
});
export const create = authenticatedMutation({
  args: {
    text: v.string(),
  },
  handler: async (ctx, args) => {
    const taskId = await ctx.db.insert("project", {
      name: args.text,
      owner: ctx.identity.id as string,
      total_rows_when_last_viewed: 0,
    });
    return taskId;
  },
});

export const viewProject = authenticatedMutation({
  args: {
    project_id: v.id("project"),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.project_id);
    if (project === null) {
      throw new Error("Project not found");
    }
    if (project.owner !== ctx.identity.id) {
      throw new Error("User not authorized to view this project");
    }

    const project_row_counter = counter.for(args.project_id);
    const totalRows = await project_row_counter.count(ctx);
    const newProject = {
      ...project,
      total_rows_when_last_viewed: totalRows,
    };

    await ctx.db.patch(args.project_id, newProject);

    return project;
  },
});

export const createApi = apiMutation({
  args: {
    text: v.string(),
    owner: v.string(),
    project_grouping: v.optional(v.id("project_grouping")),
    synced: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const taskId = await ctx.db.insert("project", {
      name: args.text,
      owner: args.owner,
      project_grouping: args.project_grouping,
      total_rows_when_last_viewed: 0,
      type: args.synced ? "synced" : undefined,
    });
    return taskId;
  },
});

export const createProjectFromHttp = httpAction(async (ctx, req) => {
  const { text, owner, apiKey, project_grouping, synced } = await req.json();
  const taskId = await ctx.runMutation(api.projects.createApi, {
    text: text,
    apiKey: apiKey,
    owner: owner,
    project_grouping: project_grouping,
    synced: synced,
  });

  const response = {
    project_id: taskId,
  };

  return new Response(JSON.stringify(response), {
    status: 200,
  });
});

export const getProjectExportDataHttp = httpAction(async (ctx, req) => {
  const { project_id, apiKey } = await req.json();
  const projectExportData = await ctx.runQuery(api.projects.getProjectExportData, {
    project_id: project_id,
    apiKey: apiKey,
  });

  return new Response(JSON.stringify(projectExportData), {
    status: 200,
  }); 
});

export const getWorkflowRequestHttp = httpAction(async (ctx, req) => {
  const { projectId, apiKey } = await req.json();
  const workflowRequest = await ctx.runQuery(api.projects.getWorkflowRequest, {
    projectId: projectId,
    apiKey: apiKey,
  })

  return new Response(JSON.stringify(workflowRequest), {
    status: 200,
  });
});


/**
 * Fetches a paginated list of projects for a given owner.
 * This is an internal query, intended to be called from other Convex functions (e.g., actions).
 */
export const getProjectsPageForAction = internalQuery({
  // Defines expected arguments and their validation schemas.
  args: {
    ownerId: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  /**
   * Handler function that executes the query logic.
   * Returns a promise that resolves to a paginated query result for projects.
   */
  handler: async (ctx, args) => {
    return await ctx.db
      .query("project")
      .withIndex("by_owner", (q) => q.eq("owner", args.ownerId))
      .order("desc")
      .paginate(args.paginationOpts);
  }})

/**
 * Transforms a database column document into a front-end workflow node.
 * This function handles the logic of decoding the stored prompt and mapping
 * database fields to the structure expected by the workflow builder UI. It leverages
 * TypeScript's discriminated unions for type-safe mapping of prompt options.
 *
 * dbColumn - The column document from Convex.
 * parentSheetConvexId - The Convex ID of the sheet this column belongs to.
 * returns a structured `WorkflowNode` object for the UI, or `null` if the column type is not workflow-relevant.
 */
export const mapDbColumnToWorkflowNode = (
  dbColumn: Doc<"column">,
  parentSheetConvexId: Id<"sheet"> | undefined,
): WorkflowNode | null => {
  // Only columns that can have actions are part of the workflow.
  if (dbColumn.column_type !== "schema" && dbColumn.column_type !== "noSchema") {
    return null;
  }

  const decodedPrompt = decodePromptBackend(dbColumn.prompt);

  // The base structure for all column nodes.
  const baseNode: Omit<WorkflowNode, "type"> = {
    id: `col-backend-${dbColumn._id}`,
    label: dbColumn.name,
    isView: false,
    expanded: true,
    children: [],
    convexId: dbColumn._id,
    convexSheetId: parentSheetConvexId,
    summary: decodedPrompt.userPrompt || dbColumn.name,
    model: decodedPrompt.model || DEFAULT_AI_MODEL,
    inputCols: decodedPrompt.promptInputColumns || [],
  };

  // Use a type-safe switch on the prompt's discriminated union type.
  switch (decodedPrompt.promptType) {
    case "schema":
      switch (decodedPrompt.schemaType) {
        case "singleTag":
        case "multiTag":
          return {
            ...baseNode,
            type: "tag",
            tagMode: decodedPrompt.schemaType,
            tags: decodedPrompt.responseOptions?.join(", ") || "",
          };
        case "freeForm":
          return {
            ...baseNode,
            type: "extract",
            responseSchema: decodedPrompt.responseSchema,
          };
        default:
          // Fallback for an unknown or unhandled schemaType. This is now reachable.
          console.warn(
            `Unknown schemaType in decoded prompt: "${
              decodedPrompt
            }" for column: ${dbColumn.name}.`,
          );
          return { ...baseNode, type: "extract" };
      }

    case "noSchema":
      return {
        ...baseNode,
        type: decodedPrompt.ask ? "ask" : "summary",
      };

    default:
      // This case handles corrupted or unexpected prompt data.
      console.warn(
        `Invalid promptType for column: ${dbColumn.name}. Treating as 'summary'.`,
      );
      return { ...baseNode, type: "summary" };
  }
}
/**
 * A pure function that builds a hierarchical workflow tree from flat lists of
 * project, sheet, and column documents. It also merges in persisted UI state
 * from the project's saved workflow. Testable.
 *
 * project - The project document, containing the `project_workflow` JSON string.
 * sheets - An array of sheet documents for the project.
 * columns - An array of column documents for the project.
 * returns An array of `WorkflowNode` objects representing the complete UI tree.
 */
export function buildWorkflowTree(
  project: Doc<"project">,
  sheets: Doc<"sheet">[],
  columns: Doc<"column">[],
): WorkflowNode[] {
  const finalWorkflowNodes: WorkflowNode[] = [];

  // for (const dbColumn of columns) {
  //   const column_parent = dbColumn.sheet_id ? dbColumn.sheet_id : sheets[0]?._id;
  //   const columnNode = mapDbColumnToWorkflowNode(dbColumn, column_parent);
  //   if (columnNode !== null) {
  //     finalWorkflowNodes.push(columnNode);
  //   }
  // }

  for (const dbSheet of sheets) {
    const viewNode: WorkflowNode = {
      id: `view-backend-${dbSheet._id}`,
      label: dbSheet.name,
      isView: true,
      expanded: true,
      children: [],
      convexId: dbSheet._id,
      sql_condition: dbSheet.filter || "1=1",
      queryBuilderState: createDefaultQueryBuilderState(),
    };

    viewNode.children = columns
      .filter((dbColumn) => dbColumn.created_on_sheet_id === dbSheet._id)
      .map((dbColumn) => mapDbColumnToWorkflowNode(dbColumn, dbSheet._id))
      .filter((node): node is WorkflowNode => node !== null);

    finalWorkflowNodes.push(viewNode);
  }

  if (project.project_workflow) {
    try {
      const persistedNodes = JSON.parse(project.project_workflow) as WorkflowNode[];
      const persistedStateMap = new Map<Id<"sheet"> | Id<"column"> | undefined, Pick<WorkflowNode, "expanded" | "queryBuilderState">>();

      // Recursively build a flat map of all saved states
      const mapPersistedStates = (nodes: WorkflowNode[]) => {
        for (const pNode of nodes) {
          if (pNode.convexId) {
            persistedStateMap.set(pNode.convexId, {
              expanded: pNode.expanded,
              queryBuilderState: pNode.isView ? pNode.queryBuilderState : undefined,
            });
          }
          if (pNode.children) mapPersistedStates(pNode.children);
        }
      };
      mapPersistedStates(persistedNodes);

      // Apply the persisted state to all generated nodes (views and their children)
      finalWorkflowNodes.forEach((viewNode) => {
        const viewState = persistedStateMap.get(viewNode.convexId);
        if (viewState) {
          if (viewState.expanded !== undefined) {
            viewNode.expanded = viewState.expanded;
          }
          if (viewNode.isView && viewState.queryBuilderState) {
            viewNode.queryBuilderState = viewState.queryBuilderState;
          }
        }
        // Apply the saved state to the generated child nodes.
        // Only update UI-specific properties like expanded. Don't replace the whole child
        // because its core data (name, type, etc.) is freshly built from the database, which is the
        // single source of truth. This prevents using stale data from the saved workflow.
        viewNode.children.forEach((childNode) => {
          const childState = persistedStateMap.get(childNode.convexId);
          if (childState && childState.expanded !== undefined) {
            childNode.expanded = childState.expanded;
          }
        });
      });
    } catch (e) {
      console.error(
        `Project ${project._id}: Failed to parse project_workflow for UI states:`,
        e,
      );
    }
  }

  return finalWorkflowNodes;
}

/**
 * Fetches all sheets and columns for a project and assembles them into a hierarchical
 * workflow tree. It combines raw database data with persisted UI state (like node expansion)
 * from the `project_workflow` JSON field.
 */
export const getProjectWorkflowTree = authenticatedQuery({
  args: { projectId: v.id("project") },
  handler: async (ctx, args): Promise<WorkflowNode[]> => {
    const project = await ctx.db.get(args.projectId);
    if (!project || project.owner !== ctx.identity.subject) {
      throw new Error("Project not found or unauthorized");
    }

    const dbSheetsList = await ctx.db
      .query("sheet")
      .withIndex("by_project", (q) => q.eq("project_id", args.projectId))
      .order("asc")
      .collect();

    const dbColumnsList = await ctx.db
      .query("column")
      .withIndex("project_id", (q) => q.eq("project_id", args.projectId))
      .collect();

    // The handler now just fetches data and calls the pure transformation function.
    return buildWorkflowTree(project, dbSheetsList, dbColumnsList);
  },
});

export const searchExa = action({
  args: {
    query: v.optional(v.string()),
    url: v.optional(v.string()), 
    actionType: v.union(v.literal("search"), v.literal("findSimilar")),
    category: v.string(), 
    numResults: v.number(),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
  },
  handler: async (_, { query, url, actionType, category, numResults, startDate, endDate }) => {
    const apiKey = process.env.EXA_AI_KEY
    if (!apiKey) {
      throw new Error("Exa API key is not configured.");
    }

    let requestBody: any;
    let endpoint = "https://api.exa.ai/search";
    // Default filename
    let baseFileName = "exa_results";
    if (actionType === "findSimilar") {
      if (!url) throw new Error("URL is required for 'findSimilar' action.");
      endpoint = "https://api.exa.ai/findSimilar";
      requestBody = {
        url: url,
        numResults: numResults,
        contents: { text: { maxCharacters: 10000 } },
      };
      const rawName = await suggestProjectName(url, category, actionType);
      baseFileName = sanitizeProjectName(rawName, true).substring(0, 20);
      if (!baseFileName) {
        try {
          baseFileName = sanitizeProjectName(
            new URL(url).hostname.replace(/\./g, "_"),
            true,
          );
        } catch {
          baseFileName = "similar_url_results";
        }
      }
    } else {
      if (!query) throw new Error("Query is required for 'search' action.");
      const rawName = await suggestProjectName(query, category, actionType);
      baseFileName = sanitizeProjectName(rawName, true).substring(0, 20);
      if (!baseFileName) {
        baseFileName = "exa_results";
      }
      requestBody = {
        query: query,
        type: "neural",
        category: category,
        numResults: numResults,
        contents: { text: { maxCharacters: 10000 } },
      };
      if (startDate) {
        requestBody.startPublishedDate = startDate;
      }
      if (endDate) {
        requestBody.endPublishedDate = endDate;
      }
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Exa API Error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
  
    const formattedResults = data.results.map((result: any) => ({
      url: result.url || '',
      title: result.title || '',
      publishedDate: result.publishedDate || '',
      text: result.text || ''
    }));

    const csvData = convertToCsv(formattedResults);
    const resultsCount = data.results.length; // Get the count
    const rawFileName = `${baseFileName}_${new Date().toISOString().split('T')[0]}.csv`;
    const fileName = sanitizeFileName(rawFileName, { maxLength: 100, allowedExts: ["csv"] });
    return { csvData, resultsCount, fileName }; // Return object with count and file name
  },
});

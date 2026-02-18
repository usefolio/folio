import { httpAction, internalMutation, internalQuery, MutationCtx } from "./_generated/server";
import {
  apiMutation,
  apiQuery,
  authenticatedMutation,
  authenticatedQuery,
} from "./middleware";
import { v } from "convex/values";
import { api, components, internal } from "./_generated/api";
import { CellStates, CellState } from "../src/utils/CellState";
import {
  HttpMutationError,
  HttpMutationErrorType,
} from "./http_valdation_errors";
import { ColumnSubtypeSchema, ColumnTypeSchema } from "../src/types/columns";
import { zodToConvex } from "convex-helpers/server/zod";
import { getPage } from "convex-helpers/server/pagination";
import schema from "./schema";
import { BackendSavedJsonSchemas, SavedPrompt, PromptOptions, JSONSchema } from "@/types/types";
import { decodePrompt, decodeJsonSchema } from "@/utils/promptUtils";
import { paginationOptsValidator } from "convex/server";
import { action } from "./_generated/server"; // Changed from internalAction
import { AllPromptsAndJsonSchemasResult } from "../src/interfaces/interfaces";
import { Id, Doc } from "./_generated/dataModel";
import { Workpool } from "@convex-dev/workpool";

const PROJECT_PAGE_SIZE = 50;
const COLUMN_ITEMS_PAGE_SIZE = 50

const rowIngestionWorkpool = new Workpool(components.rowIngestionWorkpool, { maxParallelism: 1 });

export const get = authenticatedQuery({
  args: {},
  handler: async (ctx) => {
    // Get projects the user has access to
    const projectsUserHasAccessTo = await ctx.db
      .query("project")
      .withIndex("by_owner", (q) =>
        q.eq("owner", ctx.identity.id as string),
      )
      .collect();

    // Get columns only from those projects
    const columns = await Promise.all(
      projectsUserHasAccessTo.map((project) =>
        ctx.db
          .query("column")
          .withIndex("project_id", (q) =>
            q.eq("project_id", project._id),
          )
          .collect(),
      ),
    );

    return columns.flat();
  },
});

export const getBySheetApi = apiQuery({
  args: {
    project_id: v.id("project"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("column")
      .withIndex("project_id", (q) =>
        q.eq("project_id", args.project_id),
      )
      .collect()
  },
});

export const getBySheet = internalQuery({
  args: {
    project_id: v.id("project"),
  },
  handler: async (ctx, args) => {    
    return await ctx.db
      .query("column")
      .withIndex("project_id", (q) =>
        q.eq("project_id", args.project_id),
      )
      .collect();
  },
});

export const getColumnsBatch = authenticatedQuery({
  args: {
    projectId: v.optional(v.id("project")),
    sheetId: v.optional(v.id("sheet")),
    startIndexKey: v.optional(v.array(v.any())),
    startInclusive: v.optional(v.boolean()),
    limit: v.optional(v.number()),
    order: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
  },
  handler: async (ctx, args) => {
    if (!args.projectId) {
      return {
        columns: [],
        indexKeys: [],
        hasMore: false,
        sheetId: null,
      };
    }
    const project = await ctx.db.get(args.projectId);
    if (!project || project.owner !== ctx.identity.id) {
      throw new Error("User not authorized to access this project");
    }

    const limit = args.limit ?? 50;
    const order = args.order ?? "asc";

    // Set up index keys similar to how rows are handled
    const startIndexKey = args.startIndexKey
      ? args.startIndexKey
      : [args.projectId];

    const endIndexKey = [args.projectId];

    // Use getPage helper with the same pattern as rows
    const { page, hasMore, indexKeys } = await getPage(ctx, {
      table: "column",
      index: "project_id",
      schema,
      startIndexKey,
      startInclusive: args.startInclusive ?? false,
      endIndexKey,
      endInclusive: false,
      absoluteMaxRows: limit,
      order: order,
    });

    return {
      columns: page,
      indexKeys: indexKeys,
      hasMore: hasMore,
      sheetId: args.sheetId,
    };
  },
});

export const createNewColumn = authenticatedMutation({
  args: {
    name: v.string(),
    column_type: zodToConvex(ColumnTypeSchema),
    column_subtype: zodToConvex(ColumnSubtypeSchema),
    project_id: v.id("project"),
    state: v.optional(v.string()),
    sheet_id: v.optional(v.id("sheet")),
    prompt: v.optional(v.string()),
    jsonSchema: v.optional(v.string()),
    created_on_sheet_id: v.optional(v.id("sheet"))
  },

  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.project_id);
    if (!project || project.owner !== ctx.identity.id) {
      throw new Error("User not authorized to access this project");
    }
    //TODO: get the actual number of rows by using sharded counter
    const nrOfRows = 100000; //(await ctx.db.query("row").filter((q) => q.eq(q.field("sheet_id"), args.sheet)).collect()).length;
    const newCellState = new CellStates(nrOfRows);
    const column_id = await ctx.db.insert("column", {
      name: args.name,
      column_type: args.column_type,
      column_subtype: args.column_subtype,
      project_id: args.project_id,
      sheet_id: args.sheet_id,
      cell_state: newCellState.toArrayBuffer(),
      prompt: args.prompt,
      jsonSchema: args.jsonSchema,
      created_on_sheet_id: args.created_on_sheet_id
    });

    return column_id;
  },
});
export const updateColumnDetails = authenticatedMutation({
    args: {
      columnId: v.id("column"),
      name: v.string(),
      // Client sends prompt as a base64 encoded string. Schema stores it as v.string().
      prompt: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
      const { columnId, ...updates } = args;
  
      const column = await ctx.db.get(columnId);
      if (!column) throw new Error("Column not found");
      if (!column.project_id) throw new Error("Column is not associated with a project.");
  
      const project = await ctx.db.get(column.project_id);
      if (!project || project.owner !== ctx.identity.id) {
        throw new Error("User not authorized to update this column");
      }
  
      const validUpdates: Partial<Doc<"column">> = {};
  
      if (updates.prompt !== undefined) { // This is the base64 string
        validUpdates.prompt = updates.prompt;
      }
      if(updates.name !== undefined){
        validUpdates.name = updates.name
      }
      if (Object.keys(validUpdates).length === 0) {
        return { success: true, noChanges: true };
      }
  
      await ctx.db.patch(columnId, validUpdates);
      return { success: true };
    },
  });
// Delete a column
export const deleteColumn = authenticatedMutation({
  args: {
    columnId: v.id("column"),
  },
  handler: async (ctx, args) => {
    const { columnId } = args;
    
    // Get the column to check project ownership
    const column = await ctx.db.get(columnId);
    if (!column) {
      throw new Error(`Column with ID ${columnId} not found.`);
    }
    
    // Get the project to verify ownership
    const project = await ctx.db.get(column.project_id as Id<"project">);
    if (!project || project.owner !== ctx.identity.id) {
      throw new Error("User not authorized to delete this column");
    }
    
    // Delete the column
    await ctx.db.delete(columnId);
    
    return { success: true };
  },
});


export const setColumnCells = authenticatedMutation({
  args: {
    column: v.id("column"),
    states: v.string(), // the state in which cells get created in_progress, error, stale, default
  },
  handler: async (ctx, args) => {
    const column = await ctx.db.get(args.column);
    if (!column) {
      throw new Error("Column not found");
    }

    const project = await ctx.db.get(column.project_id as Id<"project">);
    if (!project || project.owner !== ctx.identity.id) {
      throw new Error("User not authorized to modify this column");
    }
    // Decode the base64 buffer field
    function base64ToArrayBuffer(base64: string): ArrayBuffer {
      // Decode base64 to binary string
      const binaryString = atob(base64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);

      // Convert binary string to bytes
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      return bytes.buffer; // Returns an ArrayBuffer
    }

    // Convert the "buffer" field to an ArrayBuffer
    const arrayBuffer = base64ToArrayBuffer(args.states);

    await ctx.db.patch(args.column, { cell_state: arrayBuffer });
  },
});

export const setColumnStateToLoading = authenticatedMutation({
  args: {
    column: v.id("column"),
    columnSize: v.number(),
  },
  handler: async (ctx, args) => {
    const column = await ctx.db.get(args.column);
    if (!column) {
      throw new Error("Column not found");
    }

    const project = await ctx.db.get(column.project_id as Id<"project">);
    if (!project || project.owner !== ctx.identity.id) {
      throw new Error("User not authorized to modify this column");
    }

    const cellState = new CellStates(args.columnSize);
    cellState.setAllToState(CellState.Loading);
    await ctx.db.patch(args.column, { cell_state: cellState.toArrayBuffer() });
  },
});

export const getColumnsWithLoadingCells = authenticatedQuery({
  args: { projectId: v.id("project") },
  handler: async (ctx, args) => {
    const columns = await ctx.db
      .query("column")
      .withIndex("project_id", (q) => q.eq("project_id", args.projectId))
      .collect();
      
    // Return only column IDs that have loading cells
    return columns
      .filter(column => {
        if (!column.cell_state) return false;
        try {
          const cellStates = new CellStates(column.cell_state, 100000);
          return cellStates.hasAnyLoadingState();
        } catch (error) {
          console.error("Error checking cell states:", error);
          return false;
        }
      })
      .map(column => column._id);
  },
});

export async function updateRowData(
  ctx: MutationCtx,
  args: UpdateRowDataArgs,
): Promise<void> {
  await Promise.all(
    args.rows.map(async (row_id, i) => {
      const cells = (await ctx.db.get(row_id))?.cells;
      if (!cells) throw new Error(`Cells not found for row ${row_id}`);

      const idx = cells.findIndex(c => c.column_id === args.column);
      const copy = [...cells];
      const newCellValue = args.cells[i];

      if (idx >= 0)       copy[idx] = newCellValue;   // overwrite
      else if (idx === -1) copy.push(newCellValue);    // append
      else throw new Error(
        `Unexpected error for row ${row_id} columnId:${args.column} index:${idx}`,
      );

      await ctx.db.patch(row_id, { cells: copy });
    }),
  );
}

export const updateCellStatesForColumn = internalMutation({
  args: {
    column: v.id("column"),
    cell_state: v.string(),
  },
  handler: async (ctx, args) => {
    const cell_state = CellStates.fromJSON(args.cell_state);
    await ctx.db.patch(args.column, { cell_state: cell_state.toArrayBuffer() });
  } 
});

type ColumnId = Id<"column">;
type RowId   = Id<"row">;

export interface UpdateRowDataArgs {
  column: ColumnId;
  rows: RowId[];
  cells: {
    column_id: ColumnId;
    value: string;
    state: string;           // "in_progress" | "error" | ...
  }[];
  cell_state: string;
}

export const updateColumnStateAndCells = apiMutation({
  args: {
    column: v.id("column"),
    cell_state: v.string(),
    rows: v.array(v.id("row")),
    cells: v.array(
      v.object({
        column_id: v.id("column"),
        value: v.string(),
        state: v.string(), // in_progress, error, stale, default
      }),
    ),
  },
  handler: async (ctx, args) => {
    if (args.rows.length !== args.cells.length) {
      throw new HttpMutationError(
        HttpMutationErrorType.ValidationError,
        "Rows and cells length do not match",
      );
    }

    await updateRowData(ctx, {
      column: args.column,
      rows: args.rows,
      cells: args.cells,
      cell_state: args.cell_state,
    });

    await rowIngestionWorkpool.enqueueMutation(
      ctx,
      internal.columns.updateCellStatesForColumn,
      { column: args.column, cell_state: args.cell_state },
    );
  },
});

export const createApi = apiMutation({
  args: {
    text: v.string(),
    project_id: v.id("project"),
    column_subtype: zodToConvex(ColumnSubtypeSchema),
  },
  handler: async (ctx, args) => {
    //TODO: get the actual number of rows by using sharded counter
    const nrOfRows = 100000; //(await ctx.db.query("row").filter((q) => q.eq(q.field("sheet_id"), args.sheet)).collect()).length;
    const newCellState = new CellStates(nrOfRows);
    const taskId = await ctx.db.insert("column", {
      name: args.text,
      project_id: args.project_id,
      cell_state: newCellState.toArrayBuffer(),
      column_subtype: args.column_subtype,
    });

    return taskId;
  },
});

export const getBySheetFromHttp = httpAction(async (ctx, req) => {
  console.log(req);
  const { project_id, apiKey } = await req.json();

  const result = await ctx.runQuery(api.columns.getBySheetApi, {
    project_id: project_id,
    apiKey: apiKey,
  });

  const columns = result.map((column) => {
    return {
      id: column._id,
      name: column.name,
      column_type: column.column_type,
      column_subtype: column.column_subtype,
    };
  });

  return new Response(JSON.stringify(columns), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });
});

export const createColumnFromHttp = httpAction(async (ctx, req) => {
  const { text, project_id, column_subtype, apiKey } = await req.json();

  const column_id = await ctx.runMutation(api.columns.createApi, {
    text: text,
    project_id: project_id,
    apiKey: apiKey,
    column_subtype: column_subtype,
  });
  const response = {
    column_id: column_id,
  };

  return new Response(JSON.stringify(response), {
    status: 200,
  });
});

export const updateColumnStateFromHttp = httpAction(async (ctx, req) => {
  const { column, cell_state, rows, cells, apiKey } = await req.json();

  //TODO: make sure to do some input validation
  await ctx.runMutation(api.columns.updateColumnStateAndCells, {
    column: column,
    cell_state: cell_state,
    rows: rows,
    cells: cells,
    apiKey: apiKey,
  });

  return new Response(null, {
    status: 200,
  });
});
/**
 * Fetches a paginated list of column items (prompts and jsonSchemas) for a given project.
 * This is an internal query.
 */
export const getColumnItemsPageForAction = internalQuery({
  args: {
    projectId: v.id("project"),
    projectName: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  /**
   * Handler function that executes the query logic.
   * Returns a promise resolving to an object containing lists of prompts and jsonSchemas,
   * and pagination status (isDone, continueCursor).
   */
  handler: async (ctx, args) => {
    // Fetch a paginated list of columns for the specified project.
    const columnPaginationResult = await ctx.db
      .query("column")
      .withIndex("project_id", (q) => q.eq("project_id", args.projectId))
      .order("asc")
      .paginate(args.paginationOpts);
  
    // Initialize arrays to hold processed prompts and jsonSchemas.
    const prompts: SavedPrompt[] = [];
    const jsonSchemas: BackendSavedJsonSchemas[] = [];
  
    // Iterate over the fetched page of columns.
    for (const column of columnPaginationResult.page) {
      // Process the 'prompt' field if it exists.
      if (column.prompt) {
        try {
          // Decode the stored prompt string into PromptOptions structure.
          const promptOptions = decodePrompt(column.prompt) as PromptOptions;
          prompts.push({
            columnName: column.name,
            projectId: args.projectId,
            projectName: args.projectName,
            promptOptions: promptOptions,
            sourceSheetId: column.created_on_sheet_id
          });
        } catch (e) {
          // Log errors during prompt decoding to the console.
          console.error(`Error decoding prompt for column ${column._id} in project ${args.projectId}:`, e);
        }
      }
  
      // Process the jsonSchema field
      if (column.jsonSchema) {
        try {
          const rawJsonSchema = decodeJsonSchema(column.jsonSchema) as JSONSchema; // This is PURE JSONSchema

          jsonSchemas.push({
            id: `${column.name}-${args.projectId}-${column._id}`,
            name: `${column.name} - ${args.projectName}`,
            schema: rawJsonSchema,
            projectId: args.projectId,
          });
        } catch (e) {
          console.error(`Error processing jsonSchema for column ${column._id} in project ${args.projectId}:`, e);
        }
      }
    }
  
    // Return the collected prompts, jsonSchemas, and pagination status.
    return {
      prompts,
      jsonSchemas,
      isDone: columnPaginationResult.isDone,
      continueCursor: columnPaginationResult.continueCursor,
    };
  },
});

/**
 * A Convex action to fetch all saved prompts and JSON schema jsonSchemas
 * associated with the currently authenticated user's projects and columns.
 * It paginates through projects and then through columns within each project.
 */
export const fetchAllPromptsAndJsonSchemasAction = action({
  /**
   * Handler function that executes the action logic.
   * returns a promise resolving to an object containing lists of all prompts and jsonSchemas.
   */
  handler: async (ctx): Promise<Omit<AllPromptsAndJsonSchemasResult, "count">> => {
    // Retrieve the user's identity for authentication.
    const identity = await ctx.auth.getUserIdentity();
    // If no identity is found (user not authenticated), throw an error.
    if (!identity || !identity.id) {
      throw new Error("Authentication required for action.");
    }
    // Use the user's subject (unique ID) as the ownerId for fetching projects.
    const ownerId = identity.id as string;
  
    // Initialize arrays to accumulate all prompts and jsonSchemas.
    const allPromptsList: SavedPrompt[] = [];
    const allJsonSchemaList: BackendSavedJsonSchemas[] = [];
  
    let projectCursor: string | null | undefined = null; // Cursor for project pagination. // Number of projects to fetch per page.
    let projectPageResult; // Stores the result of each project page query.
  
    // Loop to fetch all pages of projects.
    do {
      // Run the internal query to get a page of projects.
      projectPageResult = await ctx.runQuery(
        internal.projects.getProjectsPageForAction,
        { ownerId, paginationOpts: { cursor: projectCursor || null, numItems: PROJECT_PAGE_SIZE } }
      );
  
      // For each project in the current page, fetch its column items (prompts/jsonSchemas).
      for (const project of projectPageResult.page) {
        let columnCursor: string | null | undefined = null; // Cursor for column pagination.
        ; // Number of column items to fetch per page.
        let columnItemsPageResult; // Stores the result of each column items page query.

        // Loop to fetch all pages of column items for the current project.
        do {
          // Run the internal query to get a page of column items.
          columnItemsPageResult = await ctx.runQuery(
            internal.columns.getColumnItemsPageForAction,
            {
              projectId: project._id,
              projectName: project.name,
              paginationOpts: { cursor: columnCursor || null, numItems: COLUMN_ITEMS_PAGE_SIZE },
            }
          );
  
          // Add fetched prompts and jsonSchemas to their respective aggregate lists.
          allPromptsList.push(...columnItemsPageResult.prompts);
          allJsonSchemaList.push(...columnItemsPageResult.jsonSchemas);
          // Update cursor for the next page of column items.
          columnCursor = columnItemsPageResult.continueCursor;
        } while (columnItemsPageResult && !columnItemsPageResult.isDone && columnCursor); // Continue if more column items exist.
      }
      // Update cursor for the next page of projects.
      projectCursor = projectPageResult ? projectPageResult.continueCursor : null;
    } while (projectPageResult && !projectPageResult.isDone && projectCursor); // Continue if more projects exist.
  
    // Return the aggregated lists of prompts and jsonSchemas.
    return {
      prompts: allPromptsList,
      jsonSchemas: allJsonSchemaList,
    };
  },
});

export const getColumnsPageForExport = internalQuery({
  args: {
    projectId: v.id("project"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("column")
      .withIndex("project_id", (q) => q.eq("project_id", args.projectId))
      .order("asc")
      .paginate(args.paginationOpts);
  },
});
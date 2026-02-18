import { httpAction } from "./_generated/server";
import { v } from "convex/values";
import {
  apiMutation,
  authenticatedMutation,
  authenticatedQuery,
} from "./middleware";
import { api, components } from "./_generated/api";
import { ShardedCounter } from "@convex-dev/sharded-counter";
import { paginationOptsValidator } from "convex/server";
import schema from "./schema";
import { getPage } from "convex-helpers/server/pagination";
import { Id } from "./_generated/dataModel";
import { internalQuery } from "./_generated/server";

const counter = new ShardedCounter(components.shardedCounter);

export const get = authenticatedQuery({
  args: {
    project_id: v.id("project"),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.project_id);
    if (!project || project.owner !== ctx.identity.id) {
      throw new Error("User not authorized to access this project");
    }
    const sheets = await ctx.db
      .query("sheet")
      .filter((q) => q.eq(q.field("project_id"), args.project_id))
      .collect();

    for (const sheet of sheets) {
      // Ensure every sheet has hidden property initialized
      if (!sheet.hidden) {
        sheet.hidden = [];
      }

      const sheet_row_counter = counter.for(sheet._id);
      const nrOfRows = await sheet_row_counter.count(ctx);
      sheet.rows_in_sheet_counter = nrOfRows;
    }

    return sheets;
  },
});

export const getPaginated = authenticatedQuery({
  args: {
    project_id: v.optional(v.id("project")),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    if (!args.project_id) {
      const paginated = await ctx.db
        .query("sheet")
        .withIndex("by_project", q => q.eq("project_id", args.project_id as Id<"project">))
        .order("asc") // Sorts by _creationTime ascending within the project_id filter
        .paginate(args.paginationOpts);

      const sheetsWithCounter = await Promise.all(
        paginated.page.map(async (sheet) => {
          const sheet_row_counter = counter.for(sheet._id);
          const nrOfRows = await sheet_row_counter.count(ctx);
          return {
            ...sheet,
            hidden: sheet.hidden ?? [],
            rows_in_sheet_counter: nrOfRows,
          };
        }),
      );

      return {
        ...paginated,
        page: sheetsWithCounter,
      };
    }

    const numItems = args.paginationOpts.numItems ?? 50;
    // Handle cursor conversion
    let startIndexKey: any[] = [args.project_id];

    if (args.paginationOpts.cursor) {
      try {
        // Parse it if it is a strigified object/array
        const parsedCursor = JSON.parse(args.paginationOpts.cursor as string);
        startIndexKey = Array.isArray(parsedCursor)
          ? parsedCursor
          : [parsedCursor];
      } catch (e) {
        // If not, use direct value
        startIndexKey = [args.paginationOpts.cursor];
      }
    }

    const endIndexKey = [args.project_id];

    const { page, hasMore, indexKeys } = await getPage(ctx, {
      table: "sheet",
      index: "by_project",
      schema,
      startIndexKey,
      startInclusive: false,
      endIndexKey,
      endInclusive: false,
      absoluteMaxRows: numItems,
      order: "desc",
    });

    // Add counters to sheets
    const sheetsWithCounter = await Promise.all(
      page.map(async (sheet) => {
        const sheet_row_counter = counter.for(sheet._id);
        const nrOfRows = await sheet_row_counter.count(ctx);
        return {
          ...sheet,
          hidden: sheet.hidden ?? [],
          rows_in_sheet_counter: nrOfRows,
        };
      }),
    );

    // Prepare the cursor for the next page
    const nextCursor =
      hasMore && indexKeys.length > 0
        ? JSON.stringify(indexKeys[indexKeys.length - 1])
        : null;

    return {
      page: sheetsWithCounter,
      isDone: !hasMore,
      continueCursor: nextCursor,
    };
  },
});

export const getSheetById = authenticatedQuery({
  args: {
    sheet_id: v.id("sheet"),
  },
  handler: async (ctx, args) => {
    console.log("Received sheet_id:", args.sheet_id); // Debug log
    const sheet = await ctx.db.get(args.sheet_id);

    if (!sheet) {
      console.error(`Sheet with ID ${args.sheet_id} not found.`);
      throw new Error(`Sheet with ID ${args.sheet_id} not found.`);
    }

    // Ensure the sheet has hidden property initialized
    if (!sheet.hidden) {
      sheet.hidden = [];
    }

    const sheet_row_counter = counter.for(sheet._id);
    const nrOfRows = await sheet_row_counter.count(ctx);
    sheet.rows_in_sheet_counter = nrOfRows;

    return sheet;
  },
});

export const create = authenticatedMutation({
  args: {
    text: v.string(),
    project_id: v.id("project"),
    filter: v.string(),
    hidden: v.optional(v.array(v.id("column"))),
  },
  handler: async (ctx, args) => {
    const taskId = await ctx.db.insert("sheet", {
      project_id: args.project_id,
      name: args.text,
      rows_in_sheet_counter: 0,
      filter: args.filter,
      hidden: args.hidden || [], // Initialize with empty array or pass the hidden argument
    });

    console.log("Created sheet with ID:", taskId);
    return taskId;
  },
});

export const setSheetHiddenColumns = authenticatedMutation({
  args: {
    sheet_id: v.id("sheet"),
    column_id: v.id("column"),
  },
  handler: async (ctx, args) => {
    const sheet = await ctx.db.get(args.sheet_id);

    if (!sheet) {
      throw new Error(`Sheet with ID ${args.sheet_id} not found.`);
    }

    const sheetHiddenColumns = sheet.hidden ?? [];

    // Only add if not already present
    if (!sheetHiddenColumns.includes(args.column_id)) {
      sheetHiddenColumns.push(args.column_id);
      await ctx.db.patch(args.sheet_id, { hidden: sheetHiddenColumns });
      console.log(
        `Added column ${args.column_id} to hidden columns for sheet ${args.sheet_id}`,
      );
    }
  },
});
// Delete a sheet
export const deleteSheet = authenticatedMutation({
  args: {
    sheetId: v.id("sheet"),
  },
  handler: async (ctx, args) => {
    const { sheetId } = args;
    
    // Get the sheet to check ownership
    const sheet = await ctx.db.get(sheetId);
    if (!sheet) {
      throw new Error(`Sheet with ID ${sheetId} not found.`);
    }
    
    // Get the project to verify ownership
    const project = await ctx.db.get(sheet.project_id);
    if (!project || project.owner !== ctx.identity.id) {
      throw new Error("User not authorized to delete this sheet");
    }
    
    // Delete the sheet
    await ctx.db.delete(sheetId);
    
    return { success: true };
  },
});
export const removeColumnFromHiddenColumnsOnSheet = authenticatedMutation({
  args: {
    sheet_id: v.id("sheet"),
    column_id: v.id("column"),
  },
  handler: async (ctx, args) => {
    const sheet = await ctx.db.get(args.sheet_id);

    if (!sheet) {
      throw new Error(`Sheet with ID ${args.sheet_id} not found.`);
    }

    const sheetHiddenColumns = sheet.hidden ?? [];
    const index = sheetHiddenColumns.indexOf(args.column_id);

    if (index > -1) {
      sheetHiddenColumns.splice(index, 1);
      await ctx.db.patch(args.sheet_id, { hidden: sheetHiddenColumns });
      console.log(
        `Removed column ${args.column_id} from hidden columns for sheet ${args.sheet_id}`,
      );
    }
  },
});
// New mutation to update multiple hidden columns at once
export const updateSheetHiddenColumns = authenticatedMutation({
  args: {
    sheet_id: v.id("sheet"),
    hidden_columns: v.array(v.id("column")),
  },
  handler: async (ctx, args) => {
    const sheet = await ctx.db.get(args.sheet_id);

    if (!sheet) {
      throw new Error(`Sheet with ID ${args.sheet_id} not found.`);
    }

    await ctx.db.patch(args.sheet_id, { hidden: args.hidden_columns });
    console.log(`Updated hidden columns for sheet ${args.sheet_id}`);
  },
});

export const createApi = apiMutation({
  args: {
    text: v.string(),
    project_id: v.id("project"),
    filter: v.string(),
  },
  handler: async (ctx, args) => {
    const taskId = await ctx.db.insert("sheet", {
      project_id: args.project_id,
      name: args.text,
      rows_in_sheet_counter: 0,
      filter: args.filter,
      hidden: [],
    });

    console.log("Created API sheet with ID:", taskId);
    return taskId;
  },
});

export const createSheetFromHttp = httpAction(async (ctx, req) => {
  const { text, project_id, filter, apiKey } = await req.json();

  const sheet_id = await ctx.runMutation(api.sheets.createApi, {
    text: text,
    project_id: project_id,
    filter: filter,
    apiKey: apiKey,
  });

  const response = {
    sheet_id: sheet_id,
  };

  const jsonString = JSON.stringify(response);
  return new Response(jsonString, {
    status: 200,
  });
});

export const getSheetsPageForExport = internalQuery({
  args: {
      projectId: v.id("project"),
      paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
      const result = await ctx.db
          .query("sheet")
          .withIndex("by_project", (q) => q.eq("project_id", args.projectId))
          .order("asc")
          .paginate(args.paginationOpts);
      return result;
  },
});
import { httpAction, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import type { Doc, Id } from "../convex/_generated/dataModel.d.ts";
import { api, components } from "./_generated/api";
import { apiMutation, apiQuery, authenticatedQuery } from "./middleware";
import { getAll } from "convex-helpers/server/relationships";
import { getPage } from "convex-helpers/server/pagination";
import schema from "./schema";
import PaginatedRowsResponse from "../src/utils/PaginatedRowsResponse";
import { ShardedCounter } from "@convex-dev/sharded-counter";

const counter = new ShardedCounter(components.shardedCounter);

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

    // Get rows only from those projects
    const rows = await Promise.all(
      projectsUserHasAccessTo.map((project) =>
        ctx.db
          .query("row")
          .filter((q) => q.eq(q.field("project_id"), project._id))
          .collect(),
      ),
    );

    return rows.flat();
  },
});
export const getRowById = apiQuery({
  args: {
    row_id: v.id("row"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.row_id);
  },
});
// export const getBySheet = query({
//   args: {
//     sheet: v.id("sheet"),
//   },
//   handler: async (ctx, args) => {
//     const result = await ctx.db.query("row")
//       .filter((q) => q.eq(q.field("sheet_id"), args.sheet))

//     return result
//   },
// });

export const getRowsForSheet = authenticatedQuery({
  args: {
    sheetId: v.optional(v.id("sheet")),
    // Optional pagination arguments
    startIndexKey: v.optional(v.array(v.any())),
    startInclusive: v.optional(v.boolean()),
    endIndexKey: v.optional(v.array(v.any())),
    endInclusive: v.optional(v.boolean()),
    order: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
  },
  handler: async (ctx, args) => {
    if (!args.sheetId) {
      return {
        rows: [],
        indexKeys: [],
        hasMore: false,
        sheetId: null,
      };
    }
    const sheet = await ctx.db.get(args.sheetId);
    if (!sheet) {
      throw new Error("Sheet not found");
    }

    const project = await ctx.db.get(sheet.project_id);
    if (!project || project.owner !== ctx.identity.id) {
      throw new Error("User not authorized to access this sheet");
    }
    try {
    const startIndexKey = args.startIndexKey
      ? args.startIndexKey
      : [args.sheetId];
    const endIndexKey = [args.sheetId];
    const {
      page,
      hasMore: more,
      indexKeys,
    } = await getPage(ctx, {
      table: "relationships",
      index: "sheet_id", // Use the index you specified
      schema,
      startIndexKey,
      startInclusive: args.startInclusive, // Include the starting key by default
      endIndexKey: endIndexKey,
      absoluteMaxRows: 50, // Fetch 100 rows per page
      order: "asc", // Fetch in ascending order
    });

    // Step 1: Order items by `row_number`
    const sortedItems = page.sort((a, b) => a.row_number - b.row_number);

    // Step 2: Remove duplicates by `row_id`
    //TODO: this wont really work if we have a page size 10 and if there are 11 duplicates. Page 2 will show the same element and also pages will be smaller...
    const uniqueItems = Array.from(
      new Map(sortedItems.map((item) => [item.row_id, item])).values(),
    );

    // Step 3: Extract `row_ids`
    const row_ids = uniqueItems.map((item) => item.row_id);

    const rows = (await getAll(ctx.db, row_ids)).filter((row) => row !== null);

    const response: PaginatedRowsResponse = {
      rows: rows as Doc<"row">[],
      indexKeys: indexKeys,
      hasMore: more,
      sheetId: args.sheetId,
    };

    return response;
  } catch (error) {
    console.error("Error in getRowsForSheet fetching row data:", error);

    const message =
    error instanceof Error ? error.message : String(error)

    return {
      rows: [],
      indexKeys: [],
      hasMore: false,
      sheetId: args.sheetId,
      error: message,
    };
  }
  },
});

export const getBySheetPaginated = authenticatedQuery({
  args: {
    paginationOpts: paginationOptsValidator,
    sheet: v.id("sheet"),
  },
  handler: async (ctx, args) => {
    const sheet = await ctx.db.get(args.sheet);
    if (!sheet) {
      throw new Error("Sheet not found");
    }

    const project = await ctx.db.get(sheet.project_id);
    if (!project || project.owner !== ctx.identity.id) {
      throw new Error("User not authorized to access this sheet");
    }
    const result = await ctx.db.query("row").paginate(args.paginationOpts);
    return result;
  },
});

export const updateCellsForRow = internalMutation({
  args: {
    row_id: v.id("row"),
    cells: v.array(
      v.object({
        column_id: v.id("column"),
        value: v.string(),
        state: v.string(), // in_progress, error, stale, default
      })
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.row_id, { cells: args.cells });
  },
});

export const createApi = apiMutation({
  args: {
    order: v.number(),
    project_id: v.id("project"),
    row_number: v.number(),
    cells: v.array(
      v.object({
        column_id: v.id("column"),
        value: v.string(),
        state: v.string(), // in_progress, error, stale, default
      })
    ),
  },
  handler: async (ctx, args) => {
    const rowId = await ctx.db.insert("row", {
      order: args.order,
      project_id: args.project_id,
      //sheet_id: args.sheet,
      row_number: args.row_number,
      cells: args.cells,
    });

    const project_row_counter = counter.for(args.project_id);
    project_row_counter.inc(ctx);
    // const nrOfRows = await project_row_counter.count(ctx);
    // await ctx.db.patch(args.project_id, { rows_in_project_counter: nrOfRows });

    return rowId;
    // do something with `taskId`
  },
});

export const createApiBulk = apiMutation({
  args: {
    rows: v.array(
      v.object({
        order: v.number(),
        project_id: v.id("project"),
        row_number: v.number(),
        cells: v.array(
          v.object({
            column_id: v.id("column"),
            value: v.string(),
            state: v.string(), // in_progress, error, stale, default
          })
        ),
      })
    ),
  },
  handler: async (ctx, args) => {
    const rows_inserted = [];
    const rowCounts = new Map<Id<"project">, number>();
    for (let i = 0; i < args.rows.length; i++) {
      const row = args.rows[i];
      const rowId = await ctx.db.insert("row", {
        order: row.order,
        project_id: row.project_id,
        //sheet_id: args.sheet,
        row_number: row.row_number,
        cells: row.cells,
      });

      // Add the row data (including cells) to the response, otherwise we can't update rows properly
      rows_inserted.push({
        convex_row_id: rowId,
        convex_row_order: row.order,
        row_number: row.row_number,
        cells: row.cells,
      });

      rowCounts.set(row.project_id, (rowCounts.get(row.project_id) || 0) + 1);
    }

    // Iterate through the keys and counts
    for (const [project_id, count] of rowCounts.entries()) {
      const rows_in_project_counter = counter.for(project_id);
      rows_in_project_counter.add(ctx, count);
      //   const nrOfRows = await rows_in_project_counter.count(ctx);
      //   await ctx.db.patch(project_id, { rows_in_project_counter: nrOfRows });
    }

    return rows_inserted;
    // do something with `taskId`
  },
});

export const createRowFromHttp = httpAction(async (ctx, req) => {
  const { order, project_id, row_number, cells, apiKey } = await req.json();

  const row_id = await ctx.runMutation(api.rows.createApi, {
    order: order,
    project_id: project_id,
    row_number: row_number,
    cells: cells,
    apiKey: apiKey,
  });

  const response = {
    row_id: row_id,
  };
  const jsonString = JSON.stringify(response);

  return new Response(jsonString, {
    status: 200,
  });
});

export const createRowBulkFromHttp = httpAction(async (ctx, req) => {
  //const { project_id, row_number, cells, apiKey } = await req.json();

  const { rows, apiKey } = await req.json();

  const rows_inserted = await ctx.runMutation(api.rows.createApiBulk, {
    rows: rows,
    apiKey: apiKey,
  });

  const response = {
    rows: rows_inserted,
  };
  const jsonString = JSON.stringify(response);

  return new Response(jsonString, {
    status: 200,
  });
});
export const getFirstNRows = apiQuery({
     args: {
       sheetId: v.id("sheet"),
       limit: v.number(),
     },
     handler: async (ctx, { sheetId, limit }) => {
       const relationships = await ctx.db
         .query("relationships")
         .withIndex("sheet_id", q => q.eq("sheet_id", sheetId))
         .take(limit);
  
       const rowIds = relationships.map(rel => rel.row_id);
       const rows = await Promise.all(rowIds.map(id => ctx.db.get(id)));
       return rows.filter(Boolean);
     },
  });
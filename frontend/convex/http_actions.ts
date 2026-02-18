import { v } from "convex/values";
import { api } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { Id, Doc } from "./_generated/dataModel";
import { zodToConvex } from "convex-helpers/server/zod";
import { ColumnTypeSchema, ColumnSubtypeSchema } from "@/types/columns";


export const createColumn = internalAction({
  args: {
    name: v.string(),
    column_type: zodToConvex(ColumnTypeSchema),
    column_subtype: zodToConvex(ColumnSubtypeSchema),
    project_id: v.id("project"),
    prompt: v.optional(v.string()),
    jsonSchema: v.optional(v.string()),
    created_on_sheet_id: v.optional(v.id("sheet"))
  },
  handler: async (ctx, args): Promise<Id<"column">> => {
    const { name, column_type, column_subtype, project_id, prompt, jsonSchema, created_on_sheet_id } = args;
    const newColumnId = await ctx.runMutation(api.columns.createNewColumn, {
        name: name,
        project_id: project_id,
        column_type: column_type,
        column_subtype: column_subtype,
        prompt: prompt,
        jsonSchema: jsonSchema,
        created_on_sheet_id: created_on_sheet_id,
      })
    return newColumnId
  },
});

export const createProject = internalAction({
    args: { name: v.string(), owner: v.string() },
    handler: async (ctx, args): Promise<Id<"project">> => {
        return await ctx.runMutation(api.projects.create, { text: args.name });
    },
});

export const createSheet = internalAction({
    args: { name: v.string(), projectId: v.id("project"), filter: v.string(), hiddenColumns: v.optional(v.array(v.id("column"))) },
    handler: async (ctx, args): Promise<Id<"sheet">> => {
        return await ctx.runMutation(api.sheets.create, { text: args.name, project_id: args.projectId, filter: args.filter, hidden: args.hiddenColumns || [] });
    },
});

export const deleteColumn = internalAction({
    args: { columnId: v.id("column") },
    handler: async (ctx, args): Promise<{ success: true }> => {
        await ctx.runMutation(api.columns.deleteColumn, { columnId: args.columnId });
        return { success: true };
    },
});

export const deleteSheet = internalAction({
    args: { sheetId: v.id("sheet") },
    handler: async (ctx, args): Promise<{ success: true }> => {
        await ctx.runMutation(api.sheets.deleteSheet, { sheetId: args.sheetId });
        return { success: true };
    },
});

export const deleteProjectAndChildren = internalAction({
  args: { projectId: v.id("project") },
  handler: async (ctx, args) => {
    const { projectId } = args;
    const BATCH_SIZE = 50;
     const sheetIds: Id<"sheet">[] = [];
    let sheetCursor: string | null = null;
    let isSheetDone = false;
    while (!isSheetDone) {
      const result: {
        page: Doc<"sheet">[];
        isDone: boolean;
        continueCursor: string | null;
      } = await ctx.runQuery(api.sheets.getPaginated, {
        project_id: projectId,
        paginationOpts: { numItems: BATCH_SIZE, cursor: sheetCursor },
      });
      result.page.forEach((sheet: Doc<"sheet">) => sheetIds.push(sheet._id));
      isSheetDone = result.isDone;
      sheetCursor = result.continueCursor;
    }

    const columnIds: Id<"column">[] = [];
    let columnStartIndexKey: any[] | undefined = undefined;
    let hasMoreColumns = true;
    while (hasMoreColumns) {
      const result: {
        columns: Doc<"column">[];
        hasMore: boolean;
        indexKeys: any[];
      } = await ctx.runQuery(api.columns.getColumnsBatch, {
        projectId: projectId,
        limit: BATCH_SIZE,
        startIndexKey: columnStartIndexKey,
      });
      result.columns.forEach((col: Doc<"column">) => columnIds.push(col._id));
      hasMoreColumns = result.hasMore;
      columnStartIndexKey = result.hasMore ? result.indexKeys[result.indexKeys.length - 1] : undefined;
    }
    const deletionPromises = [
      ...sheetIds.map(sheetId => ctx.runMutation(api.sheets.deleteSheet, { sheetId })),
      ...columnIds.map(columnId => ctx.runMutation(api.columns.deleteColumn, { columnId })),
    ];
    
    await Promise.allSettled(deletionPromises);
    
    await ctx.runMutation(api.projects.deleteProject, { projectId });

    return { success: true };
  }
});
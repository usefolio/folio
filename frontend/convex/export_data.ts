import { action } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { Doc } from "./_generated/dataModel";
import { PaginationResult } from "convex/server";

const PAGE_SIZE = 50;

export const fetchAllColumnsAndSheetsForProject = action({
  args: {
    projectId: v.id("project"),
  },
  handler: async (ctx, args): Promise<{ columns: Doc<"column">[], sheets: Doc<"sheet">[] }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Authentication required for this action.");
    }

    // Fetch all columns for the project by paginating
    const allColumns: Doc<"column">[] = [];
    let columnCursor: string | null = null;
    while (true) {
      const result: PaginationResult<Doc<"column">> = await ctx.runQuery(internal.columns.getColumnsPageForExport, {
        projectId: args.projectId,
        paginationOpts: { cursor: columnCursor, numItems: PAGE_SIZE },
      });
      allColumns.push(...result.page);
      if (result.isDone) {
        break;
      }
      columnCursor = result.continueCursor;
    }

    // Fetch all sheets for the project by paginating
    const allSheets: Doc<"sheet">[] = [];
    let sheetCursor: string | null = null;
    while (true) {
      const result: PaginationResult<Doc<"sheet">> = await ctx.runQuery(internal.sheets.getSheetsPageForExport, {
        projectId: args.projectId,
        paginationOpts: { cursor: sheetCursor, numItems: PAGE_SIZE },
      });
      allSheets.push(...result.page);
      if (result.isDone) {
        break;
      }
      sheetCursor = result.continueCursor;
    }

    return { columns: allColumns, sheets: allSheets };
  },
});
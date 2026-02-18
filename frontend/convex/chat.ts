import { v } from "convex/values";
import { api } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { authenticatedQuery } from "./middleware";

export const getChatAvailability = authenticatedQuery({
  args: {},
  handler: async () => {
    const openAiKeyConfigured = Boolean(process.env.OPENAI_API_KEY?.trim());
    const exaKeyConfigured = Boolean(process.env.EXA_AI_KEY?.trim());

    return {
      openAiKeyConfigured,
      reason: openAiKeyConfigured
        ? null
        : "OPENAI_API_KEY is not set in the environment.",
      exaKeyConfigured,
      exaReason: exaKeyConfigured
        ? null
        : "EXA_AI_KEY is not set in the environment.",
    };
  },
});


// Generate system prompt for the AI with data to use in context of the conversation
export const generateSystemPrompt = internalAction({
  args: {
    // Re-add the apiKey argument
    apiKey: v.string(),
    dataContext: v.object({
      projectName: v.string(),
      sheetName: v.string(),
      sheetId: v.id("sheet"),
      columns: v.array(
        v.object({
          id: v.id("column"),
          name: v.string(),
          type: v.string(),
          subtype: v.optional(v.string()),
          tagOptions: v.optional(v.array(v.string())),
        }),
      ),
      rowCount: v.number(),
      mentionedColumns: v.array(v.string()),
    }),
  },
  handler: async (ctx, { dataContext, apiKey }) => {
    // This is the logic from your original `chat:generate` action.
    const sampleRows = await ctx.runQuery(api.rows.getFirstNRows, {
      sheetId: dataContext.sheetId,
      limit: 100,
      apiKey
    });

    let sampleData = "";
    if (sampleRows && sampleRows.length > 0) {
      sampleData += `\n\nSample data from the first ${sampleRows.length} rows (long text is truncated):\n`;
      sampleRows.forEach((row: any, idx: number) => {
        const rowData = dataContext.columns
          .map((col) => {
            const cell = row?.cells.find((c: any) => c.column_id === col.id);
            let cellValue = cell?.value ?? "empty";
            if (cellValue.length > 150) {
              cellValue = cellValue.substring(0, 150) + "...";
            }
            return `${col.name}: "${cellValue}"`;
          })
          .join(", ");
        sampleData += `Row ${idx + 1}: ${rowData}\n`;
      });
    }

    const systemPrompt = `You are a helpful AI assistant specialised in data analysis.

Dataset context:
- Project: ${dataContext.projectName}
- Sheet:   ${dataContext.sheetName}
- Total rows: ${dataContext.rowCount}
- Columns: ${dataContext.columns
      .map((c) => `${c.name} (${c.type}${c.subtype ? `/${c.subtype}` : ""})`)
      .join(", ")}

${
  dataContext.mentionedColumns.length
    ? `Focus especially on: ${dataContext.mentionedColumns.join(", ")}\n`
    : ""
}${sampleData}

Answer the user's questions based on the provided data structure and samples. Be concise.`;

    return systemPrompt;
  },
});

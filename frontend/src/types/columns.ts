import { z } from "zod";

export const ColumnTypeSchema = z.optional(
  z.union([z.literal("schema"), z.literal("noSchema"), z.null()]),
);

export const ColumnSubtypeSchema = z.optional(
  z.union([
    z.literal("singleTag"),
    z.literal("multiTag"),
    z.literal("freeForm"),
    z.literal("pdf"),
    z.literal("image"),
    z.literal("audio"),
    z.literal("markdown"),
    z.null(),
  ]),
);

export type ColumnType = z.infer<typeof ColumnTypeSchema>;
export type ColumnSubType = z.infer<typeof ColumnSubtypeSchema>;

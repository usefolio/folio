import { IndexKey } from "convex-helpers/server/pagination";
import type { Doc, Id } from "../../convex/_generated/dataModel.d.ts";

type PaginatedRowsResponse = {
  rows: Doc<"row">[];
  indexKeys: IndexKey[];
  hasMore: boolean;
  sheetId: Id<"sheet">;
  error?: string;
};

export default PaginatedRowsResponse;

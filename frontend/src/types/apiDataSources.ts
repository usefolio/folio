import { Id, Doc } from "convex/_generated/dataModel";
// Types for ApiDataSourcesEditorPage
export type APIParameter = {
  id: string;
  key: string;
  value: string;
  hasError?: boolean;
  isQueryParam?: boolean;
};

export type APIDataSource = Omit<
  Doc<"api_data_sources">,
  "_id" | "_creationTime" | "lastTested"
> & {
  id: string | Id<"api_data_sources">;
  lastTested?: Date;
  createdAt: Date;
};

export type TestResult = {
  status: "idle" | "loading" | "success" | "error";
  url?: string;
  statusCode?: number;
  latency?: number;
  error?: string;
  data?: any[];
  validationErrors?: string[];
};

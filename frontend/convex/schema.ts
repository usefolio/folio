import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { JobSchema } from "../src/types/jobs";
import { ColumnTypeSchema, ColumnSubtypeSchema } from "../src/types/columns";
import { zodToConvex } from "convex-helpers/server/zod";

export default defineSchema({
  workspace: defineTable({
    name: v.string(),
    created_by: v.string(), // clerk user id
  }),
  worskpaceMembership: defineTable({
    user_id: v.string(), // clerk user id
    workspace_id: v.id("workspace"),
    role: v.optional(v.union(v.literal("admin"), v.literal("member"), v.literal("viewer"))),
  }).index("by_workspace", ["workspace_id"]).index("by_user", ["user_id"]),
  service_credentials: defineTable({
    workspace_id: v.id("workspace"),
    service: v.string(), // i.e. "openai", "google", "zapier"
    encrypted_api_key: v.string(), // encrypted api key
    last_modified: v.number(), // timestamp
  }).index("by_workspace", ["workspace_id"]),
  system_settings: defineTable({
    workspace_id: v.id("workspace"),
    type: v.string(), // e.g., "system_prompt"
    value: v.string(),
    lastModified: v.string(),
  }).index("by_workspace_and_type", ["workspace_id", "type"]),
  project_grouping: defineTable({
    name: v.string(), // i.e. "Mar 24 - Mar 30"
    owner: v.string(), // clerk user id
    type: v.optional(v.union(v.literal("synced"))),
  }).index("by_owner", ["owner"]),
  project: defineTable({
    name: v.string(),
    owner: v.string(), // clerk user id
    project_grouping: v.optional(v.id("project_grouping")),
    type: v.optional(v.union(v.literal("synced"))),
    // sync related stuff
    total_rows_when_last_viewed: v.optional(v.number()),
    // indicates whether the project is active/ has any data
    active: v.optional(v.boolean()),
    project_workflow: v.optional(v.string()), // JSON string of workflow data
    workflow_import_in_progress: v.optional(v.boolean()),
    scheduled_actions: v.optional(v.string())
  }).index("by_owner", ["owner"]),
  sheet: defineTable({
    name: v.string(),
    project_id: v.id("project"),
    filter: v.string(),
    rows_in_sheet_counter: v.optional(v.number()), // counter
    hidden: v.array(v.id("column")), // hidden columns
  }).index("by_project", ["project_id"]),
  column: defineTable({
    name: v.string(),
    project_id: v.optional(v.id("project")),
    cell_state: v.bytes(),
    sheet_id: v.optional(v.id("sheet")),
    column_type: zodToConvex(ColumnTypeSchema),
    column_subtype: zodToConvex(ColumnSubtypeSchema),

    tag_options: v.optional(v.array(v.string())),
    
    prompt: v.optional(v.string()),
    jsonSchema: v.optional(v.string()),
    
    items_in_progress: v.optional(v.number()),
    transformation_type: v.optional(v.string()),
    transformation_content: v.optional(
      v.object({
        operation: v.string(),
        return_type: v.string(),
      }),
    ),
    inputs: v.optional(v.array(v.id("column"))),
    // Sheet id used in workflow to connect children nodes to parent easily
    created_on_sheet_id: v.optional(v.id("sheet"))
  }).index("project_id", ["project_id"]),
  row: defineTable({
    project_id: v.optional(v.id("project")),
    order: v.number(),
    row_number: v.number(),
    cells: v.array(
      v.object({
        column_id: v.id("column"),
        value: v.string(),
        state: v.string(), // in_progress, error, stale, default
      }),
    ),
  }),
  log: defineTable({
    project_id: v.id("project"),
    owner: v.string(),
    message: v.string(),
    details: v.optional(v.string()),
    timestamp: v.number(),
    severity: v.union(
      v.literal("ERROR"), 
      v.literal("WARN"), 
      v.literal("INFO"), 
      v.literal("DEBUG"), 
      v.literal("TRACE")
    ),
    service: v.optional(v.string()),
    attributes: v.optional(v.any()), // NEW: For storing JSON objects
  }).index("by_project", ["project_id"])
    .index("by_owner_and_timestamp", ["owner", "timestamp"]),

  // Many-to-many relationship table to link sheets and rows
  relationships: defineTable({
    row_id: v.id("row"),
    sheet_id: v.id("sheet"),
    row_number: v.number(),
  }).index("sheet_id", ["sheet_id", "row_number"]),

  // Jobs state table
  job: defineTable({
    project_id: v.id("project"),
    column_id: v.optional(v.id("column")), // if the job is related to a column
    sheet_id: v.optional(v.id("sheet")), // if the job is related to a sheet
    job: zodToConvex(JobSchema),
  }).index("project_id", ["project_id"]),

  chat_conversation: defineTable({
    project_id: v.id("project"),
    sheet_id: v.id("sheet"),
    owner: v.string(), // clerk user id
    title: v.optional(v.string()), // Auto-generated from first message
    last_message_at: v.number(),
  }).index("by_owner_and_project", ["owner", "project_id"]),

  // Individual chat messages
  chat_message: defineTable({
    conversation_id: v.id("chat_conversation"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    createdAt: v.number(),
    mentioned_columns: v.optional(v.array(v.string())),
  }).index("by_conversation", ["conversation_id"]),
scheduled_actions: defineTable({
    owner: v.string(),
    searchQuery: v.string(),
    workflow: v.string(),
    interval: v.number(),
    intervalUnit: v.union(v.literal("minutes"), v.literal("hours"), v.literal("days")),
    destinationType: v.union(v.literal("email"), v.literal("api")),
    destination: v.string(),
    outputFormat: v.union(v.literal("csv"), v.literal("markdown"), v.literal("pdf")),
    prompt: v.optional(v.string()),
    model: v.optional(v.string()),
    isActive: v.boolean(),
    createdAt: v.string(),
    lastRun: v.optional(v.string()),
    nextRun: v.optional(v.string()),
    totalRuns: v.optional(v.number()),
  }).index("by_owner", ["owner"]),

  alerts: defineTable({
    project_id: v.id("project"),
    owner: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    conditions: v.string(), // This will store the SQL-like filter string
    queryBuilderState: v.optional(v.string()), // JSON string of the builder's state
    frequency: v.union(v.literal("immediate"), v.literal("hourly"), v.literal("daily"), v.literal("weekly")),
    email: v.string(),
    isActive: v.boolean(),
    createdAt: v.string(),
    lastTriggered: v.optional(v.string()),
    totalTriggers: v.number(),
  }).index("by_owner", ["owner"]),
search_engines: defineTable({
    workspace_id: v.id("workspace"),
    engineType: v.union(
      v.literal("opensearch"),
      v.literal("solr"),
      v.literal("typesense"),
      v.literal("meilisearch"),
      v.literal("quickwit"),
      v.literal("milvus"),
      v.literal("weaviate"),
      v.literal("qdrant"),
      v.literal("vespa"),
    ),
    name: v.string(),
    contentTypes: v.array(
      v.union(v.literal("text"), v.literal("pdf"), v.literal("image")),
    ),
    // Store engine-specific configuration as a flexible JSON object
    config: v.any(),
  }).index("by_workspace", ["workspace_id"]),

    api_data_sources: defineTable({
    workspace_id: v.id("workspace"),
    name: v.string(),
    url: v.string(),
    // For simplicity and flexibility, we store these complex objects as `v.any()`
    urlParameters: v.any(), // Corresponds to APIParameter[]
    headers: v.any(), // Corresponds to APIParameter[]
    bodyJson: v.string(),
    searchType: v.union(v.literal("regular"), v.literal("ai")),
    rateLimit: v.object({
      requests: v.number(),
      period: v.union(v.literal("minute"), v.literal("hour"), v.literal("day")),
    }),
    transformCode: v.string(),
    transformColumns: v.optional(v.string()),
    isValid: v.boolean(),
    lastTested: v.optional(v.number()), // Store dates as timestamps
    status: v.union(v.literal("active"), v.literal("error"), v.literal("testing")),
    exampleResponse: v.optional(v.string()),
  }).index("by_workspace", ["workspace_id"]),
  // cell: defineTable({
  //   row_id: v.id("row"),
  //   column_id: v.id("column"),
  //   sheet_id: v.id("sheet"),
  //   value: v.string(),
  //   state: v.string(), // in_progress, error, stale, default
  // }).index('sheet_id', ['sheet_id']),
});

# WorkflowContext Implementation

## Overview

The WorkflowContext manages a workflow builder where users create data processing pipelines. It's a React context that syncs a tree structure between the UI and Convex backend.

## How It Works

### Data Structure

The workflow is a hierarchy:

```text
Project
└── Views (SQL filters like "agent != 1")
    └── Columns (AI transformations)
        - Tag: Classify into categories
        - Summary: Generate text summaries
        - Ask: Answer questions
        - Extract: Pull structured data
```

### State Flow

1. **Initial Load**

   ```typescript
   // On project change, fetch from backend
   getProjectWorkflowTree() → buildWorkflowTree() → setWorkflowData()
   ```

   The backend stores views/columns in flat tables. `buildWorkflowTree()` reconstructs the hierarchy and merges saved UI state (like node expansion).

2. **Adding Nodes**

   ```typescript
   // Add a root view
   addNode(null, {
     isView: true,
     label: "Active Users",
     sql_condition: "agent != 1",
   });

   // Add a column to a view
   addNode(parentViewId, { type: "tag", label: "Priority", tags: "high,low" });
   ```

   What happens:

   - Generate temporary ID for immediate UI update
   - Create in backend via mutations
   - Encode prompt configuration to base64
   - **Special case for tag columns**: Auto-create filtered views

     ```typescript
     // If creating a tag column with tags "high,low"
     // Automatically creates:
     // - View: "high" with filter: "Priority LIKE '%high%'"
     // - View: "low" with filter: "Priority LIKE '%low%'"
     ```

   This auto-creation is why `addNode` is complex - it can trigger multiple backend operations.

3. **Updating Nodes**

   ```typescript
   updateNode(nodeId, { summary: "New prompt template" });
   ```

   The update process checks what changed:

   ```typescript
   // These fields affect the prompt configuration
   const promptAffectingFields = [
     "summary", // Prompt text
     "model", // AI model
     "tags", // Tag options
     "responseSchema", // JSON schema
     "inputCols", // Input columns
   ];

   if (promptFieldsChanged) {
     // Immediate backend update
     const newPrompt = createPromptOptions(updatedNode);
     const encoded = encodePrompt(newPrompt);
     await updateColumnDetailsMutation({ columnId, prompt: encoded });
   }

   // UI-only changes (expansion, etc) are debounced
   debouncedSaveProjectWorkflow(allWorkflowData);
   ```

4. **Tree Persistence**

   Two types of saves:

   - **Immediate**: Prompt/column changes → `updateColumnDetailsMutation`
   - **Debounced (1.5s)**: UI state → `saveProjectWorkflow`

   The tree is rebuilt on each load by merging:

   - Current DB state (source of truth)
   - Saved UI state (expansion, positions)
   - Decoded prompts (from base64)

### Type System & Prompt Handling

The system supports four column types with specific prompt configurations. For example:

```typescript
// Single Tag Classification
type SingleTagPromptOptions = {
  promptType: "schema";
  schemaType: "singleTag";
  responseOptions: string[]; // ["high", "medium", "low"]
};

// Text Generation (Summary/Ask)
type TextGenerationPromptOptions = {
  promptType: "noSchema";
  userPrompt: string;
  model: LLMModel;
  ask?: boolean; // Differentiates between summary and ask
};
```

These are encoded for consistent storage:

```typescript
// Frontend: Create a sentiment tag column
const promptOptions = {
  promptType: "schema",
  schemaType: "singleTag",
  userPrompt: "Analyze sentiment of {{feedback}}",
  responseOptions: ["positive", "negative", "neutral"],
  model: "gpt-4o",
};

// Encode for backend storage
const encoded = encodePrompt(promptOptions); // → "eyJtb2RlbCI6..."
```

### Backend Integration

The system uses Convex tables:

```typescript
// Flat storage
sheet: {
  name,
  filter,            // SQL like "agent != 1"
  project_id,
  hidden: Id<"column">[]
}
column: {
  name,
  prompt,            // Base64 encoded PromptOptions
  created_on_sheet_id,  // Parent reference
  column_type: "schema" | "noSchema",
  column_subtype: "singleTag" | "multiTag" | "freeForm" | null
}
project: {
  project_workflow   // Stores UI state as JSON
}
```

Frontend maintains the hierarchy with WorkflowNode:

```typescript
interface WorkflowNode {
  id: string; // "col-backend-xyz" or "col-pending-123"
  label: string; // Display name
  convexId?: Id<"sheet"> | Id<"column">;
  isView: boolean;
  children: WorkflowNode[];
  expanded?: boolean;

  // View-specific
  sql_condition?: string;

  // Column-specific
  type?: "tag" | "summary" | "ask" | "extract";
  summary?: string; // The prompt template
  tags?: string; // For tag columns
  responseSchema?: JSONSchema; // For extract columns
}
```

### Import/Export

Export creates different formats:

```typescript
exportWorkflow(); // Full tree as JSON
exportWorkflowViews(); // Just views without columns
exportWorkflowAsRequests(); // API request format
```

Import process creates views first, then columns with proper parent references.

### Performance Patterns

**Optimistic Updates**: UI updates before backend confirms

```typescript
setWorkflowData(newData); // Instant UI feedback
await backendMutation(); // Async backend operation
```

**Debounced Saves**: Batch UI-only changes after 1.5s of inactivity

## Key Functions

### `addNode(parentId, nodeData)`

Creates a new view or column. Handles ID generation, backend creation, and auto-creates tag views when needed.

### `updateNode(nodeId, updates)`

Updates existing nodes. Determines what changed and syncs appropriately - immediate for prompts, debounced for UI state.

### `buildWorkflowTree(project, sheets, columns)`

Transforms flat DB records into hierarchical tree, decodes prompts, and merges UI state.

### `deleteNode(nodeId)`

Removes nodes and their children, including auto-created tag views.

## Usage Example

```typescript
const { workflowData, addNode, updateNode, deleteNode, exportWorkflow } =
  useWorkflow();

// Create a sentiment analysis workflow
const viewId = await addNode(null, {
  isView: true,
  label: "Customer Feedback",
  sql_condition: "source = 'support'",
});

// Add sentiment classification
await addNode(viewId, {
  type: "tag",
  label: "Sentiment",
  tags: "positive,negative,neutral",
  summary: "Analyze sentiment of {{message}}",
});
```

## Summary

The WorkflowContext manages complex state synchronization between a hierarchical UI tree and flat database tables. The complexity in functions like `addNode` and `updateNode` comes from:

- Managing temporary vs permanent IDs
- Encoding/decoding typed prompt configurations
- Auto-creating tag views when tag columns are added
- Differentiating between prompt changes (immediate sync) and UI changes (debounced)
- Maintaining type safety across the frontend/backend boundary

Each operation handles these concerns while providing a smooth user experience through optimistic updates.

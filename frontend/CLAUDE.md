Always make sure that you update the documentation when you make changes.

A ton of documentation is inside the README.md file. Then we have a docs folder. Inside that folder we have component-scoped documentation.


## Localization
When adding a string, make sure it is localized. All strings are stored in src/locales/en.json. 

The way strings get localized is something like
```
{t("modal_manager.column_modal_config.gpt_5")}
```

Strings in the localization file are grouped by component or page as you can see.

## Adding a new backend path to the BackendClient

There are 2 backends. The convex backend, which you can find the code for in the /convex folder. Then there is a data warehouse backend. 

## Adding a new endpoint to the convex backend

This usually includes modifications to http.ts to add a new route and then adding a new action that corresponds to that route. Actions are usually added to the file that declares the main object, like:

```ts
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
```

## Adding a new endpoint to the data warehouse API endpoint

The data warehouse API endpoints are usually based off of this kind of URL:
```
const getBackendUrlForProject = (projectId: Id<"project">): string => {
    return projectBackendUrls.get(projectId) || defaultBackendUrl;
};
```

Update(src/interfaces/interfaces.ts)
  ⎿  Updated src/interfaces/interfaces.ts with 9 additions
       981      };
       982    }
       983
       984 +  // Column list request for export validation
       985 +  export interface ColumnListRequest {
       986 +    timestamp: string;
       987 +    path: "/columns/list";
       988 +    request_data: BaseRequest & {
       989 +      project_id: string;
       990 +    };
       991 +  }
       992 +
       993    export interface AllPromptsAndJsonSchemasResult {
       994      prompts: SavedPrompt[];
       995      jsonSchemas: Array<{

// src/hooks/useBackendClient.ts

/**
 * Fetches the list of columns that exist in the backend for export validation.
 */
listColumns: async (args: { project_id: Id<"project"> }) => {
  if (!args.project_id) {
    throw new Error(
      t("services.use_backend_client.missing_context", {
        context: "listColumns - missing project id",
      }),
    );
  }

  const token = await getToken();
  if (!token) {
    throw new Error(t("global.auth_token_not_found"));
  }

  const payload = { project_id: args.project_id };
  const baseUrl = getBackendUrlForProject(args.project_id);

  return client.request<{ columns: { id: string; name: string }[] }>(
    baseUrl,
    "/columns/list",
    payload,
    token,
  );
},

## Testing Components that Use Authentication

When testing components that use `useBackendClient` (which internally uses Clerk's `useAuth`), you must mock the `useBackendClient` hook to avoid Clerk provider errors:

```ts
// Mock useBackendClient hook in test files
vi.mock("@/hooks/useBackendClient", () => ({
  useBackendClient: () => ({
    listColumns: vi.fn().mockResolvedValue({
      columns: [
        { id: "col1", name: "Column A" },
        { id: "col2", name: "Column B" },
      ],
    }),
    // Mock other methods as needed
  }),
}));
```

## Testing Components with Multiple Async Operations

When components have multiple async operations (like fetching from both Convex and data warehouse), tests must wait for all operations to complete:

```ts
// Wait for async operations to complete before checking DOM
await waitFor(() => {
  expect(screen.getByText("Column A")).toBeInTheDocument();
}, { timeout: 3000 });
```

## Export Modal Pattern for Data Validation

The export modal demonstrates a pattern for validating internal data against external systems:

1. **Fetch all available data** from internal database (Convex)
2. **Fetch validation data** from external system (data warehouse) 
3. **Filter/disable options** that don't exist in the external system
4. **Default selections** to only valid items

This ensures users can only export data that actually exists in the target system.

## Build and Verification Process

After making changes to components, always follow this verification process:

### 1. Run Tests
```bash
npm test -- path/to/component.test.tsx --run
```

### 2. Build Verification
```bash
npm run build
```
This runs TypeScript compilation and Vite production build. Fix any TypeScript errors that surface.
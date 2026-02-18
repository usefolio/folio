# Project Documentation

This document provides guidance for developers working on this project. It will be updated as new patterns and standards are established.

## How to Add a New Modal Type

The application uses a centralized system to manage modals. The primary components involved are:

- **`UniversalModal.tsx`**: The generic, presentational component that acts as the "shell" for all modals. You will not need to edit this file. Unless you need to change the width of the modal
- **`ModalManager.tsx`**: The controller component that holds the configuration for every modal type and renders the `UniversalModal` with the correct content, title, and footer. **This is the main file you will edit.**
- **`useModal()` hook (from `ModalContext.tsx`, used in `App.tsx`)**: The hook used to trigger modals from anywhere in the application.

To add a new type of modal, follow these steps. Here is a hypothetical new modal type called `"shareProject"` as an example.

### Step 1: Create the Modal's Content Component

First, create a new React component that will contain the body (the content) of the new modal. Following the project's convention, it's best to place this in a `components/modalConfig/` directory.

This component will receive `state` and `actions` props from the `ModalManager` if it needs to interact with the modal's state.

**Example: `ShareProjectModalConfig.tsx`**

```tsx
// src/components/modalConfig/ShareProjectModalConfig.tsx

import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ModalState, ModalActions } from "@/hooks/useModalReducer"; // Assuming types are exported

interface ShareProjectModalConfigProps {
  state: ModalState;
  actions: ModalActions;
}

const ShareProjectModalConfig: React.FC<ShareProjectModalConfigProps> = ({
  state,
  actions,
}) => {
  return (
    <div className="p-4 space-y-4">
      <p>Share this project with others by sending them this link.</p>
      <div className="space-y-2">
        <Label htmlFor="share-link">Shareable Link</Label>
        <Input
          id="share-link"
          type="text"
          readOnly
          value={`https://yourapp.com/project/${state.modalData?.projectId}`}
        />
      </div>
    </div>
  );
};

export default ShareProjectModalConfig;
```

### Step 2: Implement Logic in ModalManager.tsx (If Needed)

If new modal has actions (like submitting a form or saving data), define the handler function for it within ModalManager.tsx. This keeps all modal-related logic centralized.

For "shareProject" example, we only need a "Close" button, so no custom logic function is needed. However, if we had a "Copy Link" button, the logic would go here.

### Step 3: Register the New Modal in ModalManager.tsx

Open ModalManager.tsx and add a new entry to the modalConfig object. The key for the new entry must be the unique string used to identify the new modal (e.g., "shareProject").

Add the key to modalType in `src/intefaces.ts` ModalManagerProps and modife context for modals if necessary in `src/context/ModalContext.tsx`

Import your new content component at the top of the file.

## Add the new configuration object to modalConfig

- Import your new content component at the top of the file.

- Add the new configuration object to modalConfig.

Example: Editing ModalManager.tsx

```tsx
// src/components/ModalManager.tsx

import ShareProjectModalConfig from "./modalConfig/ShareProjectModalConfig"; // 1. Import new component

// ...

const ModalManager: React.FC<ModalManagerProps> = (
  {
    /* ...props */
  },
) => {
  // ...

  const modalConfig = {
    column: {
      // ... existing column config
    },
    newProject: {
      // ... existing newProject config
    },
    export: {
      // ... existing export config
    },
    showPrompt: {
      // ... existing showPrompt config
    },
    settings: {
      // ... existing settings config
    },
    // 2. Add your new modal configuration here
    shareProject: {
      title: "Share Project",
      subtitle: "Anyone with the link can view.",
      // Standard close button
      headerElement: (
        <DialogClose
          asChild
          className="!mt-0 bg-gray-50 h-6 w-6 text-center flex items-center justify-center"
        >
          <Button
            variant="ghost"
            size="icon"
            onClick={closeModal}
            className="w-6 h-6 bg-gray-100 rounded-md"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </Button>
        </DialogClose>
      ),
      content: (
        <ShareProjectModalConfig
          state={state} // Pass down state and actions if needed
          actions={actions}
        />
      ),
      // Define the footer buttons
      footer: (
        <Button
          variant="default"
          className="h-8 px-4 rounded-md"
          onClick={closeModal}
        >
          {t("global.close")}
        </Button>
      ),
    },
  };
  // ...
};
```

### Step 4: Trigger the Modal from the UI

Now open new modal from any component that has access to the useModal hook. Call the openModal function with new modalType string and any data it might need.

Example: Adding a button in SheetHandler.tsx

```tsx

// src/components/SheetHandler.tsx

// ...
import { useModal } from "../context/ModalContext";
import { Share2 } from "lucide-react";


const SheetHandler = ({ project, ... }) => {
  const { openModal } = useModal();

  const handleShareClick = () => {
    // Call openModal with the new type and any required data
    openModal("shareProject", { projectId: project });
  };

  return (
    // ... inside your component's JSX
    <Button onClick={handleShareClick}>
      <Share2 className="w-4 h-4 mr-2" />
      Share
    </Button>
    // ...
  );
};
```

The ModalManager will now recognize the "shareProject" type and render ShareProjectModalConfig component inside the UniversalModal shell when openModal("shareProject") is called.

## How to use useAccess hook

The `useAccess` hook is a centralized system for managing feature access and permissions. It determines if a user can perform certain actions, such as creating a project or using an AI enrichment, based on a set of predefined requirements. This pattern keeps the access logic clean, reusable, and easy to extend.

### Core Concepts

Requirement: An object describing a condition that must be met.

Access Result: The hook returns a simple object: `{ ok: boolean, reason?: string }`.

If ok is true, access is granted.

If ok is false, access is denied, and the reason string explains why.

### How it works

The hook is located in `src/hooks/useAccess.ts`. It automatically gets the user's serviceCredentials from the `DataContex` and evaluates them against the requirements provided.

```typescript
/**
 * A hook to easily check for user access rights within any component.
 * It centralizes access logic for features like creating projects or enrichments.
 *
 * @param {Requirement[]} reqs - An array of requirements needed for the action to be allowed.
 * @param {object} [options] - Optional configuration for the hook.
 * @param {boolean} [options.disabled=false] - If true, the access check is bypassed and will always return { ok: true }. This is useful for feature flagging or phased rollouts.
 * @returns {AccessResult} An `AccessResult` object: `{ ok: boolean; reason?: string }`.
 */
export function useAccess(
  reqs: Requirement[],
  options?: { disabled?: boolean },
): AccessResult;
```

### How to implement

In the component, call the hook with the necessary requirements. To check for OpenAI credentials, do the following:

```typescript
import { useAccess } from "@/hooks/useAccess";

const MyComponent = () => {
  const access = useAccess([{ kind: "service", service: "openai" }]);
  // ...
};
```

Use the returned access object to control UI elements, such as setting the disabled property on a button. Example from `ModalManager.tsx`

```tsx
import { useAccess } from "@/hooks/useAccess";

const ModalManager: React.FC<ModalManagerProps> = ({ ... }) => {
  // 1. Call the hook
  const access = useAccess([{ kind: "service", service: "openai" }]);

  const modalConfig = {
    column: {
      // ...
      footer: (
        <div className="flex items-center justify-end space-x-2">
            {/* 2. Apply the access result to the button */}
            <Button
                variant="default"
                disabled={!access.ok || isLoading} // Disable if access is not ok
                onClick={handleCreateColumn}
            >
                Create Enrichment
            </Button>
        </div>
      ),
    },
    // ...
  };
  // ...
};
```

### Disabling the check

The hook supports a disabled mode. To temporarily bypass the access check, change the feature flag `ENABLE_CREDENTIAL_CHECK` in `constants.ts` to `false`. The hook will then always return { ok: true }.

### ColumnModalConfig cost estimation

`ColumnModalConfig` includes an optional cost estimation alert. When the component is used in read-only contexts—such as the `showPrompt` modal for viewing an existing prompt—disable this behaviour by passing `useCostEstimation={false}`. This prevents extra padding that can cause the modal to resize after mount.

## How to Add New Backend Functionality

The application has a centralized architecture for handling backend API calls and state management.

- **useBackendClient.ts**: This is the primary hook for performing actions. Any imperative call, such as creating, updating, deleting data, or triggering a process, should be handled here.

- **BackendClient.ts**: This is a low-level class that handles the raw HTTP fetch requests, including retries and authorization. It is used by the useBackendClient hook. Typically this file won't need to be edited.

- **JamsocketContext.tsx**: This context manages the lifecycle of on-demand backend instances, providing the necessary URLs to useBackendClient.

- **queryService.ts** (useQueryWithLoading): This hook is used for declarative data fetching from the Convex database. It is used to get and display data that updates automatically in the UI.

### How to add a new endpoint to useBackendClient

Steps to add a new service function to the application. For example the `createBulkRows`.

Define the Logic of the new function:

```ts
export const useBackendClient = () => {
  // existing hooks (useAuth, useTranslation, etc.)

  // helpers (createLog, generatePrompt)

const clientApiEndpoints = useMemo(() => {
  // exisiting code
    return {
      // New endpoint with some detailed comment on what it does
      /**
       * A service to handle bulk creation of rows from parsed data.
       *  parsedData - An array of row objects.
       *  headers - An array of header strings.
       *  project_id - The ID of the project to add rows to.
       *  column_ids - An array of column IDs corresponding to headers.
       */
      createBulkRows: async (
        parsedData: Array<Record<string, string>>,
        headers: string[],
        project_id: Id<"project">,
        column_ids: Id<"column">[],
        signal: AbortSignal
      ) => {
        // logic for the service, can include a request to the backend
          const data = await client.request<{ url: string }>(
          baseUrl,
          "process/bulk_upload",
          payload,
          token,
          args.signal,
        );
        // Or can only include some convex functionality
      }
      },
    };
  }, [
    // dependencies
  ]);
};
```

Call the New Service from a Component:

```tsx
// In any component, e.g., src/components/DataImporter.tsx

import { useBackendClient } from "@/hooks/useBackendClient";

const DataImporter = () => {
  const backendClient = useBackendClient();

  const handleImport = async (data, headers, projectId, columnIds) => {
    try {
      await backendClient.createBulkRows(data, headers, projectId, columnIds);
      // show success notification
    } catch (error) {
      // show error notification
    }
  };

  // ... component JSX
};
```

## Adding New Translations

All user-facing text, including error messages, should be managed in src/locales/en.json. When adding new functionality that throws an error or displays text, use the `t` function provided by the `useTranslation` hook.

- Add a new key-value pair to en.json. Use a structured path (e.g., services.use_backend_client.missing_project_for_action).

- Use the t function in the code to reference the new key.

Example:

- Before (Hardcoded String):

```ts
throw new Error("Missing project context for this action.");
```

- After (Translated):

In `src/locales/en.json`:

```ts
{
  "services": {
    "use_backend_client": {
      "missing_project_for_action": "Project context is required for this action."
    }
  }
}
```

In useBackendClient.ts:

```ts
throw new Error(t("services.use_backend_client.missing_project_for_action"));
```

## View Prompt Modal Styling

The read-only prompt modal includes a copy-to-clipboard button to quickly copy the prompt text. The button now uses the same borderless icon style as the billing balance refresh button—a square ghost button with an orange hover effect. The toolbar above the prompt uses equal top and bottom padding to prevent layout jumps when the modal opens.

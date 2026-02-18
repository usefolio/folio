import { createContext } from "react";
import { WorkflowContextType } from "@/interfaces/interfaces";
/**
 * Context is initialized as undefined rather than with empty data for because React's Context API
 * distinguishes between "no provider" and "provider with empty data"
 *    - undefined = no provider exists, component should throw error
 *    - Empty array/object = valid provider exists with no data yet
 *
 * 2. This pattern enforces proper component hierarchy. Components using useWorkflow
 *    will immediately fail if used outside WorkflowProvider
 *
 * 3. From React docs: "The default value argument is only used when a component
 *    does not have a matching Provider above it in the tree"
 *    (https://react.dev/reference/react/createContext#parameters)
 *
 * Basically if useWorkflow is used outside the provider we want to fail fast if the dependency
 * (WorkflowProvider) isn't properly wired up, rather than silently providing empty data.
 *
 * Note: This is in a separate file from WorkflowContext.tsx to avoid hot reload
 * warnings when multiple exports exist in the same context file
 */
export const WorkflowContext = createContext<WorkflowContextType | undefined>(
  undefined,
);

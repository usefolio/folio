import { FunctionReference } from "convex/server";
import { OptionalRestArgsOrSkip } from "convex/react";
import { useQuery } from "convex/react";
import { useState, useEffect, useRef } from "react";

/**
 * A wrapper for Convex's useQuery that provides an explicit loading state.
 * * NOTE: This hook is not part of `useBackendClient` for architectural reasons.
 * useBackendClient provides imperative action functions (e.g., "create a column"),
 * whereas useQueryWithLoading is a declarative React hook for fetching data.
 * According to the Rules of Hooks, hooks cannot be called from regular functions,
 * so this hook must be used directly in components, alongside useBackendClient.
 */

export function useQueryWithLoading<Query extends FunctionReference<"query">>(
  query: Query,
  args: OptionalRestArgsOrSkip<Query>[0],
  _t: (key: string, options?: Record<string, string>) => string,
): {
  data: Query["_returnType"] | undefined;
  loading: boolean;
  isEmptyResult: boolean;
} {
  const data = useQuery(query, args);
  const [isLoading, setIsLoading] = useState(true);
  const [isEmptyResult, setIsEmptyResult] = useState(false);

  // Store previous args and data
  const prevArgsRef = useRef(args);
  const prevDataRef = useRef<Query["_returnType"] | undefined>(undefined);

  // Handle args changes and loading states
  useEffect(() => {
    // Check if args have changed
    const argsChanged =
      JSON.stringify(prevArgsRef.current) !== JSON.stringify(args);

    if (argsChanged) {
      // Args changed, set loading to true and update prev args
      setIsLoading(true);
      prevArgsRef.current = args;
      prevDataRef.current = undefined;
    } else if (data !== undefined) {
      // Data loaded successfully
      setIsLoading(false);
      prevDataRef.current = data;

      // Check if the result is empty
      const isEmpty =
        data === null ||
        (Array.isArray(data) && data.length === 0) ||
        (typeof data === "object" &&
          data !== null &&
          Object.keys(data).length === 0);

      setIsEmptyResult(isEmpty);
    } else if (args === ("skip" as OptionalRestArgsOrSkip<Query>[0])) {
      // Query was skipped, not loading
      setIsLoading(false);
    }
  }, [data, args]);

  // Safe to get data, even if undefined
  const safeData = data !== undefined ? data : prevDataRef.current;

  // Don't throw errors, just return appropriate state
  return {
    data: safeData,
    loading: isLoading,
    isEmptyResult: isEmptyResult,
  };
}

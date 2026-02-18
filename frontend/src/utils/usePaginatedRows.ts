import PaginatedRowsResponse from "./PaginatedRowsResponse";
import { useState, useCallback, useMemo, useEffect } from "react";
import { useQueries } from "convex/react";
import { Id } from "../../convex/_generated/dataModel";
import { api } from "../../convex/_generated/api";
import { FunctionArgs, FunctionReturnType } from "convex/server";
import { useTranslation } from "react-i18next";
import { showErrorNotification } from "../components/notification/NotificationHandler";
import { useLogger } from "./Logger";

interface PaginatedRows {
  results: PaginatedRowsResponse[];
  scrollDown: () => void;
  scrollUp: () => void;
  // True until the first page for the current sheet resolves
  initialLoading: boolean;
  // True while additional pages beyond the first are resolving
  pageLoading: boolean;
  // Overall: initialLoading || pageLoading (kept for convenience)
  loading: boolean;
}

function usePaginatedRows(sheetId: Id<"sheet">): PaginatedRows {
  const { t } = useTranslation();
  const logger = useLogger("src/utils/usePaginatedRows.ts");
  const createInitialState = useCallback(() => {
    return [
      [0] as number[],
      {
        "0": {
          query: api.rows.getRowsForSheet,
          args: {
            sheetId,
          },
        },
      } as Record<
        string,
        {
          query: typeof api.rows.getRowsForSheet;
          args: FunctionArgs<typeof api.rows.getRowsForSheet>;
        }
      >,
    ] as const;
  }, [sheetId]);

  // State to manage our pagination queries
  // queries[0] is an array of query keys (numbers)
  // queries[1] is a record mapping those keys to query configurations
  // State management
  const [queries, setQueries] = useState(() => createInitialState());

  // Add an effect to reset state when sheetId changes
  // Prevent state updates when the sheetId hasn't changed
  useEffect(() => {
    setQueries((prev) => {
      if (prev[1]["0"].args.sheetId === sheetId) {
        return prev;
      }
      return createInitialState();
    });
  }, [sheetId, createInitialState]);

  //console.log("there are " + queries[0].length + " queries for sheet id " + sheetId)

  // Use Convex's useQueries hook to run multiple queries
  // Each query result is stored in this record, keyed by query key
  const queryResults = useQueries(queries[1]) as Record<
    string,
    FunctionReturnType<typeof api.rows.getRowsForSheet>
  >;

  // Combine all query results into a single array
  const results = useMemo(() => {
    try {
      const results: PaginatedRowsResponse[] = [];

      for (const queryKey of queries[0]) {
        // In the default case, queryKey is 0 (ie if array is of size 1 like [0])
        // queryArg is something like:
        //
        // query: api.rows.getRowsForSheet,
        // args: {
        //   sheetId,
        //   startIndexKey: firstIndexKey,
        //   startInclusive: false,
        //   order: "desc"
        // }
        const result = queryResults["" + queryKey];

        // Exclude results from other sheets or incomplete results
        if (!result || result.sheetId !== sheetId) {
          results.push({
            rows: [],
            indexKeys: [],
            hasMore: false,
            sheetId: sheetId,
          });
          continue;
        }

        // Handle error state
        if (result instanceof Error) {
          throw result;
        }
        // If query doesn't have endIndexKey, we need to refetch with proper bounds
        // This will almost never happen! endIndexKey is always the end of the sheet rows
        // To test this, scroll to the bottom of the sheet, add some rows to the sheet in
        // the backend, then make sure those rows appear at the bottom.
        // if (queryArg.args.endIndexKey === undefined) {
        //   console.log(`Refetching query ${queryKey} with fixed endIndexKey`);
        //   setQueries((prev) => {
        //     const queryArg = prev[1]["" + queryKey];
        //     // Use the last index key from results as the endIndexKey
        //     const endIndexKey = result.indexKeys.length > 0
        //       ? result.indexKeys[result.indexKeys.length - 1]
        //       : [sheetId];
        //     const startIndexKey = queryArg.args.startIndexKey ?? [sheetId];

        //     // If order is descending, swap start and end
        //     const newArgs = queryArg.args.order === "desc" ? {
        //       startIndexKey: endIndexKey,
        //       endIndexKey: startIndexKey,
        //       startInclusive: queryArg.args.endInclusive ?? true,
        //       endInclusive: queryArg.args.startInclusive ?? false,
        //     } : {
        //       ...queryArg.args,
        //       startIndexKey,
        //       endIndexKey,
        //     };

        //     return [
        //       prev[0],
        //       { ...prev[1], [queryKey]: { query: queryArg.query, args: newArgs } }
        //     ];
        //   });
        // }

        results.push(result);
      }

      logger.debug("Results length is ", { results: results.length });
      return results;
    } catch (error) {
      logger.error("Error in usePaginatedRows results computation:", {
        error: error,
      });
      const errorMessage =
        error instanceof Error
          ? error.message
          : t("pagination.error_fetching_rows");

      return [
        {
          rows: [],
          indexKeys: [],
          hasMore: false,
          sheetId: sheetId,
          error: errorMessage,
        },
      ];
    }
  }, [queryResults, queries, sheetId]);

  // Split loading into initial vs page loading to improve UX
  const initialLoading = useMemo(() => {
    try {
      const firstKey = queries[0][0];
      const res = queryResults[String(firstKey)];
      return !(res && res.sheetId === sheetId);
    } catch {
      return true;
    }
  }, [queryResults, queries, sheetId]);

  const pageLoading = useMemo(() => {
    try {
      for (const queryKey of queries[0].slice(1)) {
        const res = queryResults[String(queryKey)];
        if (!res || res.sheetId !== sheetId) return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [queryResults, queries, sheetId]);

  const loading = initialLoading || pageLoading;

  // Function to load next page of results

  const scrollDown = useCallback(() => {
    try {
      setQueries((prev) => {
        // Fixes for scrolling bug:
        // Changed the rows API to include sheetId in the results for mismatched data identificationa.

        // Make sure that  if the sheetId in the results matches the currently selected sheet, the scroll continues and does not append wrong data.

        // using the api.rows.getRowsForSheet instead of on lastQuery.query

        // Increased stability in handling state changes.
        // (the lastQuery.query might be still pending change when scrolling dow, while values from prev are always stable)

        // Ensure the state is valid
        if (!prev || prev.length < 2) {
          logger.warn("Queries state is undefined or improperly initialized.");
          return prev;
        }

        // Extract the query keys from the current state
        const queryKeys = prev[0];
        // Below is something like
        // query: api.rows.getRowsForSheet,
        // args: {
        //   sheetId,
        //   startIndexKey: firstIndexKey,
        //   startInclusive: false,
        //   order: "desc"
        // }

        // Get the last query key from the state
        const lastQueryKey = queryKeys[queryKeys.length - 1];

        // Get the last result using the last key in prev
        const lastResult = queryResults["" + lastQueryKey];

        // Don't proceed if the last query is still loading
        if (!lastResult) {
          logger.debug("No lastResult available for scrolling down.");
          return prev;
        }

        // Don't proceed if the response is for a different sheetId
        if (lastResult?.sheetId !== sheetId) {
          logger.debug(
            "Last result is for a different sheetId. Stopping pagination.",
          );
          return prev;
        }

        // Don't proceed if there are no more results
        if (!lastResult.hasMore) {
          logger.debug("No more results to load. Stopping pagination.");
          return prev;
        }

        // Don't proceed if indexKeys desn't exosts or there is not a vailid one
        const lastIndexKey =
          lastResult.indexKeys?.[lastResult.indexKeys.length - 1];
        if (!lastIndexKey) {
          logger.debug("No valid lastIndexKey found. Stopping pagination.");
          return prev;
        }

        // Add the next query for loading additional data
        const nextQueryKey = queryKeys.length;

        return [
          [...queryKeys, nextQueryKey],
          {
            // Maintain existing query arguments
            ...prev[1],
            [nextQueryKey]: {
              // Use the same query from API (stable variable)
              query: api.rows.getRowsForSheet,
              args: {
                sheetId,
                startIndexKey: lastIndexKey,
                startInclusive: false, // Do not include the last item from the previous page
              },
            },
          },
        ];
      });
    } catch (error) {
      showErrorNotification(
        t("pagination.scroll_down_error_title"),
        t("pagination.error_loading_next_page"),
      );
      logger.error("Error in scrollDown:", { error: error });
    }
  }, [queryResults, sheetId]);

  // Function to load previous page of results
  const scrollUp = useCallback(() => {
    logger.debug("Scrolling up");
    try {
      setQueries((prev) => {
        const firstQueryKey = prev[0][0];
        const firstQuery = prev[1]["" + firstQueryKey];
        const firstArgs = firstQuery.args;
        const firstIndexKey = firstArgs.startIndexKey;

        // Don't proceed if we're at the start
        if (!firstIndexKey || firstIndexKey.length === 0) {
          return prev;
        }

        // Don't proceed if first page is still loading
        if (firstArgs.endIndexKey === undefined || firstArgs.order === "desc") {
          return prev;
        }

        const nextQueryKey = prev[0].length;
        return [
          [nextQueryKey, ...prev[0]],
          {
            ...prev[1],
            [nextQueryKey]: {
              query: firstQuery.query,
              args: {
                sheetId,
                startIndexKey: firstIndexKey,
                startInclusive: false,
                order: "desc", // Reverse order to get previous page
              },
            },
          },
        ];
      });
    } catch (error) {
      showErrorNotification(
        t("pagination.scroll_up_error_title"),
        t("pagination.error_loading_previous_page"),
      );
      logger.error("Error in scrollUp:", { error: error });
    }
  }, [sheetId]);

  return {
    results,
    scrollDown,
    scrollUp,
    initialLoading,
    pageLoading,
    loading,
  };
}

export default usePaginatedRows;

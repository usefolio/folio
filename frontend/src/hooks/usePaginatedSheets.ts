import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useQueries } from "convex/react";
import { useLocation } from "react-router";
import { Id } from "../../convex/_generated/dataModel";
import { api } from "../../convex/_generated/api";
import { useTranslation } from "react-i18next";
import { showErrorNotification } from "../components/notification/NotificationHandler";
import { useLogger } from "@/utils/Logger";
import { PaginatedSheets } from "./../interfaces/interfaces";

/**
 * PAGINATION STATE MANAGEMENT FIX
 *
 * PREVIOUS BEHAVIOR:
 * - The hook maintained pagination state (cursors) across the entire application lifecycle
 * - When users navigated to the /workflow route and performed operations (create/edit/delete),
 *   the underlying data changed but the pagination cursors remained unchanged
 * - Upon returning from /workflow, the hook would use these stale cursors to fetch data
 * - Convex pagination cursors are position-based references that become invalid when the
 *   underlying dataset changes
 * - This resulted in duplicate entries appearing in the sheets list because the cursor
 *   positions no longer aligned with the actual data boundaries
 *
 * ROOT CAUSE:
 * - Cursor-based pagination relies on stable data ordering and consistent dataset state
 * - When data mutations occur (especially deletions or insertions), cursor positions shift
 * - The stale cursors would point to incorrect positions in the new dataset, causing:
 *   1. Overlapping data ranges between pages
 *   2. Same items appearing in multiple pages
 *   3. Inconsistent pagination boundaries
 *
 * NEW BEHAVIOR:
 * - The hook now tracks route changes using React Router's useLocation
 * - When detecting a transition from any other page than "/" back to "/", it triggers
 *   a complete pagination reset
 * - This reset clears all existing queries and cursors, starting fresh from the beginning
 * - Fresh pagination ensures cursors are valid for the current dataset state
 */

function usePaginatedSheets(
  projectId?: Id<"project">,
  limit?: number,
): PaginatedSheets {
  const { t } = useTranslation();
  const logger = useLogger("src/hooks/usePaginatedSheets.ts");
  const location = useLocation();
  const previousLocationRef = useRef(location.pathname);

  // Combined state for both query keys and queries
  const [queries, setQueries] = useState<
    readonly [number[], Record<string, { query: any; args: any }>]
  >(() => {
    if (!projectId) {
      // Return empty state if there is no project
      return [[], {}] as const;
    }

    // Initialize with first query
    return [
      [0],
      {
        "0": {
          query: api.sheets.getPaginated,
          args: {
            project_id: projectId,
            paginationOpts: {
              numItems: limit ? limit : 50,
              cursor: null,
            },
          },
        },
      },
    ] as const;
  });

  // FIXED: Use useEffect instead of useMemo for side effects
  // Effect to reset pagination state when the projectId or limit changes.
  // This ensures that if a new project is selected or the item limit per page
  // is adjusted, the pagination starts fresh from the beginning for the new context.
  useEffect(() => {
    if (!projectId) {
      setQueries([[], {}] as const);
      return;
    }

    // Reset to the initial query configuration for the new project/limit
    setQueries([
      [0], // Initial query key
      {
        "0": {
          query: api.sheets.getPaginated,
          args: {
            project_id: projectId,
            paginationOpts: {
              numItems: limit ? limit : 50,
              cursor: null, // Start from the beginning
            },
          },
        },
      },
    ] as const);
  }, [projectId, limit]); // re-run if projectId or limit changes

  // Reset when returning to main route from any other route
  useEffect(() => {
    const isReturningToMainRoute =
      previousLocationRef.current !== "/" && location.pathname === "/";

    if (isReturningToMainRoute && projectId) {
      // Reset pagination to start fresh
      setQueries([
        [0],
        {
          "0": {
            query: api.sheets.getPaginated,
            args: {
              project_id: projectId,
              paginationOpts: {
                numItems: limit ? limit : 50,
                cursor: null,
              },
            },
          },
        },
      ] as const);
    }

    previousLocationRef.current = location.pathname;
  }, [location.pathname, projectId, limit]);

  // Execute useQueries
  const queryResults = useQueries(queries[1]);

  // Extract sheets from results with deduplication
  const sheets = useMemo(() => {
    if (!projectId) return [];

    try {
      const allSheets: any[] = [];

      for (const queryKeyIndex of queries[0]) {
        const result = queryResults["" + queryKeyIndex];
        if (!result || result instanceof Error) {
          if (result instanceof Error) throw result;
          continue;
        }

        if (result.page) {
          allSheets.push(...result.page);
        }
      }

      return allSheets;
    } catch (error) {
      logger.error("Error in usePaginatedSheets:", { error });
      showErrorNotification(
        t("pagination.error_title"),
        t("pagination.error_fetching_sheets"),
      );
      return [];
    }
  }, [queryResults, queries, projectId, t, logger]);

  // Get last query and result
  const lastQueryKey =
    queries[0].length > 0 ? queries[0][queries[0].length - 1] : null;
  const lastResult =
    lastQueryKey !== null ? queryResults["" + lastQueryKey] : null;

  // Check if there are more sheets
  const hasMore = !!(lastResult && !lastResult.isDone);

  // Check loading state
  const loading = useMemo(() => {
    return queries[0].some(
      (key: number) => queryResults["" + key] === undefined,
    );
  }, [queries, queryResults]);

  // Load more sheets function
  const loadMore = useCallback(() => {
    if (!hasMore || loading || !projectId) return;

    try {
      setQueries(
        (
          prev: readonly [number[], Record<string, { query: any; args: any }>],
        ) => {
          const queryKeys = prev[0];
          const lastQueryKey = queryKeys[queryKeys.length - 1];
          const lastResult = queryResults["" + lastQueryKey];

          // Don't load more if there is no more to load
          if (!lastResult || lastResult.isDone) return prev;

          // Get the next query key
          const nextQueryKey = queryKeys.length;

          // Create the next query with the continuation cursor
          return [
            [...queryKeys, nextQueryKey],
            {
              ...prev[1],
              [nextQueryKey]: {
                query: api.sheets.getPaginated,
                args: {
                  project_id: projectId,
                  paginationOpts: {
                    numItems: limit ? limit : 50,
                    cursor: lastResult.continueCursor,
                  },
                },
              },
            },
          ];
        },
      );
    } catch (error) {
      logger.error("Error loading more sheets:", { error });
      showErrorNotification(
        t("pagination.error_title"),
        t("pagination.error_loading_more_sheets"),
      );
    }
  }, [hasMore, loading, queryResults, projectId, limit, t]);

  return {
    sheets,
    loading,
    loadMore,
    hasMore,
    limit,
  };
}

export default usePaginatedSheets;

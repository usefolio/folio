import { useState, useCallback, useMemo, useEffect } from "react";
import { useQueries } from "convex/react";
import { Id } from "../../convex/_generated/dataModel";
import { api } from "../../convex/_generated/api";
import { FunctionArgs } from "convex/server";
import { useTranslation } from "react-i18next";
import { showErrorNotification } from "../components/notification/NotificationHandler";
import { useLogger } from "@/utils/Logger";
import { PaginatedLogs, PaginatedLogsResponse } from "@/interfaces/interfaces";

function usePaginatedLogs(
  projectId?: Id<"project">,
  limit: number = 50,
  enabled: boolean = true,
): PaginatedLogs {
  const { t } = useTranslation();
  const logger = useLogger("src/hooks/usePaginatedLogs.ts");

  const createInitialState = useCallback(() => {
    // If not enabled or no project selected, don't issue any queries
    if (!enabled || !projectId) {
      return [[], {}] as const;
    }

    return [
      [0] as number[],
      {
        "0": {
          query: api.logs.getPaginated,
          args: {
            paginationOpts: {
              cursor: null,
              numItems: limit ?? 50,
            },
          },
        },
      } as Record<
        string,
        {
          query: typeof api.logs.getPaginated;
          args: FunctionArgs<typeof api.logs.getPaginated>;
        }
      >,
    ] as const;
  }, [projectId, limit, enabled]);

  const [queries, setQueries] = useState(() => createInitialState());

  useEffect(() => {
    setQueries(createInitialState());
  }, [projectId, limit, enabled, createInitialState]);

  const queryResults = useQueries(queries[1]) as Record<string, any>;

  const results = useMemo(() => {
    try {
      const res: PaginatedLogsResponse[] = [];

      for (const queryKey of queries[0]) {
        const result = queryResults[String(queryKey)];

        if (!result || result instanceof Error) {
          res.push({
            logs: [],
            indexKeys: [],
            hasMore: false,
            projectId: projectId!,
          });
          continue;
        }

        // Map Convex paginate result -> PaginatedLogsResponse shape
        res.push({
          logs: Array.isArray(result.page) ? result.page : [],
          indexKeys: result.continueCursor ? [result.continueCursor] : [],
          hasMore: result.isDone === false,
          projectId: projectId!,
        });
      }

      return res;
    } catch (error) {
      logger.error("Error mapping logs query results:", { error });
      showErrorNotification(
        t("pagination.error_title"),
        t("pagination.error_fetching_logs"),
      );
      return [];
    }
  }, [queries, queryResults, projectId]);

  const scrollDown = useCallback(() => {
    try {
      // Do nothing if logs fetching is disabled or no project selected
      if (!enabled || !projectId) return;

      setQueries((prev) => {
        const queryKeys = prev[0];
        const lastQueryKey = queryKeys[queryKeys.length - 1];
        const lastResult = queryResults[String(lastQueryKey)];

        if (!lastResult || lastResult instanceof Error || lastResult.isDone) {
          logger.debug("No more logs to load.");
          return prev;
        }

        const nextCursor = lastResult.continueCursor;
        if (!nextCursor) return prev;

        const nextQueryKey = queryKeys.length;
        return [
          [...queryKeys, nextQueryKey],
          {
            ...prev[1],
            [nextQueryKey]: {
              query: api.logs.getPaginated,
              args: {
                paginationOpts: {
                  cursor: nextCursor,
                  numItems: limit ?? 50,
                },
              },
            },
          },
        ];
      });
    } catch (error) {
      showErrorNotification(
        t("pagination.error_title"),
        t("pagination.error_loading_more_logs"),
      );
      logger.error("Error in scrollDown:", { error });
    }
  }, [queryResults, projectId, limit, enabled]);

  const scrollUp = useCallback(() => {
    // Dummy function for now
    return;
  }, []);

  return {
    results,
    scrollDown,
    scrollUp,
  };
}

export default usePaginatedLogs;

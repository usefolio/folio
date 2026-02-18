// src/utils/usePaginatedProjects.ts
import { useState, useCallback, useMemo } from "react";
import { useQueries } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useTranslation } from "react-i18next";
import { showErrorNotification } from "../components/notification/NotificationHandler";
import { useLogger } from "@/utils/Logger";
import { PaginatedProjects } from "@/interfaces/interfaces";

function usePaginatedProjects(limit?: number): PaginatedProjects {
  const { t } = useTranslation();
  const logger = useLogger("src/utils/usePaginatedProjects.ts");

  const [queries, setQueries] = useState(() => {
    return [
      [0] as number[],
      {
        "0": {
          query: api.projects.getPaginated,
          args: {
            paginationOpts: {
              numItems: limit ? limit : 50,
              cursor: null,
            },
          },
        },
      },
    ] as const;
  });

  const queryResults = useQueries(queries[1]);

  const projects = useMemo(() => {
    try {
      const allProjects: any[] = [];

      for (const queryKey of queries[0]) {
        const result = queryResults["" + queryKey];

        if (!result || result instanceof Error) {
          if (result instanceof Error) throw result;
          continue;
        }

        allProjects.push(...result.page);
      }

      return allProjects;
    } catch (error) {
      logger.error("Error in usePaginatedProjects:", { error });
      showErrorNotification(
        t("pagination.error_title"),
        t("pagination.error_fetching_projects"),
      );
      return [];
    }
  }, [queryResults, queries]);

  const lastQueryKey = queries[0][queries[0].length - 1];
  const lastResult = queryResults["" + lastQueryKey];
  const hasMore = !!(lastResult && !lastResult.isDone);

  const loading = useMemo(() => {
    return queries[0].some((key) => queryResults["" + key] === undefined);
  }, [queries, queryResults]);

  const loadMore = useCallback(() => {
    if (!hasMore || loading) return;

    try {
      setQueries((prev) => {
        const queryKeys = prev[0];
        const lastQueryKey = queryKeys[queryKeys.length - 1];
        const lastResult = queryResults["" + lastQueryKey];

        if (!lastResult || lastResult.isDone) return prev;

        const nextQueryKey = queryKeys.length;

        return [
          [...queryKeys, nextQueryKey],
          {
            ...prev[1],
            [nextQueryKey]: {
              query: api.projects.getPaginated,
              args: {
                paginationOpts: {
                  numItems: limit ? limit : 50,
                  cursor: lastResult.continueCursor,
                },
              },
            },
          },
        ];
      });
    } catch (error) {
      logger.error("Error loading more projects:", { error });
      showErrorNotification(
        t("pagination.error_title"),
        t("pagination.error_loading_more_projects"),
      );
    }
  }, [hasMore, loading, queryResults]);

  return { projects, loading, loadMore, hasMore };
}

export default usePaginatedProjects;

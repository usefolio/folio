import { useState, useCallback, useMemo, useEffect } from "react";
import { useQueries } from "convex/react";
import { Id } from "../../convex/_generated/dataModel";
import { api } from "../../convex/_generated/api";
import { FunctionArgs } from "convex/server";
import { useTranslation } from "react-i18next";
import { showErrorNotification } from "../components/notification/NotificationHandler";
import { useLogger } from "@/utils/Logger";
import { PaginatedJobs, PaginatedJobsResponse } from "@/interfaces/interfaces";

function usePaginatedJobs(
  projectId?: Id<"project">,
  limit?: number,
): PaginatedJobs {
  const { t } = useTranslation();
  const logger = useLogger("src/hooks/usePaginatedJobs.ts");

  const createInitialState = useCallback(() => {
    return [
      [0] as number[],
      {
        "0": {
          query: api.jobs.getJobsBatch,
          args: {
            projectId,
            limit: limit ?? 50,
            order: "desc",
          },
        },
      } as Record<
        string,
        {
          query: typeof api.jobs.getJobsBatch;
          args: FunctionArgs<typeof api.jobs.getJobsBatch>;
        }
      >,
    ] as const;
  }, [projectId, limit]);

  const [queries, setQueries] = useState(() => createInitialState());

  useEffect(() => {
    setQueries(createInitialState());
  }, [projectId, createInitialState]);

  const queryResults = useQueries(queries[1]) as Record<
    string,
    PaginatedJobsResponse
  >;

  const results = useMemo(() => {
    try {
      const res: PaginatedJobsResponse[] = [];

      for (const queryKey of queries[0]) {
        const result = queryResults[String(queryKey)];

        if (
          !result ||
          result instanceof Error ||
          result.projectId !== projectId
        ) {
          res.push({
            jobs: [],
            indexKeys: [],
            hasMore: false,
            projectId: projectId!,
          });
          continue;
        }

        res.push(result);
      }

      return res;
    } catch (error) {
      logger.error("Error mapping jobs query results:", { error });
      showErrorNotification(
        t("pagination.error_title"),
        t("pagination.error_fetching_jobs"),
      );
      return [];
    }
  }, [queries, queryResults, projectId]);

  const scrollDown = useCallback(() => {
    try {
      setQueries((prev) => {
        const queryKeys = prev[0];
        const lastQueryKey = queryKeys[queryKeys.length - 1];
        const lastResult = queryResults[String(lastQueryKey)];

        if (
          !lastResult ||
          lastResult.projectId !== projectId ||
          !lastResult.hasMore
        ) {
          logger.debug("No more jobs to load.");
          return prev;
        }

        const lastIndexKey =
          lastResult.indexKeys[lastResult.indexKeys.length - 1];
        if (!lastIndexKey) {
          logger.debug("No valid last index key.");
          return prev;
        }

        const nextQueryKey = queryKeys.length;
        return [
          [...queryKeys, nextQueryKey],
          {
            ...prev[1],
            [nextQueryKey]: {
              query: api.jobs.getJobsBatch,
              args: {
                projectId,
                startIndexKey: lastIndexKey,
                startInclusive: false,
                limit: limit ?? 50,
                order: "desc",
              },
            },
          },
        ];
      });
    } catch (error) {
      showErrorNotification(
        t("pagination.error_title"),
        t("pagination.error_loading_more_jobs"),
      );
      logger.error("Error in scrollDown:", { error });
    }
  }, [queryResults, projectId, limit]);

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

export default usePaginatedJobs;

import { useState, useCallback, useMemo, useEffect } from "react";
import { useQueries } from "convex/react";
import { Id } from "../../convex/_generated/dataModel";
import { api } from "../../convex/_generated/api";
import { FunctionArgs } from "convex/server";
import { useTranslation } from "react-i18next";
import { showErrorNotification } from "../components/notification/NotificationHandler";
import { useLogger } from "@/utils/Logger";
import {
  PaginatedColumns,
  PaginatedColumnsResponse,
} from "@/interfaces/interfaces";
// Similar to already existing usePaginatedRows
function usePaginatedColumns(
  projectId?: Id<"project">,
  sheetId?: Id<"sheet">,
  limit?: number,
): PaginatedColumns {
  const { t } = useTranslation();
  const logger = useLogger("src/utils/usePaginatedColumns.ts");

  const createInitialState = useCallback(() => {
    return [
      [0] as number[],
      {
        "0": {
          query: api.columns.getColumnsBatch,
          args: {
            projectId,
            sheetId,
            limit: limit ? limit : 50,
          },
        },
      } as Record<
        string,
        {
          query: typeof api.columns.getColumnsBatch;
          args: FunctionArgs<typeof api.columns.getColumnsBatch>;
        }
      >,
    ] as const;
  }, [projectId, sheetId]);

  const [queries, setQueries] = useState(() => createInitialState());

  useEffect(() => {
    setQueries(createInitialState());
  }, [projectId, sheetId, createInitialState]);

  const queryResults = useQueries(queries[1]) as Record<
    string,
    PaginatedColumnsResponse
  >;

  const results = useMemo(() => {
    try {
      const res: PaginatedColumnsResponse[] = [];

      for (const queryKey of queries[0]) {
        const result = queryResults[String(queryKey)];

        if (!result || result instanceof Error || result.sheetId !== sheetId) {
          res.push({
            columns: [],
            indexKeys: [],
            hasMore: false,
            sheetId: sheetId!,
          });
          continue;
        }

        res.push(result);
      }

      return res;
    } catch (error) {
      logger.error("Error mapping column query results:", { error });
      showErrorNotification(
        t("pagination.error_title"),
        t("pagination.error_fetching_columns"),
      );
      return [];
    }
  }, [queries, queryResults, sheetId]);

  const scrollRight = useCallback(() => {
    try {
      setQueries((prev) => {
        const queryKeys = prev[0];
        const lastQueryKey = queryKeys[queryKeys.length - 1];
        const lastResult = queryResults[String(lastQueryKey)];

        if (
          !lastResult ||
          lastResult.sheetId !== sheetId ||
          !lastResult.hasMore
        ) {
          logger.debug("No more columns to load.");
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
              query: api.columns.getColumnsBatch,
              args: {
                projectId,
                sheetId,
                startIndexKey: lastIndexKey,
                startInclusive: false,
                limit: limit ? limit : 50,
              },
            },
          },
        ];
      });
    } catch (error) {
      showErrorNotification(
        t("pagination.error_title"),
        t("pagination.error_loading_more_columns"),
      );
      logger.error("Error in scrollRight:", { error });
    }
  }, [queryResults, sheetId, projectId]);

  const scrollLeft = useCallback(() => {
    // Not needed for now
    return;
  }, []);

  return {
    results,
    scrollRight,
    scrollLeft,
  };
}

export default usePaginatedColumns;

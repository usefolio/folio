import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useCallback,
} from "react";
import { useAuth } from "@clerk/clerk-react";
import {
  SessionBackendProvider,
  useReady,
  type ConnectResponse,
} from "@jamsocket/react";
import { USE_JAMSOCKET } from "@/constants";
import { useTranslation } from "react-i18next";
import { useDataContext } from "./DataContext";
import type { Id } from "../../convex/_generated/dataModel";
import { Logger } from "@/utils/Logger";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle } from "lucide-react";
import {
  PerformanceMetric,
  JamsocketContextState,
} from "@/interfaces/interfaces";
import { useFreshToken } from "@/hooks/useFreshToken";
/**
 * React context for managing Jamsocket state across the application.
 * This includes the main session readiness and the URLs of per-project backends.
 */
const JamsocketContext = createContext<JamsocketContextState | undefined>(
  undefined,
);
const DEFAULT_JAMSOCKET_SERVICE = "folio-jamsocket-service";
/**
 * An internal component that manages the lifecycle of per-project Jamsocket backends.
 * It waits for the main session to be ready, then spawns backends for each project
 * that doesn't already have one.
 */
const JamsocketManager: React.FC<{
  children: ReactNode;
  connectResponse: ConnectResponse;
}> = ({ children, connectResponse }) => {
  const isMainSessionReady = useReady();
  const getToken = useFreshToken();
  const { projects } = useDataContext();
  const logger = new Logger({ service: "JamsocketManager" });
  // Tracks the mapping of a project's ID to its spawned backend URL.
  const [projectBackendUrls, setProjectBackendUrls] = useState<
    Map<Id<"project">, string>
  >(new Map());
  // Tracks which projects are currently in the process of spawning a backend.
  const [spawningProjects, setSpawningProjects] = useState<Set<Id<"project">>>(
    new Set(),
  );
  // Tracks performance metrics for backend spawn times.
  const [performanceMetrics, setPerformanceMetrics] = useState<
    Map<Id<"project">, PerformanceMetric>
  >(new Map());
  /**
   * Spawns a dedicated backend for a single project.
   * It updates the loading and URL states for that project.
   */
  const spawnForProject = useCallback(
    async (projectId: Id<"project">, token: string) => {
      setSpawningProjects((prev) => new Set(prev).add(projectId));

      const startTime = performance.now();
      setPerformanceMetrics((prev) => {
        const newMap = new Map(prev);
        newMap.set(projectId, { startTime, endTime: 0, duration: 0 });
        return newMap;
      });

      try {
        const spawnEndpoint = `${connectResponse.url}/spawn`;
        const res = await fetch(spawnEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ key: projectId }),
        });

        if (!res.ok)
          throw new Error(`Spawning failed with status ${res.status}`);

        const { url: newBackendUrl } = await res.json();
        setProjectBackendUrls((prev) =>
          new Map(prev).set(projectId, newBackendUrl),
        );
        logger.debug(`Jamsocket backend ready for project ${projectId}`);
      } catch (error) {
        logger.error(`Failed to spawn backend for project ${projectId}`, {
          error,
        });
      } finally {
        const endTime = performance.now();
        setPerformanceMetrics((prev) => {
          const newMetrics = new Map(prev);
          const metric = newMetrics.get(projectId);
          if (metric) {
            metric.endTime = endTime;
            metric.duration = endTime - metric.startTime;
            logger.debug(
              `Jamsocket spin-up for ${projectId} took ${metric.duration.toFixed(2)}ms`,
            );
          }
          return newMetrics;
        });
        setSpawningProjects((prev) => {
          const newSet = new Set(prev);
          newSet.delete(projectId);
          return newSet;
        });
      }
    },
    [connectResponse.url, logger],
  );
  /**
   * Effect to trigger the spawning of backends for all projects
   * once the main Jamsocket session is ready.
   */
  useEffect(() => {
    if (isMainSessionReady && projects.length > 0) {
      const spawnAll = async () => {
        const token = await getToken();
        if (!token) return;

        for (const project of projects) {
          if (
            !projectBackendUrls.has(project._id) &&
            !spawningProjects.has(project._id)
          ) {
            // Not awaiting here to run them concurrently
            spawnForProject(project._id, token);
          }
        }
      };
      spawnAll();
    }
  }, [
    isMainSessionReady,
    projects,
    getToken,
    spawnForProject,
    projectBackendUrls,
    spawningProjects,
  ]);

  const value = {
    isMainSessionReady,
    projectBackendUrls,
    spawningProjects,
    performanceMetrics,
  };

  return (
    <JamsocketContext.Provider value={value}>
      {children}
    </JamsocketContext.Provider>
  );
};
/**
 * The main provider component for Jamsocket integration.
 * It handles the initial connection to the Jamsocket session service and
 * renders the appropriate state (loading, error, or the application).
 */
export const JamsocketProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const { t } = useTranslation();
  const { isSignedIn } = useAuth();
  const getToken = useFreshToken();
  const [connectResponse, setConnectResponse] =
    useState<ConnectResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!USE_JAMSOCKET || !isSignedIn || connectResponse) return;
    const jamsocketService =
      import.meta.env.VITE_JAMSOCKET_SERVICE || DEFAULT_JAMSOCKET_SERVICE;

    const fetchConnectionDetails = async () => {
      try {
        const userAuthToken = await getToken();
        if (!userAuthToken)
          throw new Error("Authentication token not available.");

        const res = await fetch("/api/jamsocket-connect", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${userAuthToken}`,
          },
          body: JSON.stringify({ service: jamsocketService }),
        });

        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(
            t("jamsocket.connection_failed", {
              status: res.status,
              error: errorText,
            }),
          );
        }
        setConnectResponse(await res.json());
      } catch (err) {
        setError(
          err instanceof Error ? err.message : t("global.unknown_error"),
        );
      }
    };
    fetchConnectionDetails();
  }, [isSignedIn, getToken, connectResponse, t]);

  if (!USE_JAMSOCKET) {
    return (
      <JamsocketContext.Provider
        value={{
          isMainSessionReady: false,
          projectBackendUrls: new Map(),
          spawningProjects: new Set(),
          performanceMetrics: new Map(),
        }}
      >
        {children}
      </JamsocketContext.Provider>
    );
  }
  if (error) {
    return (
      <div className="absolute inset-0 bg-gray-50 z-50 flex justify-center items-center flex-col p-8">
        <AlertTriangle className="w-12 h-12 text-red-500 mb-4" />
        <h2 className="text-lg font-semibold text-center mb-2">
          {t("jamsocket.error_title")}
        </h2>
        <p className="text-sm text-muted-foreground text-center">{error}</p>
      </div>
    );
  }
  if (!connectResponse) {
    return (
      <div className="flex w-screen h-screen">
        <aside className="p-4 border-r w-64">
          <Skeleton className="h-8 w-3/4 mb-6" />
          <div className="space-y-3">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-5/6" />
            <Skeleton className="h-6 w-full" />
          </div>
        </aside>
        <main className="w-full flex-1 p-4">
          <Skeleton className="h-10 w-full mb-4" />
          <Skeleton className="h-full w-full" />
        </main>
      </div>
    );
  }

  return (
    <SessionBackendProvider connectResponse={connectResponse}>
      <JamsocketManager connectResponse={connectResponse}>
        {children}
      </JamsocketManager>
    </SessionBackendProvider>
  );
};
/**
 * A custom hook for components to easily access the Jamsocket context state.
 * returns the current JamsocketContextState.
 */
export const useJamsocket = (): JamsocketContextState => {
  const context = useContext(JamsocketContext);
  if (context === undefined) {
    throw new Error("useJamsocket must be used within a JamsocketProvider");
  }
  return context;
};

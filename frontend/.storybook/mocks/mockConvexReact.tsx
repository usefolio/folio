import React, { PropsWithChildren } from "react";
import { getStorybookParameters } from "./mockState";
import { getStorybookContext } from "./mockState";

export class ConvexReactClient {
  constructor(_url: string) {}
  mutation() {
    return () => Promise.resolve(undefined);
  }
  clearAuth() {}
  close() {}
  setAuth(_token?: string | null) {}
}

export const ConvexProvider: React.FC<PropsWithChildren<{ client?: any }>> = ({
  children,
}) => <>{children}</>;

type AnyFn = (...args: any[]) => any;
export const useMutation = <F extends AnyFn = AnyFn>(_m?: unknown) =>
  ((..._a: any[]) => Promise.resolve(undefined)) as unknown as F;

export const useQuery = (_query: any, _args?: any) => {
  const storyContext = getStorybookContext();
  const allMocks = storyContext.parameters?.convex;

  const queryPath = storyContext.parameters?.queryPath;
  const mockData = allMocks && queryPath ? allMocks[queryPath] : undefined;

  if (mockData !== undefined) {
    return mockData;
  }
  return undefined;
};
export const usePaginatedQuery = (_query: any, _args: any, _options: any) => {
  const storyContext = getStorybookContext();
  const allMocks = storyContext.parameters?.convex;
  const queryPath = storyContext.parameters?.queryPath;
  const mockData = allMocks && queryPath ? allMocks[queryPath] : undefined;

  if (mockData) {
    return {
      results: mockData.data || [],
      status: mockData.status || "CanLoadMore",
      loadMore: () =>
        console.log(`Storybook: loadMore called for ${queryPath}`),
    };
  }

  // Fallback if no specific mock is provided
  return {
    results: [],
    status: "LoadingFirstPage",
    loadMore: () => {},
  };
};

export const useAction = (_actionReference?: any) => {
  const parameters = getStorybookParameters();
  const mockImplementation =
    parameters?.convex?.actions?.[
      "export_data:fetchAllColumnsAndSheetsForProject"
    ];
  if (mockImplementation) {
    return mockImplementation;
  }

  // Default behavior for all other actions
  return () => Promise.resolve(undefined);
};
export const useConvex = () => ({});
export const useQueries = <T extends unknown[] = unknown[]>(
  ..._a: unknown[]
): T => [] as unknown as T;

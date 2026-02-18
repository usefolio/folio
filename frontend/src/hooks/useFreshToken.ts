import { useCallback } from "react";
import { useAuth } from "@clerk/clerk-react";

type ClerkGetToken = ReturnType<typeof useAuth>["getToken"];
type GetTokenOptions = Parameters<ClerkGetToken>[0];

/**
 * Wrapper around Clerk's getToken. We currently keep Clerk's token cache
 * enabled to avoid forcing a mint on every request.
 */
export const useFreshToken = () => {
  const { getToken } = useAuth();

  return useCallback(
    (options?: GetTokenOptions) => getToken({ ...options, skipCache: false }),
    [getToken],
  );
};

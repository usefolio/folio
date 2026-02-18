import React, { PropsWithChildren } from "react";

console.log("[SB mockClerkReact] mock module loaded");

/**
 * Minimal mock of Clerk's auth hooks & components for Storybook.
 */

//Mocks: hooks
export function useAuth() {
  return {
    isLoaded: true,
    isSignedIn: true,
    userId: "sb-mock-user",
    sessionId: "sb-mock-session",
    orgId: null,
    getToken: async (_opts?: unknown) => "sb-mock-token",
    signOut: async () => undefined,
  };
}

export function useUser() {
  return {
    isLoaded: true,
    isSignedIn: true,
    user: {
      id: "sb-mock-user",
      fullName: "Storybook User",
      emailAddresses: [{ emailAddress: "storybook@example.com" }],
    },
  };
}
export function useClerk() {
  return { signOut: async () => undefined };
}

// Mocks: components
export const ClerkProvider: React.FC<PropsWithChildren<any>> = ({
  children,
}) => <>{children}</>;

export const SignedIn: React.FC<PropsWithChildren> = ({ children }) => (
  <>{children}</>
);
export const SignedOut: React.FC<PropsWithChildren> = () => null;

export const RedirectToSignIn: React.FC = () => null;
export const RedirectToUserProfile: React.FC = () => null;

export const OrganizationProfile: React.FC = () => null;
export const UserButton: React.FC = () => null;
export const SignInButton: React.FC = () => null;
export const SignUpButton: React.FC = () => null;

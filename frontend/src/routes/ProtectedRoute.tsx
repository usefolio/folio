import React from "react";
import { Outlet, Navigate } from "react-router";
import { ConvexReactClient, useConvexAuth } from "convex/react";
import { DataProvider } from "../context/DataContext";
import { RetryProvider } from "../context/RetryContext";
import { Loader2 } from "lucide-react";
import { ChatProvider } from "@/context/ChatContext";

interface ProtectedRouteProps {
  convex: ConvexReactClient;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ convex }) => {
  const { isLoading, isAuthenticated } = useConvexAuth();

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-full w-screen overflow-hidden">
        <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />; // Redirect unauthenticated users to login
  }

  return (
    <DataProvider convex={convex}>
      <RetryProvider>
        <ChatProvider>
          <Outlet />
        </ChatProvider>
      </RetryProvider>
    </DataProvider>
  );
};

export default ProtectedRoute;

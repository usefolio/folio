import React, { createContext, useContext, useState, ReactNode } from "react";
import { RetryContextProps } from "../interfaces/interfaces";
import { useTranslation } from "react-i18next";

// Create a context for retry functionality
const RetryContext = createContext<RetryContextProps | undefined>(undefined);

// Provider to manage retry context state
export const RetryProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [retryData, setRetryData] =
    useState<RetryContextProps["retryData"]>(null); // State to store retry data

  // Function to clear retry data (reset to null)
  const clearRetryData = () => {
    setRetryData(null);
  };

  return (
    <RetryContext.Provider value={{ retryData, setRetryData, clearRetryData }}>
      {children}
    </RetryContext.Provider>
  );
};

// Hook to access the retry context
export const useRetry = () => {
  const { t } = useTranslation();
  const context = useContext(RetryContext); // Get the context value
  if (!context) {
    // Ensure the hook is used within the provider
    throw new Error(t("context.retry_context.provider_error"));
  }
  return context;
};

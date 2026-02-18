import { useRetry } from "../context/RetryContext";
import {
  showSuccessNotification,
  showErrorNotification,
} from "../components/notification/NotificationHandler";
import { useFreshToken } from "@/hooks/useFreshToken";
import { useTranslation } from "react-i18next";
import { useLogger } from "../utils/Logger";

// Hook to handle retry logic using the retry context
export const useRetryHandler = () => {
  const { t } = useTranslation();
  const logger = useLogger("src/hooks/useRetryHandler");
  const getToken = useFreshToken();
  // Access retry data and clear function from the context
  const { retryData, clearRetryData } = useRetry();
  const handleRetry = async () => {
    if (!retryData) {
      showErrorNotification(
        t("hooks.use_retry_handler.retry_failed_title"),
        t("global.no_data"),
      );
      return;
    }
    try {
      // Execute the function stored in retryData with its arguments
      // Designed to work with any async function, but made for api calls
      const token = await getToken();
      const result = await retryData.fn(token, ...retryData.args);

      // Notify the user that the retry was successful
      showSuccessNotification(
        t("hooks.use_retry_handler.retry_successful_title"),
        t("hooks.use_retry_handler.retry_successful_message"),
      );

      // Clear the retry data
      clearRetryData();
      return result;
    } catch (error) {
      logger.error("Retry failed:", { error });

      // Notify the user that the retry failed
      showErrorNotification(
        t("hooks.use_retry_handler.retry_failed_title"),
        t("hooks.use_retry_handler.retry_failed_error", {
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  };

  // Return the retry handler function
  return {
    handleRetry,
  };
};

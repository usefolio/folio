import React, { useState, useEffect } from "react";
import SheetHandler from "./components/SheetHandler";
import {
  showErrorNotification,
  showSuccessNotification,
  showProgressNotification,
} from "./components/notification/NotificationHandler";
import { useDataContext } from "./context/DataContext";
import { useTranslation } from "react-i18next";
import type { Id } from "../convex/_generated/dataModel";
import { JSONSchema, SavedPrompt } from "./types/types";
import { Toaster } from "./components/ui/sonner";
import { useLogger } from "./utils/Logger";
import { Doc } from "../convex/_generated/dataModel";
import { useModal } from "./context/ModalContext";
import { SidebarProvider } from "./components/sidebar/SidebarManager";

const App: React.FC = () => {
  const { t } = useTranslation();
  const logger = useLogger("App.tsx");
  const {
    projects,
    sheets,
    project,
    sheet,
    loading,
    setSheet,
    handleCreateView,
    setLoadingViewProjects,
  } = useDataContext();
  const { openModal } = useModal();
  const [clickedColumnId, setClickedColumnId] = useState<Id<"column"> | null>(
    null,
  );
  const [switchToNewSheet, setSwitchToNewSheet] = useState<boolean>(true);
  useEffect(() => {
    if (!loading && !projects) {
      showErrorNotification(
        t("app.notifications.error_loading_projects_title"),
        t("app.notifications.error_loading_projects_message"),
      );
    }
  }, [loading, projects]);

  useEffect(() => {
    if (!loading && !sheets) {
      showErrorNotification(
        t("app.notifications.error_loading_sheets_title"),
        t("app.notifications.error_loading_sheets_message"),
      );
    }
  }, [loading, sheets]);

  const openShowPromptModal = (props: {
    columnName: string;
    columnPrompt: SavedPrompt | string;
    columnJsonSchema?: { schema: JSONSchema };
  }) => {
    openModal("showPrompt", props);
  };
  //Creates multiple views based on tags when pressing the deep dive option in column header
  const handleCreateViewsFromDeepDive = async (
    columnName: string,
    tags: string[],
  ) => {
    if (!tags || tags.length === 0 || !project) {
      showErrorNotification(
        t("app.notifications.no_tags_title"),
        t("app.notifications.no_tags_message"),
      );
      return;
    }
    const progressToast = showProgressNotification(
      t("app.notifications.creating_views_title"),
      t("app.notifications.creating_views_message", {
        count: tags.length,
        columnName: columnName,
      }),
      0,
      tags.length,
    );
    // Set loading state for the current project
    setLoadingViewProjects((prev) => ({
      ...prev,
      [project as string]: true,
    }));

    // Track success/failure
    let deepDiveSuccessfulViewsCount = 0;
    let deepDiveFailedViewsCount = 0;
    progressToast.show();
    // Create views sequentially for proper error handling
    for (const tag of tags) {
      try {
        // Create view name
        const viewName = tag;

        // Properly construct SQL query with the correct format:
        // Double quotes around column name and LIKE with wildcards
        const sqlQuery = `"${columnName}" LIKE '%${tag}%'`;

        // Call handleCreateView with the corrected SQL filter
        await handleCreateView(
          viewName,
          sqlQuery,
          project as Id<"project">,
          false, // No notification
          false, // Don't navigate to new project
        );

        deepDiveSuccessfulViewsCount++;
      } catch (error) {
        logger.error(`Failed to create view for tag "${tag}":`, {
          error: error,
        });
        deepDiveFailedViewsCount++;
        // Continue with the next tag even if this one failed
      }
      const currentProgress =
        deepDiveSuccessfulViewsCount + deepDiveFailedViewsCount;
      progressToast.update(currentProgress);
    }

    // Reset loading state for the project
    setLoadingViewProjects((prev) => ({
      ...prev,
      [project as string]: false,
    }));
    progressToast.dismiss(2000);
    // Show a single notification at the end based on results
    if (deepDiveSuccessfulViewsCount > 0) {
      if (deepDiveFailedViewsCount === 0) {
        // All views created successfully
        showSuccessNotification(
          t("app.notifications.views_created_title"),
          t("app.notifications.views_created_message", {
            count: deepDiveSuccessfulViewsCount,
            column: columnName,
          }),
        );
      } else {
        // Some views created, some failed
        showSuccessNotification(
          t("app.notifications.views_partially_created_title"),
          t("app.notifications.views_partially_created_message", {
            success: deepDiveSuccessfulViewsCount,
            failed: deepDiveFailedViewsCount,
            column: columnName,
          }),
        );
      }
    } else if (deepDiveFailedViewsCount > 0) {
      // All views failed
      showErrorNotification(
        t("app.notifications.views_creation_failed_title"),
        t("app.notifications.views_creation_failed_message", {
          count: deepDiveFailedViewsCount,
          column: columnName,
        }),
      );
    }
  };
  return (
    <SidebarProvider loading={loading}>
      <div className="flex-1 w-full">
        {/* Toasts */}
        <Toaster
          position="top-right"
          toastOptions={{
            style: { padding: 0, boxShadow: "none" },
            className: "sonner-toast-custom",
          }}
        />
        {/* SheetHandler - show only when there are projects */}
        {projects.length > 0 && (
          <SheetHandler
            project={project}
            sheets={sheets}
            sheet={sheet as Doc<"sheet">}
            setSheet={setSheet}
            onNewColumnButtonClick={() => openModal("column")}
            openShowPromptModal={openShowPromptModal}
            setClickedColumnId={setClickedColumnId}
            clickedColumnId={clickedColumnId}
            handleCreateViewsFromDeepDive={handleCreateViewsFromDeepDive}
            switchToNewSheet={switchToNewSheet}
            setSwitchToNewSheet={setSwitchToNewSheet}
          />
        )}
      </div>
    </SidebarProvider>
  );
};

export default App;

import React, { useEffect } from "react";
import { Outlet } from "react-router";
import AppSidebar from "@/components/AppSidebar";
import { useDataContext } from "@/context/DataContext";
import { SidebarProvider } from "@/components/sidebar/SidebarManager";
import { useTranslation } from "react-i18next";
import { showErrorNotification } from "@/components/notification/NotificationHandler";
import { useModal } from "@/context/ModalContext";
import Header from "@/components/Header";
import { useUser } from "@clerk/clerk-react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useLocation } from "react-router";
import ModalManager from "@/components/ModalManager";

// This component defines the main application shell
const MainLayout: React.FC = () => {
  const { t } = useTranslation();
  const {
    projects,
    projectGrouping,
    sheets,
    sheet,
    project,
    loading,
    setProject,
    selectDefaultProject,
    setSheet,
    loadMoreProjects,
    hasMoreProjects,
    projectsLoading,
  } = useDataContext();
  const {
    isModalReady,
    isModalOpen,
    modalType,
    modalData,
    modalState,
    modalActions,
    closeModal,
    modalSessionIdRef,
  } = useModal();
  const { user } = useUser();
  const { openModal } = useModal();
  const location = useLocation();
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

  return (
    // We use the ShadCN SidebarProvider here to provide UI context for the layout
    <SidebarProvider loading={loading}>
      <div className="flex w-screen h-screen">
        <aside className="hidden md:block border-r">
          <AppSidebar
            projects={projects}
            project={project}
            setProject={setProject}
            selectDefaultProject={selectDefaultProject}
            openNewProjectModal={() => openModal("newProject")}
            setSheet={setSheet}
            projectGrouping={projectGrouping}
            loadMoreProjects={loadMoreProjects}
            hasMoreProjects={hasMoreProjects}
            projectsLoading={projectsLoading}
          />
        </aside>
        {/* Show welcome message only when there are no projects */}
        <div className="flex flex-col flex-1 scrollbar-thin min-w-0">
          {/* Main element has width only if there are projects */}
          <main
            className={`flex flex-col w-full bg-gray-50 ${projects.length > 0 && "flex-1"} ${location.pathname !== "/" ? "overflow-auto scrollbar-thin" : ""}`}
          >
            <Header
              openExportModal={() => openModal("export")}
              openSummaryModal={() => openModal("summary")}
              openAlertModal={() => openModal("alert")}
            />
            <Outlet />
          </main>
          {projects.length === 0 &&
            !projectsLoading &&
            (location.pathname === "/" ||
              location.pathname === "/workflow") && (
              <div className="flex flex-1 flex-col items-center justify-center p-8">
                <span className="text-base">
                  {t("global.welcome", {
                    userName: user?.firstName,
                  })}
                </span>
                <p className="text-xs text-muted-foreground">
                  {t("global.welcome_subtext")}
                </p>
                <Button
                  variant="default"
                  size="compact"
                  shape="square"
                  className="mt-4 hover:bg-orange-600"
                  onClick={() => openModal("newProject")}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  {t("sidebar.new_project_button")}
                </Button>
              </div>
            )}
        </div>
        {isModalReady && (
          <ModalManager
            isModalOpen={isModalOpen}
            modalType={modalType}
            closeModal={closeModal}
            project_id={project}
            sheet={sheet || sheets[0]}
            modalData={modalData}
            state={modalState}
            actions={modalActions}
            modalSessionIdRef={modalSessionIdRef}
          />
        )}
      </div>
    </SidebarProvider>
  );
};

export default MainLayout;

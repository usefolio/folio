import React from "react";
import { useDataContext } from "../context/DataContext";
import { useTranslation } from "react-i18next";
import { Toaster } from "../components/ui/sonner";
import WorkflowBuilder from "../components/workflow/workflowBuilder";
import { WorkflowProvider } from "../context/WorkflowContext";
import { SidebarProvider } from "@/components/sidebar/SidebarManager";

const WorkflowPage: React.FC = () => {
  const { t } = useTranslation();
  const { loading, projects } = useDataContext();
  return (
    <SidebarProvider loading={loading}>
      <WorkflowProvider>
        <div className="flex h-full overflow-auto scrollbar-thin bg-gray-50 w-full">
          {/* Toasts */}
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                padding: 0,
                boxShadow: "none",
              },
              className: "sonner-toast-custom",
            }}
          />

          {/* Main Content Area - EXPANDS FULLY WHEN SIDEBAR COLLAPSES */}
          <div className="flex-1 flex flex-col h-full w-full bg-gray-50">
            {/* Content Area - show only when there are projects*/}
            {projects.length > 0 && (
              <div className="flex-1 w-full p-6">
                <>
                  {/* WorkflowBuilder */}
                  <h2 className="text-xl font-semibold mb-4">
                    {t("workflow.title")}
                  </h2>
                  <WorkflowBuilder />
                </>
              </div>
            )}
          </div>
        </div>
      </WorkflowProvider>
    </SidebarProvider>
  );
};

export default WorkflowPage;

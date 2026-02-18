import React from "react";
import { useTranslation } from "react-i18next";
import {
  MoreVertical,
  ChevronDown,
  // History,
  Database,
  GitBranch,
  MessageSquare,
  Table2,
  Notebook,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarTrigger } from "./ui/sidebar";
import { useSidebar } from "@/components/sidebar/SidebarManager";
import { HeaderProps } from "@/interfaces/interfaces";
import { useNavigate } from "react-router";
import { useLocation } from "react-router";
import { useDataContext } from "@/context/DataContext";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const Header: React.FC<HeaderProps> = ({
  openExportModal,
  openSummaryModal,
  openAlertModal,
}) => {
  const { t } = useTranslation();
  const location = useLocation();
  const { projects, projectsLoading } = useDataContext();
  const { openSidebar } = useSidebar();
  const navigate = useNavigate();
  const activeView = location.pathname.startsWith("/workflow") ? "workflow" : "grid";
  const tabItems = [
    { value: "workflow", icon: GitBranch, labelKey: "header.workflow", disabled: false },
    { value: "grid", icon: Table2, labelKey: "header.grid_view", disabled: false },
    { value: "notepad", icon: Notebook, labelKey: "header.notepad", disabled: true },
  ] as const;
  const handleViewChange = (value: string) => {
    if (value === "workflow") {
      navigate("/workflow");
    }
    if (value === "grid") {
      navigate("/");
    }
  };
  // const openLogs = () => {
  //   openSidebar({ type: "logs", logData: [] });
  // };
  const openJobs = () => {
    openSidebar({ type: "jobs" });
  };
  const openChat = () => {
    openSidebar({ type: "chat" });
  };
  return (
    <header
      data-testid={"header"}
      className={`flex ${location.pathname !== "/" || (location.pathname === "/" && projects.length === 0) ? "h-[42px]" : "h-10"} items-center justify-between bg-gray-50 px-4 py-2 ${location.pathname !== "/" || (location.pathname === "/" && projects.length === 0) ? "border-b border-border" : ""}`}
    >
      <div className="flex items-center space-x-4">
        <SidebarTrigger className="rounded-md" />
        {/* Actions Dropdown */}
        {!projectsLoading &&
          projects.length > 0 &&
          (location.pathname === "/workflow" || location.pathname === "/") && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-md text-xs"
                >
                  {t("header.actions")}
                  <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="rounded-md">
                <DropdownMenuItem onClick={openExportModal}>
                  {t("header.export")}
                </DropdownMenuItem>
                <DropdownMenuItem disabled onClick={openAlertModal}>
                  {t("header.alert")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
      </div>
      {(location.pathname === "/workflow" || location.pathname === "/") &&
        projects.length > 0 &&
        !projectsLoading && (
          <Tabs
            value={activeView}
            onValueChange={handleViewChange}
            className="shrink-0"
          >
            <TabsList
              className="flex h-8 items-center gap-1 rounded-md border border-border bg-muted/40 px-1 py-1 text-muted-foreground shadow-sm"
            >
              {tabItems.map(({ value, icon: Icon, labelKey, disabled }) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  disabled={disabled}
                  className="group flex h-6 flex-1 items-center justify-center gap-2 rounded-md text-xs font-medium transition-all duration-200 hover:text-foreground data-[state=active]:bg-background data-[state=active]:shadow-none data-[state=active]:text-foreground"
                >
                  <Icon className="h-4 w-4 text-muted-foreground transition-colors duration-200 group-data-[state=active]:text-orange-500" />
                  <span className={disabled ? "text-muted-foreground" : undefined}>
                    {t(labelKey)}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}
      {(location.pathname === "/workflow" || location.pathname === "/") &&
        projects.length > 0 &&
        !projectsLoading && (
          <div className="flex items-center gap-2">
            {/* History or Logs */}
            <>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 rounded-md"
                onClick={openJobs}
              >
                <Database className="h-4 w-4" />
              </Button>
              {/* Logs disabled in sidebar */}
              {/* <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 rounded-md"
                onClick={openLogs}
              >
                <History className="h-4 w-4" />
              </Button> */}
              {/* Data Chat */}
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 rounded-md"
                onClick={openChat}
              >
                <MessageSquare className="h-4 w-4" />
              </Button>
            </>

            {/* Notification & Settings */}
            {/* <Button variant="outline" size="icon" className="h-8 w-8 rounded-md">
          <Bell className="h-4 w-4" />
        </Button> */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 rounded-md"
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="rounded-md">
                <DropdownMenuItem
                  disabled
                  onClick={openSummaryModal}
                  className="cursor-pointer"
                >
                  {t("header.summary")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
    </header>
  );
};

export default Header;

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarRail,
  SidebarSeparator,
  useRootSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import {
  Plus,
  ChevronRight,
  ChevronDown,
  Calendar,
  FileSpreadsheet,
  RefreshCw,
  Beaker,
  LogOut,
  Folder,
  CalendarSync,
  Bell,
  History,
  Search,
  SlidersVertical,
  Settings,
  SquareCode,
  CircleDollarSign,
} from "lucide-react";
import { useNavigate, useLocation } from "react-router";
import { SidebarProps } from "@/interfaces/interfaces";
import { Id } from "convex/_generated/dataModel";
import { ScrollArea } from "./ui/scroll-area";
import { useTranslation } from "react-i18next";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Avatar, AvatarImage, AvatarFallback } from "./ui/avatar";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { useUser, useClerk } from "@clerk/clerk-react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import logo from "@/assets/folio_black_horizontal.svg";
import { Skeleton } from "@/components/ui/skeleton";
import { useSidebarState } from "@/context/SidebarStateContext";
import { useModal } from "@/context/ModalContext";
import BillingBalance from "./sidebar/BillingBalance";

// Helper function to format date
const formatDate = (date: Date | string | number) => {
  return format(new Date(date), "MMM d");
};

type ProjectWithNewRows = {
  _id: Id<"project">;
  _creationTime: number;
  name: string;
  owner: string;
  project_grouping?: Id<"project_grouping">;
  total_rows_when_last_viewed?: number;
  type?: "synced";
  total_new_rows: number;
  scheduled_actions?: string;
};

const AppSidebar: React.FC<Partial<SidebarProps>> = ({
  projects = [],
  setProject,
  setSheet,
  project,
  openNewProjectModal,
  projectGrouping = [],
  loadMoreProjects,
  hasMoreProjects,
  projectsLoading,
}) => {
  const navigate = useNavigate();
  const { displayCount, setDisplayCount, ITEMS_PER_PAGE } = useSidebarState();
  const { openModal } = useModal();
  const location = useLocation();
  const { t } = useTranslation();
  const { open: isOpen, setOpenMobile, isMobile } = useRootSidebar();
  const { user } = useUser();
  const { signOut } = useClerk();
  const viewProjectMutation = useMutation(api.projects.viewProject);
  // State for expandable sections
  const [recentProjectsExpanded, setRecentProjectsExpanded] = useState(true);
  const [scheduledProjectsExpanded, setScheduledProjectsExpanded] =
    useState(true);
  const [dataSyncExpanded, setDataSyncExpanded] = useState(true);
  // State for pagination
  const [showDirection, setShowDirection] = useState<"more" | "less">("more");
  // State for weeks, commented out might be useful later
  // const [showAllWeeks, setShowAllWeeks] = useState(false);
  // const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  // Refs and state for scroll indicator
  const contentRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const [sidebarWidth, setSidebarWidth] = useState(0);
  const footerRef = useRef<HTMLDivElement>(null);
  const [footerHeight, setFooterHeight] = useState(57);

  const projectsWithNewRows = projects as unknown as ProjectWithNewRows[];
  const [previousProjectCount, setPreviousProjectCount] = useState(
    projectsWithNewRows.length,
  );
  const groupingMap = useMemo(() => {
    const map = new Map<string, { name: string; type?: string }>();
    if (projectGrouping) {
      for (const grouping of projectGrouping) {
        map.set(grouping._id, { name: grouping.name, type: grouping.type });
      }
    }
    return map;
  }, [projectGrouping]);

  const groupedProjects = useMemo(() => {
    const nonGroupedProjects: ProjectWithNewRows[] = [];
    const grouped: Record<string, ProjectWithNewRows[]> = {};

    projectsWithNewRows.forEach((proj) => {
      if (proj.project_grouping) {
        if (!grouped[proj.project_grouping as string]) {
          grouped[proj.project_grouping as string] = [];
        }
        grouped[proj.project_grouping as string].push(proj);
      } else {
        nonGroupedProjects.push(proj);
      }
    });

    return {
      groups: Object.entries(grouped).map(([groupId, projects]) => {
        const meta = groupingMap.get(groupId);
        return {
          _id: groupId as Id<"project_grouping">,
          name: meta?.name ?? groupId,
          type: meta?.type,
          projects,
        };
      }),
      nonGroupedProjects,
    };
  }, [projectsWithNewRows, projectGrouping]);

  // Filter synced projects for data sync section
  const syncedProjects = useMemo(() => {
    return projectsWithNewRows.filter((p) => p.type === "synced");
  }, [projectsWithNewRows]);

  // Sort projects by creation date, newest first
  const sortedProjects = useMemo(() => {
    return [...groupedProjects.nonGroupedProjects].sort(
      (a, b) =>
        new Date(b._creationTime).getTime() -
        new Date(a._creationTime).getTime(),
    );
  }, [groupedProjects.nonGroupedProjects]);

  // Get paginated projects
  const displayedProjects = sortedProjects
    .filter((p) => !p.scheduled_actions)
    .slice(0, displayCount);
  const scheduledProjects = useMemo(() => {
    return projectsWithNewRows.filter(
      (p) => (!p.type || p.type !== "synced") && p.scheduled_actions,
    );
  }, [projectsWithNewRows]);

  // Commented out, might be useful later for something
  // Generate mock data for configured data sync section
  // const weeksData = useMemo(() => {
  //   const generateWeeksData = (numWeeks = 4) => {
  //     const today = new Date();
  //     const weeks = [];

  //     for (let weekIndex = 0; weekIndex < numWeeks; weekIndex++) {
  //       // Start on Monday
  //       const monday = new Date(today);
  //       monday.setDate(today.getDate() - today.getDay() + 1 + weekIndex * 7);

  //       const days = [];
  //       let totalNewItemsInWeek = 0;

  //       // Generate 7 days for each week
  //       for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
  //         const currentDay = new Date(monday);
  //         currentDay.setDate(monday.getDate() + dayIndex);

  //         // Randomly decide if this day has data
  //         const hasData = Math.random() > 0.3;
  //         const newItemsCount = hasData ? Math.floor(Math.random() * 20) : 0;
  //         const isCreating = hasData && Math.random() < 0.15;

  //         if (hasData && !isCreating) {
  //           totalNewItemsInWeek += newItemsCount;
  //         }

  //         days.push({
  //           date: currentDay,
  //           formattedDate: format(currentDay, "EEE, MMM do"),
  //           shortDay: format(currentDay, "EEE"),
  //           isToday: currentDay.toDateString() === today.toDateString(),
  //           spreadsheet: hasData
  //             ? {
  //                 id: `sheet-${currentDay.toISOString().split("T")[0]}`,
  //                 title: `Data ${format(currentDay, "MMM d")}`,
  //                 newItemsCount,
  //                 status: isCreating ? "creating" : "ready",
  //               }
  //             : null,
  //         });
  //       }

  //       weeks.push({
  //         weekStart: monday,
  //         weekEnd: new Date(monday.getTime() + 6 * 24 * 60 * 60 * 1000),
  //         formattedWeek: `${format(monday, "MMM d")} - ${format(new Date(monday.getTime() + 6 * 24 * 60 * 60 * 1000), "MMM d")}`,
  //         days,
  //         newItemsCount: totalNewItemsInWeek,
  //         isCurrentWeek: weekIndex === 0,
  //       });
  //     }

  //     return weeks;
  //   };

  //   return generateWeeksData();
  // }, []);
  // Commented out, might be useful later
  // Display weeks data based on show all state
  // const displayedWeeks = showAllWeeks ? weeksData : weeksData.slice(0, 2);

  // // Utility function for data sync section
  // const isDayLoading = (day: DayData): boolean => {
  //   return Boolean(day.spreadsheet && day.spreadsheet.status === "creating");
  // };
  // Get the effective new items count (0 if creating)
  // const getEffectiveNewItemsCount = (
  //   spreadsheet: SpreadsheetData | null,
  // ): number => {
  //   if (!spreadsheet || spreadsheet.status === "creating") {
  //     return 0;
  //   }
  //   return spreadsheet.newItemsCount;
  // };

  // const handleDayClick = (day: DayData) => {
  //   if (day.spreadsheet && day.spreadsheet.status === "ready") {
  //     setSelectedDate(day.date);
  //   }
  // };

  // State for scroll indicator
  const [hasScrollableContent, setHasScrollableContent] = useState(false);

  // Check if there's content to scroll
  const checkScrollableContent = () => {
    const scrollAreaViewport = contentRef.current?.querySelector(
      "[data-radix-scroll-area-viewport]",
    );

    if (scrollAreaViewport) {
      if (!isOpen) {
        setHasScrollableContent(false);
        return;
      }
      const { scrollTop, scrollHeight, clientHeight } = scrollAreaViewport;
      // Content is scrollable if the total height is greater than the visible area and not already at the bottom
      const hasMoreContent =
        scrollHeight > clientHeight &&
        scrollHeight - scrollTop - clientHeight > 30;

      setHasScrollableContent(hasMoreContent);
    }
  };

  // Get sidebar position for the arrow down scroll
  const getSidebarPosition = () => {
    if (sidebarRef.current) {
      const rect = sidebarRef.current.getBoundingClientRect();
      return {
        left: rect.left,
        //account for border
        width: rect.width - 1,
      };
    }
    return { left: 0, width: sidebarWidth || 240 };
  };

  // Set up resize observer to get sidebar width
  useEffect(() => {
    const updateSidebarWidth = () => {
      if (sidebarRef.current) {
        setSidebarWidth(sidebarRef.current.offsetWidth);
      }
    };

    // Initial measurement
    updateSidebarWidth();

    // Update on resize
    window.addEventListener("resize", updateSidebarWidth);

    return () => {
      window.removeEventListener("resize", updateSidebarWidth);
    };
  }, []);

  // Measure footer height for scroll indicator positioning
  useEffect(() => {
    const updateFooterHeight = () => {
      if (footerRef.current) {
        setFooterHeight(footerRef.current.offsetHeight);
      }
    };

    updateFooterHeight();
    window.addEventListener("resize", updateFooterHeight);

    return () => {
      window.removeEventListener("resize", updateFooterHeight);
    };
  }, []);

  // Set up scroll event listener
  useEffect(() => {
    // Need to find the actual scroll container within ScrollArea
    const scrollAreaViewport = contentRef.current?.querySelector(
      "[data-radix-scroll-area-viewport]",
    );

    if (scrollAreaViewport) {
      // Check initially after a short delay (to ensure content is rendered)
      setTimeout(checkScrollableContent, 100);

      // Add scroll listener to the actual scrolling element
      const handleScroll = () => checkScrollableContent();
      scrollAreaViewport.addEventListener("scroll", handleScroll);

      // Also check when window resizes
      window.addEventListener("resize", checkScrollableContent);

      // Clean up
      return () => {
        scrollAreaViewport.removeEventListener("scroll", handleScroll);
        window.removeEventListener("resize", checkScrollableContent);
      };
    }
  }, [recentProjectsExpanded, displayCount, dataSyncExpanded, expandedGroups]);

  // Check for scrollable content
  useEffect(() => {
    // Delay for DOM update
    const timeoutId = setTimeout(checkScrollableContent, 300);
    return () => clearTimeout(timeoutId);
  }, [recentProjectsExpanded, dataSyncExpanded, isOpen, expandedGroups]);

  useEffect(() => {
    checkScrollableContent();
  }, [footerHeight]);

  // Scroll to bottom when clicking the arrow down
  const scrollToBottom = () => {
    const scrollAreaViewport = contentRef.current?.querySelector(
      "[data-radix-scroll-area-viewport]",
    );
    if (scrollAreaViewport) {
      scrollAreaViewport.scrollTo({
        top: scrollAreaViewport.scrollHeight,
        behavior: "smooth",
      });
    }
  };

  useEffect(() => {
    if (isMobile) {
      setOpenMobile(true);
    } else {
      setOpenMobile(false);
    }
  }, [isMobile, setOpenMobile]);

  const onProjectClick = (
    _e: React.MouseEvent<HTMLButtonElement, MouseEvent>,
    projectId: string,
  ) => {
    // Immediately update the project state for a responsive UI
    if (setProject && project !== projectId) {
      setProject(projectId as Id<"project">); //
      if (setSheet) setSheet(undefined); //
    }

    // If we're not on the home route, navigate there
    if (location.pathname !== "/") {
      navigate("/"); //
    }

    // Call the viewProject mutation in the background without awaiting it.
    // This updates the view count on the server but doesn't block the UI.
    viewProjectMutation({ project_id: projectId as Id<"project"> }).catch(
      (error) => {
        console.error(
          "Error updating project view state in background:",
          error,
        );
      },
    );
  };
  // Toggle a group's expanded state
  const toggleGroupExpanded = (groupId: string) => {
    setExpandedGroups((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(groupId)) {
        newSet.delete(groupId);
      } else {
        newSet.add(groupId);
      }
      return newSet;
    });
  };

  const { left, width } = getSidebarPosition();

  // Handle collapsible state changes
  const handleCollapsibleChange = () => {
    // Wait for the animation to complete
    setTimeout(checkScrollableContent, 300);
  };
  const handleLogout = () => {
    signOut();
  };

  // HandleShowMoreLess function updates the previous count before loading
  const handleShowMoreLess = () => {
    if (projectsLoading) {
      return;
    }

    if (showDirection === "more") {
      // There are more local projects to show
      if (displayCount < sortedProjects.length) {
        const newCount = Math.min(
          displayCount + ITEMS_PER_PAGE,
          sortedProjects.length,
        );
        setDisplayCount(newCount);

        // If all local projects are visible but there are more in convex
        if (newCount >= sortedProjects.length && hasMoreProjects) {
          // Store the current count before loading
          setPreviousProjectCount(projectsWithNewRows.length);
          loadMoreProjects?.();
        }
      }
      // If all local projects are visible but there are more in convex
      else if (hasMoreProjects) {
        // Store the current count before loading
        setPreviousProjectCount(projectsWithNewRows.length);
        loadMoreProjects?.();
      }
    } else {
      // Show less projects, reset count to initial
      setDisplayCount(ITEMS_PER_PAGE);
      setShowDirection("more");
    }
  };
  useEffect(() => {
    // Only increase if previous count is already equal to or above initial page size
    if (
      !projectsLoading &&
      projectsWithNewRows.length > previousProjectCount &&
      previousProjectCount >= ITEMS_PER_PAGE
    ) {
      const newDisplayCount = Math.min(
        displayCount + ITEMS_PER_PAGE,
        projectsWithNewRows.length,
      );
      setDisplayCount(newDisplayCount);
      setPreviousProjectCount(projectsWithNewRows.length);
    }
  }, [
    projectsLoading,
    projectsWithNewRows.length,
    previousProjectCount,
    displayCount,
  ]);
  useEffect(() => {
    // If all projects are loaded from convex
    // and the last available projects are visible
    // and more than the initial page are shown
    if (
      !hasMoreProjects &&
      displayCount >= sortedProjects.length &&
      displayCount > ITEMS_PER_PAGE
    ) {
      // Switch to show less
      setShowDirection("less");
    }
  }, [displayCount, sortedProjects.length, hasMoreProjects]);
  return (
    <Sidebar
      ref={sidebarRef}
      className={`h-screen border-r bg-background transition-all duration-300 ease-in-out pt-0`}
      data-testid={"app-sidebar"}
    >
      {/* Sidebar Header - Keeping original */}
      <SidebarHeader className="p-0">
        <div className="flex h-[42px] items-center justify-between px-4 border-b">
          {/* Logo & Name */}
          <div className="flex items-center gap-2">
            <img
              src={logo}
              alt={t("sidebar.logo_alt")}
              className="h-[23.4px] w-auto"
            />
          </div>
        </div>
      </SidebarHeader>

      {/* Sidebar Content */}
      <SidebarContent ref={contentRef} className="relative">
        <ScrollArea type="scroll">
          {/* Tools Menu */}
          <SidebarGroup>
            <SidebarMenu className="px-0 py-1">
              <SidebarMenuItem>
                <SidebarMenuButton
                  disabled
                  className="text-gray-500 text-xs font-semibold rounded-md opacity-50 h-7"
                >
                  <Beaker className="h-3.5 w-3.5 mr-1.5" />
                  <span>{t("sidebar.menu_items.playground")}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  disabled
                  onClick={() => {
                    if (setProject) setProject(null);
                    navigate("/scheduled-actions");
                  }}
                  className={`text-xs font-semibold rounded-md h-7 ${location.pathname === "/scheduled-actions" ? "text-primary" : ""}`}
                >
                  <CalendarSync className="h-3.5 w-3.5 mr-1.5" />
                  <span>{t("header.scheduled_actions")}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  disabled
                  onClick={() => {
                    if (setProject) setProject(null);
                    navigate("/alerts");
                  }}
                  className={`text-xs font-semibold rounded-md h-7 hover:text-primary hover:bg-accent ${location.pathname === "/alerts" ? "text-primary" : ""}`}
                >
                  <Bell className="h-3.5 w-3.5 mr-1.5" />
                  <span>{t("sidebar.menu_items.alerts")}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => {
                    if (setProject) setProject(null);
                    navigate("/logs");
                  }}
                  className={`hover:text-primary hover:bg-accent ${location.pathname === "/logs" ? "text-primary" : ""} text-xs font-semibold rounded-md h-7`}
                >
                  <History className="h-3.5 w-3.5 mr-1.5" />
                  <span>{t("sidebar.menu_items.logs")}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  disabled
                  onClick={() => {
                    if (setProject) setProject(null);
                    navigate("/search-configuration");
                  }}
                  className={`text-xs font-semibold rounded-md h-7 hover:text-primary hover:bg-accent ${location.pathname === "/search-configuration" ? "text-primary" : ""}`}
                >
                  <Search className="h-3.5 w-3.5 mr-1.5" />
                  <span>{t("sidebar.menu_items.search_configuration")}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  disabled
                  onClick={() => {
                    if (setProject) setProject(null);
                    navigate("/api-data-sources");
                  }}
                  className={`text-xs font-semibold rounded-md h-7 hover:text-primary hover:bg-accent ${location.pathname === "/api-data-sources" ? "text-primary" : ""}`}
                >
                  <SquareCode className="h-3.5 w-3.5 mr-1.5" />
                  <span>{t("sidebar.menu_items.api_data_sources")}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>

          {/* Create New Button */}
          <div className="pt-2 border-t border-border">
            <Button
              variant="ghost"
              className="w-[calc(100%-16px)] ml-2 py-1 flex items-center justify-center rounded-md disabled:opacity-20"
              onClick={openNewProjectModal}
            >
              <Plus className="h-4 w-4 mr-2" />
              {t("sidebar.new_project_button")}
            </Button>
          </div>

          {/* Projects - Recent (non-grouped, paginated) */}
          {projects.length > 0 && (
            <div>
              <Collapsible
                defaultOpen={true}
                open={recentProjectsExpanded}
                onOpenChange={setRecentProjectsExpanded}
              >
                <CollapsibleTrigger
                  className="w-full group"
                  onClick={handleCollapsibleChange}
                >
                  <div className="py-2 pl-3 pr-2 flex items-center justify-between cursor-pointer hover:bg-accent/50 text-gray-400">
                    <div className="flex items-center">
                      <FileSpreadsheet className="h-4 w-4 mr-2 text-gray-400" />
                      <span className="text-[10px] font-bold tracking-wider uppercase text-gray-400">
                        {t("sidebar.menu_items.recent")}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center h-4 w-4">
                        <ChevronRight className="text-gray-400 h-4 w-4 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-90" />
                      </div>
                    </div>
                  </div>
                </CollapsibleTrigger>

                <CollapsibleContent>
                  <SidebarMenu className="mt-1">
                    {displayedProjects
                      .filter(
                        (p) =>
                          (!p.type || p.type !== "synced") &&
                          !p.scheduled_actions,
                      )
                      .map((proj) => (
                        <SidebarMenuItem key={proj._id.toString()}>
                          <SidebarMenuButton
                            className={`rounded-md pl-3 py-0 h-7 text-gray-500 hover:bg-accent/50 hover:text-primary ${project === proj._id ? "text-primary" : ""}`}
                            onClick={(e) =>
                              onProjectClick(e, proj._id.toString())
                            }
                          >
                            <span className="truncate text-xs font-semibold max-w-28">
                              {proj.name}
                            </span>
                            <span className="ml-auto text-xs flex items-center gap-2 text-muted-foreground">
                              {formatDate(proj._creationTime)}
                            </span>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      ))}

                    {sortedProjects.length > ITEMS_PER_PAGE && (
                      <div
                        className="pl-3 pr-4 py-2 text-xs text-muted-foreground flex items-center cursor-pointer hover:underline"
                        onClick={handleShowMoreLess}
                      >
                        <>
                          {showDirection === "more"
                            ? t("sidebar.see_more_button")
                            : t("sidebar.show_less_button")}
                          <ChevronRight className="h-3 w-3 ml-1" />
                        </>
                      </div>
                    )}
                  </SidebarMenu>
                </CollapsibleContent>
              </Collapsible>
            </div>
          )}

          {/* Project Groupings (separate section) */}
          {groupedProjects.groups.filter((group) => group.type !== "synced").length >
            0 && (
            <div className="mt-1">
              <Collapsible defaultOpen={false}>
                <CollapsibleTrigger className="w-full group">
                  <div className="py-2 pl-3 pr-2 flex items-center justify-between cursor-pointer hover:bg-accent/50 text-gray-400">
                    <div className="flex items-center">
                      <Folder className="h-4 w-4 mr-2 text-gray-400" />
                      <span className="text-[10px] font-bold tracking-wider uppercase text-gray-400">
                        {t("sidebar.menu_items.project_groupings", "Project Groupings")}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center h-4 w-4">
                        <ChevronRight className="text-gray-400 h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-90" />
                      </div>
                    </div>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenu className="mt-1">
                    {groupedProjects.groups
                      .filter((group) => group.type !== "synced")
                      .map((group) => (
                        <SidebarMenuItem
                          key={`group-section-${group._id.toString()}`}
                          className="list-none"
                        >
                          <Collapsible
                            defaultOpen={false}
                            open={expandedGroups.has(group._id.toString())}
                            onOpenChange={() =>
                              toggleGroupExpanded(group._id.toString())
                            }
                            className="w-full"
                          >
                            <CollapsibleTrigger className="w-full group">
                              <div className="pl-3 pr-2 py-2 flex items-center justify-between cursor-pointer hover:bg-accent/50 h-8">
                                <div className="flex items-center">
                                  <Folder className="h-4 w-4 mr-2 text-gray-400" />
                                  <span className="truncate max-w-28 text-[10px] font-bold tracking-wider uppercase text-gray-400">
                                    {group.name}
                                  </span>
                                </div>
                                <div className="flex items-center h-4 w-4">
                                  <ChevronRight className="h-4 w-4 text-gray-500 transition-transform duration-200 group-data-[state=open]:rotate-90" />
                                </div>
                              </div>
                            </CollapsibleTrigger>

                            <CollapsibleContent>
                              <div className="pl-2 border-l border-border ml-4 list-none">
                                {group.projects.map((projInGroup) => (
                                  <SidebarMenuItem key={projInGroup._id.toString()}>
                                    <SidebarMenuButton
                                      className={`rounded-md pl-3 py-0 h-7 text-gray-500 hover:bg-accent/50 hover:text-primary ${
                                        project === projInGroup._id
                                          ? "text-primary"
                                          : ""
                                      }`}
                                      onClick={(e) =>
                                        onProjectClick(
                                          e,
                                          projInGroup._id.toString(),
                                        )
                                      }
                                    >
                                      <span className="truncate text-xs font-semibold max-w-28">
                                        {projInGroup.name}
                                      </span>
                                      <span className="ml-auto text-xs flex items-center gap-2 text-muted-foreground">
                                        {formatDate(projInGroup._creationTime)}
                                        {!projInGroup.type &&
                                          (projInGroup?.total_new_rows as number) >
                                            0 && (
                                            <span className="inline-flex items-center justify-center h-5 min-w-5 px-1 text-xs font-medium bg-secondary text-secondary-foreground rounded-md">
                                              {projInGroup.total_new_rows}
                                            </span>
                                          )}
                                      </span>
                                    </SidebarMenuButton>
                                  </SidebarMenuItem>
                                ))}
                              </div>
                            </CollapsibleContent>
                          </Collapsible>
                        </SidebarMenuItem>
                      ))}
                  </SidebarMenu>
                </CollapsibleContent>
              </Collapsible>
            </div>
          )}
          {/* Skeleton loading for show more projects */}
          {projectsLoading && (
            <div className="py-2 px-3">
              {[...Array(3)].map((_, index) => (
                <div
                  key={`skeleton-${index}`}
                  className="flex items-center space-x-2 py-1"
                >
                  <Skeleton className="h-4 w-32" />
                </div>
              ))}
            </div>
          )}
          {/* Configured Data Sync */}
          {syncedProjects.length > 0 ||
            (groupedProjects.groups.filter((g) => g.type === "synced").length >
              0 && (
              <div className="mt-0">
                <Collapsible
                  defaultOpen={false}
                  open={dataSyncExpanded}
                  onOpenChange={setDataSyncExpanded}
                >
                  <CollapsibleTrigger
                    className="w-full group"
                    onClick={handleCollapsibleChange}
                  >
                    <div className="py-2 pl-3 pr-2 flex items-center justify-between cursor-pointer hover:bg-accent/50 text-gray-400">
                      <div className="flex items-center">
                        <RefreshCw className="h-4 w-4 mr-2 text-gray-400" />
                        <span className="text-[10px] font-bold tracking-wider uppercase text-gray-400">
                          {t("sidebar.menu_items.configured_data_sync")}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center h-4 w-4">
                          <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-90" />
                        </div>
                      </div>
                    </div>
                  </CollapsibleTrigger>

                  <CollapsibleContent>
                    {dataSyncExpanded && (
                      <SidebarMenu className="mt-0">
                        {/* Display synced project groups */}
                        {groupedProjects.groups
                          .filter((g) => g.type === "synced")
                          .map((group) => (
                            <SidebarMenuItem
                              key={`synced-${group._id.toString()}`}
                              className="list-none"
                            >
                              <Collapsible
                                defaultOpen={true}
                                className="w-full"
                              >
                                <CollapsibleTrigger
                                  className="w-full group"
                                  onClick={handleCollapsibleChange}
                                >
                                  <SidebarMenuButton className="font-semibold w-full text-gray-500 rounded-md pl-3 hover:text-primary hover:bg-accent/50 text-xs">
                                    <div className="flex items-center">
                                      <Calendar className="h-3 w-3 mr-2 text-gray-500" />
                                      <span>{group.name}</span>
                                    </div>
                                    <div className="ml-auto flex items-center gap-2">
                                      {group.projects.reduce(
                                        (sum, p) =>
                                          sum + (p.total_new_rows || 0),
                                        0,
                                      ) > 0 && (
                                        <span className="h-2 w-2 bg-secondary-foreground/70 rounded-full"></span>
                                      )}
                                      <div className="flex items-center h-4 w-4">
                                        <ChevronRight className="h-4 w-4 text-gray-500 transition-transform duration-200 group-data-[state=open]:rotate-90" />
                                      </div>
                                    </div>
                                  </SidebarMenuButton>
                                </CollapsibleTrigger>

                                <CollapsibleContent>
                                  <div className="relative border-l border-border ml-[17.5px] mt-0 pl-[2.5px]">
                                    {group.projects.map((syncedProj) => (
                                      <div key={syncedProj._id.toString()}>
                                        <button
                                          onClick={(e) =>
                                            onProjectClick(
                                              e as any,
                                              syncedProj._id.toString(),
                                            )
                                          }
                                          className={cn(
                                            "w-full flex items-center justify-between pl-3 pr-2 py-1 text-xs font-semibold text-gray-500 rounded-md",
                                            project === syncedProj._id
                                              ? "text-accent-foreground font-bold"
                                              : "",
                                            "hover:bg-accent/50",
                                          )}
                                        >
                                          <div className="flex items-center">
                                            <span className="truncate max-w-28">
                                              {syncedProj.name}
                                            </span>
                                          </div>

                                          {(syncedProj?.total_new_rows as number) >
                                            0 && (
                                            <span className="inline-flex items-center justify-center h-5 min-w-5 px-1 text-xs font-medium bg-secondary text-secondary-foreground rounded-md">
                                              {syncedProj.total_new_rows}
                                            </span>
                                          )}
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                </CollapsibleContent>
                              </Collapsible>
                            </SidebarMenuItem>
                          ))}

                        {/* Display individual synced projects that are not in groups */}
                        {syncedProjects
                          .filter((p) => !p.project_grouping)
                          .map((syncedProj) => (
                            <SidebarMenuItem
                              key={`individual-synced-${syncedProj._id.toString()}`}
                              className="list-none"
                            >
                              <SidebarMenuButton
                                className={`rounded-md pl-3 py-0 h-7 text-gray-500 hover:bg-accent/50 hover:text-primary ${
                                  project === syncedProj._id
                                    ? "text-primary"
                                    : ""
                                }`}
                                onClick={(e) =>
                                  onProjectClick(e, syncedProj._id.toString())
                                }
                              >
                                <span className="truncate text-xs font-semibold max-w-28">
                                  {syncedProj.name}
                                </span>

                                {(syncedProj?.total_new_rows as number) > 0 && (
                                  <span className="ml-auto inline-flex items-center justify-center h-5 min-w-5 px-1 text-xs font-medium bg-secondary text-secondary-foreground rounded-md">
                                    {syncedProj.total_new_rows}
                                  </span>
                                )}
                              </SidebarMenuButton>
                            </SidebarMenuItem>
                          ))}
                      </SidebarMenu>
                    )}
                  </CollapsibleContent>
                </Collapsible>
              </div>
            ))}
          {scheduledProjects.length > 0 && (
            <div>
              <Collapsible
                defaultOpen={false}
                open={scheduledProjectsExpanded}
                onOpenChange={setScheduledProjectsExpanded}
              >
                <CollapsibleTrigger
                  className="w-full group"
                  onClick={handleCollapsibleChange}
                >
                  <div className="py-2 pl-3 pr-2 flex items-center justify-between cursor-pointer hover:bg-accent/50 text-gray-400">
                    <div className="flex items-center">
                      <CalendarSync className="h-4 w-4 mr-2 text-gray-400" />
                      <span className="text-[10px] font-bold tracking-wider uppercase text-gray-400">
                        {t("sidebar.menu_items.scheduled")}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center h-4 w-4">
                        <ChevronRight className="text-gray-400 h-4 w-4 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-90" />
                      </div>
                    </div>
                  </div>
                </CollapsibleTrigger>

                <CollapsibleContent>
                  <SidebarMenu className="mt-1">
                    {/* Display non-grouped projects */}
                    {scheduledProjects.map((proj) => (
                      <SidebarMenuItem key={proj._id.toString()}>
                        <SidebarMenuButton
                          className={`rounded-md pl-3 py-0 h-7 text-gray-500 hover:bg-accent/50 hover:text-primary ${project === proj._id ? "text-primary" : ""}`}
                          onClick={(e) =>
                            onProjectClick(e, proj._id.toString())
                          }
                        >
                          <span className="truncate text-xs font-semibold max-w-28">
                            {proj.name}
                          </span>
                          <span className="ml-auto text-xs flex items-center gap-2 text-muted-foreground">
                            {formatDate(proj._creationTime)}
                          </span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </CollapsibleContent>
              </Collapsible>
            </div>
          )}

          {/* Add padding at the bottom to ensure content doesn't get hidden behind the indicator */}
          <div className="pb-6 z-0"></div>
        </ScrollArea>

        {/* Full-width overflow indicator with smooth fade-in */}

        <div
          className={cn(
            "fixed h-14 bg-gradient-to-t from-background to-transparent pointer-events-none z-0 mr-1",
            "transition-opacity duration-300 ease-in-out",
            hasScrollableContent ? "opacity-100" : "opacity-0",
            !isOpen ? "hidden" : "visible",
          )}
          style={{ bottom: `${footerHeight}px`, left: `${left}px`, width: `${width}px` }}
          aria-hidden={!hasScrollableContent || !isOpen}
        >
          <button
            onClick={scrollToBottom}
            className={`w-full h-full flex items-center justify-center ${!hasScrollableContent || !isOpen ? "pointer-events-none" : "pointer-events-auto"}`}
            aria-label="Scroll to see more content"
            disabled={!hasScrollableContent || !isOpen}
          >
            <div className="flex items-center justify-center bg-background/90 px-3 py-2 w-full">
              <ChevronDown
                className="h-8 w-12 text-muted-foreground"
                strokeWidth={1.5}
              />
            </div>
          </button>
        </div>
      </SidebarContent>

      {/* Sidebar Footer with user info and settings */}
      <SidebarFooter ref={footerRef} className="border-t p-0">
        <div className="px-2.5 pt-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              {/* User Authentication */}
              <div className="h-8 w-8 mr-2 rounded-md">
                <div className="h-8 w-8 rounded-md">
                  <Avatar className="h-8 w-8 rounded-md">
                    <AvatarImage src={user?.imageUrl} alt="User" />
                    <AvatarFallback className="rounded-md">{`${user?.firstName?.charAt(
                      0,
                    )}${user?.lastName?.charAt(0)}`}</AvatarFallback>
                  </Avatar>
                </div>
              </div>
              <div className="text-sm max-w-[120px]">
                <p className="font-medium text-xs">{user?.fullName}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {user?.emailAddresses[0].emailAddress}
                </p>
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 rounded-md border-border"
                >
                  <SlidersVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onClick={() => openModal("settings")}
                  className="cursor-pointer"
                >
                  <Settings className="h-4 w-4 mr-2" />
                  <span>{t("sidebar.menu_items.settings")}</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => navigate("/billing")}
                  className="cursor-pointer"
                >
                  <CircleDollarSign className="h-4 w-4 mr-2" />
                  <span>{t("sidebar.menu_items.billing")}</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={handleLogout}
                  className="cursor-pointer"
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  <span>{t("sidebar.logout")}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <SidebarSeparator className="mx-2.5 my-0.5" />
        <BillingBalance />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
};

export default React.memo(AppSidebar);

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";
import UniversalSidebar from "./UniversalSidebar";
import { Button } from "../ui/button";
import { Download, X, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLogger } from "@/utils/Logger";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
  DialogClose,
} from "../ui/dialog";
// import { Card } from "../ui/card";
import { Skeleton } from "../ui/skeleton";
import { Doc } from "convex/_generated/dataModel";
import { JobCard } from "../jobs/jobCard";
import { CompactJobCard } from "../jobs/compactJobCard";
import {
  IngestionJobCard,
  createIngestionJobProps,
} from "../jobs/ingestionJobCard";
import { Job } from "@/types/jobs";
import { useDataContext } from "@/context/DataContext";
import DataChat from "../chat/dataChat";
import { useBackendClient } from "@/hooks/useBackendClient";
import { Id } from "convex/_generated/dataModel";

// Define sidebar content types
export type SidebarContent =
  | { type: "media"; fileName: string[]; columnSubType?: string }
  | { type: "logs"; logData?: any }
  | { type: "jobs"; jobData?: Doc<"job">[] } // Make jobData optional
  | { type: "chat" }
  | { type: "markdown"; data?: any }
  | { type: "custom"; content: React.ReactNode; title: string; width?: string };

// Context to make sidebar accessible globally
interface SidebarContextType {
  openSidebar: (content: SidebarContent) => void;
  closeSidebar: () => void;
}

const SidebarContext = createContext<SidebarContextType | null>(null);

// Function to determine the right job component to use based on job properties
const shouldUseCompactCard = (job: Job): boolean => {
  // Use CompactCard for enriching data jobs
  return job.type === "ENRICHING_DATA";
};

const shouldUseIngestionCard = (job: Job): boolean => {
  // Use IngestionCard for any job that includes "INGESTION" in the name
  return job.type.includes("INGESTION");
};

const PdfPreviewSkeleton: React.FC<{ withContainer?: boolean }> = ({
  withContainer = true,
}) => {
  const skeletonContent = (
    <div className="flex h-full w-full flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-5 w-10" />
      </div>
      <div className="flex-1 space-y-3 overflow-hidden">
        <Skeleton className="h-full w-full" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-3 w-3/4" />
        <Skeleton className="h-3 w-2/3" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  );

  if (withContainer) {
    return (
      <div className="w-full h-[650px] border border-solid mb-2 bg-background p-6">
        {skeletonContent}
      </div>
    );
  }

  return (
    <div
      className="absolute inset-0 z-10 flex h-full w-full bg-background p-6"
      aria-hidden="true"
    >
      {skeletonContent}
    </div>
  );
};

const PdfPreview: React.FC<{ url: string; fileName: string }> = ({
  url,
  fileName,
}) => {
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setIsLoaded(false);
  }, [url]);

  return (
    <div className="relative w-full h-[650px] flex flex-col border border-solid mb-2 bg-background">
      {!isLoaded && <PdfPreviewSkeleton withContainer={false} />}
      <iframe
        src={url}
        className={`w-full h-full border-0 transition-opacity duration-300 ${
          isLoaded ? "opacity-100" : "opacity-0"
        }`}
        title={`PDF Preview: ${fileName}`}
        onLoad={() => setIsLoaded(true)}
      />
    </div>
  );
};

// SidebarManager component that handles rendering the correct sidebar content
export const SidebarProvider: React.FC<{
  children: React.ReactNode;
  loading: boolean;
}> = ({ children, loading }) => {
  const logger = useLogger("src/components/sidebar/SidebarManager.tsx");
  const { t } = useTranslation();
  const backendClient = useBackendClient();
  const {
    logs,
    jobs,
    project,
    scrollDownLogs,
    scrollDownJobs,
    logsLoading,
    jobsLoading,
    jobsResults,
    logsResults,
  } = useDataContext();
  const [isOpen, setIsOpen] = useState(false);
  const [content, setContent] = useState<SidebarContent | null>(null);
  // const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const [downloadUrls, setDownloadUrls] = useState<Map<string, string>>(
    new Map(),
  );
  const [loadingUrls, setLoadingUrls] = useState<boolean>(false);

  // Scroll observer ref to detect when user scrolls to bottom
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const contentContainerRef = useRef<HTMLDivElement | null>(null);

  // Function to check if there might be more data to load
  const hasMoreContent = useCallback(() => {
    if (!project) return false;

    if (content?.type === "logs") {
      return logsResults.some((result) => result.hasMore);
    } else if (content?.type === "jobs") {
      return jobsResults.some((result) => result.hasMore);
    }

    return false;
  }, [content, project, logsResults, jobsResults]);

  // Function to load more data
  const loadMoreData = useCallback(() => {
    if (!project) return;

    // Don't try to load more if there is none or if already loading
    if (
      (content?.type === "logs" && logsLoading) ||
      (content?.type === "jobs" && jobsLoading)
    ) {
      return;
    }

    if (content?.type === "logs" && hasMoreContent()) {
      logger.debug("Loading more logs for project", { projectId: project });
      scrollDownLogs && scrollDownLogs();
    } else if (content?.type === "jobs" && hasMoreContent()) {
      logger.debug("Loading more jobs for project", { projectId: project });
      scrollDownJobs && scrollDownJobs();
    }
  }, [
    project,
    content,
    scrollDownLogs,
    scrollDownJobs,
    logsLoading,
    jobsLoading,
    hasMoreContent,
    logger,
  ]);

  // Check if content fits into the viewport
  const checkContentHeight = useCallback(() => {
    if (!scrollContainerRef.current || !contentContainerRef.current) return;

    const { clientHeight: viewportHeight } = scrollContainerRef.current;
    const { clientHeight: contentHeight } = contentContainerRef.current;

    // If content is shorter than viewport try to load more data
    if (contentHeight < viewportHeight && hasMoreContent()) {
      logger.debug(
        "Content fits in viewport, automatically loading more data",
        {
          viewportHeight,
          contentHeight,
          hasMore: hasMoreContent(),
        },
      );
      loadMoreData();
    }
  }, [loadMoreData, hasMoreContent, logger]);

  // Load initial data when sidebar opens
  useEffect(() => {
    if (isOpen && project && content) {
      logger.debug("Sidebar opened, checking if initial load needed");
      // Initial check to see if there's any content at all
      if (
        (content.type === "logs" && logs.length === 0) ||
        (content.type === "jobs" && jobs.length === 0)
      ) {
        logger.debug("No initial content, triggering load");
        loadMoreData();
      } else {
        // Wait for DOM to update, then check if we need more content
        setTimeout(() => {
          checkContentHeight();
        }, 100);
      }
    }
  }, [
    isOpen,
    content,
    project,
    logs.length,
    jobs.length,
    loadMoreData,
    checkContentHeight,
    logger,
  ]);

  // Check content height after data loads
  useEffect(() => {
    if (isOpen && project && !logsLoading && !jobsLoading) {
      const timeoutId = setTimeout(() => {
        checkContentHeight();
      }, 200);

      return () => clearTimeout(timeoutId);
    }
  }, [
    isOpen,
    project,
    logsLoading,
    jobsLoading,
    logs.length,
    jobs.length,
    checkContentHeight,
  ]);
  // Handle scroll events for pagination
  const handleScroll = useCallback(
    (e: Event | React.UIEvent<HTMLDivElement>) => {
      if (!project) return;

      // Don't do anything if data is loading
      if (
        (content?.type === "logs" && logsLoading) ||
        (content?.type === "jobs" && jobsLoading)
      ) {
        return;
      }

      // Get the viewport element from the event
      const viewport = e.target as HTMLDivElement;
      if (!viewport) {
        console.log("No target in scroll event");
        return;
      }

      const { scrollTop, scrollHeight, clientHeight } = viewport;
      const scrolledToBottom = scrollHeight - scrollTop - clientHeight < 50; // Load more when within 50px of bottom
      if (scrolledToBottom && hasMoreContent()) {
        console.log("Loading more data from scroll handler");
        loadMoreData();
      }
    },
    [project, content, logsLoading, jobsLoading, hasMoreContent, loadMoreData],
  );

  // Set up scroll listener
  useEffect(() => {
    const currentRef = scrollContainerRef.current;
    if (currentRef) {
      currentRef.addEventListener("scroll", handleScroll);
      return () => {
        currentRef.removeEventListener("scroll", handleScroll);
      };
    }
  }, [handleScroll]);

  useEffect(() => {
    if (!isOpen) {
      scrollContainerRef.current = null;
    }
  }, [isOpen]);

  // const toggleDetails = (logId: string) => {
  //   setExpandedLog(expandedLog === logId ? null : logId);
  // };

  const openSidebar = (newContent: SidebarContent) => {
    logger.debug("Opening sidebar with content type:", {
      type: newContent.type,
    });
    setContent(newContent);
    setIsOpen(true);
  };

  const closeSidebar = () => {
    setIsOpen(false);
  };

  // Fetch download URLs when media content is loaded
  useEffect(() => {
    // Only fetch URLs if sidebar is open and showing media content
    if (isOpen && content?.type === "media") {
      const fetchDownloadUrls = async () => {
        try {
          setLoadingUrls(true);
          const fileNames = content.fileName;
          const controller = new AbortController();

          const urlsToFetch = fileNames.filter(
            (file) => !downloadUrls.has(file),
          );

          if (urlsToFetch.length === 0) {
            setLoadingUrls(false);
            return;
          }

          const urlPromises = urlsToFetch.map(async (file) => {
            try {
              const url = await backendClient.getDownloadUrl({
                fileName: file,
                signal: controller.signal,
                project_id: project as Id<"project">,
              });
              return { file, url };
            } catch (error) {
              logger.error(`Failed to get download URL for ${file}`, { error });
              return { file, url: null };
            }
          });

          const results = await Promise.all(urlPromises);

          // Update URLs map with new results
          setDownloadUrls((prevUrls) => {
            const newUrls = new Map(prevUrls);
            results.forEach(({ file, url }) => {
              if (url) newUrls.set(file, url);
            });
            return newUrls;
          });
        } catch (error) {
          logger.error("Error fetching download URLs:", { error });
        } finally {
          setLoadingUrls(false);
        }
      };

      fetchDownloadUrls();
    }
  }, [isOpen, content]);

  // Function to determine and render the appropriate preview for media
  const getMediaPreview = (fileName: string, t: Function) => {
    // Get the download URL for this file
    const url = downloadUrls.get(fileName);

    if (!url) {
      return <PdfPreviewSkeleton />;
    }

    // Get column subtype from content
    const columnSubType =
      content?.type === "media" ? content.columnSubType?.toLowerCase() : null;

    // Determine file type and return appropriate preview
    if (columnSubType === "image") {
      return (
        <Dialog>
          <DialogTrigger asChild>
            <img
              src={url}
              className="w-full rounded-md p-2 border border-solid mb-2 cursor-pointer transition-transform hover:scale-105"
              alt={t("grid.media_sidebar.image_alt_text", { fileName })}
            />
          </DialogTrigger>
          <DialogContent className="flex items-center justify-center bg-background p-4 shadow-lg !rounded-md">
            <div className="relative">
              <img src={url} className="max-w-full max-h-full rounded-md" />
              <DialogClose asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 absolute top-2 right-2 bg-black/50 text-background hover:bg-black/50 hover:text-primary p-2 rounded-md"
                >
                  <X className="h-4 w-4" />
                </Button>
              </DialogClose>
            </div>
          </DialogContent>
        </Dialog>
      );
    } else if (columnSubType === "pdf") {
      return <PdfPreview url={url} fileName={fileName} />;
    } else if (columnSubType === "video") {
      return (
        <div className="w-full flex flex-col border border-solid p-2 mb-2">
          <video controls src={url} className="w-full" preload="metadata" />
        </div>
      );
    } else {
      return (
        <div className="w-full flex flex-col items-center border border-solid p-4 mb-2">
          <div className="flex justify-center items-center h-48 w-full bg-gray-100 mb-4">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="64"
              height="64"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
            </svg>
          </div>
          <p className="text-center mb-2">
            {t("grid.media_sidebar.file_preview_not_available")}
          </p>
        </div>
      );
    }
  };
  // Render markdown
  const renderMarkdownContent = (data: string) => {
    return (
      <div className="p-4 h-auto w-full overflow-auto scrollbar-thin prose prose-sm dark:prose-invert max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
          {data}
        </ReactMarkdown>
      </div>
    );
  };
  // Render media content
  const renderMediaContent = (fileNames: string[]) => {
    return (
      <div className="p-4 space-y-4">
        {loadingUrls && fileNames.every((file) => !downloadUrls.has(file)) ? (
          <div className="space-y-4">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-8 w-32 mx-auto" />
          </div>
        ) : (
          fileNames.map((fileName, index) => {
            return (
              <div key={index} className="flex flex-col items-center">
                {/* Display the filename above the preview */}
                <p className="text-xs text-foreground mb-1 break-all">
                  {t("grid.media_sidebar.filename_label")}: {fileName}
                </p>

                {/* Render the appropriate preview based on file type */}
                {getMediaPreview(fileName, t)}

                {downloadUrls.has(fileName) && (
                  <Button
                    variant="default"
                    className="h-8 px-4 rounded-md hover:bg-orange-600"
                    onClick={() => {
                      const link = document.createElement("a");
                      link.href = downloadUrls.get(fileName) as string;
                      link.target = "_blank";
                      link.rel = "noopener noreferrer";
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                    }}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    {t("grid.media_sidebar.download_button")}
                  </Button>
                )}
              </div>
            );
          })
        )}
      </div>
    );
  };
  // Logs in sidebarmanager disabled
  // Render logs content and LogTypeTag
  // const renderLogTypeTag = (type: string) => {
  //   const colorMap: Record<string, string> = {
  //     error: "bg-red-500 text-white",
  //     success: "bg-green-500 text-white",
  //     warning: "bg-yellow-500 text-black",
  //     default: "bg-gray-500 text-white",
  //   };

  //   return (
  //     <span
  //       className={`px-2 py-0.5 rounded-md text-xs ${colorMap[type] || colorMap.default}`}
  //     >
  //       {t(`logs_page.log_type.${type}`)}
  //     </span>
  //   );
  // };

  // const renderLogsContent = (logData: any[]) => {
  //   // The logs from DataContext are already filtered by project in the backend
  //   const currentLogs = content?.type === "logs" ? logs : logData;

  //   if (!currentLogs) {
  //     return <p className="p-4">{t("logs_page.no_log_selected")}</p>;
  //   }
  //   // const filteredLogs = currentLogs.filter(log => log.)
  //   return (
  //     <div
  //       className="w-full h-full overflow-auto scrollbar-thin"
  //       ref={scrollContainerRef}
  //       onScrollCapture={(e) => handleScroll(e)}
  //     >
  //       <div
  //         className="space-y-3 p-4"
  //         style={{ maxHeight: "calc(100vh - 120px)" }}
  //         ref={contentContainerRef}
  //       >
  //         {loading ? (
  //           <div className="flex flex-col gap-3">
  //             <Skeleton className="h-12 w-full" />
  //             <Skeleton className="h-12 w-full" />
  //             <Skeleton className="h-12 w-full" />
  //           </div>
  //         ) : currentLogs.length === 0 ? (
  //           <div className="flex items-center justify-center h-32">
  //             <h3 className="text-lg text-gray-600">
  //               {t("logs_page.no_logs")}
  //             </h3>
  //           </div>
  //         ) : (
  //           <div className="space-y-3">
  //             {currentLogs.map((log) => {
  //               const isExpanded = expandedLog === log._id;
  //               return (
  //                 <Card
  //                   key={log._id}
  //                   className="p-4 shadow-sm border rounded-md"
  //                 >
  //                   <div className="flex justify-between items-center">
  //                     <div className="flex items-center space-x-3">
  //                       {renderLogTypeTag(log.type)}
  //                       <span className="text-sm">{log.text}</span>
  //                     </div>
  //                     {log.details && (
  //                       <Button
  //                         variant="ghost"
  //                         size="icon"
  //                         onClick={() => toggleDetails(log._id)}
  //                       >
  //                         {isExpanded ? (
  //                           <ChevronUp className="h-4 w-4" />
  //                         ) : (
  //                           <ChevronDown className="h-4 w-4" />
  //                         )}
  //                       </Button>
  //                     )}
  //                   </div>
  //                   <div className="flex flex-row">
  //                     <span className="text-gray-500 text-xs mt-2">
  //                       {new Date(log.timestamp).toLocaleString()}
  //                     </span>
  //                   </div>
  //                   {isExpanded && log.details ? (
  //                     <div className="mt-2 p-2 bg-gray-100 rounded text-sm text-gray-700">
  //                       {log.details}
  //                     </div>
  //                   ) : !isExpanded && log.details ? (
  //                     <></>
  //                   ) : (
  //                     <span className="text-sm text-gray-500">
  //                       {t("logs_page.no_details")}
  //                     </span>
  //                   )}
  //                 </Card>
  //               );
  //             })}
  //           </div>
  //         )}
  //       </div>

  //       {/* Loading indicator only when actually loading */}
  //       {content?.type === "logs" && logsLoading && (
  //         <div className="flex justify-center py-4">
  //           <div className="flex items-center space-x-2">
  //             <Loader2 className="h-4 w-4 animate-spin" />
  //             <span className="text-sm text-gray-500">
  //               {t("pagination.loading_more")}
  //             </span>
  //           </div>
  //         </div>
  //       )}
  //     </div>
  //   );
  // };

  // Render jobs content
  const renderJobsContent = (passedJobs?: Doc<"job">[]) => {
    // Use jobs from context
    const currentJobs = content?.type === "jobs" ? jobs : passedJobs;

    if (loading) {
      return (
        <div className="flex flex-col gap-3 p-4">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      );
    }

    if (!currentJobs || currentJobs.length === 0) {
      return (
        <div className="flex items-center justify-center h-32">
          <h3 className="text-gray-600">
            {t("jobs.no_jobs", "No jobs available")}
          </h3>
        </div>
      );
    }

    // Extract the job data from the wrapper documents and reverse to show newest first
    const jobItems = [...currentJobs].reverse().map((wrapper) => wrapper.job);

    // Categorize jobs based on which component to use
    const compactJobs = jobItems.filter((job) => shouldUseCompactCard(job));
    const ingestionJobs = jobItems.filter((job) => shouldUseIngestionCard(job));
    const regularJobs = jobItems.filter(
      (job) => !shouldUseCompactCard(job) && !shouldUseIngestionCard(job),
    );
    return (
      <div
        className="w-full h-full overflow-auto scrollbar-thin scrollbar-track-transparent"
        ref={scrollContainerRef}
        onScrollCapture={(e) => handleScroll(e)}
      >
        <div
          className="p-4 space-y-6"
          style={{ maxHeight: "calc(100vh - 120px)" }}
          ref={contentContainerRef}
        >
          {compactJobs.length > 0 && (
            <div className="space-y-4">
              {compactJobs.map((job) => (
                <CompactJobCard
                  key={job.id}
                  job={job}
                  name={`${job.type.split("_").join(" ")} #${job.id.substring(0, 8)}`}
                />
              ))}
            </div>
          )}

          {ingestionJobs.length > 0 && (
            <div>
              <div className="space-y-4">
                {ingestionJobs.map((job) => (
                  <IngestionJobCard
                    key={job.id}
                    {...createIngestionJobProps(job)}
                  />
                ))}
              </div>
            </div>
          )}

          {regularJobs.length > 0 && (
            <div>
              <div className="space-y-4">
                {regularJobs.map((job) => (
                  <JobCard
                    key={job.id}
                    job={job}
                    onCancel={(id) => console.log(`Cancel job ${id}`)}
                    onViewDetails={(id) =>
                      console.log(`View details for job ${id}`)
                    }
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {content?.type === "jobs" && jobsLoading && (
          <div className="flex justify-center py-4">
            <div className="flex items-center space-x-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm text-gray-500">
                {t("pagination.loading_more")}
              </span>
            </div>
          </div>
        )}
      </div>
    );
  };

  let sidebarContent: React.ReactNode = null;
  let sidebarTitle = "";
  let sidebarWidth = "500px";

  if (content) {
    switch (content.type) {
      case "media":
        sidebarContent = renderMediaContent(content.fileName);
        sidebarTitle = t("grid.media_sidebar.file_preview_title");
        break;
      // case "logs":
      //   sidebarContent = renderLogsContent(content.logData);
      //   sidebarTitle = t("logs_page.title");
      //   break;
      case "jobs":
        sidebarContent = renderJobsContent(content.jobData);
        sidebarTitle = t("jobs.title", "Jobs");
        sidebarWidth = "600px"; // Wider sidebar for job cards
        break;
      case "chat":
        sidebarContent = <DataChat />;
        sidebarTitle = t("chat.title");
        sidebarWidth = "600px"; // Wider for better chat experience
        break;
      case "markdown":
        sidebarContent = renderMarkdownContent(content.data);
        sidebarTitle = t("markdown.title", "Markdown");
        sidebarWidth = "auto";
        break;
      case "custom":
        sidebarContent = content.content;
        sidebarTitle = content.title;
        sidebarWidth = content.width || "500px";
        break;
      default:
        sidebarContent = <p className="p-4">{t("sidebar.unknown_type")}</p>;
        sidebarTitle = t("sidebar.default_title");
    }
  }

  return (
    <SidebarContext.Provider value={{ openSidebar, closeSidebar }}>
      {children}

      {/* Universal Sidebar */}
      <UniversalSidebar
        isOpen={isOpen}
        onClose={closeSidebar}
        title={sidebarTitle}
        width={sidebarWidth}
      >
        {sidebarContent}
      </UniversalSidebar>
    </SidebarContext.Provider>
  );
};

// Hook to use the sidebar from any component
export const useSidebar = () => {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return context;
};

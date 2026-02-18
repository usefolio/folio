import type React from "react";
import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  ChevronDown,
  ChevronRight,
  Copy,
  Calendar,
  Loader2,
} from "lucide-react";
import { usePaginatedQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { LogLevel, LogEntry, TimeWindow } from "@/types/types";
import { useTranslation } from "react-i18next";

const getSeverityColor = (severity: LogLevel) => {
  switch (severity) {
    case "ERROR":
      return "text-red-600 bg-red-500/10 border border-red-500/20";
    case "WARN":
      return "text-yellow-600 bg-yellow-500/10 border border-yellow-500/20";
    case "INFO":
      return "text-blue-600 bg-blue-500/10 border border-blue-500/20";
    case "DEBUG":
      return "text-muted-foreground bg-muted/50 border border-border";
    case "TRACE":
      return "text-purple-600 bg-purple-500/10 border border-purple-500/20";
    default:
      return "text-muted-foreground bg-muted/50 border border-border";
  }
};

const formatTimestamp = (timestamp: number) => {
  const date = new Date(timestamp);
  const mo = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  const ms = String(date.getMilliseconds()).padStart(3, "0");
  return `${mo}/${d} ${h}:${m}:${s}.${ms}`;
};

const LogRow = ({
  log,
  isExpanded,
  onToggle,
}: {
  log: LogEntry;
  isExpanded: boolean;
  onToggle: () => void;
}) => {
  const copyToClipboard = (text: string) => navigator.clipboard.writeText(text);
  const { t } = useTranslation();
  return (
    <div className="border-b border-border">
      <div
        className="flex items-center px-4 py-2 hover:bg-muted/50 cursor-pointer"
        onClick={onToggle}
      >
        <div className="flex items-center w-4 mr-2 flex-shrink-0">
          {isExpanded ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
          )}
        </div>
        <div className="flex-1 grid grid-cols-12 gap-4 text-sm min-w-0">
          <div className="col-span-3 font-mono text-xs text-muted-foreground truncate mt-[2px]">
            {formatTimestamp(log.timestamp)}
          </div>
          <div className="col-span-1 flex-shrink-0">
            <span
              className={`px-2 py-0.5 text-[10px] font-medium ${getSeverityColor(log.severity)}`}
            >
              {log.severity}
            </span>
          </div>
          <div className="col-span-2 text-xs text-foreground truncate font-medium mt-[2px]">
            {log.service}
          </div>
          <div className="col-span-6 text-xs text-foreground truncate">
            {log.message}
          </div>
        </div>
      </div>
      {isExpanded && (
        <div className="px-4 pb-4 bg-muted/30 border-t border-border">
          <div className="ml-6 space-y-3 pt-3 font-mono text-xs">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-foreground flex items-center gap-2">
                <span className="text-sm">{t("logs_page.full_log_entry")}</span>
                <span className="text-xs text-muted-foreground bg-border px-2 py-0.5">
                  {t("logs_page.log_id", { id: log._id })}
                </span>
              </h4>
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  copyToClipboard(JSON.stringify(log, null, 2));
                }}
                className="h-8 px-2 text-xs rounded-md"
              >
                <Copy className="h-3 w-3 mr-1" /> {t("logs_page.copy_json")}
              </Button>
            </div>
            <div>
              <span className="font-medium text-sm">
                {t("logs_page.message_label")}
              </span>
              <div className="mt-1 p-3 bg-background border border-border text-xs text-foreground whitespace-pre-wrap">
                {log.message}
              </div>
            </div>
            {log.attributes && Object.keys(log.attributes).length > 0 && (
              <div>
                <span className="font-medium text-muted-foreground">
                  {t("logs_page.attributes")}
                </span>
                <div className="mt-1 p-3 bg-background border border-border">
                  <pre className="text-xs whitespace-pre-wrap overflow-x-auto">
                    {JSON.stringify(log.attributes, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export function LogBrowser() {
  const { results, status, loadMore } = usePaginatedQuery(
    api.logs.getPaginated,
    {},
    { initialNumItems: 50 },
  );
  const logs = results || [];
  const { t } = useTranslation();
  const [filteredLogs, setFilteredLogs] = useState<LogEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [timeWindow, setTimeWindow] = useState<TimeWindow>("24h");
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // NOTE: Live tail functionality is disabled for this implementation, we get data live from convex anyway
  // const [isLiveTail, setIsLiveTail] = useState(false);

  const isLoadingMore = status === "LoadingMore";
  const isInitialLoading = status === "LoadingFirstPage";
  const canLoadMore = status === "CanLoadMore";

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let processedLogs = [...logs];
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      processedLogs = processedLogs.filter((log) =>
        JSON.stringify(log).toLowerCase().includes(query),
      );
    }
    const now = new Date();
    if (timeWindow !== "custom") {
      let startTime: Date;
      switch (timeWindow) {
        case "5m":
          startTime = new Date(now.getTime() - 5 * 60 * 1000);
          break;
        case "1h":
          startTime = new Date(now.getTime() - 60 * 60 * 1000);
          break;
        case "24h":
          startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
      }
      processedLogs = processedLogs.filter(
        (log) => new Date(log.timestamp) >= startTime,
      );
    }
    setFilteredLogs(processedLogs);
  }, [logs, searchQuery, timeWindow]);

  const toggleRowExpansion = (id: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) newExpanded.delete(id);
    else newExpanded.add(id);
    setExpandedRows(newExpanded);
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop - clientHeight < 200 && canLoadMore) {
      loadMore(50);
    }
  };

  const renderContent = () => {
    if (isInitialLoading) {
      return (
        <div className="flex items-center justify-center h-full text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          <span>{t("logs_page.loading")}</span>
        </div>
      );
    }
    if (filteredLogs.length === 0) {
      return (
        <div className="flex text-sm p-24 items-center justify-center h-full text-muted-foreground">
          <span>{t("logs_page.no_logs_found")}</span>
        </div>
      );
    }
    return (
      <div
        ref={scrollContainerRef}
        className="h-full overflow-y-auto scrollbar-thin"
        onScroll={handleScroll}
      >
        {filteredLogs.map((log) => (
          <LogRow
            key={log._id}
            log={log}
            isExpanded={expandedRows.has(log._id)}
            onToggle={() => toggleRowExpansion(log._id)}
          />
        ))}
        {isLoadingMore && (
          <div className="text-center p-4 text-sm text-muted-foreground">
            {t("logs_page.loading_more")}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="bg-background w-full h-full flex flex-col">
      {/* Filters */}
      <div className="flex items-center gap-4 p-4 bg-muted/50 border border-border">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("logs_page.search_placeholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-8 text-sm rounded-md"
          />
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <Select
            value={timeWindow}
            onValueChange={(value) => setTimeWindow(value as TimeWindow)}
          >
            <SelectTrigger className="w-40 h-8 text-sm rounded-md">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-md">
              <SelectItem className="rounded-md" value="5m">
                {t("logs_page.time_window_5m")}
              </SelectItem>
              <SelectItem className="rounded-md" value="1h">
                {t("logs_page.time_window_1h")}
              </SelectItem>
              <SelectItem className="rounded-md" value="24h">
                {t("logs_page.time_window_24h")}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Header */}
      <div className="border-x border-border">
        <div className="px-4 py-2 bg-muted/50">
          <div className="flex items-center">
            <div className="w-6 mr-2"></div>
            <div className="flex-1 grid grid-cols-12 gap-4 text-xs font-medium text-muted-foreground">
              <div className="col-span-3">
                {t("logs_page.header_timestamp")}
              </div>
              <div className="col-span-1">{t("logs_page.header_level")}</div>
              <div className="col-span-2">{t("logs_page.header_service")}</div>
              <div className="col-span-6">{t("logs_page.header_message")}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 border border-border relative min-h-0">
        {renderContent()}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 bg-muted/50 border-x border-b border-border flex items-center justify-between text-xs text-muted-foreground">
        <div>
          {t("logs_page.showing_logs", { count: filteredLogs.length })}{" "}
          {searchQuery && t("logs_page.matching_query", { query: searchQuery })}
        </div>
        <div>
          {canLoadMore
            ? t("logs_page.scroll_for_more")
            : t("logs_page.all_logs_loaded")}
        </div>
      </div>
    </div>
  );
}

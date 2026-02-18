import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { Clock, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import Tag from "../tags/tag";
import { Job } from "../../types/jobs";

interface CompactJobCardProps {
  job: Job;
  name: string;
}

export function CompactJobCard({ job, name }: CompactJobCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const timestamp = new Date(job.createdAt);
  const progress = job.progress
    ? ((job.progress.completedCount as number) /
        (job.progress.totalCount || 1)) *
      100
    : 0;
  // const triggeredBy = job.createdBy;
  const status = job.state;
  const scheduledCompletionTime = job.expectedCompletionAt
    ? new Date(job.expectedCompletionAt)
    : undefined;
  const totalRecords = job.progress?.totalCount;
  const inputTokens = job.tokenUsage?.inputTokens;
  const outputTokens = job.tokenUsage?.outputTokens;
  const totalCost = job.tokenUsage?.totalCost;
  const errorMessage = job.errorReason || job.cancellationReason;

  const metrics = [
    {
      label: "Processed",
      value: job.progress?.completedCount || 0,
    },
    {
      label: "Total",
      value: job.progress?.totalCount || 0,
    },
  ];

  // Type guard to check if parameters has prompt property
  const hasPrompt = (params: any): params is { prompt?: string } => {
    return params && "prompt" in params;
  };

  // Type guard to check if parameters has filter property
  const hasFilter = (params: any): params is { filter?: string } => {
    return params && "filter" in params;
  };

  // Determine job details structure based on job type
  const getJobDetails = () => {
    if (job.parameters) {
      if (job.type === "FILTERING_DATA" && hasFilter(job.parameters)) {
        return {
          conditions: job.parameters.filter || "No filter conditions",
        };
      } else if (job.type === "ENRICHING_DATA" && hasPrompt(job.parameters)) {
        return {
          categories: [],
          userPromptTemplate: job.parameters.prompt || "",
        };
      }
    }
    return null;
  };

  const jobDetails = getJobDetails();

  const statusColors = {
    SCHEDULED: "bg-blue-50 text-blue-700 border-blue-200",
    PENDING: "bg-amber-50 text-amber-700 border-amber-200",
    IN_PROGRESS: "bg-cyan-50 text-cyan-700 border-cyan-200",
    SUCCESS: "bg-emerald-50 text-emerald-700 border-emerald-200",
    PARTIAL_SUCCESS: "bg-yellow-50 text-yellow-700 border-yellow-200",
    FAILURE: "bg-red-50 text-red-700 border-red-200",
    CANCELED: "bg-gray-50 text-gray-700 border-gray-200",
  };

  const renderJobDetails = () => {
    if (!jobDetails) {
      return (
        <div className="text-xs text-muted-foreground">
          No details available
        </div>
      );
    }

    if (job.type === "FILTERING_DATA") {
      const filter = jobDetails as { conditions: string };
      return (
        <div>
          <h2 className="text-xs font-medium mb-1">Filter:</h2>
          <div className="bg-gray-50 p-2 rounded-sm overflow-x-auto">
            <code className="text-xs whitespace-nowrap break-all font-mono">
              {filter.conditions}
            </code>
          </div>
        </div>
      );
    } else {
      const prompt = jobDetails as {
        categories: string[];
        userPromptTemplate: string;
      };
      return (
        <>
          {prompt.categories.length > 0 && (
            <div>
              <h4 className="text-xs font-medium mb-2">Tags:</h4>
              <div className="flex flex-wrap gap-1">
                {prompt.categories.map((category, index) => (
                  <Tag key={index} tag={category}>
                    {category}
                  </Tag>
                ))}
              </div>
            </div>
          )}
          {prompt.userPromptTemplate && (
            <div>
              <h4 className="text-xs font-medium mb-1">Prompt:</h4>
              <p className="text-xs bg-gray-50 p-2 rounded-sm whitespace-pre-wrap">
                {prompt.userPromptTemplate}
              </p>
            </div>
          )}
        </>
      );
    }
  };

  const hasError = jobDetails && errorMessage;
  const hasPromptContent =
    jobDetails &&
    job.type === "ENRICHING_DATA" &&
    (jobDetails as { categories: string[]; userPromptTemplate: string })
      .userPromptTemplate.length === 0;
  const thereIsDataToDisplay = hasPromptContent || hasError;

  return (
    <Card className="overflow-hidden border rounded-md">
      <div className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Badge
                variant="secondary"
                className="px-1 py-[1.5px] rounded-none font-semibold text-[10px] bg-gray-100 text-gray-800"
              >
                {job.type.split("_").join(" ")}
              </Badge>
              <h3 className="text-xs font-medium truncate">{name}</h3>
            </div>
            <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" />
              <span>{formatDistanceToNow(timestamp, { addSuffix: true })}</span>
              <span className="w-1 h-1 bg-muted-foreground rounded-full"></span>
              {/** temporarily hide trigger attribution until design is finalized */}
              {/* <span>triggered by {triggeredBy}</span> */}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Badge
              variant="secondary"
              className={cn(
                "text-[10px] px-1 py-[1.5px] rounded-none font-[550]",
                statusColors[status],
              )}
            >
              {status}
            </Badge>
            {status === "SCHEDULED" && scheduledCompletionTime && (
              <span className="text-[10px] text-muted-foreground">
                {format(scheduledCompletionTime, "MMM d, HH:mm")}
              </span>
            )}
          </div>

          {status === "SCHEDULED" ? (
            <div className="grid grid-cols-1 gap-2">
              <div className="flex items-center justify-between px-2 py-1 bg-gray-50">
                <span className="text-xs text-muted-foreground">
                  To be processed
                </span>
                <span className="text-xs">
                  {totalRecords?.toLocaleString() || "N/A"}
                </span>
              </div>
            </div>
          ) : (
            <>
              <Progress
                value={progress}
                className="h-1.5 rounded-md w-full"
                indicatorColor="bg-black"
              />
              <div className="grid grid-cols-2 gap-2">
                {metrics.map((metric, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between px-2 py-1 bg-gray-50"
                  >
                    <span className="text-xs text-muted-foreground">
                      {metric.label}
                    </span>
                    <span className="text-[11px]">
                      {metric.value.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 mt-2 border-t">
          {inputTokens !== undefined &&
            outputTokens !== undefined &&
            totalCost !== undefined && (
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className="px-1 py-[1.5px] rounded-none font-semibold font-mono text-xs token-badge"
                >
                  {inputTokens.toLocaleString()} input tokens
                </Badge>
                <Badge
                  variant="outline"
                  className="px-1 py-[1.5px] rounded-none font-semibold font-mono text-xs token-badge"
                >
                  {outputTokens.toLocaleString()} output tokens
                </Badge>
                <Badge
                  variant="outline"
                  className="px-1 py-[1.5px] rounded-none font-semibold font-mono text-xs token-badge"
                >
                  ${totalCost.toLocaleString()}
                </Badge>
              </div>
            )}
          <Button
            variant="ghost"
            size="sm"
            className="rounded-md h-5 px-3 py-2 text-xs ml-auto"
            onClick={() => setIsExpanded(!isExpanded)}
            disabled={Boolean(!thereIsDataToDisplay)}
          >
            {isExpanded ? (
              <>
                Hide Details
                <ChevronUp className="ml-1 h-4 w-4" />
              </>
            ) : (
              <>
                View Details
                <ChevronDown className="ml-1 h-4 w-4" />
              </>
            )}
          </Button>
        </div>

        {/* Expanded Details */}
        {isExpanded && (
          <div className="mt-4 space-y-3 border-t pt-4">
            {errorMessage && (
              <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-2 text-xs flex items-start">
                <AlertTriangle className="h-4 w-4 mr-2" />
                <span>{errorMessage}</span>
              </div>
            )}
            {renderJobDetails()}
          </div>
        )}
      </div>
    </Card>
  );
}

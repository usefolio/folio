import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  CheckCircle,
  Clock,
  AlertTriangle,
  Loader2,
  PlayCircle,
  StopCircle,
  XCircle,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Job, JobState } from "@/types/jobs";

// Helper function to get state icon
export const getStateIcon = (state: JobState) => {
  switch (state) {
    case "SCHEDULED":
      return <Clock className="h-4 w-4 text-blue-500" />;
    case "PENDING":
      return <PlayCircle className="h-4 w-4 text-amber-500" />;
    case "IN_PROGRESS":
      return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
    case "SUCCESS":
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    case "PARTIAL_SUCCESS":
      return <AlertCircle className="h-4 w-4 text-amber-500" />;
    case "FAILURE":
      return <XCircle className="h-4 w-4 text-red-500" />;
    case "CANCELED":
      return <StopCircle className="h-4 w-4 text-gray-500" />;
  }
};

// Helper function to get state color
const getStateColor = (state: JobState) => {
  switch (state) {
    case "SCHEDULED":
      return "bg-blue-100 text-blue-800 border-blue-300";
    case "PENDING":
      return "bg-amber-100 text-amber-800 border-amber-300";
    case "IN_PROGRESS":
      return "bg-blue-100 text-blue-800 border-blue-300";
    case "SUCCESS":
      return "bg-green-100 text-green-800 border-green-300";
    case "PARTIAL_SUCCESS":
      return "bg-amber-100 text-amber-800 border-amber-300";
    case "FAILURE":
      return "bg-red-100 text-red-800 border-red-300";
    case "CANCELED":
      return "bg-gray-100 text-gray-800 border-gray-300";
  }
};

// Helper function to format job type for display
const formatJobType = (type: string) => {
  switch (type) {
    case "ENRICHING_DATA":
      return "Enriching Data";
    case "FILTERING_DATA":
      return "Filtering Data";
    default:
      return type.split("_").join(" ");
  }
};

interface JobCardProps {
  job: Job;
  onCancel?: (id: string) => void;
  onViewDetails?: (id: string) => void;
}

export function JobCard({ job, onCancel, onViewDetails }: JobCardProps) {
  const canCancel =
    job.state === "SCHEDULED" ||
    job.state === "PENDING" ||
    job.state === "IN_PROGRESS";
  const isCompleted = [
    "SUCCESS",
    "PARTIAL_SUCCESS",
    "FAILURE",
    "CANCELED",
  ].includes(job.state);
  const hasProgress = job.progress && job.progress.totalCount !== undefined;
  const progressPercentage = hasProgress
    ? Math.round(
        ((job?.progress?.completedCount as number) /
          (job?.progress?.totalCount as number)) *
          100,
      )
    : job.state === "IN_PROGRESS"
      ? 50
      : isCompleted
        ? 100
        : 0;

  return (
    <Card
      className={cn(
        "w-full transition-all",
        job.state === "FAILURE" && "border-red-300",
        job.state === "SUCCESS" && "border-green-300",
        job.state === "PARTIAL_SUCCESS" && "border-amber-300",
      )}
    >
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className={cn(
                  "px-1 py-[1.5px] rounded-none font-[550]",
                  getStateColor(job.state),
                )}
              >
                <span className="flex items-center gap-1 text-[10px]">
                  {getStateIcon(job.state)}
                  {job.state}
                </span>
              </Badge>
              <Badge
                variant="secondary"
                className="px-1 py-[1.5px] rounded-none font-[550]"
              >
                {formatJobType(job.type)}
              </Badge>
            </div>
            <h2 className="text-sm font-medium mt-2">
              Job #{job.id.substring(0, 8)}
            </h2>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pb-2">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <p className="text-muted-foreground">Created</p>
              <p>
                {formatDistanceToNow(new Date(job.createdAt), {
                  addSuffix: true,
                })}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Last Updated</p>
              <p>
                {formatDistanceToNow(new Date(job.updatedAt), {
                  addSuffix: true,
                })}
              </p>
            </div>
            {job.scheduledStartAt && (
              <div>
                <p className="text-muted-foreground">Scheduled Start</p>
                <p>
                  {formatDistanceToNow(new Date(job.scheduledStartAt), {
                    addSuffix: true,
                  })}
                </p>
              </div>
            )}
            {job.expectedCompletionAt && (
              <div>
                <p className="text-muted-foreground">Expected Completion</p>
                <p>
                  {formatDistanceToNow(new Date(job.expectedCompletionAt), {
                    addSuffix: true,
                  })}
                </p>
              </div>
            )}
          </div>

          {hasProgress && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span>Progress</span>
                <span>
                  {job?.progress?.completedCount as number} /{" "}
                  {job?.progress?.totalCount}
                </span>
              </div>
              <Progress
                value={progressPercentage}
                indicatorColor="bg-black"
                className="h-2 rounded-md"
              />
            </div>
          )}

          {job.tokenUsage && (
            <div className="text-xs">
              <p className="text-muted-foreground">Token Usage</p>
              <Badge
                variant="outline"
                className="rounded-none px-1.5 py-0.5 font-mono text-xs token-badge font-semibold mt-2"
              >
                <p className="font-mono">
                  {job.tokenUsage.totalTokens.toLocaleString()} tokens
                </p>
              </Badge>
            </div>
          )}

          {(job.errorReason || job.cancellationReason) && (
            <div className="text-xs">
              <p className="text-muted-foreground">
                {job.errorReason ? "Error" : "Cancellation"} Reason
              </p>
              <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-2 text-xs flex items-start mt-2">
                <AlertTriangle className="h-4 w-4 mr-2" />
                <span>{job.errorReason || job.cancellationReason}</span>
              </div>
            </div>
          )}
        </div>
      </CardContent>
      <CardFooter className="pt-2">
        <div className="flex justify-between w-full">
          <div className="text-xs text-muted-foreground">
            Created by: {job.createdBy}
          </div>
          <div className="flex gap-2">
            {onViewDetails && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onViewDetails(job.id)}
                className="rounded-md h-5 px-3 py-2 text-xs"
              >
                View Details
              </Button>
            )}
            {canCancel && onCancel && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onCancel(job.id)}
                className="text-red-500 hover:text-red-700 hover:bg-red-50 rounded-md h-5 px-3 py-2 text-xs"
              >
                Cancel
              </Button>
            )}
          </div>
        </div>
      </CardFooter>
    </Card>
  );
}

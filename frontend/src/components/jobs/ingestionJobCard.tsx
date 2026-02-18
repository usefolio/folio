import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, ChevronDown, ChevronUp } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Job } from "@/types/jobs";

interface IngestionJobCardProps {
  connectorName: string;
  lastRunTime: Date;
  runsInPast2Hours: number;
  recordsInPast12Runs: number;
  runs: Array<{ success: boolean; records: number }>;
  onViewDetails?: () => void;
}

export const createIngestionJobProps = (job: Job): IngestionJobCardProps => {
  const connectorName = `Connector ${job.id.substring(0, 8)}`;
  const lastRunTime = new Date(job.updatedAt);
  const runsInPast2Hours = job.progress?.completedCount || 0;
  const recordsInPast12Runs = job.progress?.totalCount || 0;

  const runs = [
    {
      success: job.state === "SUCCESS" || job.state === "PARTIAL_SUCCESS",
      records: job.progress?.completedCount || 0,
    },
  ];

  return {
    connectorName,
    lastRunTime,
    runsInPast2Hours,
    recordsInPast12Runs,
    runs,
    onViewDetails: () => console.log(`View details for ${job.id}`),
  };
};

export function IngestionJobCard({
  connectorName,
  lastRunTime,
  runsInPast2Hours,
  recordsInPast12Runs,
  runs,
}: IngestionJobCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const successfulRuns = runs.filter((run) => run.success).length;
  const failedRuns = runs.length - successfulRuns;
  const maxRecords = Math.max(...runs.map((run) => run.records), 1); // Prevent division by zero
  const successRate =
    runs.length > 0 ? ((successfulRuns / runs.length) * 100).toFixed(1) : "0.0";

  const getBarHeight = (records: number) => {
    return records > 0 ? Math.max((records / maxRecords) * 40, 4) : 0; // Minimum height of 4px for visibility
  };

  return (
    <Card className="overflow-hidden border rounded-md">
      <div className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Badge
                variant="secondary"
                className="rounded-none px-1.5 py-0.5 text-[10px] bg-gray-100 text-gray-800"
              >
                INGESTION
              </Badge>
              <h2 className="text-xs font-medium truncate">{connectorName}</h2>
            </div>
            <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" />
              <span>
                Last run {formatDistanceToNow(lastRunTime, { addSuffix: true })}
              </span>
              <span className="w-1 h-1 bg-muted-foreground rounded-md"></span>
              <span>{runsInPast2Hours} runs in 2h</span>
              <span className="w-1 h-1 bg-muted-foreground rounded-md"></span>
              <span>{successRate}% success rate</span>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="space-y-2">
          <div className="h-10 flex items-end space-x-0.5">
            {runs.map((run, index) => (
              <div
                key={index}
                className={`w-1.5 rounded-md ${
                  run.success
                    ? "bg-green-100 border-green-300"
                    : "bg-red-100 border-red-300"
                }`}
                style={{
                  height: `${getBarHeight(run.records)}px`,
                  borderTop: run.success
                    ? "2px solid #4ade80"
                    : "2px solid #f87171",
                }}
              ></div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center justify-between px-2 py-1 bg-gray-50">
              <span className="text-xs text-muted-foreground">Successful</span>
              <span className="text-xs">{successfulRuns}</span>
            </div>
            <div className="flex items-center justify-between px-2 py-1 bg-gray-50">
              <span className="text-xs text-muted-foreground">Failed</span>
              <span className="text-xs">{failedRuns}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 mt-2 border-t">
          <div className="text-xs text-muted-foreground">
            {recordsInPast12Runs.toLocaleString()} records in 12 runs
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 rounded-md text-xs px-3 py-2"
            onClick={() => setIsExpanded(!isExpanded)}
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
            <p className="text-xs">
              Successful records:{" "}
              {runs
                .filter((run) => run.success)
                .reduce((sum, run) => sum + run.records, 0)
                .toLocaleString()}
            </p>
            <p className="text-xs">
              Failed records:{" "}
              {runs
                .filter((run) => !run.success)
                .reduce((sum, run) => sum + run.records, 0)
                .toLocaleString()}
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}

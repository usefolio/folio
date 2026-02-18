import { Badge } from "@/components/ui/badge";
import { Job, JobType } from "@/types/jobs";

interface EnrichmentDataProps {
  enrichingData: number;
  filteringData: number;
  state: "active" | "inactive" | "pending" | "completed";
  title: string;
  jobType: JobType;
}

export const createEnrichmentDataProps = (
  jobs: Job[],
  title: string,
): EnrichmentDataProps => {
  const enrichingData = jobs.filter(
    (job) => job.type === "ENRICHING_DATA",
  ).length;
  const filteringData = jobs.filter(
    (job) => job.type === "FILTERING_DATA",
  ).length;

  let jobType: JobType =
    enrichingData >= filteringData ? "ENRICHING_DATA" : "FILTERING_DATA";

  const hasActiveJobs = jobs.some(
    (job) =>
      job.state === "IN_PROGRESS" ||
      job.state === "PENDING" ||
      job.state === "SCHEDULED",
  );
  const hasPendingJobs = jobs.some((job) => job.state === "SCHEDULED");
  const hasCompletedJobs = jobs.some(
    (job) => job.state === "SUCCESS" || job.state === "PARTIAL_SUCCESS",
  );

  let state: "active" | "inactive" | "pending" | "completed" = "inactive";

  if (hasActiveJobs) state = "active";
  else if (hasPendingJobs) state = "pending";
  else if (hasCompletedJobs) state = "completed";

  return {
    enrichingData,
    filteringData,
    state,
    title,
    jobType,
  };
};

const stateColors = {
  active: "bg-green-100 text-green-800",
  inactive: "bg-gray-100 text-gray-800",
  pending: "bg-yellow-100 text-yellow-800",
  completed: "bg-blue-100 text-blue-800",
};

export function EnrichmentDataCard({
  enrichingData,
  filteringData,
  state,
  title,
  jobType,
}: EnrichmentDataProps) {
  return (
    <div className="bg-white shadow-sm rounded-lg p-4 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-2 text-sm">
        <div className="flex items-center space-x-2">
          <Badge
            variant="secondary"
            className="text-xs px-1 py-[1.5px] rounded-none font-[550]"
          >
            {jobType.replace("_", " ")}
          </Badge>
          <Badge
            className={`${stateColors[state]} text-xs px-1 py-[1.5px] rounded-none font-[550]`}
          >
            {state}
          </Badge>
        </div>
      </div>
      <div className="flex items-center space-x-2 mb-2 text-sm">
        <Badge variant="outline" className="text-xs font-mono">
          ED: {enrichingData}
        </Badge>
        <Badge variant="outline" className="text-xs font-mono">
          FD: {filteringData}
        </Badge>
      </div>
      <h3 className="text-lg font-semibold text-gray-800 truncate">{title}</h3>
    </div>
  );
}

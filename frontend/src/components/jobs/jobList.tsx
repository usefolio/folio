import { useState } from "react";
import { JobCard } from "./jobCard";
import { Job, JobState, JobType } from "@/types/jobs";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface JobListProps {
  jobs: Job[];
  onCancelJob?: (id: string) => void;
  onViewJobDetails?: (id: string) => void;
}

export function JobList({
  jobs = [],
  onCancelJob,
  onViewJobDetails,
}: JobListProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [stateFilter, setStateFilter] = useState<JobState | "ALL">("ALL");
  const [typeFilter, setTypeFilter] = useState<JobType | "ALL">("ALL");

  const filteredJobs = jobs.filter((job) => {
    const matchesSearch =
      job.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      job.createdBy.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesState = stateFilter === "ALL" || job.state === stateFilter;
    const matchesType = typeFilter === "ALL" || job.type === typeFilter;

    return matchesSearch && matchesState && matchesType;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1">
          <Input
            placeholder="Search by ID or creator..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full"
          />
        </div>
        <div className="flex gap-2">
          <Select
            value={stateFilter}
            onValueChange={(value) => setStateFilter(value as JobState | "ALL")}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by state" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All States</SelectItem>
              <SelectItem value="SCHEDULED">Scheduled</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
              <SelectItem value="SUCCESS">Success</SelectItem>
              <SelectItem value="PARTIAL_SUCCESS">Partial Success</SelectItem>
              <SelectItem value="FAILURE">Failure</SelectItem>
              <SelectItem value="CANCELED">Canceled</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={typeFilter}
            onValueChange={(value) => setTypeFilter(value as JobType | "ALL")}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Types</SelectItem>
              <SelectItem value="ENRICHMENT_CREATION">
                Enrichment Creation
              </SelectItem>
              <SelectItem value="ENRICHMENT_POPULATION">
                Enrichment Population
              </SelectItem>
              <SelectItem value="VIEW_CREATION">View Creation</SelectItem>
              <SelectItem value="VIEW_POPULATION">View Population</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {filteredJobs.length === 0 ? (
        <div className="text-center py-12 border rounded-lg bg-muted/20">
          <p className="text-muted-foreground">
            No jobs found matching your filters
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredJobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              onCancel={onCancelJob}
              onViewDetails={onViewJobDetails}
            />
          ))}
        </div>
      )}
    </div>
  );
}

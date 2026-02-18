import type { Meta, StoryObj } from "@storybook/react-vite";
import { SidebarProvider, useSidebar } from "./SidebarManager";
import { Button } from "@/components/ui/button";
import { Doc, Id } from "../../../convex/_generated/dataModel";
import { JobState, JobType } from "@/types/jobs";

// Mock Data
const mockProject = {
  _id: "proj1" as Id<"project">,
  name: "Q3 Financials",
  _creationTime: 0,
  owner: "user_1",
};
const mockSheet = {
  _id: "sheet1" as Id<"sheet">,
  name: "Main Sheet",
  _creationTime: 0,
  project_id: mockProject._id,
  filter: "1=1",
  hidden: [],
};

// Mock Jobs Data
const mockJobs: Doc<"job">[] = [
  {
    _id: "job1" as Id<"job">,
    _creationTime: Date.now(),
    project_id: mockProject._id,
    job: {
      id: "job_enrich_1",
      type: "ENRICHING_DATA" as JobType,
      state: "SUCCESS" as JobState,
      parameters: { prompt: "Categorize sentiment" },
      createdBy: "user_1",
      createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date().toISOString(),
      progress: { completedCount: 100, totalCount: 100 },
    },
  },
];

// Interactive Story Component
const SidebarStoryUIRunner = () => {
  const { openSidebar } = useSidebar();
  return (
    <div className="flex h-screen w-full relative">
      <div className="flex-1 p-4">
        <h1 className="text-lg font-bold">Application Content</h1>
        <p>Click a button to open a sidebar from the right.</p>
        <div className="flex gap-2 mt-4">
          <Button
            className="rounded-md"
            onClick={() => openSidebar({ type: "jobs" })}
          >
            Open Jobs
          </Button>
        </div>
      </div>
    </div>
  );
};

const meta = {
  title: "Layout/Sidebar Manager",
  component: SidebarStoryUIRunner,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <SidebarProvider loading={false}>
        <Story />
      </SidebarProvider>
    ),
  ],
} satisfies Meta<typeof SidebarStoryUIRunner>;

export default meta;
type Story = StoryObj<typeof meta>;

// Story

export const Default: Story = {
  name: "Interactive Sidebar",
  parameters: {
    dataContext: {
      project: mockProject._id,
      sheet: mockSheet,
      loading: false,
      jobs: mockJobs,
    },
  },
};

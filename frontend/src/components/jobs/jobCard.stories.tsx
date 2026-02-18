import type { Meta, StoryObj } from "@storybook/react-vite";
import { JobCard } from "./jobCard";
import { Job, JobState, JobType } from "@/types/jobs";

// Helper to create mock job data
const createMockJob = (overrides: Partial<Job>): Job => {
  return {
    id: "job_12345678",
    type: "ENRICHING_DATA" as JobType,
    state: "IN_PROGRESS" as JobState,
    parameters: {},
    createdBy: "test-user",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    progress: { completedCount: 50, totalCount: 100 },
    ...overrides,
  };
};

const meta = {
  title: "Components/Jobs/JobCard",
  component: JobCard,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div style={{ width: "360px" }}>
        <Story />
      </div>
    ),
  ],
  argTypes: {
    job: { control: "object" },
  },
} satisfies Meta<typeof JobCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const InProgress: Story = {
  args: {
    job: createMockJob({
      state: "IN_PROGRESS",
      progress: { completedCount: 65, totalCount: 100 },
      tokenUsage: {
        totalTokens: 15000,
        inputTokens: 10000,
        outputTokens: 5000,
        totalCost: 0.045,
      },
    }),
  },
};

export const Scheduled: Story = {
  args: {
    job: createMockJob({
      state: "SCHEDULED",
      progress: { completedCount: 0, totalCount: 1000 },
      scheduledStartAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2 hours from now
      tokenUsage: undefined,
    }),
  },
};

export const Success: Story = {
  args: {
    job: createMockJob({
      state: "SUCCESS",
      progress: { completedCount: 100, totalCount: 100 },
      tokenUsage: {
        totalTokens: 25000,
        inputTokens: 15000,
        outputTokens: 10000,
        totalCost: 0.08,
      },
    }),
  },
};

export const Failure: Story = {
  args: {
    job: createMockJob({
      state: "FAILURE",
      progress: { completedCount: 30, totalCount: 100 },
      errorReason:
        "The API returned a 503 Service Unavailable error after 3 retries.",
      tokenUsage: {
        totalTokens: 8000,
        inputTokens: 5000,
        outputTokens: 3000,
        totalCost: 0.02,
      },
    }),
  },
};

export const Canceled: Story = {
  args: {
    job: createMockJob({
      state: "CANCELED",
      progress: { completedCount: 10, totalCount: 100 },
      cancellationReason: "Job was canceled by the user.",
      tokenUsage: undefined,
    }),
  },
};

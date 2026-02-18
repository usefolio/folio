import type { Meta, StoryObj } from "@storybook/react-vite";
import { CompactJobCard } from "./compactJobCard";
import { Job, JobState, JobType } from "@/types/jobs";

// Helper to create mock job data
const createMockJob = (overrides: Partial<Job>): Job => ({
  id: "job_compact_123",
  type: "ENRICHING_DATA" as JobType,
  state: "IN_PROGRESS" as JobState,
  parameters: {
    prompt: "Summarize the following text for sentiment analysis.",
  },
  createdBy: "test-user",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  progress: { completedCount: 50, totalCount: 100 },
  tokenUsage: {
    totalTokens: 15000,
    inputTokens: 10000,
    outputTokens: 5000,
    totalCost: 0.045,
  },
  ...overrides,
});

const meta = {
  title: "Components/Jobs/CompactJobCard",
  component: CompactJobCard,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div style={{ width: "500px" }}>
        <Story />
      </div>
    ),
  ],
  argTypes: {
    job: { control: "object" },
    name: { control: "text" },
  },
} satisfies Meta<typeof CompactJobCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const InProgress: Story = {
  args: {
    name: "Sentiment Analysis",
    job: createMockJob({
      state: "IN_PROGRESS",
      progress: { completedCount: 65, totalCount: 100 },
    }),
  },
};

export const Success: Story = {
  args: {
    name: "Data Categorization",
    job: createMockJob({
      state: "SUCCESS",
      progress: { completedCount: 100, totalCount: 100 },
    }),
  },
};

export const Failure: Story = {
  args: {
    name: "Entity Extraction",
    job: createMockJob({
      state: "FAILURE",
      progress: { completedCount: 30, totalCount: 100 },
      errorReason:
        "API endpoint returned status 500. Job failed after 3 attempts.",
    }),
  },
};

export const Scheduled: Story = {
  args: {
    name: "Scheduled Filtering Job",
    job: createMockJob({
      state: "SCHEDULED",
      type: "FILTERING_DATA",
      parameters: { filter: "status = 'active'" },
      progress: { completedCount: 0, totalCount: 1250 },
      tokenUsage: undefined,
      expectedCompletionAt: new Date(
        Date.now() + 3 * 60 * 60 * 1000,
      ).toISOString(),
    }),
  },
};

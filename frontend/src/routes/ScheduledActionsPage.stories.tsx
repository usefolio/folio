import type { Meta, StoryObj } from "@storybook/react-vite";
import ScheduledActionsPage from "./ScheduledActionsPage";
import { ConvexReactClient } from "convex/react";
import { ConvexProvider } from "convex/react";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

const meta = {
  title: "Pages/Scheduled Actions Page",
  component: ScheduledActionsPage,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <ConvexProvider client={convex}>
        <Story />
      </ConvexProvider>
    ),
  ],
  parameters: {
    convex: {
      "scheduled_actions.getPaginated": {
        data: [
          {
            _id: "1",
            _creationTime: Date.now(),
            searchQuery: "new AI startups",
            workflow: "Data Enrichment",
            interval: 24,
            intervalUnit: "hours",
            destinationType: "email",
            destination: "reports@company.com",
            outputFormat: "csv",
            isActive: true,
            totalRuns: 42,
            lastRun: "2025-08-05",
            nextRun: "2025-08-06",
            createdAt: new Date().toISOString(),
          },
          {
            _id: "2",
            _creationTime: Date.now(),
            searchQuery: "market sentiment",
            workflow: "Sentiment Analysis",
            interval: 15,
            intervalUnit: "minutes",
            destinationType: "api",
            destination: "https://hooks.slack.com/...",
            outputFormat: "markdown",
            prompt: '{"userPrompt":"Summarize the sentiment."}',
            isActive: false,
            totalRuns: 1021,
            lastRun: "2025-08-06",
            nextRun: "Paused",
            createdAt: new Date().toISOString(),
          },
        ],
        status: "Exhausted",
      },
    },
  },
} satisfies Meta<typeof ScheduledActionsPage>;

export default meta;
type Story = StoryObj<typeof ScheduledActionsPage>;
export const Default: Story = {
  parameters: {
    queryPath: "scheduled_actions.getPaginated",
  },
};
export const EmptyState: Story = {
  parameters: {
    queryPath: "scheduled_actions.getPaginated",
    convex: {
      "scheduled_actions.getPaginated": {
        data: [],
        status: "Exhausted",
      },
    },
  },
};

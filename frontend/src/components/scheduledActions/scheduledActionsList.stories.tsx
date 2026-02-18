import type { Meta, StoryObj } from "@storybook/react-vite";
import { ScheduledActionsList } from "./scheduledActionsList";
import { ConvexReactClient } from "convex/react";
import { ConvexProvider } from "convex/react";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

const meta = {
  title: "Components/Scheduled Actions/ScheduledActionsList",
  component: ScheduledActionsList,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <ConvexProvider client={convex}>
        <div className="w-full p-4 bg-muted/40">
          <Story />
        </div>
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
            createdAt: Date.now().toString(),
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
          },
          {
            _id: "2",
            _creationTime: Date.now(),
            searchQuery: "market sentiment",
            createdAt: Date.now().toString(),
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
          },
        ],
        status: "CanLoadMore",
      },
    },
  },
} satisfies Meta<typeof ScheduledActionsList>;

export default meta;
type Story = StoryObj<typeof ScheduledActionsList>;

export const Default: Story = {
  parameters: {
    queryPath: "scheduled_actions.getPaginated",
  },
};

export const Empty: Story = {
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

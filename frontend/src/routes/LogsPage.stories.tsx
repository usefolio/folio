import type { Meta, StoryObj } from "@storybook/react-vite";
import LogsPage from "./LogsPage";

const meta = {
  title: "Pages/Logs Page",
  component: LogsPage,
  tags: ["autodocs"],
  parameters: {
    convex: {
      "logs.getPaginated": {
        data: [
          {
            _id: "log1",
            _creationTime: Date.now(),
            severity: "INFO",
            message: "Successfully processed file: report.csv",
            timestamp: Date.now(),
            service: "FileProcessingService",
          },
          {
            _id: "log2",
            _creationTime: Date.now(),
            severity: "ERROR",
            message: "Failed to enrich column: Sentiment",
            details: "API key expired.",
            timestamp: Date.now() - 3600000,
            service: "EnrichmentService",
          },
          {
            _id: "log3",
            _creationTime: Date.now(),
            severity: "DEBUG",
            message: 'Scheduled action "Daily Report" completed.',
            timestamp: Date.now() - 7200000,
            service: "SchedulingService",
          },
        ],
        status: "Exhausted",
      },
    },
  },
} satisfies Meta<typeof LogsPage>;

export default meta;
type Story = StoryObj<typeof LogsPage>;

export const Default: Story = {
  parameters: {
    queryPath: "logs.getPaginated",
  },
};
export const EmptyState: Story = {
  parameters: {
    queryPath: "logs.getPaginated",
    convex: {
      "logs.getPaginated": {
        data: [],
        status: "Exhausted",
      },
    },
  },
};

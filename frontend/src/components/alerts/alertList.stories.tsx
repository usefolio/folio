import type { Meta, StoryObj } from "@storybook/react-vite";
import { AlertsList } from "./alertsList";
import { ConvexReactClient } from "convex/react";
import { ConvexProvider } from "convex/react";

// Mock Convex client for Storybook
const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

const meta = {
  title: "Components/Alerts/AlertsList",
  component: AlertsList,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <ConvexProvider client={convex}>
        <div className="w-full p-4 bg-gray-50">
          <Story />
        </div>
      </ConvexProvider>
    ),
  ],
  parameters: {
    // Mock the usePaginatedQuery hook
    convex: {
      "alerts.getPaginated": {
        data: [
          {
            _id: "1",
            _creationTime: Date.now(),
            name: "New AI Companies Alert",
            description: "Monitors for new companies in the AI sector.",
            conditions: "company_sector = 'AI' AND founded_date > '2024-01-01'",
            email: "alerts@company.com",
            totalTriggers: 14,
            isActive: true,
          },
          {
            _id: "2",
            _creationTime: Date.now(),
            name: "High Priority Issues",
            description: "Notifies when a high priority issue is logged.",
            conditions: "priority = 'High'",
            email: "dev-team@company.com",
            totalTriggers: 88,
            isActive: false,
          },
        ],
        status: "CanLoadMore",
      },
    },
  },
} satisfies Meta<typeof AlertsList>;

export default meta;
type Story = StoryObj<typeof AlertsList>;

export const Default: Story = {
  parameters: {
    queryPath: "alerts.getPaginated",
  },
};

export const Empty: Story = {
  parameters: {
    queryPath: "alerts.getPaginated",
    convex: {
      "alerts.getPaginated": {
        data: [],
        status: "Exhausted",
      },
    },
  },
};

export const Loading: Story = {
  parameters: {
    queryPath: "alerts.getPaginated",
    convex: {
      "alerts.getPaginated": {
        data: [],
        status: "LoadingFirstPage",
      },
    },
  },
};

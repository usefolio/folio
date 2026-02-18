import type { Meta, StoryObj } from "@storybook/react-vite";
import AlertsPage from "./AlertsPage";

const meta = {
  title: "Pages/Alerts Page",
  component: AlertsPage,
  tags: ["autodocs"],
  parameters: {
    // Because this page renders AlertsList, we need to provide the mock data
    // that the usePaginatedQuery hook inside AlertsList expects.
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
} satisfies Meta<typeof AlertsPage>;

export default meta;
type Story = StoryObj<typeof AlertsPage>;

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

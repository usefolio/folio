import type { Meta, StoryObj } from "@storybook/react-vite";
import Header from "./Header";
import { action } from "storybook/actions";
import { SidebarProvider } from "../../src/components/sidebar/SidebarManager";
import { Id } from "convex/_generated/dataModel";

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

const meta = {
  title: "Layout/Header",
  component: Header,
  parameters: {
    // This component is intended to span the full width of the viewport
    layout: "fullscreen",
    dataContext: {
      project: mockProject._id,
      projects: [mockProject],
      sheet: mockSheet,
      loading: false,
    },
  },
  tags: ["autodocs"],
  argTypes: {
    // Define the actions for the props the component receives
    openExportModal: { action: "openExportModal" },
  },
} satisfies Meta<typeof Header>;

export default meta;
type Story = StoryObj<typeof meta>;

// --- Story ---

export const Default: Story = {
  args: {
    // Provide the functions that the component expects as props
    openExportModal: action("openExportModal"),
    openSummaryModal: action("openSummaryModal"),
    openAlertModal: action("openAlertsModal"),
  },
  decorators: [
    (Story) => (
      // This decorator forces the sidebar container to be 100% width
      <SidebarProvider loading={false}>
        <div className="flex flex-1 flex-col w-full">
          <Story />
        </div>
      </SidebarProvider>
    ),
  ],
};

import type { Meta, StoryObj } from "@storybook/react-vite";
import WorkflowPage from "./WorkflowPage";
import { Id, Doc } from "../../convex/_generated/dataModel";
import { LLMModelEnum } from "@/types/types";
import { WorkflowNode } from "@/interfaces/interfaces";

// Mock Data
const mockProject: Doc<"project"> = {
  _id: "proj1" as Id<"project">,
  name: "Sample Workflow Project",
  owner: "user_storybook",
  _creationTime: Date.now(),
  project_workflow: "[]",
};

const mockSheet: Doc<"sheet"> = {
  _id: "sheet1" as Id<"sheet">,
  _creationTime: Date.now(),
  name: "Default",
  project_id: mockProject._id,
  filter: "1=1",
  hidden: [],
};

const mockWorkflowData: WorkflowNode[] = [
  {
    id: `view-backend-${mockSheet._id}`,
    label: "Default",
    isView: true,
    expanded: true,
    convexId: mockSheet._id,
    sql_condition: "1=1",
    children: [
      {
        id: "col-backend-123",
        label: "Sentiment Analysis",
        isView: false,
        convexId: "col123" as Id<"column">,
        convexSheetId: mockSheet._id,
        type: "tag",
        model: LLMModelEnum.GPT4O,
        summary:
          "Classify the sentiment of the customer feedback in {{feedback_text}}",
        tags: "Positive, Negative, Neutral",
        tagMode: "singleTag",
        inputCols: ["feedback_text"],
        children: [],
      },
    ],
  },
  {
    id: `view-backend-sheet2`,
    label: "High Priority Tickets",
    isView: true,
    expanded: false,
    convexId: "sheet2" as Id<"sheet">,
    sql_condition: "priority = 'High'",
    children: [],
  },
];
const mockColumns: Doc<"column">[] = [
  {
    _id: "col1" as Id<"column">,
    name: "feedback_text",
    _creationTime: 0,
    cell_state: new ArrayBuffer(0),
    project_id: mockProject._id,
    column_type: "noSchema",
    created_on_sheet_id: mockSheet._id,
  },
  {
    _id: "col2" as Id<"column">,
    name: "priority",
    _creationTime: 0,
    cell_state: new ArrayBuffer(0),
    project_id: mockProject._id,
    column_type: "noSchema",
    created_on_sheet_id: mockSheet._id,
  },
  {
    _id: "col3" as Id<"column">,
    name: "status",
    _creationTime: 0,
    cell_state: new ArrayBuffer(0),
    project_id: mockProject._id,
    column_type: "noSchema",
    created_on_sheet_id: mockSheet._id,
  },
];
mockProject.project_workflow = JSON.stringify(mockWorkflowData);
// Meta
const meta = {
  title: "Pages/Workflow",
  component: WorkflowPage,
  parameters: {
    layout: "fullscreen",
    fullscreen: true,
    dataContext: {
      projects: [mockProject],
      sheets: [mockSheet],
      project: mockProject._id,
      sheet: mockSheet,
      columns: mockColumns,
    },
    convex: {
      "projects.getProjectWorkflowTree": mockWorkflowData,
    },
  },
} satisfies Meta<typeof WorkflowPage>;

export default meta;
type Story = StoryObj<typeof meta>;

// Story
export const Default: Story = {
  name: "Default Workflow View",
  tags: ["autodocs"],
  parameters: {
    queryPath: "projects.getProjectWorkflowTree",
  },
};

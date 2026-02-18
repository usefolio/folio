import type { Meta, StoryObj } from "@storybook/react-vite";
import { action } from "storybook/actions";
import ModalManager from "./ModalManager";
import { Button } from "./ui/button";
import { useModal, ModalProvider } from "@/context/ModalContext";
import { Id, Doc } from "../../convex/_generated/dataModel";

// Storybook Wrapper
const ModalManagerStoryWrapper = () => {
  const {
    isModalOpen,
    modalType,
    modalData,
    modalState,
    modalActions,
    closeModal,
    openModal,
    modalSessionIdRef,
  } = useModal();

  return (
    <div className="p-4">
      <h3 className="text-lg font-semibold mb-2">Modal Triggers</h3>
      <p className="text-sm text-muted-foreground mb-4">
        Click a button to open the corresponding modal.
      </p>
      <div className="flex gap-2 flex-wrap">
        <Button
          className="rounded-md h-8"
          onClick={() => openModal("newProject")}
        >
          Open New Project Modal
        </Button>
        <Button
          className="rounded-md h-8"
          onClick={() =>
            openModal("column", { columnName: "New Sentiment Column" })
          }
        >
          Open Column Modal
        </Button>
        <Button
          className="rounded-md h-8"
          onClick={() => openModal("export")}
        >
          Open Export Modal
        </Button>
        <Button
          className="rounded-md h-8"
          onClick={() => openModal("settings")}
        >
          Open Settings Modal
        </Button>
        <Button
          className="rounded-md h-8"
          onClick={() => openModal("summary")}
        >
          Open Summary Modal
        </Button>
        <Button className="rounded-md h-8" onClick={() => openModal("alert")}>
          Open Alerts Modal
        </Button>
        <Button
          className="rounded-md h-8"
          onClick={() => openModal("schedule")}
        >
          Open Schedule Modal
        </Button>
      </div>

      <ModalManager
        isModalOpen={isModalOpen}
        modalType={modalType}
        closeModal={closeModal}
        project_id={"project1" as Id<"project">}
        sheet={mockSheet}
        handleNewView={action("handleNewView")}
        handleCreateView={action("handleCreateView")}
        modalData={modalData}
        state={modalState}
        actions={modalActions}
        modalSessionIdRef={modalSessionIdRef}
        setLoadingViewProjects={action("setLoadingViewProjects")}
      />
    </div>
  );
};

// Mock Data
const mockProject: Doc<"project"> = {
  _id: "project1" as Id<"project">,
  name: "Sample Project",
  owner: "user_storybook",
  _creationTime: Date.now(),
};

const mockSheet: Doc<"sheet"> = {
  _id: "sheet1" as Id<"sheet">,
  _creationTime: Date.now(),
  name: "Default View",
  project_id: mockProject._id,
  filter: "1=1",
  hidden: [],
};

const mockColumns: Doc<"column">[] = [
  {
    _id: "col1" as Id<"column">,
    name: "Customer Name",
    _creationTime: 0,
    cell_state: new ArrayBuffer(0),
    project_id: mockProject._id,
  },
  {
    _id: "col2" as Id<"column">,
    name: "Order Date",
    _creationTime: 0,
    cell_state: new ArrayBuffer(0),
    project_id: mockProject._id,
  },
];

// Meta Configuration
const meta = {
  title: "Layout/ModalManager",
  component: ModalManagerStoryWrapper,
  parameters: {
    layout: "fullscreen",
    dataContext: {
      projects: [mockProject],
      sheets: [mockSheet],
      columns: mockColumns,
      project: mockProject._id,
      sheet: mockSheet,
    },
    convex: {
      actions: {
        "export_data:fetchAllColumnsAndSheetsForProject": async () => {
          await new Promise((resolve) => setTimeout(resolve, 500));
          return {
            columns: mockColumns,
            sheets: [mockSheet],
          };
        },
      },
    },
  },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <ModalProvider>
        <Story />
      </ModalProvider>
    ),
  ],
} satisfies Meta<typeof ModalManagerStoryWrapper>;

export default meta;
type Story = StoryObj<typeof meta>;

// Story Definition
export const Default: Story = {
  name: "Interactive Modal Triggers",
  args: {},
};

import React, { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import SheetMenu from "./SheetMenu";
import { Doc, Id } from "convex/_generated/dataModel";
import { action } from "storybook/actions";

// --- Mock Data ---
const createMockSheet = (
  id: string,
  name: string,
  overrides: Partial<Doc<"sheet">> = {},
): Doc<"sheet"> => ({
  _id: id as Id<"sheet">,
  _creationTime: Date.now(),
  name,
  project_id: "proj1" as Id<"project">,
  filter: "1=1",
  hidden: [],
  rows_in_sheet_counter: 100,
  ...overrides,
});

const mockSheets: Doc<"sheet">[] = [
  createMockSheet("sheet2", "Customer View", { filter: `"Status" = 'Active'` }),
  createMockSheet("sheet3", "Q4 Analysis"),
  createMockSheet("sheet1", "Default"),
];

// --- Interactive Wrapper Component ---
// This component will manage the state of the active sheet
const InteractiveSheetMenu = (
  props: Omit<React.ComponentProps<typeof SheetMenu>, "sheet" | "setSheet">,
) => {
  const [activeSheet, setActiveSheet] = useState<Doc<"sheet">>(props.sheets[0]);

  const handleSetSheet = (sheet: Doc<"sheet">) => {
    // Log the action to the Storybook panel
    action("setSheet")(sheet);
    // Update the local state to re-render the component
    setActiveSheet(sheet);
  };

  return <SheetMenu {...props} sheet={activeSheet} setSheet={handleSetSheet} />;
};

const meta = {
  title: "Layout/SheetMenu",
  component: InteractiveSheetMenu, // Render the interactive wrapper
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="w-[700px] bg-background p-4 border-b">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof InteractiveSheetMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

// --- Stories ---

export const Default: Story = {
  name: "Interactive Menu",
  args: {
    // We provide the list of sheets to our wrapper
    sheets: mockSheets,
    disableInteraction: false,
    creatingSheetId: null,
  },
};

export const CreatingNewSheet: Story = {
  name: "Creating a New Sheet",
  args: {
    ...Default.args,
    sheets: [createMockSheet("new-sheet-id", "New View"), ...mockSheets],
    creatingSheetId: "new-sheet-id",
  },
};

export const Disabled: Story = {
  name: "Disabled State",
  args: {
    ...Default.args,
    disableInteraction: true,
  },
};

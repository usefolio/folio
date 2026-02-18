import type { Meta, StoryObj } from "@storybook/react-vite";
import { Separator } from "./separator";

const meta = {
  title: "Components/UI/Separator",
  component: Separator,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    orientation: {
      control: "radio",
      options: ["horizontal", "vertical"],
    },
  },
} satisfies Meta<typeof Separator>;

export default meta;
type Story = StoryObj<typeof meta>;
// Stories
export const AllVariants: Story = {
  render: () => (
    <div className="space-y-8 text-center">
      {/* Content from Horizontal story */}
      <div className="w-48 text-center">
        <span>Top Content</span>
        <Separator className="my-4" />
        <span>Bottom Content</span>
      </div>

      {/* Content from Vertical story */}
      <div className="flex h-10 items-center space-x-4 text-sm">
        <span>Left</span>
        <Separator orientation="vertical" />
        <span>Middle</span>
        <Separator orientation="vertical" />
        <span>Right</span>
      </div>
    </div>
  ),
};
export const Horizontal: Story = {
  render: () => (
    <div className="w-48 text-center">
      <span>Top Content</span>
      <Separator className="my-4" />
      <span>Bottom Content</span>
    </div>
  ),
};

export const Vertical: Story = {
  render: () => (
    <div className="flex h-10 items-center space-x-4 text-sm">
      <span>Left</span>
      <Separator orientation="vertical" />
      <span>Middle</span>
      <Separator orientation="vertical" />
      <span>Right</span>
    </div>
  ),
};

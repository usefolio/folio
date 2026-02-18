import type { Meta, StoryObj } from "@storybook/react-vite";
import { Badge } from "./badge";

const meta = {
  title: "Components/UI/Badge",
  component: Badge,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "secondary", "destructive", "outline"],
    },
    children: {
      control: "text",
    },
  },
  decorators: [
    (Story) => (
      <div className="flex items-center justify-center p-4 min-w-[200px] border rounded-md">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;
export const AllVariants: Story = {
  render: () => (
    <div className="flex space-x-2">
      <Badge {...Default.args} />
      <Badge {...Secondary.args} />
      <Badge {...Destructive.args} />
      <Badge {...Outline.args} />
    </div>
  ),
};
export const Default: Story = {
  args: {
    variant: "default",
    children: "Active",
    className: "rounded-md",
  },
};

export const Secondary: Story = {
  args: {
    variant: "secondary",
    children: "Enriching Data",
    className: "rounded-md",
  },
};

export const Destructive: Story = {
  args: {
    variant: "destructive",
    children: "Failure",
    className: "rounded-md",
  },
};

export const Outline: Story = {
  args: {
    variant: "outline",
    children: "15,000 tokens",
    className: "rounded-md font-mono",
  },
};

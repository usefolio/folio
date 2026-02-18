import type { Meta, StoryObj } from "@storybook/react-vite";
import { Progress } from "./progress";

const meta = {
  title: "Components/UI/Progress",
  component: Progress,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    value: { control: { type: "range", min: 0, max: 100, step: 1 } },
  },
  decorators: [
    (Story) => (
      <div style={{ width: "300px" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Progress>;

export default meta;
type Story = StoryObj<typeof meta>;
export const AllVariants: Story = {
  args: {
    indicatorColor: "bg-primary",
  },
  render: () => (
    <div className="space-y-4">
      <Progress {...Default.args} />
      <Progress {...PrimaryColor.args} />
    </div>
  ),
};
export const Default: Story = {
  args: {
    value: 33,
    indicatorColor: "bg-black",
    className: "h-2 rounded-md",
  },
};

export const PrimaryColor: Story = {
  args: {
    value: 66,
    indicatorColor: "bg-primary",
    className: "h-2 rounded-md",
  },
};

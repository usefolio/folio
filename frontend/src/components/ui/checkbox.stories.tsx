import type { Meta, StoryObj } from "@storybook/react-vite";
import { Checkbox } from "./checkbox";
import { Label } from "./label";

const meta = {
  title: "Components/UI/Checkbox",
  component: Checkbox,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="flex items-center space-x-2">
        <Story />
        <Label htmlFor="terms">Accept terms and conditions</Label>
      </div>
    ),
  ],
} satisfies Meta<typeof Checkbox>;

export default meta;
type Story = StoryObj<typeof meta>;
export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-col space-y-4">
      <div className="flex items-center space-x-2">
        <Checkbox id="terms1" className="rounded-none" />
        <Label htmlFor="terms1">Default</Label>
      </div>
      <div className="flex items-center space-x-2">
        <Checkbox id="terms2" className="rounded-none" checked />
        <Label htmlFor="terms2">Checked</Label>
      </div>
      <div className="flex items-center space-x-2">
        <Checkbox id="terms3" className="rounded-none" disabled />
        <Label htmlFor="terms3">Disabled</Label>
      </div>
    </div>
  ),
};
export const Default: Story = {
  args: {
    id: "terms",
    className: "rounded-md",
  },
};

export const Checked: Story = {
  args: {
    ...Default.args,
    checked: true,
  },
};

export const Disabled: Story = {
  args: {
    ...Default.args,
    disabled: true,
  },
};

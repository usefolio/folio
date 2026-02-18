import type { Meta, StoryObj } from "@storybook/react-vite";
import { Input } from "./input";

const meta = {
  title: "Components/UI/Input",
  component: Input,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    type: { control: "text" },
    placeholder: { control: "text" },
    disabled: { control: "boolean" },
  },
  decorators: [
    (Story) => (
      <div style={{ width: "300px" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;
export const AllVariants: Story = {
  render: () => (
    <div className="space-y-2">
      <Input {...Default.args} />
      <Input {...Password.args} />
      <Input {...Disabled.args} />
    </div>
  ),
};
export const Default: Story = {
  args: {
    type: "text",
    placeholder: "Enter your email...",
    className: "rounded-md",
  },
};

export const Password: Story = {
  args: {
    type: "password",
    placeholder: "Enter your password...",
    className: "rounded-md",
  },
};

export const Disabled: Story = {
  args: {
    type: "text",
    placeholder: "You cannot type here",
    disabled: true,
    className: "rounded-md",
  },
};

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Textarea } from "./textarea";
import { Label } from "./label";

const meta = {
  title: "Components/UI/Textarea",
  component: Textarea,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    placeholder: { control: "text" },
    disabled: { control: "boolean" },
  },
  decorators: [
    (Story) => (
      <div style={{ width: "350px" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Textarea>;

export default meta;
type Story = StoryObj<typeof meta>;

// Stories
export const AllVariants: Story = {
  render: () => (
    <div className="space-y-4">
      <div>
        <Label className="text-sm font-medium">Default</Label>
        <Textarea {...Default.args} />
      </div>
      <div>
        <Label className="text-sm font-medium">With Value</Label>
        <Textarea {...With_Value.args} />
      </div>
      <div>
        <Label className="text-sm font-medium">Disabled</Label>
        <Textarea {...Disabled.args} />
      </div>
      <div>
        <Label className="text-sm font-medium">Error State</Label>
        <Textarea {...Error_State.args} />
      </div>
      <div>
        <Label className="text-sm font-medium">Warning State</Label>
        <Textarea {...Warning_State.args} />
      </div>
      <div>
        <Label className="text-sm font-medium">Resizable</Label>
        <Textarea {...Resizable.args} />
      </div>
    </div>
  ),
};

export const Default: Story = {
  args: {
    placeholder: "Enter your prompt here...",
    className: "rounded-md resize-none",
  },
};

export const With_Value: Story = {
  args: {
    ...Default.args,
    defaultValue:
      "This is some pre-filled text that spans multiple lines to show how the textarea handles existing content.",
  },
};

export const Disabled: Story = {
  args: {
    ...Default.args,
    placeholder: "This textarea is disabled.",
    disabled: true,
  },
};

export const Error_State: Story = {
  args: {
    ...Default.args,
    defaultValue: "This value has an error.",
    className:
      "rounded-md resize-none border-red-500 focus-visible:ring-red-500",
  },
};

export const Warning_State: Story = {
  args: {
    ...Default.args,
    defaultValue: "This value has a warning.",
    className:
      "rounded-md resize-none border-amber-500 focus-visible:ring-amber-500",
  },
};

export const Resizable: Story = {
  args: {
    ...Default.args,
    defaultValue: "This textarea is vertically resizable.",
    className: "rounded-md",
  },
};

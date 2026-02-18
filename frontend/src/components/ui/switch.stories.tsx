import type { Meta, StoryObj } from "@storybook/react-vite";
import { Switch } from "./switch";
import { Label } from "./label";

const meta = {
  title: "Components/UI/Switch",
  component: Switch,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="flex items-center space-x-2">
        <Story />
        <Label htmlFor="airplane-mode">Airplane Mode</Label>
      </div>
    ),
  ],
} satisfies Meta<typeof Switch>;

export default meta;
type Story = StoryObj<typeof meta>;
export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-col space-y-4">
      <div className="flex items-center space-x-2">
        <Switch id="switch-off" />
        <Label htmlFor="switch-off">Off</Label>
      </div>
      <div className="flex items-center space-x-2">
        <Switch id="switch-on" checked />
        <Label htmlFor="switch-on">On</Label>
      </div>
      <div className="flex items-center space-x-2">
        <Switch id="switch-disabled" disabled />
        <Label htmlFor="switch-disabled">Disabled</Label>
      </div>
    </div>
  ),
};
export const Off: Story = {
  args: {
    id: "airplane-mode",
  },
};

export const On: Story = {
  args: {
    ...Off.args,
    checked: true,
  },
};

export const Disabled: Story = {
  args: {
    ...Off.args,
    disabled: true,
  },
};

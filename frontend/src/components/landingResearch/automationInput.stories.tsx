import type { Meta, StoryObj } from "@storybook/react-vite";
import { AutomationInput } from "./automationInput";

const meta = {
  title: "Components/Landing Research/AutomationInput",
  component: AutomationInput,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="w-full p-4 flex justify-center">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AutomationInput>;

export default meta;
type Story = StoryObj<typeof AutomationInput>;

export const Default: Story = {};

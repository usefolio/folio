import type { Meta, StoryObj } from "@storybook/react-vite";
import { StarterPrompts } from "./starterPrompts";

const meta = {
  title: "Components/Landing Research/StarterPrompts",
  component: StarterPrompts,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="w-full flex justify-center p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof StarterPrompts>;

export default meta;
type Story = StoryObj<typeof StarterPrompts>;

export const Default: Story = {};

import type { Meta, StoryObj } from "@storybook/react-vite";
import LandingResearch from "./LandingResearch";

const meta = {
  title: "Pages/Landing Research",
  component: LandingResearch,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof LandingResearch>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

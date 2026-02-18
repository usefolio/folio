import type { Meta, StoryObj } from "@storybook/react-vite";
import TutorialsRoute from "./TutorialsRoute";

const meta = {
  title: "Pages/Tutorials Page",
  component: TutorialsRoute,
  tags: ["autodocs"],
} satisfies Meta<typeof TutorialsRoute>;

export default meta;
type Story = StoryObj<typeof TutorialsRoute>;

export const Default: Story = {};

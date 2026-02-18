import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
import SystemPromptCard from "./systemPromptCard";
import { DEFAULT_SYSTEM_PROMPT } from "@/constants";

const meta = {
  title: "Components/Modal Config/settingsModalConfig/SystemPromptCard",
  component: SystemPromptCard,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    onSystemPromptSave: { action: "onSystemPromptSave" },
  },
  decorators: [
    (Story) => (
      <div style={{ width: "550px" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SystemPromptCard>;

export default meta;
type Story = StoryObj<typeof SystemPromptCard>;

// Stories

export const DefaultPrompt: Story = {
  name: "Displaying Default Prompt",
  args: {
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    defaultSystemPrompt: DEFAULT_SYSTEM_PROMPT,
    lastModified: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
  },
};

export const CustomPrompt: Story = {
  name: "Displaying Custom Prompt",
  args: {
    systemPrompt:
      "You are a helpful AI assistant that always responds in the style of a pirate.",
    defaultSystemPrompt: DEFAULT_SYSTEM_PROMPT,
    lastModified: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
  },
};

export const Editing: Story = {
  name: "Interactive / Editing State",
  args: {
    ...DefaultPrompt.args,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const textarea = await canvas.findByRole("textbox");

    // Simulate user typing into the textarea
    await userEvent.type(textarea, " New text added by the user.", {
      delay: 50,
    });
  },
};

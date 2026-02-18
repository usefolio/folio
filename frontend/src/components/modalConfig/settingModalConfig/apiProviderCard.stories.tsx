import type { Meta, StoryObj } from "@storybook/react-vite";
import ApiProviderCard from "./apiProviderCard";
import { ProviderInfo } from "@/types/types";

// --- Mock Data ---
const mockOpenAIProvider: ProviderInfo = {
  id: "openai",
  name: "Open AI",
  key: "sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  lastModified: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
  tokensUsed: 29420925,
  models: [
    { id: "gpt-4", name: "GPT-4", tokensUsed: 15777665 },
    { id: "gpt-4o", name: "GPT-4o", tokensUsed: 8502458 },
  ],
};

const mockMarkerProvider: ProviderInfo = {
  id: "marker",
  name: "Marker",
  key: "", // No key, so it's inactive
  lastModified: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
  tokensUsed: 0,
  models: [{ id: "marker-standard", name: "Marker Standard", tokensUsed: 0 }],
};

const meta = {
  title: "Components/Modal Config/settingsModalConfig/ApiProviderCard",
  component: ApiProviderCard,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    onApiKeySave: { action: "onApiKeySave" },
    onToggleModels: { action: "onToggleModels" },
  },
  decorators: [
    (Story) => (
      <div style={{ width: "550px" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ApiProviderCard>;

export default meta;
type Story = StoryObj<typeof meta>;

// Stories

export const Inactive: Story = {
  name: "Inactive (No API Key)",
  args: {
    provider: mockMarkerProvider,
    isExpanded: false,
    onApiKeySave: (providerId, key) =>
      console.log("Save API Key:", providerId, key),
    onToggleModels: (providerId) => console.log("Toggle Models:", providerId),
  },
};

export const ActiveCollapsed: Story = {
  name: "Active & Collapsed",
  args: {
    provider: mockOpenAIProvider,
    isExpanded: false,
    onApiKeySave: (providerId, key) =>
      console.log("Save API Key:", providerId, key),
    onToggleModels: (providerId) => console.log("Toggle Models:", providerId),
  },
};

export const ActiveExpanded: Story = {
  name: "Active & Expanded",
  args: {
    provider: mockOpenAIProvider,
    isExpanded: true,
    onApiKeySave: (providerId, key) =>
      console.log("Save API Key:", providerId, key),
    onToggleModels: (providerId) => console.log("Toggle Models:", providerId),
  },
};

import type { Meta, StoryObj } from "@storybook/react-vite";
import DataChat from "./dataChat";
import { ChatContext, ChatStatus } from "@/context/ChatContext"; // Import the actual context and types
import { Message } from "@ai-sdk/react";

// --- Mock Data ---
const mockMessages: Message[] = [
  {
    id: "1",
    role: "user",
    content:
      "Can you show me all the high-priority tasks in the {{Customer Feedback}} column?",
    createdAt: new Date(Date.now() - 3 * 60 * 1000),
  },

  {
    id: "2",
    role: "assistant",
    content:
      'Of course! I found 3 high-priority tasks. I can create a new view called "High Priority Tasks" for you.',
    createdAt: new Date(Date.now() - 3 * 60 * 1000),
  },
  {
    id: "3",
    role: "user",
    content: "Yes, please do that.",
    createdAt: new Date(Date.now() - 3 * 60 * 1000),
  },
];

const StoryWrapper = ({
  messages = [],
  status = "ready",
  error = undefined,
}: {
  messages?: Message[];
  status?: ChatStatus;
  error?: Error;
}) => {
  const mockContextValue = {
    messages,
    status,
    error,
    startConversation: () => console.log("Storybook: startConversation called"),
    sendMessage: async (msg: string) =>
      console.log("Storybook: sendMessage called with:", msg),
    clearMessages: () => console.log("Storybook: clearMessages called"),
  };

  return (
    <ChatContext.Provider value={mockContextValue}>
      <DataChat />
    </ChatContext.Provider>
  );
};

const meta = {
  title: "Components/Chat/DataChat",
  component: DataChat,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="w-[500px] h-[600px] border rounded-md flex">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DataChat>;

export default meta;
type Story = StoryObj<typeof DataChat>;

export const Empty: Story = {
  name: "Empty Conversation",
  render: () => <StoryWrapper />,
};

export const WithConversation: Story = {
  render: () => <StoryWrapper messages={mockMessages} />,
};

export const AssistantResponding: Story = {
  render: () => <StoryWrapper messages={mockMessages} status="submitted" />,
};

export const ErrorState: Story = {
  render: () => (
    <StoryWrapper
      messages={[mockMessages[0]]}
      status="error"
      error={new Error("Failed to get response from the assistant.")}
    />
  ),
};

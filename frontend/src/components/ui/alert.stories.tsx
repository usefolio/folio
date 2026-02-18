import type { Meta, StoryObj } from "@storybook/react-vite";
import { InfoIcon, AlertTriangle } from "lucide-react";
import { Alert, AlertTitle, AlertDescription } from "./alert";

const meta = {
  title: "Components/UI/Alert",
  component: Alert,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="w-[500px] space-y-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Alert>;

export default meta;
type Story = StoryObj<typeof meta>;

// Stories
export const AllVariants: Story = {
  render: () => (
    <>
      <Alert {...(Informational.args as any)} />
      <Alert {...(Warning.args as any)} />
      <Alert {...(Destructive.args as any)} />
    </>
  ),
};
export const Informational: Story = {
  args: {
    className: "rounded-md border bg-blue-50/50",
    children: (
      <>
        <InfoIcon className="h-4 w-4" />
        <AlertDescription className="text-xs mt-0.5">
          This is an informational message.
        </AlertDescription>
      </>
    ),
  },
};

export const Warning: Story = {
  args: {
    className:
      "rounded-md pr-2 pl-2 py-2 border border-[#F2C14B] bg-[#FFFBED]",
    children: (
      <>
        <AlertTriangle color="#E9A13B" className="h-4 w-4 mt-[1px]" />
        <AlertTitle className="text-[#88451E] text-sm mb-0">Warning</AlertTitle>
        <AlertDescription className="text-xs text-[#A85823]">
          There is no column mentioned in your prompt.
        </AlertDescription>
      </>
    ),
  },
};

export const Destructive: Story = {
  args: {
    variant: "destructive",
    className: "rounded-md pr-2 pl-2 py-2",
    children: (
      <>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle className="text-sm mb-0">Error</AlertTitle>
        <AlertDescription className="text-xs">
          Your session has expired. Please log in again to continue.
        </AlertDescription>
      </>
    ),
  },
};

import type { Meta, StoryObj } from "@storybook/react-vite";
import React from "react";
import { Button } from "./button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./tooltip";

type TooltipStoryProps = React.ComponentProps<typeof TooltipContent> & {
  content: React.ReactNode;
};

const meta: Meta<TooltipStoryProps> = {
  title: "Components/UI/Tooltip",
  component: Tooltip,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <TooltipProvider>
        <div className="p-16">
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
  argTypes: {
    side: {
      control: "select",
      options: ["top", "bottom", "left", "right"],
    },
    content: {
      control: "text",
    },
  },
  render: ({ content, ...args }) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline" className="rounded-md">
          Hover me
        </Button>
      </TooltipTrigger>
      <TooltipContent {...args}>
        <p>{content}</p>
      </TooltipContent>
    </Tooltip>
  ),
};

export default meta;
type Story = StoryObj<typeof meta>;
export const AllVariants: Story = {
  render: () => (
    <div className="grid grid-cols-2 gap-8">
      <div className="flex justify-center">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" className="rounded-md">
              Top
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p>Tooltip on the top</p>
          </TooltipContent>
        </Tooltip>
      </div>
      <div className="flex justify-center">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" className="rounded-md">
              Right
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">
            <p>Tooltip on the right</p>
          </TooltipContent>
        </Tooltip>
      </div>
      <div className="flex justify-center">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" className="rounded-md">
              Left
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">
            <p>Tooltip on the left</p>
          </TooltipContent>
        </Tooltip>
      </div>
      <div className="flex justify-center">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" className="rounded-md">
              Bottom
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>Tooltip on the bottom</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  ),
};
export const Default: Story = {
  args: {
    content: "This is a tooltip message.",
    side: "top",
  },
};

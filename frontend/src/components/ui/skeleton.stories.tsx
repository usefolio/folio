import type { Meta, StoryObj } from "@storybook/react-vite";
import { Skeleton } from "./skeleton";

const meta = {
  title: "Components/UI/Skeleton",
  component: Skeleton,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof Skeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

// Stories
export const AllVariants: Story = {
  render: () => (
    <div className="space-y-8 w-[500px]">
      {/* Card Example */}
      <div className="flex items-center space-x-4">
        <Skeleton className="h-12 w-12 rounded-full" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-4" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
      {/* List Example */}
      <div className="space-y-2">
        <Skeleton className="h-4" />
        <Skeleton className="h-4" />
        <Skeleton className="h-4" />
      </div>
    </div>
  ),
};
export const Card_Example: Story = {
  render: () => (
    <div className="flex items-center space-x-4 w-[500px]">
      <Skeleton className="h-12 w-12 rounded-full" />
      <div className="space-y-2 flex-1">
        <Skeleton className="h-4" />
        <Skeleton className="h-4" />
      </div>
    </div>
  ),
};
export const List_Example: Story = {
  render: () => (
    <div className="space-y-8 w-[500px]">
      <div className="space-y-2">
        <Skeleton className="h-4" />
        <Skeleton className="h-4" />
        <Skeleton className="h-4" />
      </div>
    </div>
  ),
};

import type { Meta, StoryObj } from "@storybook/react-vite";
import { PrimaryActionButton, SecondaryIconButton } from "./actionButtons";
import { Plus, RotateCcw, Loader2, Trash2, Save } from "lucide-react";

const meta = {
  title: "Components/UI/ActionButtons",
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary_Default: Story = {
  render: () => (
    <PrimaryActionButton icon={<Plus className="h-4 w-4" />}>Create</PrimaryActionButton>
  ),
};

export const Primary_Loading: Story = {
  render: () => (
    <PrimaryActionButton disabled icon={<Loader2 className="h-4 w-4 animate-spin" />}>Creating…</PrimaryActionButton>
  ),
};

export const Secondary_Outline: Story = {
  render: () => (
    <SecondaryIconButton icon={<RotateCcw className="h-4 w-4" />}>Clear</SecondaryIconButton>
  ),
};

export const Secondary_Destructive: Story = {
  render: () => (
    <SecondaryIconButton variant="destructive" icon={<Trash2 className="h-4 w-4" />}>Delete</SecondaryIconButton>
  ),
};

export const Secondary_HoverBrand: Story = {
  render: () => (
    <SecondaryIconButton hoverBrand icon={<Save className="h-4 w-4" />}>Save</SecondaryIconButton>
  ),
};


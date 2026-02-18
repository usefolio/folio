import type { Meta, StoryObj } from "@storybook/react-vite";
import BillingPage from "./BillingPage";

const meta = {
  title: "Pages/Billing Page",
  component: BillingPage,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof BillingPage>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

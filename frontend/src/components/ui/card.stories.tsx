import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
} from "./card";
import { Button } from "./button";

const meta = {
  title: "Components/UI/Card",
  component: Card,
  parameters: {
    layout: "centered",
  },
  subcomponents: {
    CardHeader,
    CardFooter,
    CardTitle,
    CardDescription,
    CardContent,
  },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div style={{ width: "350px" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllVariants: Story = {
  render: () => (
    <div className="space-y-4">
      <Card {...(WithHeaderAndFooter.args as any)} />
      <Card {...(Simple.args as any)} />
    </div>
  ),
};
// Story demonstrating a full card layout
export const WithHeaderAndFooter: Story = {
  args: {
    className: "rounded-md", // Using your project's style
    children: (
      <>
        <CardHeader>
          <CardTitle>Card Title</CardTitle>
          <CardDescription>This is the card description.</CardDescription>
        </CardHeader>
        <CardContent>
          <p>
            This is the main content area of the card. You can place any
            information here.
          </p>
        </CardContent>
        <CardFooter>
          <Button variant="outline" className="h-8 rounded-md">
            Cancel
          </Button>
          <Button variant="default" className="h-8 rounded-md ml-2">
            Deploy
          </Button>
        </CardFooter>
      </>
    ),
  },
};

// A simpler story with just content
export const Simple: Story = {
  args: {
    className: "rounded-md",
    children: (
      <CardContent className="p-6">
        <p>This is a simple card with only content.</p>
      </CardContent>
    ),
  },
};

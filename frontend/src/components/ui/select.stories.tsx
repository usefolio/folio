import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
} from "./select";

const meta = {
  title: "Components/UI/Select",
  component: Select,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div style={{ width: "250px" }}>
        <Story />
      </div>
    ),
  ],
  // We need to render the component with its children for the story to work
  render: (args) => (
    <Select {...args}>
      <SelectTrigger className="rounded-md">
        <SelectValue placeholder="Select a fruit" />
      </SelectTrigger>
      <SelectContent className="rounded-md">
        <SelectGroup>
          <SelectLabel>Fruits</SelectLabel>
          <SelectItem value="apple">Apple</SelectItem>
          <SelectItem value="banana">Banana</SelectItem>
          <SelectItem value="blueberry">Blueberry</SelectItem>
          <SelectItem value="grapes">Grapes</SelectItem>
          <SelectItem value="pineapple">Pineapple</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  ),
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;
export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-col space-y-4">
      {/* Default Select */}
      <Select>
        <SelectTrigger className="rounded-md">
          <SelectValue placeholder="Default" />
        </SelectTrigger>
        <SelectContent className="rounded-md">
          <SelectGroup>
            <SelectLabel>Fruits</SelectLabel>
            <SelectItem value="apple">Apple</SelectItem>
            <SelectItem value="banana">Banana</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>

      {/* Disabled Select */}
      <Select disabled={true}>
        <SelectTrigger className="rounded-md">
          <SelectValue placeholder="Disabled" />
        </SelectTrigger>
        <SelectContent className="rounded-md">
          <SelectGroup>
            <SelectLabel>Fruits</SelectLabel>
            <SelectItem value="apple">Apple</SelectItem>
            <SelectItem value="banana">Banana</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  ),
};
export const Default: Story = {
  args: {},
};

// Disabled state
export const Disabled: Story = {
  args: {
    disabled: true,
  },
};

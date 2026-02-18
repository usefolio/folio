import type { Meta, StoryObj } from "@storybook/react-vite";
import FilterDisplay from "./filterDisplay";

const meta = {
  title: "Components/Visual Query Builder/FilterDisplay",
  component: FilterDisplay,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    filterString: { control: "text" },
    filterConditions: { control: "text" },
  },
} satisfies Meta<typeof FilterDisplay>;

export default meta;
type Story = StoryObj<typeof meta>;

// Stories

export const NoFilters: Story = {
  name: "No Filters Applied",
  args: {
    filterString: "1=1",
    filterConditions: "All conditions are met:",
  },
};

export const Simple_Condition: Story = {
  args: {
    filterString: `"Status" = 'Completed'`,
    filterConditions: "All conditions are met:",
  },
};

export const Multiple_Conditions: Story = {
  args: {
    filterString: `"Status" = 'Completed' AND "Priority" = 'High'`,
    filterConditions: "All conditions are met:",
  },
};

export const ComplexCondition: Story = {
  name: "Complex Condition with Grouping",
  args: {
    filterString: `("Status" = 'Pending' OR "Status" = 'In Progress') AND "Urgency" > 'Medium'`,
    filterConditions: "All conditions are met:",
  },
};

export const Contains_Condition: Story = {
  args: {
    filterString: `"Customer Name" LIKE '%Acme%'`,
    filterConditions: "Any condition is met:",
  },
};

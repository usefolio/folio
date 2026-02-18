// VisualQueryBuilder.stories.tsx ─ Storybook v7 (CSF3 style)
import { Meta, StoryObj } from "@storybook/react-vite";
import { useRef, useState } from "react";
import { action } from "storybook/actions";
import VisualQueryBuilder from "./visualQueryBuilder";
import {
  VisualQueryBuilderProps,
  QueryBuilderState,
} from "@/interfaces/interfaces";

type StoryArgs = Omit<
  VisualQueryBuilderProps,
  | "isAddingCondition"
  | "setIsAddingCondition"
  | "constructedQueryVisible"
  | "setConstructedQueryVisible"
  | "onSave"
  | "onCancel"
  | "onStateChange"
>;

// Wrapper component
const InteractiveQueryBuilder = (args: StoryArgs) => {
  const [isAdding, setIsAdding] = useState(false);
  const [queryVisible, setQueryVisible] = useState(true);

  const initialStateRef = useRef<QueryBuilderState | null>(
    args.initialState ?? null,
  );

  const handleSetIsAdding = (bool: boolean) => setIsAdding(bool);
  const handleSetQueryVisible = (visible: boolean) => setQueryVisible(visible);

  return (
    <VisualQueryBuilder
      {...args} // viewName, fields, loading, etc.
      initialState={initialStateRef.current}
      isAddingCondition={isAdding}
      setIsAddingCondition={handleSetIsAdding}
      constructedQueryVisible={queryVisible}
      setConstructedQueryVisible={handleSetQueryVisible}
      onSave={action("onSave")}
      onCancel={action("onCancel")}
      onStateChange={action("onStateChange")}
    />
  );
};

// Meta
const meta: Meta<typeof InteractiveQueryBuilder> = {
  component: InteractiveQueryBuilder,
  title: "Components/Visual Query Builder/VisualQueryBuilder",
  argTypes: {
    // Hide props Storybook shouldn’t touch
    initialState: { table: { disable: true } },
  },
  tags: ["autodocs"],
};
export default meta;

// Stories
export const Empty: StoryObj<typeof InteractiveQueryBuilder> = {
  args: {
    viewName: "My New View",
    fields: ["Status", "Priority", "Assignee"],
    loading: false,
  },
};

export const WithPredefinedFilters: StoryObj<typeof InteractiveQueryBuilder> = {
  args: {
    ...Empty.args,
    initialState: {
      tokens: [
        { field: "Status", operator: "=", value: "Done", isEditing: false },
        "AND",
        { field: "Priority", operator: "!=", value: "Low", isEditing: false },
      ],
      currentCondition: {
        field: "",
        operator: "",
        value: "",
        isEditing: true,
      },
      showOperators: false,
    },
  },
};

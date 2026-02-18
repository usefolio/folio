import React from "react";
import { useDataContext } from "@/context/DataContext";
import {
  ModalManagerState,
  ModalReducerActions,
  MentionsComponentRef,
} from "@/interfaces/interfaces";
import { InputColumnSelector } from "./inputColumnSelector";
import { PromptInput } from "./promptInput";
import { JsonSchemaBuilder } from "../json/JsonSchemaBuilder";
import {
  SavedPrompt,
  PromptOptions,
  JsonSchemaBuilderTemplate,
} from "@/types/types";
import { Doc } from "convex/_generated/dataModel";
import { GroupedPrompts } from "@/interfaces/interfaces";

interface JsonConfigProps {
  state: ModalManagerState;
  actions: ModalReducerActions;
  projectId: string | null;
  savedJsonSchemas?: JsonSchemaBuilderTemplate[];
  mentionsRef: React.RefObject<MentionsComponentRef>;
  projectColumns: Doc<"column">[];
  validColumnNames: Set<string>;
  promptOptionsRef: React.MutableRefObject<PromptOptions>;
  filteredSavedPrompts: SavedPrompt[];
  handleSelectSavedPrompt: (value: string) => void;
  loadingColumnsSet: Set<string>;
  localMentionsTextAreaValueState: string;
  setLocalMentionsTextAreaValueState: React.Dispatch<
    React.SetStateAction<string>
  >;
  groupedSavedPrompts: GroupedPrompts;
  promptSearch: string;
  setPromptSearch: React.Dispatch<React.SetStateAction<string>>;
  columnName: string;
  isReadOnly?: boolean;
}

export const JsonConfig: React.FC<JsonConfigProps> = ({
  state,
  actions,
  projectId,
  savedJsonSchemas,
  isReadOnly,
  columnName,
  ...rest
}) => {
  const { projects } = useDataContext();
  const { promptOptions } = state;

  if (
    promptOptions.promptType !== "schema" ||
    promptOptions.schemaType !== "freeForm"
  ) {
    return null;
  }

  const currentProject = projects.find((project) => project._id === projectId);

  return (
    <div className="space-y-4 mt-4">
      <JsonSchemaBuilder
        onSchemaChange={(schema) => {
          // This now works because the type guard above guarantees promptOptions is the correct shape.
          actions.setPromptOptions({
            ...promptOptions,
            responseSchema: schema,
          });
        }}
        initialSchema={promptOptions.responseSchema}
        columnName={state.columnName}
        projectName={currentProject?.name || ""}
        savedJsonSchemas={savedJsonSchemas}
        isReadOnly={isReadOnly}
      />
      <InputColumnSelector
        actions={actions}
        promptOptions={promptOptions}
        columnName={columnName}
        isReadOnly={isReadOnly}
        {...rest}
      />
      <PromptInput
        state={state}
        actions={actions}
        isReadOnly={isReadOnly}
        {...rest}
      />
    </div>
  );
};

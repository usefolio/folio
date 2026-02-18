import React from "react";
import {
  ModalManagerState,
  ModalReducerActions,
} from "@/interfaces/interfaces";
import { InputColumnSelector } from "./inputColumnSelector";
import { PromptInput } from "./promptInput";
import { MentionsComponentRef, GroupedPrompts } from "@/interfaces/interfaces";
import { Doc } from "convex/_generated/dataModel";
import { PromptOptions, SavedPrompt } from "@/types/types";

interface TextGenerationConfigProps {
  state: ModalManagerState;
  actions: ModalReducerActions;
  mentionsRef: React.RefObject<MentionsComponentRef>;
  projectColumns: Doc<"column">[];
  validColumnNames: Set<string>;
  promptOptionsRef: React.MutableRefObject<PromptOptions>;
  filteredSavedPrompts: SavedPrompt[];
  handleSelectSavedPrompt: (value: string) => void;
  promptOptions: PromptOptions;
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

export const TextGenerationConfig: React.FC<TextGenerationConfigProps> = ({
  state,
  actions,
  promptOptions,
  isReadOnly,
  columnName,
  ...rest
}) => {
  return (
    <div className="space-y-4 mt-4">
      {!promptOptions.ask && (
        <InputColumnSelector
          actions={actions}
          promptOptions={promptOptions}
          columnName={columnName}
          isReadOnly={isReadOnly}
          {...rest}
        />
      )}
      <PromptInput
        state={state}
        actions={actions}
        isReadOnly={isReadOnly}
        {...rest}
      />
    </div>
  );
};

import React from "react";
import {
  ModalManagerState,
  ModalReducerActions,
  MentionsComponentRef,
} from "@/interfaces/interfaces";
import { Doc } from "convex/_generated/dataModel";
import { PromptOptions } from "@/types/types";
import { InputColumnSelector } from "./inputColumnSelector";

interface CrawlConfigProps {
  state: ModalManagerState;
  promptOptions: PromptOptions;
  projectColumns: Doc<"column">[];
  loadingColumnsSet: Set<string>;
  actions: ModalReducerActions;
  mentionsRef: React.RefObject<MentionsComponentRef>;
  columnName: string;
  isReadOnly?: boolean;
}

export const CrawlConfig: React.FC<CrawlConfigProps> = ({
  isReadOnly,
  columnName,
  state: _state,
  ...props
}) => {
  return (
    <div className="space-y-4 mt-4">
      {/* The only unique UI for Crawl is selecting which column to use as input */}
      <InputColumnSelector
        isReadOnly={isReadOnly}
        columnName={columnName}
        {...props}
      />
    </div>
  );
};

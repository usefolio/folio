import React, { useCallback } from "react";
import { Doc } from "convex/_generated/dataModel";
import { useTranslation } from "react-i18next";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { ChevronsUpDown, Check, Loader2, X } from "lucide-react";
import { PromptOptions } from "@/types/types";
import {
  ModalReducerActions,
  MentionsComponentRef,
} from "@/interfaces/interfaces";

interface InputColumnSelectorProps {
  promptOptions: PromptOptions;
  projectColumns: Doc<"column">[];
  loadingColumnsSet: Set<string>;
  actions: ModalReducerActions;
  mentionsRef: React.RefObject<MentionsComponentRef>;
  columnName: string;
  isReadOnly?: boolean;
}

export const InputColumnSelector: React.FC<InputColumnSelectorProps> = ({
  promptOptions,
  projectColumns,
  loadingColumnsSet,
  actions,
  mentionsRef,
  columnName,
  isReadOnly,
}) => {
  const { t } = useTranslation();
  const summaryColumnPrefix = t(
    "modal_manager.column_modal_config.summary_column_prefix",
  );
  const summaryPrefixWithDash = `${summaryColumnPrefix} - `;

  const isSummaryOption =
    promptOptions.promptType === "noSchema" &&
    !promptOptions.ask &&
    !promptOptions.isCrawl;

  const shouldAutoUpdateSummaryName = (currentName: string) => {
    const trimmed = currentName.trim();
    return trimmed === "" || trimmed.startsWith(summaryPrefixWithDash);
  };

  const maybeUpdateSummaryColumnName = (updatedColumns: string[]) => {
    if (!isSummaryOption) {
      return;
    }

    const trimmedColumnName = columnName.trim();

    if (!shouldAutoUpdateSummaryName(trimmedColumnName)) {
      return;
    }

    if (updatedColumns.length === 0) {
      if (trimmedColumnName !== "") {
        actions.setColumnName("");
      }
      return;
    }

    if (updatedColumns.length === 1) {
      const targetColumn = updatedColumns[0];
      const nextName = `${summaryPrefixWithDash}${targetColumn}`;
      if (nextName !== columnName) {
        actions.setColumnName(nextName);
      }
    }
  };

  const isColumnLoading = useCallback(
    (column: Doc<"column"> | undefined) => {
      if (!column) return false;
      return loadingColumnsSet.has(column._id);
    },
    [loadingColumnsSet],
  );

  const handleColumnToggle = (column: Doc<"column">) => {
    if (isColumnLoading(column)) return;

    const columnName = column.name;
    let currentPrompt = promptOptions.userPrompt || "";
    let updatedColumns = [...promptOptions.promptInputColumns];
    const mention = `{{${columnName}}}`;

    if (updatedColumns.includes(columnName)) {
      // Remove column if already selected
      updatedColumns = updatedColumns.filter((col) => col !== columnName);

      // Remove column mention from prompt
      currentPrompt = currentPrompt.replace(mention, "");
      // Clean up potential double spaces
      currentPrompt = currentPrompt.replace(/\s\s+/g, " ").trim();
    } else {
      // Add column if not already selected
      updatedColumns.push(columnName);

      // Add column mention to prompt if not already included
      if (!currentPrompt.includes(mention)) {
        // If prompt is empty or ends with punctuation/whitespace, just append
        if (currentPrompt.trim() === "" || /[\s.:,;!?]$/.test(currentPrompt)) {
          currentPrompt += mention;
        } else {
          // Otherwise add a space first
          currentPrompt += " " + mention;
        }
      }
    }

    // Update states
    actions.setPromptOptions({
      ...promptOptions,
      userPrompt: currentPrompt,
      promptInputColumns: updatedColumns,
    });
    mentionsRef.current?.updateOverlaySafely(currentPrompt);

    maybeUpdateSummaryColumnName(updatedColumns);
  };

  const handleRemoveBadge = (colName: string) => {
    const updatedColumns = promptOptions.promptInputColumns.filter(
      (c) => c !== colName,
    );
    let currentPrompt = promptOptions.userPrompt || "";

    // Remove column mention from prompt
    const mention = `{{${colName}}}`;
    currentPrompt = currentPrompt.replace(mention, "");
    currentPrompt = currentPrompt.replace(/\s\s+/g, " ").trim();

    actions.setPromptOptions({
      ...promptOptions,
      userPrompt: currentPrompt,
      promptInputColumns: updatedColumns,
    });

    mentionsRef.current?.updateOverlaySafely(currentPrompt);

    maybeUpdateSummaryColumnName(updatedColumns);
  };

  return (
    <div>
      <Label className="text-xs font-medium text-gray-500 block mb-2">
        {t("modal_manager.column_modal_config.select_input_columns")}
      </Label>

      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            disabled={isReadOnly}
            className="!h-10 w-full justify-between rounded-md mb-2 text-sm text-muted-foreground font-normal pl-3 hover:bg-background hover:text-muted-foreground"
          >
            {promptOptions.promptInputColumns.length > 0
              ? `${promptOptions.promptInputColumns.length} ${t("modal_manager.column_modal_config.column")}${promptOptions.promptInputColumns.length > 1 ? "s" : ""} ${t("modal_manager.column_modal_config.selected")}`
              : t("modal_manager.column_modal_config.select_columns")}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full p-0 rounded-md" align="start">
          <Command>
            <CommandInput
              placeholder={t(
                "modal_manager.column_modal_config.search_columns",
              )}
              className="h-10"
            />
            <CommandList
              onWheel={(e) => e.stopPropagation()}
              className="scrollbar-thin column-name-command-list"
            >
              <CommandEmpty>
                {t("modal_manager.column_modal_config.no_columns_found")}
              </CommandEmpty>
              <CommandGroup>
                {projectColumns.map((column) => (
                  <CommandItem
                    key={column._id}
                    className={`rounded-md ${isColumnLoading(column) ? "opacity-40 cursor-not-allowed" : ""}`}
                    onSelect={() => handleColumnToggle(column)}
                  >
                    <div className="flex items-center">
                      <Check
                        className={`mr-2 h-4 w-4 ${promptOptions.promptInputColumns.includes(column.name) ? "opacity-100" : "opacity-0"}`}
                      />
                      <span>{column.name}</span>
                      {isColumnLoading(column) && (
                        <Loader2 className="ml-2 h-3 w-3 animate-spin text-primary" />
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {promptOptions.promptInputColumns.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {promptOptions.promptInputColumns.map((colName) => (
            <Badge
              key={colName}
              className="whitespace-normal leading-[20px] px-1 py-[1.5px] rounded-none z-1 pointer-events-auto text-xs font-[550] bg-gray-50 hover:bg-muted text-muted-foreground border border-border border-solid"
            >
              {colName}
              <X
                className="ml-1 w-3 h-3 cursor-pointer"
                onClick={
                  isReadOnly ? undefined : () => handleRemoveBadge(colName)
                }
              />
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
};

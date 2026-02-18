import React, { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Library } from "lucide-react";
import MentionsComponent from "./mentionsComponent";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { TriangleAlert } from "lucide-react";
import {
  ModalManagerState,
  ModalReducerActions,
  MentionsComponentRef,
  GroupedPrompts,
} from "@/interfaces/interfaces";
import { Doc } from "convex/_generated/dataModel";
import { SavedPrompt, PromptOptions } from "@/types/types";

interface PromptInputProps {
  state: ModalManagerState;
  actions: ModalReducerActions;
  mentionsRef: React.RefObject<MentionsComponentRef>;
  projectColumns: Doc<"column">[];
  validColumnNames: Set<string>;
  promptOptionsRef: React.MutableRefObject<PromptOptions>;
  groupedSavedPrompts: GroupedPrompts;
  filteredSavedPrompts: SavedPrompt[];
  handleSelectSavedPrompt: (value: string) => void;
  localMentionsTextAreaValueState: string;
  setLocalMentionsTextAreaValueState: React.Dispatch<
    React.SetStateAction<string>
  >;
  promptSearch: string;
  setPromptSearch: React.Dispatch<React.SetStateAction<string>>;
  isReadOnly?: boolean;
  mode?: "schedule";
}

export const PromptInput: React.FC<PromptInputProps> = ({
  state,
  actions,
  mentionsRef,
  projectColumns,
  validColumnNames,
  promptOptionsRef,
  groupedSavedPrompts,
  handleSelectSavedPrompt,
  localMentionsTextAreaValueState,
  setLocalMentionsTextAreaValueState,
  promptSearch,
  setPromptSearch,
  isReadOnly,
  mode,
}) => {
  const { t } = useTranslation();
  const {
    promptOptions,
    promptInputOverlayValidationError,
    promptInputOverlayValidationWarning,
  } = state;
  // Declared conditions
  const isTextGeneration =
    promptOptions.promptType === "noSchema" &&
    !promptOptions.ask &&
    !promptOptions.isCrawl;

  const isJsonExtraction =
    promptOptions.promptType === "schema" &&
    promptOptions.schemaType === "freeForm";

  const isTagData =
    promptOptions.promptType === "schema" &&
    (promptOptions.schemaType === "singleTag" ||
      promptOptions.schemaType === "multiTag");

  const canIdentifyTopics =
    isTagData || promptOptions.promptType === "noSchema";

  const [open, setOpen] = useState(false);
  // Handle template select function
  const handleTemplateSelect = useCallback(
    (templateString: string) => {
      // Get current column mentions for preservation
      const currentColumns = promptOptions.promptInputColumns || [];
      const columnMentions =
        currentColumns.length > 0
          ? " " + currentColumns.map((col) => `{{${col}}}`).join(" ")
          : "";

      const newPrompt = `${templateString}${columnMentions}`;

      // Update all necessary state
      actions.setPromptOptions({
        ...promptOptions,
        userPrompt: newPrompt,
      });
      setLocalMentionsTextAreaValueState(newPrompt);
      mentionsRef.current?.updateOverlaySafely(newPrompt);
      setOpen(false); // Close the popover
    },
    [
      promptOptions,
      actions,
      setLocalMentionsTextAreaValueState,
      mentionsRef,
      setOpen,
    ],
  );
  return (
    <div className="relative w-full space-y-1">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium text-gray-500">
          {t("modal_manager.column_modal_config.user_prompt_template_label")}
        </Label>
        <Popover open={open} onOpenChange={isReadOnly ? undefined : setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              disabled={isReadOnly}
              className="h-8 px-2 text-primary text-xs rounded-md"
            >
              <Library className="h-4 w-4 mr-1" />
              {t("modal_manager.column_modal_config.check_prompt_library")}
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="w-[450px] p-0 rounded-md library-command-list"
            align="end"
          >
            <Command>
              {/* This is the new search bar */}
              <CommandInput
                placeholder={t(
                  "modal_manager.column_modal_config.search_prompts_placeholder",
                )}
                value={promptSearch}
                onValueChange={setPromptSearch}
              />
              <CommandList
                className="scrollbar-thin rounded-md"
                onScroll={(e) => {
                  e.stopPropagation();
                }}
                onWheel={(e) => {
                  e.stopPropagation();
                }}
              >
                <CommandEmpty>
                  {t("modal_manager.column_modal_config.no_prompts_found")}
                </CommandEmpty>

                {/* 5. Render the grouped prompts */}
                {Object.entries(groupedSavedPrompts).map(
                  ([sheetName, prompts]) => (
                    <CommandGroup
                      key={sheetName}
                      heading={sheetName}
                      className="rounded-md"
                    >
                      {prompts.map((prompt) => (
                        <CommandItem
                          className="rounded-md cursor-pointer"
                          key={`${prompt.columnName}-${prompt.projectId}`}
                          onSelect={() => {
                            handleSelectSavedPrompt(
                              `${prompt.columnName}-${prompt.projectId}`,
                            );
                            setOpen(false); // Close popover on selection
                          }}
                        >
                          {`${prompt.columnName} - ${prompt.projectName}`}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  ),
                )}
                <CommandSeparator />
                <CommandGroup
                  heading={t(
                    "modal_manager.column_modal_config.templates_group_heading",
                  )}
                >
                  {isTextGeneration && (
                    <>
                      <CommandItem
                        className="rounded-md cursor-pointer"
                        onSelect={() =>
                          handleTemplateSelect(
                            t(
                              "modal_manager.column_modal_config.summarize_in_3_details",
                            ),
                          )
                        }
                      >
                        {t("modal_manager.column_modal_config.summarize_in_3")}
                      </CommandItem>
                      <CommandItem
                        className="rounded-md cursor-pointer"
                        onSelect={() =>
                          handleTemplateSelect(
                            t(
                              "modal_manager.column_modal_config.summarize_in_2_details",
                            ),
                          )
                        }
                      >
                        {t("modal_manager.column_modal_config.summarize_in_2")}
                      </CommandItem>
                      <CommandItem
                        className="rounded-md cursor-pointer"
                        onSelect={() =>
                          handleTemplateSelect(
                            t(
                              "modal_manager.column_modal_config.summarize_in_1_details",
                            ),
                          )
                        }
                      >
                        {t("modal_manager.column_modal_config.summarize_in_1")}
                      </CommandItem>
                    </>
                  )}

                  {isJsonExtraction && (
                    <CommandItem
                      className="rounded-md cursor-pointer"
                      onSelect={() =>
                        handleTemplateSelect(
                          t(
                            "modal_manager.column_modal_config.extract_key_entities_details",
                          ),
                        )
                      }
                    >
                      {t(
                        "modal_manager.column_modal_config.extract_key_entities",
                      )}
                    </CommandItem>
                  )}

                  {isTagData && (
                    <CommandItem
                      className="rounded-md cursor-pointer"
                      onSelect={() =>
                        handleTemplateSelect(
                          t(
                            "modal_manager.column_modal_config.classify_sentiment_details",
                          ),
                        )
                      }
                    >
                      {t(
                        "modal_manager.column_modal_config.classify_sentiment",
                      )}
                    </CommandItem>
                  )}

                  {canIdentifyTopics && (
                    <CommandItem
                      className="rounded-md cursor-pointer"
                      onSelect={() =>
                        handleTemplateSelect(
                          t(
                            "modal_manager.column_modal_config.identify_main_topics_details",
                          ),
                        )
                      }
                    >
                      {t(
                        "modal_manager.column_modal_config.identify_main_topics",
                      )}
                    </CommandItem>
                  )}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
      <MentionsComponent
        ref={mentionsRef}
        value={localMentionsTextAreaValueState}
        setValue={setLocalMentionsTextAreaValueState}
        setPromptOptions={actions.setPromptOptions}
        setMentionsPopupPosition={actions.setMentionsPopupPosition}
        projectColumns={projectColumns}
        overlayError={promptInputOverlayValidationError}
        overlayWarning={promptInputOverlayValidationWarning}
        overlayErrorSetter={actions.setPromptInputOverlayValidationError}
        overlayWarningSetter={actions.setPromptInputOverlayValidationWarning}
        validColumnNames={validColumnNames}
        promptOptionsRef={promptOptionsRef}
        disabled={isReadOnly}
        showCopyButton={isReadOnly}
      />
      {promptInputOverlayValidationWarning &&
        promptOptions.userPrompt &&
        !mode && (
          <Alert className="rounded-md pr-1 pl-2 py-2 border border-[#F2C14B] bg-[#FFFBED]">
            <TriangleAlert color="#E9A13B" className="h-4 w-4 mt-[1px]" />
            <AlertTitle className="text-[#88451E] text-sm mb-0">
              {t("modal_manager.column_modal_config.warning")}
            </AlertTitle>
            <AlertDescription className="text-xs text-[#A85823]">
              {promptInputOverlayValidationWarning}
            </AlertDescription>
          </Alert>
        )}
    </div>
  );
};

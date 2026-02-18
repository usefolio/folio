import React, { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import WarningAlert from "@/components/ui/warningAlert";
import { Plus, X, Copy } from "lucide-react";
import {
  ModalManagerState,
  ModalReducerActions,
  MentionsComponentRef,
} from "@/interfaces/interfaces";
import { SavedPrompt, PromptOptions } from "@/types/types";
import { PromptInput } from "./promptInput";
import Tag from "../../tags/tag";
import { getColorForTag, hexColorPalette } from "@/utils/CellDraw";
import { debounce } from "@/utils/general";
import { Doc } from "convex/_generated/dataModel";
import { GroupedPrompts } from "@/interfaces/interfaces";
import IconButton from "@/components/ui/iconButton";
import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import {
  showErrorNotification,
  showSuccessNotification,
} from "@/components/notification/NotificationHandler";

type TagSeparator = "comma" | "newline";

const tokenizeTags = (input: string, separators: Set<string>): string[] => {
  const tokens: string[] = [];
  let current = "";
  let quoteChar: string | null = null;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];

    if (char === "\r") {
      continue;
    }

    if (quoteChar) {
      current += char;
      if (char === quoteChar) {
        quoteChar = null;
      }
      continue;
    }

    if (
      (char === '"' || char === "'") &&
      current.trim().length === 0
    ) {
      quoteChar = char;
      current += char;
      continue;
    }

    if (separators.has(char)) {
      const trimmed = current.trim();
      if (trimmed) {
        tokens.push(trimmed);
      }
      current = "";
      continue;
    }

    current += char;
  }

  const trimmed = current.trim();
  if (trimmed) {
    tokens.push(trimmed);
  }

  return tokens;
};

const parseTagsWithPreferredSeparator = (
  input: string | undefined,
): { tags: string[]; separator: TagSeparator } => {
  if (!input) {
    return { tags: [], separator: "comma" };
  }

  const commaTokens = tokenizeTags(input, new Set([","]));
  const newlineTokens = tokenizeTags(input, new Set(["\n"]));

  const useNewline = newlineTokens.length > commaTokens.length;

  return {
    tags: useNewline ? newlineTokens : commaTokens,
    separator: useNewline ? "newline" : "comma",
  };
};

const formatTagsForInput = (tags: string[], separator: TagSeparator): string => {
  if (tags.length === 0) {
    return "";
  }

  return separator === "newline" ? tags.join("\n") : tags.join(", ");
};

interface StructuredPromptConfigProps {
  state: ModalManagerState;
  actions: ModalReducerActions;
  mentionsRef: React.RefObject<MentionsComponentRef>;
  projectColumns: Doc<"column">[];
  validColumnNames: Set<string>;
  promptOptionsRef: React.MutableRefObject<PromptOptions>;
  filteredSavedPrompts: SavedPrompt[];
  handleSelectSavedPrompt: (value: string) => void;
  localMentionsTextAreaValueState: string;
  setLocalMentionsTextAreaValueState: React.Dispatch<
    React.SetStateAction<string>
  >;
  setLocalTagTextareaValue: React.Dispatch<React.SetStateAction<string>>;
  localTagTextareaValue: string;
  groupedSavedPrompts: GroupedPrompts;
  promptSearch: string;
  setPromptSearch: React.Dispatch<React.SetStateAction<string>>;
  columnName: string;
  isReadOnly?: boolean;
}

export const StructuredPromptConfig: React.FC<StructuredPromptConfigProps> = ({
  state,
  actions,
  setLocalMentionsTextAreaValueState,
  setLocalTagTextareaValue,
  localTagTextareaValue,
  isReadOnly,
  ...rest
}) => {
  const { t } = useTranslation();
  const {
    promptOptions,
    isEditingTagTextArea,
    tagTextAreaError,
    tagTextAreaerrorDetails,
    tagTextAreaOriginalInput,
    tagTextAreaValue,
  } = state;
  const showTagCopyButton = Boolean(isReadOnly);
  const tagResponseOptions = useMemo(() => {
    if (
      promptOptions.promptType === "schema" &&
      (promptOptions.schemaType === "singleTag" ||
        promptOptions.schemaType === "multiTag")
    ) {
      return promptOptions.responseOptions;
    }

    return [] as string[];
  }, [promptOptions]);
  const debouncedSetTagTextareaValue = useCallback(
    debounce((value: string) => {
      actions.setTagTextareaValue(value);
    }, 150),
    [actions],
  );
  const validateTags = (
    tags: string[] | undefined,
  ): { validTags: string[] | undefined; invalidTags: string[] | undefined } => {
    const invalidTags = tags?.filter((tag) => {
      if (!tag || typeof tag !== "string") return true; // Reject undefined/null values
      const trimmedTag = tag?.trim(); // Remove leading/trailing whitespace

      return (
        trimmedTag === "" || // Reject empty/whitespace-only tags
        // Incomplete quoted strings: starts with " or ' but doesn't end properly
        ((trimmedTag.startsWith('"') || trimmedTag.startsWith("'")) &&
          !(trimmedTag.endsWith('"') || trimmedTag.endsWith("'"))) ||
        // Check for unquoted tags with invalid characters
        (!/^[a-zA-Z0-9\s\-&'/\\\\]+$/.test(trimmedTag) &&
          !/^["'].*["']$/.test(trimmedTag))
      );
    });

    const validTags = tags?.filter((tag) => !invalidTags?.includes(tag));
    return { validTags, invalidTags };
  };
  // Clicking the close icon will remove the tag entirely
  const handleRemoveTag = useCallback(
    (removedTag: string) => {
      if (
        promptOptions.promptType === "schema" &&
        (promptOptions.schemaType === "singleTag" ||
          promptOptions.schemaType === "multiTag")
      ) {
        const updatedTags = tagResponseOptions.filter(
          (tag) => tag !== removedTag,
        );
        actions.setPromptOptions({
          ...promptOptions,
          responseOptions: updatedTags,
        });
      }

      // Update the original input to reflect the removal
      const {
        tags: originalTags,
        separator,
      } = parseTagsWithPreferredSeparator(tagTextAreaOriginalInput);
      const updatedOriginalTags = originalTags.filter((tag) => {
        const normalizedTag = tag.replace(/^['"]|['"]$/g, "");
        return normalizedTag !== removedTag;
      });
      const updatedOriginal = formatTagsForInput(
        updatedOriginalTags,
        separator,
      );
      actions.setTagTextAreaOriginalInput(updatedOriginal);
      actions.setTagTextareaValue(updatedOriginal);
      setLocalTagTextareaValue(updatedOriginal);
    },
    [promptOptions, actions, tagTextAreaOriginalInput, tagResponseOptions],
  );

  const handleTextareaBlurOrSubmit = () => {
    const { tags: parsedTags, separator } = parseTagsWithPreferredSeparator(
      tagTextAreaValue,
    );
    const { validTags, invalidTags } = validateTags(parsedTags);
    if (invalidTags?.length === 0) {
      if (
        promptOptions.promptType === "schema" &&
        (promptOptions.schemaType === "singleTag" ||
          promptOptions.schemaType === "multiTag")
      ) {
        const processedTags = validTags
          ? validTags.map((tag) => tag.replace(/^['"]|['"]$/g, ""))
          : [];

        const updatedOptions = {
          ...promptOptions,
          promptType: promptOptions.promptType,
          schemaType: promptOptions.schemaType,
          responseOptions: processedTags,
        };

        // Update the state
        actions.setPromptOptions(updatedOptions);
      }
      const formattedInput = formatTagsForInput(parsedTags, separator);
      actions.setTagTextAreaOriginalInput(formattedInput);
      actions.setTagTextAreaError(false);
      actions.setTagTextAreaErrorDetails("");
      // Only exit editing mode if there are no errors
      actions.setIsEditingTagTextArea(false);
    } else {
      actions.setTagTextAreaError(true);
      actions.setTagTextAreaErrorDetails(
        t("modal_manager.column_modal_config.invalid_tags_error", {
          invalidTags:
            invalidTags?.join(", ") === ""
              ? t(
                  "modal_manager.column_modal_config.invalid_tags_error_whitespace",
                )
              : invalidTags?.join(", "),
        }),
      );
    }
  };

  const canCopyTags = (() => {
    const source = isEditingTagTextArea
      ? localTagTextareaValue
      : tagTextAreaOriginalInput ||
        formatTagsForInput(tagResponseOptions, "comma");
    return Boolean(source?.trim());
  })();

  const handleCopyTags = useCallback(async () => {
    const source = isEditingTagTextArea
      ? localTagTextareaValue
      : tagTextAreaOriginalInput ||
        formatTagsForInput(tagResponseOptions, "comma");
    if (!source?.trim()) return;

    try {
      await navigator.clipboard.writeText(source);
      showSuccessNotification(t("global.copied"), t("global.copy"));
    } catch (error) {
      showErrorNotification(
        t("global.error"),
        t("global.copy_error", {
          error:
            error instanceof Error
              ? error.message
              : t("global.unknown_error"),
        }),
      );
    }
  }, [
    isEditingTagTextArea,
    localTagTextareaValue,
    tagTextAreaOriginalInput,
    tagResponseOptions,
    t,
  ]);

  const handleTextareaKeyDown = (
    e: React.KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleTextareaBlurOrSubmit();
    }
  };

  const handleTagClick = () => {
    actions.setTagTextareaValue(tagTextAreaOriginalInput); // Restore original formatting
    actions.setIsEditingTagTextArea(true);
    setTimeout(() => {
      const textarea = document.getElementById("tagTextArea");
      textarea?.focus();
    }, 200);
  };
  if (
    promptOptions.promptType !== "schema" ||
    (promptOptions.schemaType !== "singleTag" &&
      promptOptions.schemaType !== "multiTag")
  ) {
    return null;
  }
  const handlePromptSubTypeChange = (value: boolean) => {
    if (
      promptOptions.promptType === "schema" &&
      (promptOptions.schemaType === "singleTag" ||
        promptOptions.schemaType === "multiTag")
    ) {
      actions.setPromptOptions({
        ...promptOptions,
        schemaType: value ? "multiTag" : "singleTag",
      });
    } else if ("promptSubType" in promptOptions) {
      actions.setPromptOptions({
        ...(promptOptions as any),
        promptSubType: value ? "multiTag" : "singleTag",
      });
    } else {
      console.error("promptOptions does not support schema type change");
    }
  };

  const checkIfTagsEmpty = (): boolean => {
    if (
      promptOptions.promptType === "schema" &&
      (promptOptions.schemaType === "singleTag" ||
        promptOptions.schemaType === "multiTag")
    ) {
      return tagResponseOptions.length === 0;
    }
    return false;
  };

  return (
    <div className="space-y-4 mt-4">
      <PromptInput
        state={state}
        actions={actions}
        isReadOnly={isReadOnly}
        {...rest}
        setLocalMentionsTextAreaValueState={setLocalMentionsTextAreaValueState}
      />

      <div className="space-y-1">
        <Label className="text-xs font-medium text-gray-500">
          {t("modal_manager.column_modal_config.define_output_values_label")}
        </Label>
        {!isEditingTagTextArea ? (
          <div className="relative">
            <div
              onClick={isReadOnly ? undefined : handleTagClick}
              className={`flex items-center hover:bg-border p-2 min-h-10 border border-solid border-input ${showTagCopyButton ? "pr-12" : ""}`}
            >
              {tagResponseOptions.length > 0 ? (
                <div className="flex flex-wrap gap-2 items-center">
                  {(() => {
                    const tagColors = getColorForTag(
                      tagResponseOptions,
                    ) as string[];
                    return tagResponseOptions.map((tag, index) => {
                      if (!tag?.trim()) return null;
                      const colorName = tagColors[index];
                      const colorStyle =
                        hexColorPalette[
                          colorName as keyof typeof hexColorPalette
                        ] || hexColorPalette.charcoal;
                      return (
                        <Tag key={tag} tag={tag} colorName={colorName}>
                          <div className="flex-1">{tag}</div>
                          <X
                            onClick={(e) => {
                              if (isReadOnly) return;
                              e.stopPropagation();
                              handleRemoveTag(tag);
                            }}
                            style={{ color: colorStyle?.text }}
                            size="14px"
                            className="ml-2 cursor-pointer flex-2"
                          />
                        </Tag>
                      );
                    });
                  })()}
                </div>
              ) : (
                <div className="flex flex-wrap gap-2 items-center">
                  <Button
                    variant="default"
                    size="icon"
                    onClick={handleTagClick}
                    className="h-[25px] w-[25px] rounded-md leading-[20px] px-3 py-[3.5px]"
                  >
                    <Plus size="14px" className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>
            {showTagCopyButton && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <IconButton
                      icon={<Copy className="h-4 w-4" />}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleCopyTags();
                      }}
                      disabled={!canCopyTags}
                      aria-label={t("global.copy")}
                      className="rounded-md absolute bottom-2 right-2"
                    />
                  </TooltipTrigger>
                  <TooltipContent side="left">
                    <p>{t("global.copy")}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        ) : (
          <>
            <div className="relative">
              <Textarea
                value={localTagTextareaValue}
                onChange={(e) => {
                  setLocalTagTextareaValue(e.target.value);
                  debouncedSetTagTextareaValue(e.target.value);
                }}
                onBlur={handleTextareaBlurOrSubmit}
                onKeyDown={handleTextareaKeyDown}
                disabled={isReadOnly}
                id="tagTextArea"
                placeholder={t(
                  "modal_manager.column_modal_config.enter_tags_placeholder",
                )}
                className={`${
                  tagTextAreaError
                    ? "border-red-500 rounded-md resize-none min-h-20"
                    : "rounded-md resize-none min-h-20"
                } ${showTagCopyButton ? "pr-12" : ""}`}
              />
              {showTagCopyButton && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <IconButton
                        icon={<Copy className="h-4 w-4" />}
                        onMouseDown={(event) => {
                          event.preventDefault();
                        }}
                        onClick={() => {
                          void handleCopyTags();
                        }}
                        disabled={!canCopyTags}
                        aria-label={t("global.copy")}
                        className="rounded-md absolute bottom-2 right-2"
                      />
                    </TooltipTrigger>
                    <TooltipContent side="left">
                      <p>{t("global.copy")}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
            {tagTextAreaError && (
              <div className="text-red-500 mt-2 text-xs">
                {tagTextAreaerrorDetails}
              </div>
            )}
          </>
        )}
        {checkIfTagsEmpty() && !isEditingTagTextArea && (
          <div className="mt-2">
            <WarningAlert title={t("modal_manager.main.validation_error_title")}>
              {t("modal_manager.column_modal_config.no_tags_error_message")}
            </WarningAlert>
          </div>
        )}
      </div>

      <div className="flex items-center justify-end space-x-2 mt-1">
        <span
          className={`text-sm text-gray-500 ${promptOptions.schemaType === "singleTag" ? "font-medium" : ""}`}
        >
          {t("modal_manager.column_modal_config.pick_one")}
        </span>
        <Switch
          id="multiple-tags"
          disabled={isReadOnly}
          checked={promptOptions.schemaType === "multiTag"}
          onCheckedChange={handlePromptSubTypeChange}
        />
        <span
          className={`text-sm text-gray-500 ${promptOptions.schemaType === "multiTag" ? "font-medium" : ""}`}
        >
          {t("modal_manager.column_modal_config.pick_many")}
        </span>
      </div>
    </div>
  );
};

import React, { useCallback, useMemo, useEffect, useRef } from "react";
import { DISALLOWED_PROJECT_NAME_CHARS } from "@/utils/projectNameUtils";
import { ColumnModalConfigProps } from "../../interfaces/interfaces";
import { useTranslation } from "react-i18next";
import { useDataContext } from "../../context/DataContext";
import { RadioGroup } from "../ui/radio-group";
import {
  Select,
  SelectContent,
  SelectTrigger,
  SelectValue,
  SelectItem,
} from "../ui/select";
import { Label } from "../ui/label";
import InfoAlert from "@/components/ui/infoAlert";
import { Check, Loader2 } from "lucide-react";
import { LLMModel, LLMModelEnum, PromptOptions } from "../../types/types";
import { ContentTransition } from "./contentTransition";
import ColumnNameInput from "./columnModalConfig/columnNameInput";
import { createDefaultPromptOptions } from "@/utils/promptUtils";
import { CrawlConfig } from "./columnModalConfig/crawlConfig";
import { JsonConfig } from "./columnModalConfig/jsonConfig";
import { StructuredPromptConfig } from "./columnModalConfig/structuredPromptConfig";
import { TextGenerationConfig } from "./columnModalConfig/textGenerationConfig";
import { useBackendClient } from "@/hooks/useBackendClient";
import { useFreshToken } from "@/hooks/useFreshToken";

type PromptVariant = "structured" | "summarize" | "ask" | "extract" | "crawl";

const PROMPT_VARIANT_MODEL_MAP: Record<PromptVariant, readonly LLMModel[]> = {
  structured: [LLMModelEnum.GPT5, LLMModelEnum.GPT41],
  summarize: [LLMModelEnum.GPT5, LLMModelEnum.GPT41, LLMModelEnum.GEMINI_25_FLASH],
  ask: [LLMModelEnum.GPT5, LLMModelEnum.GPT41, LLMModelEnum.GEMINI_25_FLASH],
  extract: [LLMModelEnum.GPT5, LLMModelEnum.GPT41],
  crawl: [LLMModelEnum.GPT5, LLMModelEnum.GPT41, LLMModelEnum.GEMINI_25_FLASH],
} as const;

const FALLBACK_MODELS: readonly LLMModel[] = [
  LLMModelEnum.GPT5,
  LLMModelEnum.GPT41,
];

const MODEL_TRANSLATION_KEYS: Partial<Record<LLMModelEnum, string>> = {
  [LLMModelEnum.GPT5]: "modal_manager.column_modal_config.gpt_5",
  [LLMModelEnum.GPT41]: "modal_manager.column_modal_config.gpt_41",
  [LLMModelEnum.GEMINI_25_FLASH]: "modal_manager.column_modal_config.gemini_25_flash",
};

const getPromptVariant = (options: PromptOptions): PromptVariant => {
  if (options.isCrawl) {
    return "crawl";
  }
  if (options.promptType === "noSchema") {
    return options.ask ? "ask" : "summarize";
  }
  if (options.promptType === "schema" && options.schemaType === "freeForm") {
    return "extract";
  }
  return "structured";
};

const ColumnModalConfig: React.FC<ColumnModalConfigProps> = ({
  state,
  actions,
  projectId,
  savedJsonSchemas,
  mentionsRef,
  promptOptionsRef,
  localMentionsTextAreaValueState,
  setLocalMentionsTextAreaValueState,
  promptSearch,
  setPromptSearch,
  validColumnNames,
  filteredSavedPrompts,
  groupedSavedPrompts,
  handleSelectSavedPrompt,
  localTagTextareaValue,
  setLocalTagTextareaValue,
  isEditingExistingNode = false,
  useCostEstimation = true,
  nodeError = undefined,
  isReadOnly = false,
}) => {
  const {
    columnName,
    promptOptions,
    promptNameError,
    estimatedCost,
    estimatedCostLoading,
  } = state;
  const { t } = useTranslation();
  const {
    columns: projectColumns,
    // projects,
    sheet,
    convex,
    loadingColumnsSet,
  } = useDataContext();
  const timeoutRef = useRef<number | null>(null);
  const warningTimeoutRef = useRef<number | null>(null);
  const costEstimationTimeoutRef = useRef<number | null>(null);
  // State for performing a search in the library dropdown

  const costEstimationAbortControllerRef = useRef<AbortController | null>(null);
  const getToken = useFreshToken();
  const backendClient = useBackendClient();

  const validateColumnName = useCallback(
    (name: string) => {
      // Quick exit for empty names
      if (!name) {
        actions.setPromptNameError(null);
        return;
      }

      // Check for disallowed characters first (faster)
      const matches = name.match(DISALLOWED_PROJECT_NAME_CHARS);
      if (matches) {
        const uniqueInvalidChars = [...new Set(matches)].join(", ");
        actions.setPromptNameError(
          t("modal_manager.column_modal_config.invalid_characters_error", {
            chars: uniqueInvalidChars,
          }),
        );
        return;
      }

      // Then check for duplicates
      const nameLower = name.toLowerCase();
      const isDuplicate = projectColumns.some(
        (column) => column.name.toLowerCase() === nameLower,
      );

      if (isDuplicate) {
        actions.setPromptNameError(
          t("modal_manager.column_modal_config.column_name_exists_error"),
        );
      } else {
        actions.setPromptNameError(null);
      }
    },
    [actions, projectColumns, t],
  );

  const handleColumnNameChange = useCallback(
    (value: string) => {
      validateColumnName(value);
      actions.setColumnName(value);
    },
    [actions, validateColumnName],
  );
  // Clear timeouts on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (warningTimeoutRef.current) {
        clearTimeout(warningTimeoutRef.current);
      }
      if (costEstimationTimeoutRef.current) {
        clearTimeout(costEstimationTimeoutRef.current);
      }
    };
  }, []);

  const handleModelChange = useCallback(
    (value: LLMModel, promptOptions: PromptOptions) => {
      actions.setPromptOptions({ ...promptOptions, model: value });
    },
    [actions],
  );
  // Prompt cost estimation function
  const costEstimation = useCallback(async () => {
    if (!useCostEstimation || isReadOnly) {
      return;
    }
    // Clear any existing timeout
    if (costEstimationTimeoutRef.current) {
      clearTimeout(costEstimationTimeoutRef.current);
    }
    // Add abort controller to prevent backend spam
    if (costEstimationAbortControllerRef.current) {
      costEstimationAbortControllerRef.current.abort();
    }

    const controller = new AbortController();
    costEstimationAbortControllerRef.current = controller;
    // Set a new timeout
    costEstimationTimeoutRef.current = window.setTimeout(async () => {
      try {
        // Only calculate cost when there are necessary values
        if (
          projectId &&
          sheet?._id &&
          columnName &&
          promptOptions.model &&
          promptOptions.promptType &&
          promptOptions.userPrompt &&
          promptOptions.promptInputColumns.length > 0
        ) {
          actions.setEstimatedCostLoading(true);
          const cost = await backendClient.calculateCost({
            columnName,
            promptOptions,
            signal: controller.signal,
            project_id: projectId,
            sheet,
          });

          if (cost && cost.total_price) {
            const rawCost = cost.total_price;
            const roundedCost =
              rawCost > 0 && rawCost < 0.01 ? 0.01 : Number(rawCost.toFixed(2));
            actions.setEstimatedCost(roundedCost.toFixed(2));
          } else {
            actions.setEstimatedCost("0.00");
          }
        }
        actions.setEstimatedCostLoading(false);
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "message" in error &&
          typeof (error as any).message === "string" &&
          (error as any).message.toLowerCase().includes("abort")
        ) {
          return;
        } else {
          console.error("Error estimating cost:", error);
          actions.setEstimatedCost("0.00");
        }
      }
    }, 1000);
  }, [
    projectId,
    sheet?._id,
    columnName,
    promptOptions,
    getToken,
    convex,
    t,
    useCostEstimation,
    isReadOnly,
  ]);

  const crawlFeatureEnabled = false;

  const isCrawlPromptDisabled =
    isReadOnly || (isEditingExistingNode && !nodeError) || !crawlFeatureEnabled;

  const handlePromptTypeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const promptTypeValue = e.target.value as
        | "StructuredOutput"
        | "TextGeneration"
        | "ask"
        | "json"
        | "crawl";
      // Clear all relevant state slices in the reducer.
      actions.clearColumnModalData();
      // Create the new default state.
      const newPromptOptions = createDefaultPromptOptions(promptTypeValue);
      // Set the new state.
      actions.setPromptOptions(newPromptOptions);
      setLocalMentionsTextAreaValueState(newPromptOptions.userPrompt);
      setLocalTagTextareaValue("");
      // Because there's no local state, the UI will instantly reflect this new global state.
      mentionsRef.current?.updateOverlaySafely(newPromptOptions.userPrompt);
    },
    [actions, promptOptions],
  );
  // Trigger cost estimation when relevant props change
  useEffect(() => {
    if (!useCostEstimation || isReadOnly) {
      actions.setEstimatedCost(null);
      if (costEstimationTimeoutRef.current) {
        clearTimeout(costEstimationTimeoutRef.current);
      }
      return;
    }
    // Only run cost estimation when meaningful changes happen
    if (promptOptions.isCrawl) {
      actions.setEstimatedCost(null);
      return;
    }
    if (
      promptOptions.model &&
      promptOptions.promptType &&
      promptOptions.userPrompt &&
      promptOptions.promptInputColumns.length > 0
    ) {
      costEstimation();
    }
    return () => {
      if (costEstimationTimeoutRef.current) {
        clearTimeout(costEstimationTimeoutRef.current);
      }
    };
  }, [
    promptOptions.model,
    promptOptions.promptType,
    promptOptions.userPrompt,
    promptOptions.promptInputColumns,
    useCostEstimation,
    isReadOnly,
  ]);

  useEffect(() => {
    promptOptionsRef.current = promptOptions;
  }, [promptOptions]);
  //Animate when switching between JSON, Tag Data etc
  const animationKey = useMemo(() => {
    if (promptOptions.isCrawl) {
      return "crawl";
    }
    if (promptOptions.promptType === "schema") {
      return promptOptions.schemaType === "freeForm" ? "json" : "structured";
    }
    if (promptOptions.promptType === "noSchema") {
      return promptOptions.ask ? "ask" : "textGen";
    }
    return "unknown";
  }, [
    promptOptions.promptType,
    promptOptions.ask,
    promptOptions.isCrawl,
    (promptOptions as any).schemaType,
  ]);

  const renderPromptSpecificUI = () => {
    const propsToPass = {
      state,
      actions,
      projectColumns,
      savedJsonSchemas,
      validColumnNames,
      loadingColumnsSet,
      mentionsRef,
      promptOptionsRef,
      filteredSavedPrompts,
      groupedSavedPrompts,
      promptSearch,
      setPromptSearch,
      promptOptions,
      handleSelectSavedPrompt,
      projectId,
      localMentionsTextAreaValueState,
      setLocalMentionsTextAreaValueState,
      setLocalTagTextareaValue,
      localTagTextareaValue,
      isReadOnly,
      columnName: state.columnName,
    };

    if (promptOptions.isCrawl && promptOptions.promptType === "noSchema") {
      return <CrawlConfig {...propsToPass} />;
    }
    if (promptOptions.promptType === "schema") {
      if (promptOptions.schemaType === "freeForm") {
        return <JsonConfig {...propsToPass} />;
      }
      return <StructuredPromptConfig {...propsToPass} />;
    }
    if (promptOptions.promptType === "noSchema" && !promptOptions.isCrawl) {
      return <TextGenerationConfig {...propsToPass} />;
    }
    return null;
  };

  const promptVariant = useMemo(
    () => getPromptVariant(promptOptions),
    [promptOptions],
  );

  const availableModels = useMemo(
    () => PROMPT_VARIANT_MODEL_MAP[promptVariant] ?? FALLBACK_MODELS,
    [promptVariant],
  );

  useEffect(() => {
    const [firstModel = LLMModelEnum.GPT5] = availableModels;
    if (!availableModels.includes(promptOptions.model) && firstModel) {
      actions.setPromptOptions({ ...promptOptions, model: firstModel });
    }
  }, [actions, availableModels, promptOptions]);

  return (
    <div className="space-y-4 px-6 py-3 relative">
      {/* Dropdown to select previously saved prompts */}
      <div className="space-y-1 max-w-[450px]">
        <Label className="text-xs font-medium text-gray-500">
          {t("modal_manager.column_modal_config.select_prompt_type_label")}
        </Label>
        <RadioGroup className="flex flex-row justify-between gap-2 mt-1">
          {/* TAG DATA */}
          <label
            htmlFor="promptType_structuredOutput"
            className="flex items-center cursor-pointer"
          >
            <input
              type="radio"
              disabled={isReadOnly || (isEditingExistingNode && !nodeError)}
              name="promptType"
              id="promptType_structuredOutput"
              value="StructuredOutput"
              checked={
                promptOptions.promptType === "schema" &&
                (promptOptions.schemaType === "singleTag" ||
                  promptOptions.schemaType === "multiTag")
              }
              onChange={handlePromptTypeChange}
              className="hidden peer"
            />
            <div
              className={`w-4 h-4 flex items-center justify-center border peer-checked:bg-[#FF6B00] peer-checked:border-[#FF6B00] rounded-none ${
                isReadOnly || (isEditingExistingNode && !nodeError)
                  ? "border-border opacity-40 !cursor-not-allowed"
                  : "border-[#FF6B00]"
              }`}
            >
              <Check
                strokeWidth={3}
                className={`w-3 h-3 text-white font-bold ${
                  promptOptions.promptType === "schema" &&
                  (promptOptions.schemaType === "singleTag" ||
                    promptOptions.schemaType === "multiTag")
                    ? "opacity-100"
                    : "opacity-0"
                }`}
              />
            </div>
            <Label
              className="ml-2 font-medium text-sm"
              htmlFor="promptType_structuredOutput"
            >
              {t("modal_manager.column_modal_config.structured_prompt")}
            </Label>
          </label>

          {/* SUMMARIZE */}
          <label
            htmlFor="promptType_textGeneration"
            className="flex items-center cursor-pointer"
          >
            <input
              type="radio"
              name="promptType"
              disabled={isReadOnly || (isEditingExistingNode && !nodeError)}
              id="promptType_textGeneration"
              value="TextGeneration"
              checked={
                promptOptions.promptType === "noSchema" &&
                !promptOptions.ask &&
                !promptOptions.isCrawl
              }
              onChange={handlePromptTypeChange}
              className="hidden peer"
            />
            <div
              className={`w-4 h-4 flex items-center justify-center border peer-checked:bg-[#FF6B00] peer-checked:border-[#FF6B00] rounded-none ${
                isReadOnly || (isEditingExistingNode && !nodeError)
                  ? "border-border opacity-40 !cursor-not-allowed"
                  : "border-[#FF6B00]"
              }`}
            >
              <Check
                strokeWidth={3}
                className={`w-3 h-3 text-white font-semibold ${promptOptions.promptType === "noSchema" ? "opacity-100" : "opacity-0"}`}
              />
            </div>
            <Label
              className="ml-2 font-medium text-sm"
              htmlFor="promptType_textGeneration"
            >
              {t("modal_manager.column_modal_config.text_generation_prompt")}
            </Label>
          </label>

          {/* ASK */}
          <label
            htmlFor="promptType_ask"
            className="flex items-center cursor-pointer"
          >
            <input
              type="radio"
              name="promptType"
              disabled={isReadOnly || (isEditingExistingNode && !nodeError)}
              id="promptType_ask"
              value="ask"
              checked={
                promptOptions.promptType === "noSchema" &&
                promptOptions.ask === true
              }
              onChange={handlePromptTypeChange}
              className="hidden peer"
            />
            <div
              className={`w-4 h-4 flex items-center justify-center border peer-checked:bg-[#FF6B00] peer-checked:border-[#FF6B00] rounded-none ${
                isReadOnly || (isEditingExistingNode && !nodeError)
                  ? "border-border opacity-40 !cursor-not-allowed"
                  : "border-[#FF6B00]"
              }`}
            >
              <Check
                strokeWidth={3}
                className={`w-3 h-3 text-white font-semibold ${promptOptions.promptType === "noSchema" && (promptOptions as any).ask === true ? "opacity-100" : "opacity-0"}`}
              />
            </div>
            <Label
              className="ml-2 font-medium text-sm"
              htmlFor="promptType_ask"
            >
              {t("modal_manager.column_modal_config.ask_prompt")}
            </Label>
          </label>

          {/* EXTRACT */}
          <label
            htmlFor="promptType_json"
            className="flex items-center cursor-pointer"
          >
            <input
              type="radio"
              name="promptType"
              disabled={isReadOnly || (isEditingExistingNode && !nodeError)}
              id="promptType_json"
              value="json"
              checked={
                promptOptions.promptType === "schema" &&
                promptOptions.schemaType === "freeForm"
              }
              onChange={handlePromptTypeChange}
              className="hidden peer"
            />
            <div
              className={`w-4 h-4 flex items-center justify-center border peer-checked:bg-[#FF6B00] peer-checked:border-[#FF6B00] rounded-none ${
                isReadOnly || (isEditingExistingNode && !nodeError)
                  ? "border-border opacity-40 !cursor-not-allowed"
                  : "border-[#FF6B00]"
              }`}
            >
              <Check
                strokeWidth={3}
                className={`w-3 h-3 text-white font-semibold ${promptOptions.promptType === "schema" && promptOptions.schemaType === "freeForm" ? "opacity-100" : "opacity-0"}`}
              />
            </div>
            <Label
              className="ml-2 font-medium text-sm"
              htmlFor="promptType_json"
            >
              {t("modal_manager.column_modal_config.json")}
            </Label>
          </label>
          {/* CRAWL */}
          <label
            htmlFor="promptType_crawl"
            className={`flex items-center ${
              isCrawlPromptDisabled ? "cursor-not-allowed" : "cursor-pointer"
            }`}
          >
            <input
              type="radio"
              name="promptType"
              disabled={isCrawlPromptDisabled}
              id="promptType_crawl"
              value="crawl"
              checked={
                promptOptions.isCrawl === true &&
                promptOptions.promptType === "noSchema"
              }
              onChange={handlePromptTypeChange}
              className="hidden peer"
            />
            <div
              className={`w-4 h-4 flex items-center justify-center border peer-checked:bg-[#FF6B00] peer-checked:border-[#FF6B00] rounded-none ${
                isCrawlPromptDisabled
                  ? "border-[#FF6B00] opacity-40 !cursor-not-allowed"
                  : "border-[#FF6B00]"
              }`}
            >
              <Check
                strokeWidth={3}
                className={`w-3 h-3 text-white font-semibold ${
                  promptOptions.isCrawl ? "opacity-100" : "opacity-0"
                }`}
              />
            </div>
            <Label
              className={`ml-2 font-medium text-sm ${
                isCrawlPromptDisabled ? "opacity-60" : ""
              }`}
              htmlFor="promptType_crawl"
            >
              {t("modal_manager.column_modal_config.crawl_prompt")}
            </Label>
          </label>
        </RadioGroup>
      </div>
      {/* Input for column name */}
      <div className="flex flex-row items-center justify-between max-w-[450px] w-full">
        <div className="space-y-1 max-w-52">
          <Label className="text-xs font-medium text-gray-500">
            {t("modal_manager.column_modal_config.column_prompt_name_label")}
          </Label>
          <ColumnNameInput
            value={columnName}
            onChange={handleColumnNameChange}
            placeholder={t(
              "modal_manager.column_modal_config.column_prompt_name_placeholder",
            )}
            error={promptNameError}
            disabled={isReadOnly || (isEditingExistingNode && !nodeError)}
          />
        </div>
        <div className="space-y-1 min-w-52">
          <Label className="text-xs font-medium text-gray-500">
            {t("modal_manager.column_modal_config.model")}
          </Label>
          <Select
            value={promptOptions.model}
            onValueChange={(value: LLMModel) =>
              handleModelChange(value, promptOptions)
            }
            disabled={isReadOnly}
          >
            <SelectTrigger className="rounded-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-sm">
              {availableModels.map((model) => (
                <SelectItem key={model} className="rounded-sm" value={model}>
                  {t(MODEL_TRANSLATION_KEYS[model] ?? model)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="!m-0">
        {promptNameError && (
          <p className="text-[#ff4d4f] text-sm font-['Segoe UI]">
            {promptNameError}
          </p>
        )}
      </div>
      {/* Key change triggers animation */}
      <ContentTransition keyValue={animationKey}>
        {renderPromptSpecificUI()}
        {useCostEstimation &&
          !isReadOnly &&
          (estimatedCost || estimatedCostLoading) &&
          !promptOptions.isCrawl && (
            <div className="space-y-1">
              <InfoAlert
                message={
                  estimatedCostLoading ? (
                    <>
                      {t(
                        "modal_manager.column_modal_config.estimated_cost_loading_part_1",
                      )}
                      <span className="inline-flex items-center justify-center mx-1">
                        <Loader2 className="animate-spin w-3 h-3 text-muted-foreground" />
                      </span>
                      {t(
                        "modal_manager.column_modal_config.estimated_cost_loading_part_2",
                      )}
                    </>
                  ) : (
                    t("modal_manager.column_modal_config.estimated_cost", {
                      cost: `$${estimatedCost}`,
                    })
                  )
                }
              />
            </div>
          )}
      </ContentTransition>
    </div>
  );
};

export default React.memo(ColumnModalConfig);

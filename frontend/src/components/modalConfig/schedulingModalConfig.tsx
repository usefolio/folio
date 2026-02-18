import type React from "react";
import {
  useState,
  useCallback,
  useLayoutEffect,
  type ReactNode,
  useRef,
  useEffect,
} from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslation } from "react-i18next";
import {
  ScheduledActionData,
  IntervalUnit,
  DestinationType,
  OutputFormat,
} from "@/types/types";
import { SchedulingModalConfigProps } from "@/interfaces/interfaces";
import { PromptInput } from "./columnModalConfig/promptInput";
import { LLMModelEnum, LLMModel, PromptOptions } from "@/types/types";
import { Textarea } from "../ui/textarea";

const useAutosizeTextarea = (
  textAreaRef: React.RefObject<HTMLTextAreaElement>,
  value: string,
) => {
  const adjustTextAreaHeight = useCallback(() => {
    const ta = textAreaRef.current;
    if (!ta) return;

    ta.style.height = "auto";
    ta.style.overflowY = "hidden";
    ta.style.height = `${ta.scrollHeight}px`;
  }, [textAreaRef]);

  // Effect to handle shrinking on deletion
  useEffect(() => {
    const textarea = textAreaRef.current;
    if (!textarea) return;

    const handleInput = (e: Event) => {
      const inputEvent = e as InputEvent;
      if (
        inputEvent.inputType &&
        (inputEvent.inputType.includes("delete") ||
          inputEvent.inputType.includes("backspace"))
      ) {
        requestAnimationFrame(() => {
          textarea.style.height = "auto"; // Reset before recalculating
          void textarea.offsetHeight; // Force reflow
          adjustTextAreaHeight();
        });
      }
    };

    textarea.addEventListener("input", handleInput);
    return () => {
      textarea.removeEventListener("input", handleInput);
    };
  }, [adjustTextAreaHeight]);

  // Adjust height whenever the value changes
  useLayoutEffect(() => {
    adjustTextAreaHeight();
  }, [value, adjustTextAreaHeight]);
};
// Custom component for the inline, underlined select
const InlineSelect = ({
  children,
  value,
  onValueChange,
  placeholder,
  className,
}: {
  children: ReactNode;
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) => (
  <Select value={value} onValueChange={onValueChange}>
    <SelectTrigger
      className={`inline-flex w-auto items-center justify-start p-0 h-auto text-sm text-orange-600 border-0 border-b border-dashed border-orange-600 hover:border-solid focus:ring-0 rounded-md gap-1 ${className}`}
    >
      <SelectValue placeholder={placeholder} />
    </SelectTrigger>
    <SelectContent className="rounded-md">{children}</SelectContent>
  </Select>
);

export function SchedulingModalConfig({
  onSave,
  onCancel,
  isLoading,
  state,
  actions,
  mentionsRef,
  columns,
  promptOptionsRef,
  localMentionsTextAreaValueState,
  setLocalMentionsTextAreaValueState,
  promptSearch,
  setPromptSearch,
  validColumnNames,
  filteredSavedPrompts,
  groupedSavedPrompts,
  handleSelectSavedPrompt,
}: SchedulingModalConfigProps) {
  const { t } = useTranslation();
  const [intervalValue, setIntervalValue] = useState("15");
  const [intervalUnit, setIntervalUnit] = useState<IntervalUnit>("minutes");
  const [destinationType, setDestinationType] =
    useState<DestinationType>("email");
  const [email, setEmail] = useState("");
  const [apiUrl, setApiUrl] = useState("");
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("csv");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedWorkflow, setSelectedWorkflow] = useState("Data Enrichment");
  const searchQueryRef = useRef<HTMLTextAreaElement>(null);
  useAutosizeTextarea(searchQueryRef, searchQuery);
  const handleModelChange = useCallback(
    (value: LLMModel, promptOptions: PromptOptions) => {
      actions.setPromptOptions({ ...promptOptions, model: value });
    },
    [actions],
  );
  const workflowOptions = [
    {
      value: "Data Enrichment",
      label: t("modal_manager.schedule_modal_config.data_enrichment"),
    },
    {
      value: "Sentiment Analysis",
      label: t("modal_manager.schedule_modal_config.sentiment_analysis"),
    },
    {
      value: "Content Extraction",
      label: t("modal_manager.schedule_modal_config.content_extraction"),
    },
    {
      value: "Data Validation",
      label: t("modal_manager.schedule_modal_config.data_validation"),
    },
  ];

  const handleSaveClick = () => {
    const data: ScheduledActionData = {
      searchQuery,
      workflow: selectedWorkflow,
      interval: parseInt(intervalValue, 10) || 15,
      intervalUnit,
      destinationType,
      destination: destinationType === "email" ? email : apiUrl,
      outputFormat,
      prompt:
        outputFormat === "markdown" || outputFormat === "pdf"
          ? state.promptOptions
          : undefined,
      model:
        outputFormat === "markdown" || outputFormat === "pdf"
          ? state.promptOptions.model
          : undefined,
    };
    onSave(data);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 space-y-4 flex-1 overflow-y-auto">
        {/* Schedule Sentence */}
        <div className="text-sm text-gray-800 leading-7">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span>{t("modal_manager.schedule_modal_config.run_search")}</span>
            <Textarea
              ref={searchQueryRef}
              placeholder={t(
                "modal_manager.schedule_modal_config.search_placeholder",
              )}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 min-h-8 text-xs border border-input rounded-md px-2 py-1 resize-none overflow-hidden bg-transparent"
              rows={1}
            />
            <span>
              {t("modal_manager.schedule_modal_config.apply_workflow")}
            </span>
            <InlineSelect
              value={selectedWorkflow}
              onValueChange={setSelectedWorkflow}
            >
              {workflowOptions.map((workflow) => (
                <SelectItem
                  key={workflow.value}
                  value={workflow.value}
                  className="rounded-md"
                >
                  {workflow.label}
                </SelectItem>
              ))}
            </InlineSelect>
            <span>{t("modal_manager.schedule_modal_config.every")}</span>
            <Input
              type="number"
              value={intervalValue}
              onChange={(e) => setIntervalValue(e.target.value)}
              className="h-8 w-14 text-xs text-center border-gray-300 rounded-md px-1"
            />
            <InlineSelect
              value={intervalUnit}
              onValueChange={(val) => setIntervalUnit(val as IntervalUnit)}
            >
              <SelectItem className="rounded-md" value="minutes">
                {t("modal_manager.schedule_modal_config.minutes")}
              </SelectItem>
              <SelectItem className="rounded-md" value="hours">
                {t("modal_manager.schedule_modal_config.hours")}
              </SelectItem>
              <SelectItem className="rounded-md" value="days">
                {t("modal_manager.schedule_modal_config.days")}
              </SelectItem>
            </InlineSelect>
            <span>{t("modal_manager.schedule_modal_config.send_to")}</span>
            <InlineSelect
              value={destinationType}
              onValueChange={(val) =>
                setDestinationType(val as DestinationType)
              }
            >
              <SelectItem className="rounded-md" value="email">
                {t("modal_manager.schedule_modal_config.email")}
              </SelectItem>
              <SelectItem className="rounded-md" value="api">
                {t("modal_manager.schedule_modal_config.api")}
              </SelectItem>
            </InlineSelect>
            {destinationType === "email" && (
              <Input
                type="email"
                placeholder="recipient@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-8 text-xs border-gray-300 flex-1 min-w-[150px] rounded-md"
              />
            )}
            {destinationType === "api" && (
              <Input
                type="url"
                placeholder="https://api.example.com/webhook"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                className="h-8 text-xs border-gray-300 flex-1 min-w-[150px] rounded-md"
              />
            )}
            <span>{t("modal_manager.schedule_modal_config.format_as")}</span>
            <InlineSelect
              value={outputFormat}
              onValueChange={(val) => setOutputFormat(val as OutputFormat)}
            >
              <SelectItem className="rounded-md" value="csv">
                {t("modal_manager.schedule_modal_config.csv")}
              </SelectItem>
              <SelectItem className="rounded-md" value="markdown">
                {t("modal_manager.schedule_modal_config.markdown")}
              </SelectItem>
              <SelectItem className="rounded-md" value="pdf">
                {t("modal_manager.schedule_modal_config.pdf")}
              </SelectItem>
            </InlineSelect>
            .
          </div>
        </div>

        {/* Report Generation */}
        {(outputFormat === "markdown" || outputFormat === "pdf") && (
          <div className="space-y-4 pt-3 border-t">
            <div className="space-y-1 min-w-52">
              <Label className="text-xs font-medium text-gray-500">
                {t("modal_manager.column_modal_config.model")}
              </Label>
              <Select
                value={state.promptOptions.model}
                onValueChange={(value: LLMModel) =>
                  handleModelChange(value, state.promptOptions)
                }
              >
                <SelectTrigger className="rounded-md">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-md">
                  <SelectItem
                    className="rounded-md"
                    value={LLMModelEnum.GPT5}
                  >
                    {t("modal_manager.column_modal_config.gpt_5")}
                  </SelectItem>
                  <SelectItem
                    className="rounded-md"
                    value={LLMModelEnum.GPT41}
                  >
                    {t("modal_manager.column_modal_config.gpt_41")}
                  </SelectItem>
                  {state.promptOptions.promptType === "noSchema" && (
                    <SelectItem
                      className="rounded-md"
                      value={LLMModelEnum.GEMINI_25_FLASH}
                    >
                      {t(
                        "modal_manager.column_modal_config.gemini_25_flash",
                      )}
                    </SelectItem>
                  )}
                  <SelectItem
                    className="rounded-md"
                    value={LLMModelEnum.GPT4O_MINI}
                  >
                    {t("modal_manager.column_modal_config.gpt_4o_mini")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <PromptInput
              state={state}
              actions={actions}
              mentionsRef={mentionsRef}
              projectColumns={columns}
              validColumnNames={validColumnNames}
              promptOptionsRef={promptOptionsRef}
              groupedSavedPrompts={groupedSavedPrompts}
              filteredSavedPrompts={filteredSavedPrompts}
              handleSelectSavedPrompt={handleSelectSavedPrompt}
              localMentionsTextAreaValueState={localMentionsTextAreaValueState}
              setLocalMentionsTextAreaValueState={
                setLocalMentionsTextAreaValueState
              }
              promptSearch={promptSearch}
              setPromptSearch={setPromptSearch}
              mode={"schedule"}
            />
          </div>
        )}
      </div>
      <div className="px-4 py-2 flex justify-end gap-2 border-t border-gray-200">
        <Button
          variant="outline"
          size="sm"
          onClick={onCancel}
          disabled={isLoading}
          className="h-8 rounded-md"
        >
          {t("global.cancel")}
        </Button>
        <Button
          onClick={handleSaveClick}
          size="sm"
          variant="default"
          className="h-8 hover:bg-orange-600 rounded-md"
          disabled={isLoading}
        >
          {isLoading
            ? t("modal_manager.schedule_modal_config.saving_schedule")
            : t("modal_manager.schedule_modal_config.save_schedule")}
        </Button>
      </div>
    </div>
  );
}

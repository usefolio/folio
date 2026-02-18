import { useState, useEffect } from "react";
import { Check, Clock, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatDistanceToNow } from "date-fns";
import { useTranslation } from "react-i18next";
import { Textarea } from "@/components/ui/textarea";

interface SystemPromptCardProps {
  systemPrompt: string;
  defaultSystemPrompt: string;
  lastModified: Date;
  onSystemPromptSave: (prompt: string) => void;
}

const SystemPromptCard = ({
  systemPrompt,
  defaultSystemPrompt,
  lastModified,
  onSystemPromptSave,
}: SystemPromptCardProps) => {
  const [prompt, setPrompt] = useState<string>(
    systemPrompt || defaultSystemPrompt,
  );
  const [isModified, setIsModified] = useState<boolean>(false);
  const { t } = useTranslation();

  // Update local state when props change
  useEffect(() => {
    setPrompt(systemPrompt || defaultSystemPrompt);
    setIsModified(false);
  }, [systemPrompt, defaultSystemPrompt]);

  const handleSave = () => {
    if (prompt && isModified) {
      onSystemPromptSave(prompt);
      setIsModified(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setPrompt(newValue);
    setIsModified(newValue !== systemPrompt);
  };

  const handleRestoreDefault = () => {
    setPrompt(defaultSystemPrompt);
    setIsModified(systemPrompt !== defaultSystemPrompt);
  };
  const isUsingDefault = systemPrompt === defaultSystemPrompt || !systemPrompt;
  const isSaveDisabled = !isModified || !prompt.trim();
  return (
    <Card className="overflow-hidden border rounded-md mb-2">
      <div className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center">
              <div className="flex items-center">
                <span className="font-semibold text-xs">
                  {t("modal_manager.settings_modal_config.system_prompt")}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" />
              <span>
                {formatDistanceToNow(lastModified, {
                  addSuffix: true,
                })}
              </span>
            </div>
          </div>
        </div>

        {/* Textarea */}
        <div className="mt-2">
          <Textarea
            value={prompt}
            onChange={handleInputChange}
            placeholder={t(
              "modal_manager.settings_modal_config.system_prompt_placeholder",
            )}
            className="min-h-[120px] text-xs rounded-md resize-vertical"
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 mt-2 border-t">
          <Button
            onClick={handleRestoreDefault}
            variant="outline"
            className="rounded-md h-[26px] px-3 py-1.5 text-xs"
            disabled={isUsingDefault && !isModified}
            size="sm"
          >
            <RotateCcw className="h-3 w-3 mr-1" />
            {t("modal_manager.settings_modal_config.restore_default")}
          </Button>

          <Button
            onClick={handleSave}
            variant="outline"
            className="rounded-md h-[26px] px-3 py-1.5 text-xs"
            disabled={!isModified || isSaveDisabled}
            size="sm"
          >
            <Check className="h-3 w-3 mr-1" />
            {t("global.save")}
          </Button>
        </div>
      </div>
    </Card>
  );
};
export default SystemPromptCard;

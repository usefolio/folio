import { useState, useEffect } from "react";
import { Check, ChevronDown, ChevronUp, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import ModelsTable from "./modelsTable";
import { formatDistanceToNow } from "date-fns";
import { Input } from "@/components/ui/input";
import { useTranslation } from "react-i18next";
import { ApiProviderCardProps } from "@/interfaces/interfaces";

export default function ApiProviderCard({
  provider,
  onApiKeySave,
  onToggleModels,
  isExpanded,
}: ApiProviderCardProps) {
  const [apiKey, setApiKey] = useState<string>(provider.key || "");

  useEffect(() => {
    setApiKey(provider.key || "");
  }, [provider.key]);

  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [isFocused, setIsFocused] = useState<boolean>(false);
  const { t } = useTranslation();
  const handleSave = () => {
    if (apiKey) {
      onApiKeySave(provider.id, apiKey);
      setIsEditing(false);
    }
  };

  const startEditing = () => {
    setIsEditing(true);
  };

  const handleInputFocus = () => {
    setIsFocused(true);
  };

  const handleInputBlur = () => {
    setIsFocused(false);

    // Only exit editing mode if the key already exists
    if (provider.key) {
      setIsEditing(false);
    }
  };

  const maskApiKey = (key: string): string => {
    if (!key) return "";
    if (key.length <= 4) return key;

    // Mask all but the last 4 characters
    const lastFour = key.slice(-4);
    // Limit to 16 dots for visual clarity
    const maskedPart = "•".repeat(Math.min(16, key.length - 4));
    return `${maskedPart}${lastFour}`;
  };

  const getDisplayValue = (): string => {
    if (!apiKey) return "";

    // Show full key only when focused, otherwise show masked
    if (isFocused) {
      return apiKey;
    }
    return maskApiKey(apiKey);
  };

  // Get the first letter of the provider name for the logo
  const providerInitial = provider.name.charAt(0);

  return (
    <Card className="overflow-hidden border rounded-md mb-2">
      <div className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Badge
                variant="secondary"
                className={cn(
                  `cursor-default px-1 py-[1.5px] rounded-none font-semibold text-[10px] ${provider.key ? "hover:bg-green-100" : "hover:bg-yellow-100"}`,
                  provider.key
                    ? "bg-green-100 text-green-800"
                    : "bg-yellow-100 text-yellow-800",
                )}
              >
                {provider.key
                  ? t("modal_manager.settings_modal_config.card_active")
                  : t("modal_manager.settings_modal_config.card_inactive")}
              </Badge>
              <div className="flex items-center">
                <div className="cursor-default w-5 h-5 mr-2 flex items-center justify-center bg-gray-200 rounded-md">
                  <span className="text-xs font-semibold">
                    {providerInitial}
                  </span>
                </div>
                <span className="font-semibold text-xs">{provider.name}</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" />
              <span>
                {formatDistanceToNow(provider.lastModified, {
                  addSuffix: true,
                })}
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 mt-2 border-t">
          <div className="flex items-center">
            <div className="relative">
              <Input
                type="text"
                value={getDisplayValue()}
                onChange={(e) => setApiKey(e.target.value)}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
                onClick={startEditing}
                placeholder={t(
                  "modal_manager.settings_modal_config.card_api_key_placeholder",
                )}
                className="border px-2 py-1 text-xs w-56 font-mono rounded-md h-8"
              />
              {provider.key && !isEditing && (
                <div
                  className="absolute inset-0 cursor-pointer"
                  onClick={startEditing}
                />
              )}
            </div>
            <Button
              onClick={handleSave}
              variant="outline"
              className="rounded-md h-[26px] px-3 py-1.5 text-xs ml-2"
              disabled={!apiKey}
              size="sm"
            >
              <Check className="h-3 w-3 mr-1" />
              {t("modal_manager.settings_modal_config.card_save")}
            </Button>
          </div>

          <Button
            onClick={() => onToggleModels(provider.id)}
            variant="ghost"
            size="sm"
            className="rounded-md h-5 px-3 py-2 text-xs ml-auto"
            disabled={!provider.models || provider.models.length === 0}
          >
            {isExpanded ? (
              <>
                {t("modal_manager.settings_modal_config.card_hide_models")}
                <ChevronUp className="ml-1 h-4 w-4" />
              </>
            ) : (
              <>
                {t("modal_manager.settings_modal_config.card_view_models")}
                <ChevronDown className="ml-1 h-4 w-4" />
              </>
            )}
          </Button>
        </div>
        {/* Expanded Models */}
        {isExpanded && provider.models && provider.models.length > 0 && (
          <div className="mt-2">
            <ModelsTable models={provider.models} isVisible={isExpanded} />
          </div>
        )}
      </div>
    </Card>
  );
}

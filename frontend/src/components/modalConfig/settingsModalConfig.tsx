import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useDataContext } from "@/context/DataContext";
import { SettingsModalConfigProps } from "@/interfaces/interfaces";
/*
 * Tabs UI temporarily removed while only the System Prompt configuration is
 * available. Restore the import below alongside the commented JSX further
 * down in this file to re-enable tabbed navigation.
 *
 * import { Tabs, TabsList, TabsTrigger, TabsContent } from "../ui/tabs";
 */
import SystemPromptCard from "./settingModalConfig/systemPromptCard";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import {
  showErrorNotification,
  showSuccessNotification,
} from "../notification/NotificationHandler";
import { DEFAULT_SYSTEM_PROMPT } from "@/constants";

/*
 * NOTE: Custom API provider configuration is temporarily disabled.
 * The imports and helper logic below are preserved for a future revival.
 *
 * import { AlertTriangle, Loader2 } from "lucide-react";
 * import { Alert, AlertDescription } from "../ui/alert";
 * import ApiProviderCard from "./settingModalConfig/apiProviderCard";
 * import { ModelInfo, ProviderInfo } from "@/types/types";
 *
 * const modelsData: Record<string, ModelInfo[]> = {
 *   openai: [
 *     { id: "gpt-4", name: "GPT-4", tokensUsed: 15777665 },
 *     { id: "gpt-4o", name: "GPT-4o", tokensUsed: 8502458 },
 *     { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo", tokensUsed: 5140802 },
 *   ],
 *   marker: [
 *     { id: "marker-standard", name: "Marker Standard", tokensUsed: 0 },
 *     { id: "marker-pro", name: "Marker Pro", tokensUsed: 0 },
 *   ],
 *   fal: [
 *     {
 *       id: "fal-stable-diffusion",
 *       name: "Stable Diffusion XL",
 *       tokensUsed: 9941975,
 *     },
 *     { id: "fal-llava", name: "LLaVA", tokensUsed: 2491357 },
 *   ],
 * };
 *
 * const initialProviders: ProviderInfo[] = [
 *   {
 *     id: "openai",
 *     name: "Open AI",
 *     key: "",
 *     lastModified: new Date(2025, 3, 29, 6, 30),
 *     tokensUsed: 29420925,
 *     models: modelsData.openai,
 *   },
 *   {
 *     id: "marker",
 *     name: "Marker",
 *     key: "",
 *     lastModified: new Date(),
 *     tokensUsed: 0,
 *     models: modelsData.marker,
 *   },
 *   {
 *     id: "fal",
 *     name: "Fal AI",
 *     key: "",
 *     lastModified: new Date(2025, 3, 27, 9, 45),
 *     tokensUsed: 12433332,
 *     models: modelsData.fal,
 *   },
 * ];
 *
 * function mergeProvidersWithCredentials(
 *   baseProviders: ProviderInfo[],
 *   credentials: any[] | null,
 * ): ProviderInfo[] {
 *   return baseProviders.map((provider) => {
 *     const cred = credentials?.find((c) => c.service === provider.id);
 *     return {
 *       ...provider,
 *       key: cred ? cred.apiKey : "",
 *       lastModified: cred
 *         ? new Date(cred.lastModified)
 *         : provider.lastModified,
 *     };
 *   });
 * }
 */

const SettingsModalConfig: React.FC<SettingsModalConfigProps> = ({
  onApiKeySave: _onApiKeySave,
}) => {
  void _onApiKeySave;
  /*
   * Legacy state for managing BYO API providers:
   *
   * const [providers, setProviders] =
   *   useState<ProviderInfo[]>(initialProviders);
   * const [expandedProvider, setExpandedProvider] = useState<string | null>(
   *   null,
   * );
   */
  const [systemPromptValue, setSystemPromptValue] = useState<string>(
    DEFAULT_SYSTEM_PROMPT,
  );
  const [systemPromptLastModified, setSystemPromptLastModified] =
    useState<Date>(new Date());
  const { t } = useTranslation();

  const getErrorMessage = (error: unknown): string => {
    return error instanceof Error ? error.message : String(error);
  };
  // Get data from context
  const {
    workspace,
    systemPrompt,
  } = useDataContext();

  const saveSystemPromptMutation = useMutation(
    api.system_settings.saveSystemPrompt,
  );

  /*
   * Disabled effect and handlers for BYO API providers:
   *
   * useEffect(() => {
   *   if (!serviceCredentialsLoading && serviceCredentials) {
   *     const merged = mergeProvidersWithCredentials(
   *       initialProviders,
   *       serviceCredentials,
   *     );
   *     setProviders(merged);
   *   }
   * }, [serviceCredentials, serviceCredentialsLoading]);
   *
   * const handleApiKeySave = async (providerId: string, key: string) => {
   *   if (!key) return;
   *
   *   onApiKeySave(providerId, key);
   *
   *   setProviders((_) =>
   *     mergeProvidersWithCredentials(
   *       initialProviders,
   *       (serviceCredentials ?? []).map((cred) =>
   *         cred.service === providerId
   *           ? {
   *               ...cred,
   *               apiKey: key,
   *               lastModified: new Date().toISOString(),
   *             }
   *           : cred,
   *       ),
   *     ),
   *   );
   * };
   *
   * const toggleProvider = (providerId: string) => {
   *   setExpandedProvider(
   *     expandedProvider === providerId ? null : providerId,
   *   );
   * };
   */

  // Initialize system prompt from context
  useEffect(() => {
    if (systemPrompt?.value) {
      setSystemPromptValue(systemPrompt.value || DEFAULT_SYSTEM_PROMPT);
      setSystemPromptLastModified(new Date(systemPrompt.lastModified));
    }
  }, [systemPrompt?.value]);

  const handleSystemPromptSave = async (prompt: string) => {
    if (!prompt) return;

    if (!workspace) {
      console.error("No workspace found");
      showErrorNotification(
        t("modal_manager.settings_modal_config.system_prompt_error_title"),
        t(
          "modal_manager.settings_modal_config.system_prompt_error_description",
          { error: t("modal_manager.settings_modal_config.no_workspace") },
        ),
      );
      return;
    }

    try {
      // Save to Convex
      await saveSystemPromptMutation({
        workspaceId: workspace._id,
        prompt: prompt,
      });

      // Update local state
      setSystemPromptValue(prompt);
      setSystemPromptLastModified(new Date());
      showSuccessNotification(
        t("modal_manager.settings_modal_config.system_prompt_success_title"),
        t(
          "modal_manager.settings_modal_config.system_prompt_success_description",
        ),
      );
    } catch (error) {
      const message = getErrorMessage(error);
      showErrorNotification(
        t("modal_manager.settings_modal_config.system_prompt_error_title"),
        t(
          "modal_manager.settings_modal_config.system_prompt_error_description",
          { error: message },
        ),
      );
      console.error("Error saving system prompt:", error);
    }
  };

  return (
    <div className="space-y-4 px-3 py-3">
      {/**
       * Tabbed navigation is temporarily removed so the System Prompt
       * configuration renders without the tabs chrome. Re-enable the Tabs JSX
       * below when additional settings sections are ready to return.
       */}
      <div className="space-y-1">
        <SystemPromptCard
          systemPrompt={systemPromptValue}
          defaultSystemPrompt={DEFAULT_SYSTEM_PROMPT}
          lastModified={systemPromptLastModified}
          onSystemPromptSave={handleSystemPromptSave}
        />
      </div>
    </div>
  );
};
export default SettingsModalConfig;

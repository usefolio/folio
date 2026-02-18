import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Trash2,
  Clock,
  Mail,
  Globe,
  FileText,
  FileSpreadsheet,
  FileImage,
  Eye,
  Play,
  AlertTriangle,
  Loader2,
  Plus,
} from "lucide-react";
import { usePaginatedQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Doc } from "convex/_generated/dataModel";
import { useModal } from "@/context/ModalContext";
import { SavedPrompt, JSONSchema } from "@/types/types";
import { decodePrompt } from "@/utils/promptUtils";
import { useTranslation } from "react-i18next";
import { useDataContext } from "@/context/DataContext";

type ScheduledAction = Doc<"scheduled_actions">;

// Helper icons
const getDestinationIcon = (type: "email" | "api") =>
  type === "email" ? (
    <Mail className="h-3 w-3" />
  ) : (
    <Globe className="h-3 w-3" />
  );
const getFormatIcon = (format: "csv" | "markdown" | "pdf") => {
  switch (format) {
    case "csv":
      return <FileSpreadsheet className="h-3 w-3" />;
    case "markdown":
      return <FileText className="h-3 w-3" />;
    case "pdf":
      return <FileImage className="h-3 w-3" />;
  }
};

export function ScheduledActionsList() {
  const {
    results: actions,
    status,
    loadMore,
  } = usePaginatedQuery(
    api.scheduled_actions.getPaginated,
    {},
    { initialNumItems: 50 },
  );
  const toggleAction = useMutation(api.scheduled_actions.toggleIsActive);
  const deleteAction = useMutation(api.scheduled_actions.deleteAction);
  const { openModal } = useModal();
  const { t } = useTranslation();
  const { project, projects } = useDataContext();

  const [confirmToggle, setConfirmToggle] = useState<{
    action: ScheduledAction;
    newState: boolean;
  } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{
    action: ScheduledAction;
  } | null>(null);

  const handleToggleAction = (action: ScheduledAction) => {
    const newState = !action.isActive;
    setConfirmToggle({ action, newState });
  };

  const confirmToggleAction = () => {
    if (!confirmToggle) return;
    toggleAction({
      id: confirmToggle.action._id,
      isActive: confirmToggle.newState,
    });
    setConfirmToggle(null);
  };

  const handleDeleteAction = (action: ScheduledAction) => {
    setConfirmDelete({ action });
  };

  const confirmDeleteAction = () => {
    if (!confirmDelete) return;
    deleteAction({ id: confirmDelete.action._id });
    setConfirmDelete(null);
  };
  const openShowPromptModal = (props: {
    columnName: string;
    columnPrompt: SavedPrompt | string;
    columnJsonSchema?: { schema: JSONSchema };
  }) => {
    openModal("showPrompt", props);
  };
  const handleViewPrompt = (action: ScheduledAction) => {
    if (!action.prompt) return;
    const promptOptions = decodePrompt(action.prompt);
    if (!promptOptions) return;

    const promptForModal = {
      columnName: action.workflow,
      columnPrompt: {
        columnName: action.workflow,
        projectId: project,
        projectName: projects.find((p) => p._id === project)?.name,
        promptOptions: promptOptions,
      } as SavedPrompt,
    };

    openShowPromptModal(promptForModal);
  };

  const isLoading = status === "LoadingFirstPage";

  return (
    <div className="max-w-7xl mx-auto">
      {isLoading ? (
        <div className="flex flex-1 flex-grow justify-center items-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {actions?.map((action) => (
            <div
              key={action._id}
              className="border border-border flex flex-col"
            >
              {/* Header */}
              <div className="px-3 py-2 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-bold">
                    {t("scheduled_actions_page.every_interval", {
                      interval: action.interval,
                      unit: action.intervalUnit,
                    })}{" "}
                  </span>
                  <span className="text-xs text-muted-foreground">•</span>
                  <span className="text-xs text-muted-foreground">
                    {t("scheduled_actions_page.created")}{" "}
                    {action.createdAt.substring(0, 10)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={action.isActive}
                    onCheckedChange={() => handleToggleAction(action)}
                    className="data-[state=checked]:bg-primary"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 rounded-md p-0 text-destructive"
                    onClick={() => handleDeleteAction(action)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Content */}
              <div className="p-3 space-y-2 flex-grow">
                <div className="text-sm">
                  <span className="text-muted-foreground font-medium">
                    {t("scheduled_actions_page.search")}
                  </span>
                  <span className="ml-2 font-mono text-xs bg-muted/50 px-2 py-1 border border-border font-semibold">
                    {action.searchQuery}
                  </span>
                </div>
                <div className="text-sm">
                  <span className="text-muted-foreground font-medium">
                    {t("scheduled_actions_page.workflow")}
                  </span>
                  <span className="ml-2 text-primary font-medium">
                    {action.workflow}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-1">
                    {getDestinationIcon(action.destinationType)}
                    <span className="text-muted-foreground font-medium text-sm">
                      {t("scheduled_actions_page.send_to")}
                    </span>
                    <span className="font-mono text-xs mt-px font-semibold">
                      {action.destination}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    {getFormatIcon(action.outputFormat)}
                    <span className="text-muted-foreground font-medium">
                      {t("scheduled_actions_page.format")}
                    </span>
                    <span className="uppercase text-xs font-semibold">
                      {action.outputFormat}
                    </span>
                  </div>
                </div>
                {action.prompt &&
                  (action.outputFormat === "markdown" ||
                    action.outputFormat === "pdf") && (
                    <div className="text-sm flex items-center">
                      <span className="text-muted-foreground font-medium">
                        {t("scheduled_actions_page.prompt")}
                      </span>
                      <button
                        onClick={() => handleViewPrompt(action)}
                        className="ml-2 text-primary hover:text-orange-600 underline text-xs flex items-center gap-1"
                      >
                        <Eye className="h-3 w-3" />
                        {t("scheduled_actions_page.view_prompt", {
                          characters: decodePrompt(action.prompt).userPrompt
                            .length,
                        })}
                      </button>
                    </div>
                  )}
              </div>

              {/* Footer */}
              <div className="px-3 py-2 border-t border-border/50">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1">
                      <Play className="h-3 w-3" />
                      <span>
                        {action.totalRuns || 0}{" "}
                        {t("scheduled_actions_page.runs")}
                      </span>
                    </div>
                    {action.lastRun && (
                      <span>
                        {t("scheduled_actions_page.last")} {action.lastRun}
                      </span>
                    )}
                    {action.nextRun && (
                      <span>
                        {t("scheduled_actions_page.next")} {action.nextRun}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div
                      className={`w-2 h-2 rounded-full ${action.isActive ? "bg-green-500" : "bg-gray-400"}`}
                    />
                    <span>
                      {action.isActive
                        ? t("scheduled_actions_page.active")
                        : t("scheduled_actions_page.paused")}
                    </span>{" "}
                  </div>
                </div>
              </div>
            </div>
          ))}

          {actions?.length === 0 && !isLoading && (
            <div className="col-span-full text-center py-12 text-muted-foreground">
              <Clock className="h-12 w-12 mx-auto mb-4 text-border" />
              <h3 className="text-lg font-medium mb-2">
                {t("scheduled_actions_page.no_actions_title")}
              </h3>
              <p className="text-sm">
                {t("scheduled_actions_page.no_actions_subtitle")}
              </p>
              <Button
                variant="default"
                onClick={() => openModal("schedule")}
                className="mt-4 rounded-md h-8 hover:bg-orange-600"
              >
                <Plus className="w-4 h-4 mr-2" />
                {t("scheduled_actions_page.schedule_new_action")}
              </Button>
            </div>
          )}
        </div>
      )}
      {!isLoading && actions?.length > 0 && (
        <div className="flex flex-1 flex-grow mt-2 justify-end">
          <Button
            variant="default"
            onClick={() => openModal("schedule")}
            className="rounded-md h-8 hover:bg-orange-600"
          >
            <Plus className="w-4 h-4 mr-2" />
            {t("scheduled_actions_page.schedule_new_action")}
          </Button>
        </div>
      )}

      {status === "CanLoadMore" && (
        <div className="mt-6 text-center">
          <Button
            variant="outline"
            onClick={() => loadMore(50)}
            className="rounded-md"
          >
            {t("scheduled_actions_page.load_more")}
          </Button>
        </div>
      )}

      {/* Confirmation and Prompt Modals */}
      {confirmToggle && (
        <div className="fixed inset-0 bg-white/80 flex items-center justify-center p-4 z-50">
          <div className="bg-background border border-border w-full max-w-md">
            <div className="px-4 py-2 border-b border-border flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-primary" />
              <h3 className="text-md font-medium">
                {confirmToggle.newState
                  ? t("scheduled_actions_page.activate_title")
                  : t("scheduled_actions_page.pause_title")}
              </h3>
            </div>
            <div className="p-4">
              <p className="text-sm">
                {confirmToggle.newState
                  ? t("scheduled_actions_page.confirm_activate_message")
                  : t("scheduled_actions_page.confirm_pause_message")}
              </p>
            </div>
            <div className="px-4 py-2 border-t border-border flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmToggle(null)}
                className="h-8 rounded-md"
              >
                {t("global.cancel")}
              </Button>
              <Button
                size="sm"
                onClick={confirmToggleAction}
                className={`h-8 rounded-md text-white ${confirmToggle.newState ? "bg-green-500 hover:bg-green-600" : "bg-primary hover:bg-orange-600"}`}
              >
                {confirmToggle.newState
                  ? t("scheduled_actions_page.activate_button")
                  : t("scheduled_actions_page.pause_button")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-background border border-border w-full max-w-md">
            <div className="px-4 py-2 border-b border-border flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <h3 className="text-md font-medium">
                {t("scheduled_actions_page.delete_title")}
              </h3>
            </div>
            <div className="p-4">
              <p className="text-sm">
                {t("scheduled_actions_page.confirm_delete_message")}
              </p>
            </div>
            <div className="px-4 py-2 border-t border-border flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmDelete(null)}
                className="h-8 rounded-md"
              >
                {t("global.cancel")}
              </Button>
              <Button
                size="sm"
                onClick={confirmDeleteAction}
                className="h-8 rounded-md text-white bg-destructive hover:bg-red-600"
              >
                {t("scheduled_actions_page.delete_button")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

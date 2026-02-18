import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Bell, Trash2, AlertTriangle, Loader2 } from "lucide-react";
import { usePaginatedQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Doc } from "convex/_generated/dataModel";
import FilterDisplay from "@/components/visualQueryBuilder/filterDisplay";
import { useTranslation } from "react-i18next";

export function AlertsList() {
  const { t } = useTranslation();
  const {
    results: alerts,
    status,
    loadMore,
  } = usePaginatedQuery(api.alerts.getPaginated, {}, { initialNumItems: 50 });
  const toggleAlert = useMutation(api.alerts.toggleIsActive);
  const deleteAlert = useMutation(api.alerts.deleteAlert);

  const [confirmToggle, setConfirmToggle] = useState<{
    alert: Doc<"alerts">;
    newState: boolean;
  } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{
    alert: Doc<"alerts">;
  } | null>(null);

  const handleToggleAlert = (alert: Doc<"alerts">) => {
    const newState = !alert.isActive;
    setConfirmToggle({ alert, newState });
  };

  const confirmToggleAction = () => {
    if (!confirmToggle) return;
    toggleAlert({
      id: confirmToggle.alert._id,
      isActive: confirmToggle.newState,
    });
    setConfirmToggle(null);
  };

  const handleDeleteAlert = (alert: Doc<"alerts">) => {
    setConfirmDelete({ alert });
  };

  const confirmDeleteAction = () => {
    if (!confirmDelete) return;
    deleteAlert({ id: confirmDelete.alert._id });
    setConfirmDelete(null);
  };

  const isLoading = status === "LoadingFirstPage";

  return (
    <div>
      {/* Table */}
      <div className="border border-border bg-background">
        {/* Table Header */}
        <div className="px-4 py-2 border-b border-border bg-muted/50">
          <div className="grid grid-cols-12 gap-4 text-xs font-medium text-muted-fo2reground">
            <div className="col-span-3 font-medium">
              {t("alerts_page.table_header_name")}
            </div>
            <div className="col-span-5 font-medium">
              {t("alerts_page.table_header_conditions")}
            </div>
            <div className="col-span-2 font-medium">
              {t("alerts_page.table_header_email")}
            </div>
            <div className="col-span-1 font-medium">
              {t("alerts_page.table_header_triggers")}
            </div>
            <div className="col-span-1 font-medium text-right">
              {t("alerts_page.table_header_actions")}
            </div>
          </div>
        </div>

        {/* Table Body */}
        <div>
          {isLoading && (
            <div className="flex justify-center items-center p-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
          {alerts?.map((alert) => (
            <div
              key={alert._id}
              className="px-4 py-3 border-b border-border last:border-b-0 hover:bg-muted/50"
            >
              <div className="grid grid-cols-12 gap-4 items-center text-sm">
                {/* Alert Name */}
                <div className="col-span-3">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-2 h-2 flex-shrink-0 rounded-full ${alert.isActive ? "bg-green-500" : "bg-gray-400"}`}
                    />
                    <div>
                      <div className="font-medium text-foreground truncate">
                        {alert.name}
                      </div>
                      {alert.description && (
                        <div className="text-xs text-muted-foreground truncate">
                          {alert.description}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Conditions */}
                <div className="col-span-5 text-xs">
                  <FilterDisplay
                    filterString={alert.conditions}
                    filterConditions={""}
                    mode="alerts"
                  />
                </div>

                {/* Email */}
                <div className="col-span-2">
                  <div className="text-xs font-mono font-semibold text-muted-foreground truncate">
                    {alert.email}
                  </div>
                </div>

                {/* Triggers */}
                <div className="col-span-1">
                  <div className="text-xs text-muted-foreground">
                    {alert.totalTriggers}
                  </div>
                </div>

                {/* Actions */}
                <div className="col-span-1">
                  <div className="flex items-center justify-end gap-2">
                    <Switch
                      checked={alert.isActive}
                      onCheckedChange={() => handleToggleAlert(alert)}
                      className="data-[state=checked]:bg-orange-500"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteAlert(alert)}
                      className="p-1 h-6 w-6 text-muted-foreground hover:text-destructive rounded-md"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {alerts?.length === 0 && !isLoading && (
          <div className="text-center py-12 text-muted-foreground">
            <Bell className="h-12 w-12 mx-auto mb-4 text-border" />
            <h3 className="text-lg font-medium mb-2">
              {t("alerts_page.empty_state_title")}
            </h3>
            <p className="text-sm">{t("alerts_page.empty_state_subtitle")}</p>
          </div>
        )}
      </div>

      {status === "CanLoadMore" && (
        <div className="mt-6 text-center">
          <Button
            variant="outline"
            onClick={() => loadMore(50)}
            className="h-8 rounded-md"
          >
            {t("alerts_page.load_more_button")}
          </Button>
        </div>
      )}

      {/* Confirmation Modals */}
      {confirmToggle && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-background border border-border w-full max-w-md">
            <div className="px-4 py-2 border-b border-border flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              <h3 className="text-md font-medium">
                {confirmToggle.newState
                  ? t("alerts_page.activate_title")
                  : t("alerts_page.pause_title")}
              </h3>
            </div>
            <div className="p-4">
              <p className="text-sm">
                {confirmToggle.newState
                  ? t("alerts_page.confirm_activate_message")
                  : t("alerts_page.confirm_pause_message")}
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
                variant="default"
                size="sm"
                onClick={confirmToggleAction}
                className={`h-8 rounded-md text-white ${confirmToggle.newState ? "bg-green-500 hover:bg-green-600" : "bg-primary hover:bg-orange-600"}`}
              >
                {confirmToggle.newState
                  ? t("alerts_page.activate_button")
                  : t("alerts_page.pause_button")}
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
                {t("alerts_page.delete_title")}
              </h3>
            </div>
            <div className="p-4">
              <p className="text-sm">
                {t("alerts_page.confirm_delete_message")}
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
                variant="destructive"
                size="sm"
                onClick={confirmDeleteAction}
                className="h-8 rounded-md text-white bg-destructive hover:bg-red-600"
              >
                {t("alerts_page.delete_button")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

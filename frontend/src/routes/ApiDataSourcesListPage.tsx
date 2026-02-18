import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Globe,
  Plus,
  Edit,
  Trash2,
  Database,
  Calendar,
  Clock,
  CheckCircle,
  AlertTriangle,
} from "lucide-react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Doc, Id } from "../../convex/_generated/dataModel";
import { useNavigate } from "react-router";
import { useDataContext } from "@/context/DataContext";
import { useTranslation } from "react-i18next";

const ApiDataSourcesListPage: React.FC = () => {
  const navigate = useNavigate();
  const { workspace } = useDataContext();
  const { t } = useTranslation();
  const dataSources = useQuery(
    api.api_data_sources.list,
    workspace?._id ? { workspaceId: workspace._id } : "skip",
  );
  const removeSource = useMutation(api.api_data_sources.remove);

  // Use the correct Doc type for the state
  const [confirmDelete, setConfirmDelete] = useState<{
    id: Id<"api_data_sources">;
    source: Doc<"api_data_sources">;
  } | null>(null);

  // The handler now correctly accepts the type provided by the useQuery hook
  const handleDeleteDataSource = (source: Doc<"api_data_sources">) => {
    setConfirmDelete({ id: source._id, source });
  };

  const confirmDeleteAction = async () => {
    if (!confirmDelete) return;
    await removeSource({ id: confirmDelete.id });
    setConfirmDelete(null);
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffHours < 1)
      return t("api_data_sources_list_page.card.time.just_now");
    if (diffHours < 24)
      return t("api_data_sources_list_page.card.time.hours_ago", {
        count: diffHours,
      });
    if (diffDays < 7)
      return t("api_data_sources_list_page.card.time.days_ago", {
        count: diffDays,
      });
    return date.toLocaleDateString();
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">
            {t("api_data_sources_list_page.title")}
          </h3>
          <p className="text-sm text-muted-foreground">
            {t("api_data_sources_list_page.subtitle")}
          </p>
        </div>
        {dataSources && dataSources?.length > 0 && (
          <Button
            variant="default"
            onClick={() => navigate("/api-data-sources/new")}
            className="h-8 px-4 rounded-md hover:bg-orange-600"
          >
            <Plus className="h-4 w-4 mr-2" />
            {t("api_data_sources_list_page.setup_button")}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {dataSources?.map((source: Doc<"api_data_sources">) => (
          <div
            key={source._id}
            className="border border-border p-4 bg-background"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-primary" />
                <h4 className="font-medium">{source.name}</h4>
                <div
                  className={`w-2 h-2 mt-0.5 rounded-full ${source.status === "active" ? "bg-green-500" : "bg-destructive"}`}
                />
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-muted-foreground rounded-md hover:text-foreground"
                  onClick={() =>
                    navigate(`/api-data-sources/${source._id}/edit`)
                  }
                >
                  <Edit className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeleteDataSource(source)}
                  className="h-6 w-6 p-0 rounded-md text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Database className="h-3 w-3" />
                <span className="font-mono text-xs truncate">{source.url}</span>
              </div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  <span>
                    {t("api_data_sources_list_page.card.created")}{" "}
                    {formatDate(source._creationTime)}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  <span>
                    {source.rateLimit.requests.toLocaleString()}/
                    {source.rateLimit.period}
                  </span>
                </div>
                {source.isValid && (
                  <div className="inline-flex items-center rounded-md bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                    <CheckCircle className="mr-1.5 h-3 w-3" />
                    {t("api_data_sources_list_page.card.verified")}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
        {dataSources?.length === 0 && (
          <div className="col-span-2 text-center py-12 text-muted-foreground">
            <Globe className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-medium mb-2">
              {t("api_data_sources_list_page.empty_state.title")}
            </h3>
            <p className="text-sm mb-4">
              {t("api_data_sources_list_page.empty_state.subtitle")}
            </p>
            <Button
              variant="default"
              onClick={() => navigate("/api-data-sources/new")}
              className="h-8 px-4 hover:bg-orange-600 rounded-md"
            >
              <Plus className="h-4 w-4 mr-2" />
              {t("api_data_sources_list_page.setup_button")}
            </Button>
          </div>
        )}
      </div>

      {confirmDelete && (
        <div className="fixed inset-0 bg-white/80 flex items-center justify-center p-4 z-50">
          <div className="bg-background border border-border w-full max-w-md">
            <div className="px-4 py-2 border-b border-border flex items-center gap-2 bg-gray-50">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <h3 className="text-md font-medium">
                {t("api_data_sources_list_page.delete_modal.title")}
              </h3>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-sm">
                {t("api_data_sources_list_page.delete_modal.confirmation")}
              </p>
              <div className="bg-gray-50 border border-borderp-3 space-y-2 text-xs px-4 py-2">
                <div>
                  <span className="text-muted-foreground">
                    {t("api_data_sources_list_page.delete_modal.label_source")}
                  </span>
                  <span className="ml-2 font-medium">
                    {confirmDelete.source.name}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">
                    {t("api_data_sources_list_page.delete_modal.label_url")}
                  </span>
                  <span className="ml-2 font-mono">
                    {confirmDelete.source.url}
                  </span>
                </div>
              </div>
            </div>
            <div className="px-4 py-2 border-t border-border flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmDelete(null)}
                className="h-8 border border-border rounded-md"
              >
                {t("global.cancel")}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={confirmDeleteAction}
                className="h-8 rounded-md hover:bg-red-600"
              >
                {t("api_data_sources_list_page.delete_modal.delete_button")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default ApiDataSourcesListPage;

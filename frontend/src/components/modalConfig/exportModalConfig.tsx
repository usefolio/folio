import React, { useEffect, useMemo, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useAction } from "convex/react";
import { Alert, AlertDescription } from "../ui/alert";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../ui/tabs";
import { InfoIcon, Loader2 } from "lucide-react";
import { Checkbox } from "../ui/checkbox";
import { Button } from "../ui/button";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { Doc } from "convex/_generated/dataModel";
import { api } from "../../../convex/_generated/api";
import { ExportModalConfigProps } from "@/interfaces/interfaces";
import { useBackendClient } from "@/hooks/useBackendClient";

const ExportModalConfig: React.FC<ExportModalConfigProps> = ({
  state,
  actions,
  projectId,
  closeModal,
}) => {
  const { t } = useTranslation(); // Add activeSheet from context
  const {
    exportSelectedColumns,
    exportSelectedViews,
    exportActiveTab,
    userHasSetColumnsSelection,
    userHasSetViewsSelection,
  } = state;
  const [isFetching, setIsFetching] = useState(true);
  const [exportableColumns, setExportableColumns] = useState<Doc<"column">[]>(
    [],
  );
  const [exportableSheets, setExportableSheets] = useState<Doc<"sheet">[]>([]);
  const [dataWarehouseColumns, setDataWarehouseColumns] = useState<Set<string>>(new Set());
  const [isDataWarehouseColumnsFetching, setIsDataWarehouseColumnsFetching] = useState(true);
  const closeTimerRef = useRef<number | null>(null);
  const fetchAllDataForExport = useAction(
    api.export_data.fetchAllColumnsAndSheetsForProject,
  );
  // Keep a stable reference to avoid effect re-runs if the action identity changes
  const fetchAllDataForExportRef = useRef(fetchAllDataForExport);
  useEffect(() => {
    fetchAllDataForExportRef.current = fetchAllDataForExport;
  }, [fetchAllDataForExport]);
  const { listColumns } = useBackendClient();
  const listColumnsRef = useRef(listColumns);
  useEffect(() => {
    listColumnsRef.current = listColumns;
  }, [listColumns]);
  
  // Single effect that handles both fetching operations sequentially
  useEffect(() => {
    if (!projectId) return;
    
    const loadAllData = async () => {
      // Set both loading states at the start
      setIsFetching(true);
      setIsDataWarehouseColumnsFetching(true);
      
      try {
        // Step 1: Fetch Convex data
        const { columns, sheets } = await fetchAllDataForExportRef.current({ projectId });
        setExportableColumns(columns);
        setExportableSheets(sheets);

        // Step 2: Fetch data warehouse validation
        try {
          const result = await listColumnsRef.current({
            convex_project_id: projectId,
          });

          if (!result || !Array.isArray(result.columns)) {
            console.warn(
              "Data warehouse validation returned an unexpected response, enabling all columns",
            );
            const allColumnNames = new Set(columns.map((col) => col.name));
            setDataWarehouseColumns(allColumnNames);
            return;
          }

          const validColumnNames = new Set<string>(result.columns);
          setDataWarehouseColumns(validColumnNames);
        } catch (dwError) {
          console.error("Data warehouse validation failed:", dwError);
          // Fallback: enable all columns
          const allColumnNames = new Set(columns.map((col) => col.name));
          setDataWarehouseColumns(allColumnNames);
        }
      } catch (error) {
        console.error("Failed to fetch data for export modal:", error);
      } finally {
        // Clear both loading states at the end
        setIsFetching(false);
        setIsDataWarehouseColumnsFetching(false);
      }
    };
    
    loadAllData();
  }, [projectId]);
  // Count selected items - only count available columns

  const selectedColumnsCount = useMemo(() => {
    return exportableColumns.reduce((count, column) => {
      return count + (exportSelectedColumns[column._id] ? 1 : 0);
    }, 0);
  }, [exportableColumns, exportSelectedColumns]);

  const selectedViewsCount = useMemo(() => {
    return exportableSheets.reduce((count, sheet) => {
      return count + (exportSelectedViews[sheet._id] ? 1 : 0);
    }, 0);
  }, [exportableSheets, exportSelectedViews]);

  // Initialize selection - select all columns first, then update based on data warehouse
  useEffect(() => {
    // First: Select all columns when exportable columns are loaded (before data warehouse fetch)
    if (!isFetching && !userHasSetColumnsSelection && exportableColumns.length > 0 && dataWarehouseColumns.size === 0) {
      const initialColumnSelections: Record<string, boolean> = {};
      exportableColumns.forEach((column) => {
        initialColumnSelections[column._id] = true; // Select ALL columns initially
      });
      actions.setInitialExportColumns(initialColumnSelections);
    }

    // Second: Update selections after data warehouse fetch completes
    if (!isFetching && !isDataWarehouseColumnsFetching && exportableColumns.length > 0 && dataWarehouseColumns.size > 0) {
      const updatedColumnSelections: Record<string, boolean> = {};
      exportableColumns.forEach((column) => {
        updatedColumnSelections[column._id] = dataWarehouseColumns.has(column.name);
      });
      actions.setInitialExportColumns(updatedColumnSelections);
    }

    if (!userHasSetViewsSelection && exportableSheets.length > 0) {
      const initialViewSelections: Record<string, boolean> = {};
      exportableSheets.forEach((sheet) => {
        initialViewSelections[sheet._id] = true;
      });
      actions.setInitialExportViews(initialViewSelections);
    }
  }, [
    isFetching,
    isDataWarehouseColumnsFetching,
    exportableColumns,
    exportableSheets,
    dataWarehouseColumns,
    userHasSetColumnsSelection,
    userHasSetViewsSelection,
    actions,
  ]);

  const handleTabChange = (value: string) => {
    actions.setExportActiveTab(value as "columns" | "views");
  };

  const handleSelectAll = () => {
    if (exportActiveTab === "columns") {
      actions.selectAllExportColumns(exportableColumns);
    } else {
      actions.selectAllExportViews(exportableSheets);
    }
  };

  const handleDeselectAll = () => {
    if (exportActiveTab === "columns") {
      actions.deselectAllExportColumns();
    } else {
      actions.deselectAllExportViews();
    }
  };

  const toggleColumnSelection = (columnId: string, checked: boolean) => {
    actions.toggleExportColumn(columnId, checked);
  };

  const toggleViewSelection = (viewId: string, checked: boolean) => {
    actions.toggleExportView(viewId, checked);
  };

  // Function to truncate text with ellipsis
  const truncateText = (text: string, maxLength = 20) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + "...";
  };

  const handleDownloadClick = () => {
    // Prevent setting multiple timers if the link is clicked again
    if (closeTimerRef.current) {
      return;
    }
    // Set a 5-second timer that will call the closeModal function
    closeTimerRef.current = window.setTimeout(() => {
      closeModal();
      actions.setExportDownloadUrl(null);
    }, 5000);
  };
  useEffect(() => {
    return () => {
      actions.setExportDownloadUrl(null);
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
    };
  }, []);
  return (
    <div className="relative">
      {state.exportDownloadUrl && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white bg-opacity-90 p-4 text-center">
          <p className="text-xs font-normal text-gray-800">
            {t("modal_manager.export_modal_config.download_ready")}
          </p>
          <a
            href={state.exportDownloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 font-semibold text-sm text-primary hover:underline hover:text-orange-600"
            onClick={handleDownloadClick}
          >
            {t("modal_manager.export_modal_config.click_to_get_data")}
          </a>
        </div>
      )}
      <div className="space-y-4 px-6 py-3">
        <div className="space-y-1">
          <Alert className="rounded-md border bg-blue-50/50">
            <InfoIcon className="h-4 w-4" />
            <AlertDescription className="text-xs">
              {t("modal_manager.export_modal_config.alert_description")}
            </AlertDescription>
          </Alert>
        </div>
        <div className="space-y-1">
          <Tabs defaultValue={exportActiveTab} onValueChange={handleTabChange}>
            <TabsList className="rounded-none bg-transparent p-0 h-full w-full flex flex-grow flex-1">
              <TabsTrigger
                value="columns"
                className={`transition-none flex flex-1 relative bg-transparent rounded-none border-b border-gray-200 px-4 py-2 aria-selected:border-b-2 aria-selected:!border-primary aria-selected:!bg-background aria-selected:text-foreground text-xs whitespace-nowrap`}
              >
                <span className="block overflow-hidden">
                  {t("modal_manager.export_modal_config.columns")}
                </span>
                <span className="ml-2 bg-muted px-1.5 py-0.5 text-xs font-medium">
                  {exportableColumns.length.toLocaleString() || 0}
                </span>
              </TabsTrigger>
              <TabsTrigger
                value="views"
                className={`transition-none flex flex-1 relative bg-transparent rounded-none border-b border-gray-200 px-4 py-2 aria-selected:border-b-2 aria-selected:!border-primary aria-selected:!bg-background aria-selected:text-foreground text-xs whitespace-nowrap`}
              >
                <span className="block overflow-hidden">
                  {t("modal_manager.export_modal_config.views")}
                </span>
                <span className="ml-2 bg-muted px-1.5 py-0.5 text-xs font-medium">
                  {exportableSheets.length.toLocaleString() || 0}
                </span>
              </TabsTrigger>
            </TabsList>
            <TabsContent value="columns">
              {isFetching || isDataWarehouseColumnsFetching ? (
                <div className="flex h-auto w-full items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : (
                <>
                  <div className="space-y-1 flex flex-grow items-center my-4">
                    <div className="flex flex-1">
                      <span className="text-sm text-gray-500">
                        {t(
                          "modal_manager.export_modal_config.columns_selected",
                          {
                            selectedColumns: selectedColumnsCount,
                            totalColumns: exportableColumns.length,
                          },
                        )}
                      </span>
                    </div>
                    <div className="flex flex-1 justify-between ml-2">
                      <Button
                        variant="outline"
                        className="h-8 px-3 text-xs font-medium rounded-md"
                        onClick={handleSelectAll}
                      >
                        {t("modal_manager.export_modal_config.select_all")}
                      </Button>
                      <Button
                        variant="outline"
                        className="h-8 px-3 text-xs font-medium rounded-md"
                        onClick={handleDeselectAll}
                      >
                        {t("modal_manager.export_modal_config.deselect_all")}
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-2 gap-y-4">
                    {exportableColumns.map((column) => (
                      <div
                        key={column._id}
                        className={`flex items-center space-x-2 checked:text-primary-foreground ${
                          !dataWarehouseColumns.has(column.name) ? 'opacity-50' : ''
                        }`}
                      >
                        <Checkbox
                          id={column._id}
                          checked={!!exportSelectedColumns[column._id]}
                          disabled={isDataWarehouseColumnsFetching ? false : !dataWarehouseColumns.has(column.name)}
                          onCheckedChange={(checked) =>
                            toggleColumnSelection(column._id, !!checked)
                          }
                        />
                        {column.name.length >= 25 ? (
                          <TooltipPrimitive.Provider>
                            <TooltipPrimitive.Root>
                              <TooltipPrimitive.Trigger asChild>
                                <label
                                  htmlFor={column._id}
                                  className="text-foreground text-xs font-medium max-w-[180px] truncate cursor-pointer"
                                >
                                  {truncateText(column.name, 25)}
                                </label>
                              </TooltipPrimitive.Trigger>
                              <TooltipPrimitive.Portal>
                                <TooltipPrimitive.Content
                                  side="top"
                                  align="start"
                                  className="z-[9999] bg-background px-3 py-1.5 text-xs border border-border rounded-md text-foreground animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
                                  sideOffset={5}
                                >
                                  <p className="text-xs max-w-[300px] break-words">
                                    {column.name}
                                  </p>
                                </TooltipPrimitive.Content>
                              </TooltipPrimitive.Portal>
                            </TooltipPrimitive.Root>
                          </TooltipPrimitive.Provider>
                        ) : (
                          <label
                            htmlFor={column._id}
                            className="text-foreground text-xs font-medium max-w-[180px] truncate cursor-pointer"
                          >
                            {column.name}
                          </label>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </TabsContent>
            <TabsContent value="views">
              {isFetching ? (
                <div className="flex h-auto w-full items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : (
                <>
                  <div className="space-y-1 flex flex-grow items-center my-4">
                    <div className="flex flex-1">
                      <span className="text-sm text-gray-500">
                        {t("modal_manager.export_modal_config.views_selected", {
                          selectedViews: selectedViewsCount,
                          totalViews: exportableSheets.length,
                        })}
                      </span>
                    </div>
                    <div className="flex flex-1 justify-between ml-2">
                      <Button
                        variant="outline"
                        className="h-8 px-3 text-xs font-medium rounded-md"
                        onClick={handleSelectAll}
                      >
                        {t("modal_manager.export_modal_config.select_all")}
                      </Button>
                      <Button
                        variant="outline"
                        className="h-8 px-3 text-xs font-medium rounded-md"
                        onClick={handleDeselectAll}
                      >
                        {t("modal_manager.export_modal_config.deselect_all")}
                      </Button>
                    </div>
                  </div>
                  {/* Grid layout for views */}
                  <div className="grid grid-cols-2 gap-x-2 gap-y-4">
                    {exportableSheets.map((view) => (
                      <div
                        key={view._id}
                        className="flex items-center space-x-2 checked:text-primary-foreground"
                      >
                        <Checkbox
                          id={view._id}
                          checked={!!exportSelectedViews[view._id]}
                          onCheckedChange={(checked) =>
                            toggleViewSelection(view._id, !!checked)
                          }
                        />
                        {view.name.length >= 25 ? (
                          <TooltipPrimitive.Provider>
                            <TooltipPrimitive.Root>
                              <TooltipPrimitive.Trigger asChild>
                                <label
                                  htmlFor={view._id}
                                  className="text-foreground text-xs font-medium max-w-[180px] truncate cursor-pointer"
                                >
                                  {truncateText(view.name, 25)}
                                </label>
                              </TooltipPrimitive.Trigger>
                              <TooltipPrimitive.Portal>
                                <TooltipPrimitive.Content
                                  side="top"
                                  align="start"
                                  className="z-[9999] bg-background px-3 py-1.5 text-xs border border-border rounded-md text-foreground animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
                                  sideOffset={5}
                                >
                                  <p className="text-xs max-w-[300px] break-words">
                                    {view.name}
                                  </p>
                                </TooltipPrimitive.Content>
                              </TooltipPrimitive.Portal>
                            </TooltipPrimitive.Root>
                          </TooltipPrimitive.Provider>
                        ) : (
                          <label
                            htmlFor={view._id}
                            className="text-foreground text-xs font-medium max-w-[180px] truncate cursor-pointer"
                          >
                            {view.name}
                          </label>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
};
export default React.memo(ExportModalConfig);

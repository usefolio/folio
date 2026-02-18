import { useEffect, useMemo, useState } from "react";
import { HeaderDropdownProps } from "../../interfaces/interfaces";
import { JSONSchema, SavedPrompt } from "../../types/types";
import { useTranslation } from "react-i18next";
import { useLogger } from "../../utils/Logger";
import { Id } from "../../../convex/_generated/dataModel";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDataContext } from "@/context/DataContext";
import { decodePrompt } from "@/utils/promptUtils";

const HeaderDropdown: React.FC<HeaderDropdownProps> = ({
  clickedColumnId,
  visibleColumns,
  dropdownVisible,
  dropdownPosition,
  closeHeaderDropdown,
  openShowPromptModal,
  projectId,
  hideColumn,
  handleCreateViewsFromDeepDive,
  switchToNewSheet,
  setSwitchToNewSheet,
  isResizing,
}) => {
  const { t } = useTranslation();
  const logger = useLogger("src/components/grid/HeaderDropdown.tsx");
  const [isTagColumn, setIsTagColumn] = useState(false);
  const [columnTags, setColumnTags] = useState<string[]>([]);
  const [columnName, setColumnName] = useState<string>("");
  const [isPromptDisabled, setIsPromptDisabled] = useState(true);

  // Get full columns data from DataContext
  const {
    columns: fullColumns,
    savedPrompts,
    savedJsonSchemas,
    projects,
    loadingColumnsSet,
  } = useDataContext();

  const columnIsInFlight = useMemo(() => {
    if (!clickedColumnId) return false;
    return loadingColumnsSet.has(clickedColumnId as Id<"column">);
  }, [clickedColumnId, loadingColumnsSet]);

  useEffect(() => {
    if (!dropdownVisible || !clickedColumnId) return;

    const column = visibleColumns.find((col) => col._id === clickedColumnId);
    if (!column) return;
    // Find the full column data from DataContext
    const fullColumn = fullColumns.find((col) => col._id === clickedColumnId);

    setColumnName(column.name);

    // Logic to determine if show-prompt should be disabled
    // Is the column a user-created column
    if (!fullColumn) return;
    const isUserCreatedAIColumn =
      fullColumn.column_type === "schema" ||
      fullColumn.column_type === "noSchema";

    // Does the column have prompt attached
    const hasSavedPrompt =
      savedPrompts.some(
        (prompt: SavedPrompt) =>
          prompt.columnName === column.name && prompt.projectId === projectId,
      ) || !!fullColumn.prompt;

    // The button is enabled ONLY IF it's a user-created AI column AND it has a prompt.
    // Otherwise, it is disabled.
    setIsPromptDisabled(!isUserCreatedAIColumn || !hasSavedPrompt);

    let columnPrompt = savedPrompts.find(
      (prompt: SavedPrompt) =>
        prompt.columnName === column.name && prompt.projectId === projectId,
    );

    const isTag = !!(
      columnPrompt?.promptOptions.promptType === "schema" &&
      columnPrompt?.promptOptions.responseOptions &&
      columnPrompt?.promptOptions.responseOptions.length > 0
    );

    const projectDoc = projects.find((p) => p._id === projectId);
    // If not found in localStorage and column has a prompt in Convex, decode it
    if (!columnPrompt && fullColumn?.prompt) {
      try {
        const decodedPrompt = decodePrompt(fullColumn.prompt);
        columnPrompt = {
          projectName: projectDoc?.name || "",
          columnName: column.name,
          projectId: projectId as string,
          promptOptions: decodedPrompt,
        };
      } catch (error) {
        logger.error("Failed to decode column prompt", { error });
      }
    }
    setIsTagColumn(isTag);

    if (
      isTag &&
      columnPrompt?.promptOptions.promptType === "schema" &&
      columnPrompt.promptOptions.responseOptions
    ) {
      setColumnTags(columnPrompt.promptOptions?.responseOptions);
    } else {
      // No prompt found at all
      setIsTagColumn(false);
      setColumnTags([]);
    }
  }, [
    dropdownVisible,
    clickedColumnId,
    visibleColumns,
    projectId,
    fullColumns,
  ]);

  const handleShowPrompt = () => {
    // Exit when no column Id is passed
    if (!clickedColumnId) {
      logger.warn("No column selected.");
      return;
    }
    // Find column matching ID
    const column = visibleColumns.find((col) => col._id === clickedColumnId);
    if (!column) {
      logger.error("Column not found for ID:", { clickedColumnId });
      return;
    }
    const columnName = column.name;

    // Find the full column data from DataContext
    const fullColumn = fullColumns.find((col) => col._id === clickedColumnId);
    // Try to find in localStorage first
    let columnPrompt = savedPrompts.find(
      (prompt: SavedPrompt) =>
        prompt.columnName === columnName && prompt.projectId === projectId,
    );
    const projectDoc = projects.find((p) => p._id === projectId);
    // If not found in localStorage and column has a prompt in Convex, decode it
    if (!columnPrompt && fullColumn?.prompt) {
      try {
        const decodedPrompt = decodePrompt(fullColumn.prompt);
        columnPrompt = {
          projectName: projectDoc?.name as string,
          columnName: column.name,
          projectId: projectId as string,
          promptOptions: decodedPrompt,
        };
      } catch (error) {
        logger.error("Failed to decode column prompt for display", { error });
      }
    }

    const columnJsonSchema = savedJsonSchemas.find(
      (prompt: { id: string; schema: JSONSchema }) =>
        prompt.id === `${columnName}-${projectId}-${column._id}`,
    );
    console.log(savedJsonSchemas);
    // Pass prompt data to modal
    if (columnPrompt) {
      openShowPromptModal({
        columnName,
        columnPrompt,
        columnJsonSchema: columnJsonSchema
          ? { schema: columnJsonSchema.schema }
          : undefined,
      });
    } else {
      openShowPromptModal({
        columnName,
        columnPrompt: t("grid.header_dropdown.no_saved_prompt_error", {
          columnName,
        }),
      });
    }
    closeHeaderDropdown();
  };

  const handleHideColumn = () => {
    if (!clickedColumnId) {
      return;
    }
    hideColumn(clickedColumnId as Id<"column">);
    closeHeaderDropdown();
  };

  const isDeepDiveDisabled =
    columnIsInFlight ||
    !handleCreateViewsFromDeepDive ||
    columnTags.length === 0 ||
    !columnName;

  const handleDeepDive = () => {
    if (switchToNewSheet) {
      setSwitchToNewSheet(false);
    }
    if (isDeepDiveDisabled) {
      logger.warn("Cannot perform Deep Dive: prerequisites not met", {
        columnId: clickedColumnId,
        hasTags: columnTags.length > 0,
        hasColumnName: !!columnName,
        hasHandler: !!handleCreateViewsFromDeepDive,
        isColumnInFlight: columnIsInFlight,
      });
      return;
    }
    handleCreateViewsFromDeepDive(columnName, columnTags);
    closeHeaderDropdown();
  };

  // Prevent modal from opening when dropdown is closed
  if (!dropdownVisible || isResizing) return null;

  return (
    <div
      className="absolute z-40"
      style={{ top: dropdownPosition.y, left: dropdownPosition.x }}
    >
      <DropdownMenu
        open={dropdownVisible && !isResizing}
        onOpenChange={(open) => !open && closeHeaderDropdown()}
      >
        <DropdownMenuTrigger asChild>
          {/* An invisible trigger element is needed for the dropdown to function */}
          <div className="w-1 h-1 opacity-0"></div>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem
            disabled={isPromptDisabled}
            onClick={handleShowPrompt}
            className="text-xs"
          >
            {t("grid.header_dropdown.show_prompt")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleHideColumn} className="text-xs">
            {t("grid.header_dropdown.hide_column")}
          </DropdownMenuItem>

          {isTagColumn && handleCreateViewsFromDeepDive && (
            <>
              <DropdownMenuItem
                onClick={isDeepDiveDisabled ? undefined : handleDeepDive}
                className="text-xs"
                disabled={isDeepDiveDisabled}
                title={
                  columnIsInFlight
                    ? t("grid.header_dropdown.deep_dive_inflight")
                    : undefined
                }
              >
                {t("grid.header_dropdown.deep_dive")}
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuItem onClick={closeHeaderDropdown} className="text-xs">
            {t("global.close")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

export default HeaderDropdown;

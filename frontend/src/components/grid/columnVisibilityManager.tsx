import React, { useMemo, useState, useEffect } from "react";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
} from "../ui/dropdown-menu";
import { Id } from "../../../convex/_generated/dataModel";
import { ColumnVisibilityManagerProps } from "../../types/types";
import { Filter } from "lucide-react";
import { ScrollArea, ScrollBar } from "../ui/scroll-area";
import { useTranslation } from "react-i18next";

const ColumnVisibilityManager: React.FC<ColumnVisibilityManagerProps> = ({
  columns,
  hiddenColumns,
  toggleColumnVisibility,
  updateAllHiddenColumns,
}) => {
  const { t } = useTranslation();
  const [dropdownOpen, setDropdownOpen] = useState<boolean>(false);
  const [localHiddenColumns, setLocalHiddenColumns] =
    useState<Id<"column">[]>(hiddenColumns);

  // Sync local state with props when hiddenColumns changes
  useEffect(() => {
    if (JSON.stringify(localHiddenColumns) !== JSON.stringify(hiddenColumns)) {
      setLocalHiddenColumns(hiddenColumns);
    }
  }, [hiddenColumns]);

  const handleCheckboxChange = (columnId: Id<"column">, checked: boolean) => {
    const updatedHidden = checked
      ? localHiddenColumns.filter((id) => id !== columnId)
      : [...localHiddenColumns, columnId];

    setLocalHiddenColumns(updatedHidden);

    // Call parent function to update real state
    toggleColumnVisibility(columnId, checked);
  };

  // When dropdown closes, ensure Convex and local state are in sync
  const handleDropdownChange = (open: boolean) => {
    setDropdownOpen(open);

    if (
      !open &&
      JSON.stringify(localHiddenColumns) !== JSON.stringify(hiddenColumns)
    ) {
      // Update all columns at once when closing dropdown
      updateAllHiddenColumns(localHiddenColumns);
    }
  };

  const createVisibilityMenu = useMemo(() => {
    return (
      <ScrollArea className="w-full h-48">
        {columns.map((column) => {
          const isHidden = localHiddenColumns.includes(column._id);
          return (
            <div
              key={column._id}
              className="mb-2 flex items-center space-x-2 checked:text-primary-foreground"
            >
              <Checkbox
                id={column._id}
                onCheckedChange={(checked: boolean) => {
                  handleCheckboxChange(column._id, checked);
                }}
                checked={!isHidden}
                className="rounded-none"
              />
              <span className="text-foreground">{column.name}</span>
            </div>
          );
        })}
        <ScrollBar orientation="vertical" />
      </ScrollArea>
    );
  }, [columns, localHiddenColumns, handleCheckboxChange]);

  const disabled = columns.length === 0;

  return (
    <DropdownMenu open={dropdownOpen} onOpenChange={handleDropdownChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className="h-8 w-8 rounded-md"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
          }}
        >
          <Filter className="w-4 h-4" />
          {localHiddenColumns.length > 0 && (
            <span className="absolute -top-2 right-[2px] bg-primary text-primary-foreground rounded-md w-4 h-4 text-[10px] flex items-center justify-center">
              {localHiddenColumns.length}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="rounded-md text-xs min-w-[180px] p-4 relative mr-4"
        align="start"
      >
        <div className="text-[10px] text-muted-foreground mb-2">
          {t("grid.column_visibility_manager.total_columns", {
            count: columns.length,
          })}
        </div>
        {createVisibilityMenu}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ColumnVisibilityManager;

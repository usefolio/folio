import { SheetObject } from "@/interfaces/interfaces.ts";

/**
 * Transforms selected views and columns into the SheetObject structure required by the API
 */
export const transformExportSelections = (
  selectedViews: Record<string, boolean>,
  selectedColumns: Record<string, boolean>,
  sheets: { _id: string; name: string; filter?: string; hidden?: string[] }[],
  columns: { _id: string; name: string }[],
): SheetObject[] => {
  // Get the selected column IDs
  const selectedColumnIds = Object.entries(selectedColumns)
    .filter(([_, selected]) => selected)
    .map(([id]) => id);

  // Get the selected view IDs
  const selectedViewIds = Object.entries(selectedViews)
    .filter(([_, selected]) => selected)
    .map(([id]) => id);

  // Transform to sheet objects
  const sheetObjects = selectedViewIds
    .map((viewId) => {
      // Find the sheet object
      const view = sheets.find((sheet) => sheet._id === viewId);

      if (!view) {
        console.error(`View with ID ${viewId} not found in sheets array`);
        return null;
      }

      // For each view, filter out selected columns that are hidden in this view
      const visibleSelectedColumnIds =
        view.hidden && Array.isArray(view.hidden)
          ? selectedColumnIds.filter(
              (columnId) => !view.hidden?.includes(columnId),
            )
          : selectedColumnIds;

      // Get the column names for the visible selected columns
      const visibleColumnNames = visibleSelectedColumnIds
        .map((id) => {
          const column = columns.find((c) => c._id === id);
          return column ? column.name : "";
        })
        .filter(Boolean);

      // Return the SheetObject
      return {
        name: view.name,
        condition: view.filter || "1=1", // Default condition if not specified
        column_names: visibleColumnNames,
      };
    })
    .filter(Boolean) as SheetObject[]; // Remove any null entries

  // Return the structure requested by the PM
  return sheetObjects;
};

/**
 * Check if any columns are selected
 */
export const hasSelectedColumns = (
  selectedColumns: Record<string, boolean>,
): boolean => {
  return Object.values(selectedColumns).some((selected) => selected);
};

/**
 * Check if any views are selected
 */
export const hasSelectedViews = (
  selectedViews: Record<string, boolean>,
): boolean => {
  return Object.values(selectedViews).some((selected) => selected);
};
/**
 * Filter out columns that are hidden in any view
 */

export const getInitialColumnSelections = (
  availableColumns: { _id: string; name: string }[],
): Record<string, boolean> => {
  const initialSelections: Record<string, boolean> = {};

  // All columns that are available in the active view are selected by default
  availableColumns.forEach((column) => {
    initialSelections[column._id] = true;
  });

  return initialSelections;
};

export const getInitialViewSelections = (
  sheets: { _id: string; name: string }[],
): Record<string, boolean> => {
  const initialSelections: Record<string, boolean> = {};

  sheets.forEach((sheet) => {
    // All views are selected by default
    initialSelections[sheet._id] = true;
  });

  return initialSelections;
};

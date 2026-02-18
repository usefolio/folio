import { useEffect, useMemo, useCallback, useRef, useState, memo } from "react";
import { Button } from "./ui/button";
import { Id } from "../../convex/_generated/dataModel";
import {
  DataEditor,
  GridCell,
  GridCellKind,
  GridColumn,
  Item,
  Rectangle,
  DataEditorRef,
  DrawHeaderCallback,
  TextCell,
  GridMouseEventArgs,
} from "@glideapps/glide-data-grid";
import { CellState, CellStates } from "../utils/CellState";
import { GridProps, JsonCell, MarkdownCell } from "../interfaces/interfaces";
import { CellClickedEventArgs } from "@glideapps/glide-data-grid";
import GridPopup from "./grid/GridPopup";
import LoadingCellRenderer from "./grid/LoadingCell";
import ErrorCellRenderer from "./grid/errorCell";
import JSONCellRenderer from "./grid/jsonCell";
import { LoadingCell, ErrorCell, FileCell } from "../types/types";
import { ColumnType, ColumnSubType } from "@/types/columns";
import { AudioCell } from "../interfaces/interfaces";
import {
  registerMediaCell,
  handleMediaCellClick,
  gridRef,
  parseMultiTagValue,
  clearMediaCellMap,
} from "../utils/CellDraw";
import HeaderDropdown from "./grid/HeaderDropdown";
import { showErrorNotification } from "./notification/NotificationHandler";
import { drawBubbleCell } from "../utils/CellDraw";
import {
  DrawCellCallback,
  BubbleCell,
  ImageCell,
} from "@glideapps/glide-data-grid";
import FileCellRenderer from "./grid/fileCell";
import { useDataContext } from "../context/DataContext";
import { useTranslation } from "react-i18next";
import { useLogger } from "../utils/Logger";
import { Plus, Minus } from "lucide-react";
import { useSidebar } from "@/components/sidebar/SidebarManager";
import AudioCellRenderer from "./grid/audioCell";
import MarkdownCellRenderer from "./grid/markdownCell";
import { Label } from "./ui/label";

// Small LRU cache for canvas measureText results to reduce repeated work
const MEASURE_CACHE_LIMIT = 2000;
const __measureCache = new Map<string, number>();
const FAILED_HEADER_ICON_ID = "columnFailedWarning";
const FAILED_ICON_HITBOX_PX = 28;
const FAILED_TOOLTIP_VERTICAL_OFFSET = 8;
function measureTextCached(ctx: CanvasRenderingContext2D, text: string): number {
  const key = ctx.font + "|" + text;
  const cached = __measureCache.get(key);
  if (cached !== undefined) return cached;
  const width = ctx.measureText(text).width;
  if (__measureCache.size >= MEASURE_CACHE_LIMIT) {
    const firstKey = __measureCache.keys().next().value as string | undefined;
    if (firstKey) __measureCache.delete(firstKey);
  }
  __measureCache.set(key, width);
  return width;
}

const Grid: React.FC<GridProps> = ({
  sheet_id,
  // project_id,
  onNewColumnButtonClick,
  setClickedColumnId,
  clickedColumnId,
  openShowPromptModal,
  state,
  actions,
  rows,
  scrollDown,
  hideColumn,
  handleCreateViewsFromDeepDive,
  switchToNewSheet,
  setSwitchToNewSheet,
}) => {
  // Data is now acquired from the context
  const {
    sheet,
    columns,
    loading,
    sheets,
    project,
    jobs,
    scrollColumnsRight,
    failedColumnsSet,
  } = useDataContext();
  // TODO: This is because right now count is hard to get. Will use the counter package from convex.
  // CONSTANTS
  const HARDCODED_ROW_COUNT = 100000;
  const defaultCellWidth = 130;
  const MIN_ROW_HEIGHT = 24;
  const MAX_ROW_HEIGHT = 120;
  const POPUP_MIN_WIDTH = 250;
  // REF CONSTANTS
  // Track the previous sheet_id
  const previousSheetId = useRef<string | null>(null);
  // Track previous columns length
  const previousAllColumns = useRef<Id<"column">[]>([]);

  const localGridRef = useRef<DataEditorRef>(null);

  const popupRef = useRef<HTMLDivElement>(null);

  const persistentColumnWidths = useRef(new Map<Id<"column">, number>());
  // Safari specific
  const isResizingRef = useRef(false);

  const resizeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [isResizing, setIsResizing] = useState(false);
  // STATE CONSTANTS
  const {
    // FILTEREDCOLUMNS
    filteredColumns,
    // HIDDEN COLUMNS
    hiddenColumns,
    columnWidths,
    headerDropdownVisible,
    headerDropdownPosition,
    // POPUP
    clickedCell,
    popupStyle,
    isProgrammaticPopupUpdate,
  } = state;

  const [rowHeight, setRowHeight] = useState(36); // Default row height
  const [failedColumnTooltip, setFailedColumnTooltip] = useState<
    { left: number; top: number; text: string } | null
  >(null);
  // CUSTOM HOOKS
  const { t } = useTranslation();
  const { openSidebar } = useSidebar();
  // USE CUSTOM LOGGER
  const logger = useLogger("src/Grid.tsx");
  const headerIcons = useMemo(
    () => ({
      [FAILED_HEADER_ICON_ID]: () =>
        '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><g opacity="0.9" transform="translate(0 0.4)"><path d="M9 3.4L14.1 13.4H3.9L9 3.4Z" fill="#FEE2E2" fill-opacity="0.88" stroke="#F87171" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 7.5V10.8" stroke="#F87171" stroke-width="1.25" stroke-linecap="round"/><circle cx="9" cy="12.9" r="0.95" fill="#F87171"/></g></svg>',
    }),
    [],
  );
  //MEMOIZED CONSTANTS
  const visibleColumns = useMemo(() => {
    if (!filteredColumns || !columns) return [];
    // Use filteredColumns to determine the visible columns
    return filteredColumns
      .map((columnId) => columns.find((col) => col._id === columnId))
      .filter(Boolean) as typeof columns; // Ensure no null values
  }, [filteredColumns, columns]);

  const gridColumns = useMemo((): GridColumn[] => {
    if (
      !columns ||
      !Array.isArray(columns) ||
      columns.length === 0 ||
      !visibleColumns ||
      visibleColumns.length === 0
    ) {
      // Return a placeholder column when real columns aren't available
      // This ensures the grid header is properly initialized even when no data is available
      return [
        {
          id: "placeholder-column",
          title: "",
          width: 0,
          hasMenu: false, // No menu for placeholder
        },
      ];
    }

    // Map visible columns to grid columns, with explicit handling for empty result
    const mappedColumns = visibleColumns.map((column) => {
      const isFailed = failedColumnsSet.has(column._id);
      return {
        title: column.name,
        id: column._id,
        hasMenu: true,
        menuIcon: "dots",
        width: columnWidths.get(column._id) || defaultCellWidth,
        icon: isFailed ? FAILED_HEADER_ICON_ID : undefined,
      };
    });

    // Return mapped columns or a placeholder if mapping produced no results
    return mappedColumns.length > 0
      ? mappedColumns
      : [
          {
            id: "placeholder-column",
            title: "",
            width: 0,
            hasMenu: false,
          },
        ];
  }, [visibleColumns, columnWidths, columns, failedColumnsSet]);

  // CONTANTS WITH DEPENDENCIES
  // Trigger loading more data when approaching the edges
  const BUFFER_ROWS = 1;
  const BUFFER_COLUMNS = 1;
  const totalRows = rows?.length;
  // Track visible region locally to avoid parent re-renders during scroll
  const visibleRegionRef = useRef<Rectangle>({ x: 0, y: 0, width: 0, height: 0 });

  gridRef.current = localGridRef.current;
  // USE EFFECT HOOKS
  useEffect(() => {
    if (columns.length > 0) {
      // Preserve existing column widths when columns are refreshed
      actions.updateColumnWidths((prev) => {
        const newWidths = new Map();

        // Apply existing widths first if available
        columns.forEach((col) => {
          // Use persistent columns ref instead of just state
          const persistentWidth = persistentColumnWidths.current.get(col._id);
          const currentWidth = prev.get(col._id);
          newWidths.set(
            col._id,
            persistentWidth || currentWidth || defaultCellWidth,
          );
        });

        return newWidths;
      });
    }
  }, [columns]);
  useEffect(() => {
    if (!loading && !columns) {
      showErrorNotification(
        t("grid.main.error_loading_columns_title"),
        t("grid.main.error_loading_columns_message"),
      );
    }
  }, [columns, loading]);
  // UseMemo used to comply with react rules of hooks and useEffect
  // Filter the columns and add promptType property to distinguish the columns that need bubble rendering

  useEffect(() => {
    if (sheet === undefined && !loading && !Array.isArray(sheets)) {
      showErrorNotification(
        t("grid.main.error_loading_sheet_title"),
        t("grid.main.error_loading_sheet_message"),
      );
    }
  }, [sheet, loading]);
  // ROWS

  // Flatten results array to get all rows

  useEffect(() => {
    if (!sheet || !columns) return;

    // Reset hiddenColumns and filteredColumns only on sheet change
    if (previousSheetId.current !== sheet_id) {
      // Get hidden columns from the sheet object (already from Convex)
      const savedHiddenColumns = sheet.hidden || [];
      actions.setHiddenColumns(savedHiddenColumns);

      const filteredColumns = columns
        .filter((col) => !savedHiddenColumns.includes(col._id))
        .map((col) => col._id);

      actions.setFilteredColumns(filteredColumns);

      logger.debug(
        `Sheet changed: ${sheet_id}. Loaded hidden columns from Convex.`,
      );
      previousSheetId.current = sheet_id;
    }

    previousAllColumns.current = columns.map((col) => col._id);
  }, [sheet_id, columns, sheet, project]);

  // Visible region edge detection is handled inside the scroll callback below
  // Position popup before it turns visible so that the height calculation can be taken into account
  useEffect(() => {
    if (!popupRef.current || !clickedCell) return;
    // Get the popup scrollArea and it's actual scroll element
    // (always 1 in the array as there are inline styles injected first by shadcn/radix-ui)

    const scrollElement =
      popupRef.current.querySelector(".popup-scroll-area")?.children[1];
    if (scrollElement) {
      // Reset the scroll-bar to the top and left position
      scrollElement.scrollTop = 0;
      scrollElement.scrollLeft = 0;
    }
    // Reset any previous manual height from resize so each new cell starts default size
    try {
      popupRef.current.style.height = "auto";
    } catch {}
    // Get popup location data including width height, x and y etc
    const popupBounds = popupRef.current.getBoundingClientRect();
    const gridElement = document.querySelector(".grid-container") as HTMLElement | null;
    // get the same but for the grid itself
    const gridBounds = gridElement?.getBoundingClientRect();
    // check if the grid exists
    // Rerun the effect if the initial left is incorrect
    if (popupBounds.left === 0) {
      actions.setPopupStyle({
        top: popupBounds.top,
        left: 1,
        visibility: "visible",
        opacity: 0,
        maxWidth: "250",
        width: "auto",
      });
      //Pseudo hook, change object reference by copying it
      setTimeout(() => {
        actions.setClickedCell({ ...clickedCell });
      }, 0);
      return;
    }
    if (gridBounds) {
      // Determine preferred vertical placement: below if space allows, otherwise above.
      const spaceBelow =
        gridBounds.bottom - (clickedCell.position.y + clickedCell.cellHeight);
      const spaceAbove = clickedCell.position.y - gridBounds.top;
      const wantBelow = spaceBelow >= popupBounds.height + 4;
      const wantAbove = !wantBelow && spaceAbove >= popupBounds.height + 4;

      // Compute preliminary Y based on preference
      let adjustedY = clickedCell.position.y + clickedCell.cellHeight; // default below
      if (!wantBelow && wantAbove) {
        adjustedY = clickedCell.position.y - popupBounds.height; // above
      }
      // If neither side fully fits, clamp within grid vertically while preferring above when below doesn't fit
      if (!wantBelow && !wantAbove) {
        const candidateAbove = clickedCell.position.y - popupBounds.height;
        adjustedY = Math.max(gridBounds.top, Math.min(candidateAbove, gridBounds.bottom - popupBounds.height));
        if (adjustedY + popupBounds.height > gridBounds.bottom) {
          adjustedY = gridBounds.bottom - popupBounds.height;
        }
      }

      // Horizontal placement: align with cell's left, clamped within grid; avoid side placement.
      let adjustedX = clickedCell.position.x;
      const maxLeft = gridBounds.right - popupBounds.width;
      const minLeft = gridBounds.left;

      // If there's not enough room to keep the popup's left at cell.x, clamp into the grid bounds.
      adjustedX = Math.max(minLeft, Math.min(adjustedX, maxLeft));

      // Special case: if the cell is flush with the right edge and there's no room,
      // align the popup under the left neighbor (right-align the popup to the cell).
      const cellRight = clickedCell.position.x + clickedCell.cellWidth;
      const isAtRightEdge = Math.abs(cellRight - gridBounds.right) < 2; // within 2px
      const noRoomToRight = cellRight + popupBounds.width > gridBounds.right;
      const scrolledAllTheWayLeft = (gridElement?.scrollLeft ?? 0) === 0;
      if (isAtRightEdge && noRoomToRight && scrolledAllTheWayLeft) {
        adjustedX = cellRight - popupBounds.width;
        // Keep inside grid bounds regardless
        adjustedX = Math.max(minLeft, Math.min(adjustedX, maxLeft));
      }

      // Make it visible
      actions.setIsProgrammaticPopupUpdate(true);
      // Prevent popup from opening unexpected when changing projects or sheets
      if (columns && sheet) {
        const calculatedWidth = isNaN(clickedCell.cellWidth)
          ? POPUP_MIN_WIDTH
          : Math.max(clickedCell.cellWidth, POPUP_MIN_WIDTH);

        actions.setPopupStyle({
          top: adjustedY,
          left: adjustedX,
          visibility: "visible",
          opacity: 1,
          maxWidth: `${calculatedWidth}`,
          width: `${calculatedWidth}px`,
        });
      }
      // Prevent flicker and accidental closing of the popup from false positive region changed update
      setTimeout(() => {
        actions.setIsProgrammaticPopupUpdate(false);
        // document.body.style.overflow = "auto";
      }, 100);
    }
  }, [clickedCell]);

  // HIDDEN COLUNS
  useEffect(() => {
    // Synchronize filteredColumns with visible columns
    const filteredColumns = columns
      .filter((col) => !hiddenColumns.includes(col._id))
      .map((col) => col._id);

    actions.setFilteredColumns(filteredColumns);
  }, [hiddenColumns, columns]);
  // Handle visible region changes
  // USE CALLBACK FUNCTIONS
  const handleVisibleRegionChanged = useCallback(
    (region: Rectangle) => {
      try {
        // Track visible region locally only
        visibleRegionRef.current = region;

        setFailedColumnTooltip(null);

        // Hide the popup when scrolling, but avoid redundant updates
        if (
          !isProgrammaticPopupUpdate &&
          (popupStyle.visibility !== "hidden" || popupStyle.opacity !== 0)
        ) {
          actions.updatePopupStyle((prev) => ({
            ...prev,
            visibility: "hidden",
            opacity: 0,
          }));
        }

        // Edge-triggered lazy loading for rows/columns
        const visibleEnd = region.y + region.height - 1;
        const visibleStart = region.y;
        const visibleHorizontalEnd = region.x + region.width - 1;
        const visibleHorizontalStart = region.x;

        // Rows: near bottom
        if (totalRows && totalRows > 0 && scrollDown) {
          const rowHeightFactor = Math.max(1, Math.floor(rowHeight / 36));
          const dynamicBufferRows = BUFFER_ROWS + Math.floor(rowHeightFactor * 2);
          const isNearBottom = visibleEnd + dynamicBufferRows >= totalRows;
          if (isNearBottom) {
            logger.debug("Near bottom, loading more rows.", {
              totalRows,
              visibleEnd,
              rowHeight,
              dynamicBufferRows,
            });
            scrollDown();
          }
        }

        // Rows: near top (disabled call as before)
        if (visibleStart <= BUFFER_ROWS && visibleStart > 0) {
          logger.debug("Near top, loading previous rows.", {
            visibleStart,
            buffer: BUFFER_ROWS,
          });
          // scrollUp?.();
        }

        // Columns: near right edge
        const columnsCount = columns?.length ?? 0;
        const gridColumnsCount = gridColumns?.length ?? 0;
        if (
          columnsCount > 0 &&
          visibleHorizontalEnd >= gridColumnsCount - BUFFER_COLUMNS &&
          scrollColumnsRight
        ) {
          logger.debug("Near right, loading more columns.", {
            columnsLength: columnsCount,
            visibleHorizontalEnd,
          });
          scrollColumnsRight();
        }

        // Columns: near left (disabled call as before)
        if (visibleHorizontalStart <= BUFFER_COLUMNS && visibleHorizontalStart > 0) {
          logger.debug("Near left, loading previous columns.", {
            visibleHorizontalStart,
            buffer: BUFFER_COLUMNS,
          });
          // scrollColumnsLeft?.();
        }
      } catch (error) {
        // Handle unexpected errors
        logger.error("Error handling visible region change:", { error: error });
        showErrorNotification(
          t("grid.main.error_updating_visible_region_title"),
          t("grid.main.error_updating_visible_region_message"),
        );
      }
    },
    [
      isProgrammaticPopupUpdate,
      popupStyle.visibility,
      popupStyle.opacity,
      totalRows,
      rowHeight,
      columns?.length,
      gridColumns?.length,
      scrollDown,
      scrollColumnsRight,
    ],
  );

  // Define and update visible columns on changes

  const getCellContent = useCallback(
    (cell: Item): GridCell => {
      try {
        if (!visibleColumns || !rows) {
          // Log the missing data
          if (!visibleColumns) {
            logger.warn("Visible columns are not loaded.");
          }
          if (!rows) {
            logger.warn("Rows are not loaded.");
          }

          // Return a loading cell as a fallback
          return {
            kind: GridCellKind.Loading,
            allowOverlay: false,
          };
        }

        const [column_nr, row_nr] = cell;
        if (row_nr >= rows.length || column_nr >= visibleColumns.length) {
          return {
            kind: GridCellKind.Loading,
            allowOverlay: false,
          };
        }
        const row_data = rows[row_nr];
        const column = visibleColumns[column_nr];

        // Handle missing data
        if (!row_data || !column) {
          return {
            kind: GridCellKind.Loading,
            allowOverlay: false,
          };
        }
        // Get cell states and determine the current state
        const cell_states = column.cell_state || [];
        const cell_state = new CellStates(
          cell_states,
          HARDCODED_ROW_COUNT,
        ).getStateAtPosition(row_data.order);
        // Use visibleColumns to determine the correct column
        // Handle missing data
        if (!row_data || !column) {
          if (!row_data) {
            logger.warn("Row data is missing for row index:", {
              row_nr: row_nr,
            });
          }
          if (!column) {
            logger.warn("Column is missing for column index:", {
              column_nr: column_nr,
            });
          }

          // Return a loading cell as a fallback
          return {
            kind: GridCellKind.Loading,
            allowOverlay: false,
          };
        }
        const columnFailed = failedColumnsSet.has(column._id);

        // Find the matching cell without allocating a new array
        const _data = row_data?.cells?.find(
          (cell) => cell.column_id === column._id,
        );
        const cellValue =
          _data && (typeof _data.value === "string" || Array.isArray(_data.value))
            ? _data.value
            : "";

        // Render loading cells
        if (cell_state === CellState.Loading) {
          if (columnFailed) {
            const failureText = String(_data?.value ?? t("global.error"));
            return {
              kind: GridCellKind.Custom,
              allowOverlay: false,
              data: {
                type: "error-cell",
                text: failureText,
              },
              copyData: failureText,
            } as ErrorCell;
          }
          return {
            kind: GridCellKind.Custom,
            allowOverlay: false,
            data: {
              kind: "loading-cell",
            },
          } as LoadingCell;
        }
        // Show error cells if the cell-state indicates them
        if (cell_state === CellState.Error) {
          return {
            kind: GridCellKind.Custom, // Marks the cell as a custom type
            data: {
              type: "error-cell",
              text: _data?.value || t("global.error"),
            }, // Store type and message
            copyData: _data?.value || t("global.error"), // Text used for copying
            allowOverlay: false, // Disable overlays for error cells
          } as ErrorCell;
        }
        // Check if value ends with an image extension and render the image cell
        const isImage =
          /\.(jpg|jpeg|png|gif|webp)$/i.test(String(cellValue)) ||
          column.column_subtype === "image";
        if (isImage) {
          // Example image for now
          // const imageUrl = [
          //   "https://i.imgur.com/ESPqZgU.jpeg",
          //   "https://i.imgur.com/ESPqZgU.jpeg",
          // ];
          // Register the image cell in the media map, handle either one image or an array of multiple image urls
          registerMediaCell(
            row_nr,
            column_nr,
            "image",
            Array.isArray(cellValue) ? cellValue : [cellValue],
            column.column_subtype as string,
          );
          return {
            kind: GridCellKind.Image,
            allowOverlay: false,
            data: Array.isArray(cellValue) ? cellValue : [cellValue],
            rounding: 0,
            readonly: true,
          } as ImageCell;
        }
        // Render file cell
        const isFile =
          column.column_subtype === "pdf" || column.column_subtype === "image";
        if (isFile) {
          // // Example files, uncomment to see how it looks
          // const file = [
          //   "https://pdfobject.com/pdf/sample.pdf",
          //   "https://dl11.webmfiles.org/big-buck-bunny_trailer.webm",
          // ];
          const file = cellValue;
          registerMediaCell(
            row_nr,
            column_nr,
            "file",
            Array.isArray(file) ? file : [file],
            (column.column_subtype as string) || "pdf",
          );
          return {
            kind: GridCellKind.Custom, // Marks the cell as a custom type
            data: {
              type: "file-cell",
              fileName: Array.isArray(file) ? file : [file],
            }, // Store type and message
            copyData: _data?.value || "file", // Text used for copying
            allowOverlay: false, // Disable overlays for error cells
          } as FileCell;
        }
        let isAudio =
          /\.(mp3|wav|ogg|m4a|flac|aac)$/i.test(String(cellValue ?? "")) ||
          column.column_subtype === "audio";
        if (isAudio) {
          const fileName = String(cellValue);
          return {
            kind: GridCellKind.Custom,
            data: {
              type: "audio-cell",
              fileName: fileName,
            },
            copyData: fileName,
            allowOverlay: false,
          } as AudioCell;
        }
        let isMarkdown = column.column_subtype === "markdown";
        if (isMarkdown) {
          return {
            kind: GridCellKind.Custom,
            data: {
              type: "markdown-cell",
            },
            copyData: String(cellValue || ""),
            allowOverlay: false,
          } as MarkdownCell;
        }
        // Pass the values for the BubbleCell renderer,
        // extracted using the CellDraw functions like intensifyColor
        if (column?.column_subtype && cellValue) {
          let values: string[] = [];
          // Switch to check subtypes and render accordingly
          switch (column.column_subtype) {
            case "freeForm":
              return {
                kind: GridCellKind.Custom,
                data: {
                  type: "json-cell",
                  json: cellValue,
                },
                copyData: String(cellValue),
                allowOverlay: false,
              } as JsonCell;
            case "multiTag":
              values = parseMultiTagValue(String(cellValue)) as string[];
              return {
                kind: GridCellKind.Bubble,
                allowOverlay: false,
                data: values,
              };
            case "singleTag":
              values = parseMultiTagValue(String(cellValue)) as string[];
              return {
                kind: GridCellKind.Bubble,
                allowOverlay: false,
                data: values,
              };
            default:
              return {
                kind: GridCellKind.Text,
                allowOverlay: false,
                allowWrapping: true,
                displayData: String(cellValue || ""),
                data: String(cellValue || ""),
              };
          }
        }
        // Render text cells for existing data
        if (cellValue !== undefined && cellValue !== null) {
          return {
            kind: GridCellKind.Text,
            allowOverlay: false,
            allowWrapping: true,
            displayData: String(cellValue || ""),
            data: String(cellValue || ""),
          };
        }

        // If there is no data for the cell, show an empty cell
        return {
          kind: GridCellKind.Text,
          allowOverlay: false,
          displayData: "",
          data: "",
          allowWrapping: true,
        };
      } catch (error) {
        // Handle unexpected errors
        showErrorNotification(
          t("grid.main.error_fetching_cell_content_title"),
          t("grid.main.error_fetching_cell_content_message", {
            error: String(error),
          }),
        );

        // Return a loading cell as a fallback
        return {
          kind: GridCellKind.Loading,
          allowOverlay: false,
        };
      }
    },
    [rows, visibleColumns, failedColumnsSet],
  );
  // COLUMN RESIZE
  useEffect(() => {
    return () => {
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
    };
  }, []);
  // Resize the columns by changing the the value in the map, set a new map from previous value to account for previous resizes
  const onResize = useCallback((column: GridColumn, newSize: number) => {
    const MIN_WIDTH = 50;
    const MAX_WIDTH = 1000;

    try {
      isResizingRef.current = true;
      setIsResizing(true);

      // Clear any existing timeout
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }

      // Set a timeout to reset the resize state after resize is complete
      resizeTimeoutRef.current = setTimeout(() => {
        isResizingRef.current = false;
        setIsResizing(false);
      }, 300); // 300ms delay to ensure resize is complete

      // First update the persistent ref
      if (column?.id) {
        const constrainedSize = Math.max(
          MIN_WIDTH,
          Math.min(newSize, MAX_WIDTH),
        );
        persistentColumnWidths.current.set(
          column.id as Id<"column">,
          constrainedSize,
        );
      }

      // Then update the state
      actions.updateColumnWidths((prev) => {
        const newWidths = new Map(prev);

        // Disallow the width of the column to be smaller or bigger than the MIN_WIDTH and MAX_WIDTH
        const constrainedSize = Math.max(
          MIN_WIDTH,
          Math.min(newSize, MAX_WIDTH),
        );

        // Ensure the column ID is valid
        if (!column?.id) {
          showErrorNotification(
            t("grid.main.error_resizing_columns_title"),
            t("grid.main.error_resizing_columns_message_id"),
          );
          return prev; // Return the previous map unchanged
        }
        // Set the new column size
        newWidths.set(column.id as Id<"column">, constrainedSize);

        // Return the updated map
        return newWidths;
      });
    } catch (error) {
      // Handle unexpected errors
      logger.error("Error during column resize:", { error: error });
      showErrorNotification(
        t("grid.main.error_resizing_columns_title"),
        t("grid.main.error_resizing_columns_message"),
      );
    }
  }, []);
  // Sync columnWidths to persistentColumnWidths
  useEffect(() => {
    // Update persistent column widths from current state when it changes
    // Save the freshest data
    if (columnWidths.size > 0) {
      columnWidths.forEach((width, columnId) => {
        persistentColumnWidths.current.set(columnId, width);
      });
    }
  }, [columnWidths]);
  const handleHeaderMenuClicked = useCallback(
    (columnIndex: number, args: Rectangle) => {
      if (isResizingRef.current) {
        logger.debug("Header menu click prevented during resize");
        return;
      }

      if (columnIndex < 0 || columnIndex >= columns.length) {
        //Log level more important than debug
        logger.warn("Column index out of bounds.", {
          columnIndex,
          totalColumns: columns.length,
        });
        showErrorNotification(
          t("grid.main.invalid_column_index_title"),
          t("grid.main.invalid_column_index_message", {
            columnIndex: columnIndex,
          }),
        );
        return;
      }

      const column = visibleColumns[columnIndex];
      if (!column) {
        showErrorNotification(
          t("grid.main.column_not_found_title"),
          t("grid.main.column_not_found_message", {
            columnIndex,
          }),
        );
        return;
      }

      // Set dropdown position near the cursor
      setClickedColumnId(column._id); // Store the column ID in state
      const gridElement = document.querySelector(".grid-container");
      const gridBounds = gridElement?.getBoundingClientRect();
      // Adjust header dropdown to be under the header
      actions.setHeaderDropdownPosition({
        x: args.x - (gridBounds as DOMRect)?.left + args.height / 2 - 7,
        y: args.y - (gridBounds as DOMRect)?.top + args.height - 7,
      });
      actions.setHeaderDropdownVisible(true);
    },
    [
      columns,
      setClickedColumnId,
      actions.setHeaderDropdownPosition,
      actions.setHeaderDropdownVisible,
    ],
  );

  //Handle popup logic for positioning
  const handleCellClicked = useCallback(
    (cell: readonly [number, number], event: CellClickedEventArgs) => {
      try {
        const columnIndex = cell[0];
        const rowIndex = cell[1];

        if (!rows || !visibleColumns) {
          showErrorNotification(
            t("grid.main.data_unavailable_title"),
            t("grid.main.data_unavailable_message"),
          );
          return;
        }

        // Get the data for the clicked row
        const row = rows[rowIndex];
        // Map the visible column index to the actual column
        const column = visibleColumns[columnIndex];

        if (!row || !column) {
          if (!row) {
            logger.warn("Row data is missing.", { rowIndex });
            showErrorNotification(
              t("grid.main.row_not_found_title"),
              t("grid.main.row_not_found_message", {
                rowIndex,
              }),
            );
          }
          if (!column) {
            logger.warn("Column data is missing.", { columnIndex });
            showErrorNotification(
              t("grid.main.column_not_found_title"),
              t("grid.main.column_not_found_data_message", {
                columnIndex,
              }),
            );
          }
          return;
        }

        // Match the cell data by column_id
        const cellInfo = row.cells.find((c) => c.column_id === column._id);

        logger.debug("Cell clicked.", {
          rowIndex,
          columnIndex,
          value: cellInfo?.value,
        });
        // Values to pass to the new column modal for prompt generation
        setClickedColumnId(column._id);
        const cellBounds = gridRef.current?.getBounds(columnIndex, rowIndex);
        const popupX = cellBounds?.x ?? event.bounds.x;
        const popupY = cellBounds?.y ?? event.bounds.y;
        const popupWidth = cellBounds?.width ?? event.bounds.width;
        const popupHeight = cellBounds?.height ?? event.bounds.height;
        const mediaContent = handleMediaCellClick(rowIndex, columnIndex);
        if (mediaContent) {
          openSidebar({
            type: "media",
            fileName: mediaContent.fileName,
            columnSubType: mediaContent.columnSubType,
          });
          return;
        }

        if (column.column_subtype === "markdown") {
          openSidebar({
            type: "markdown",
            data: String(cellInfo?.value),
          });
          return;
        }
        //Width and height of the cell for better popup calculation
        const initialWidth = Number.isFinite(popupWidth) ? Math.max(popupWidth, POPUP_MIN_WIDTH) : POPUP_MIN_WIDTH;
        const initialTop = popupY + popupHeight;
        actions.setPopupStyle({
          top: initialTop,
          left: popupX,
          visibility: "visible",
          opacity: 0,
          maxWidth: `${initialWidth}px`,
          width: `${initialWidth}px`,
        });
        actions.setClickedCell({
          //Value from found cell
          value: cellInfo?.value || t("grid.main.cell_clicked_default_value"),
          // Cell state:
          state: cellInfo?.state || "empty",
          // Cell height
          cellHeight: popupHeight,
          // Cell width
          cellWidth: initialWidth,
          // Position of the cell relative to the grid
          position: { x: popupX, y: popupY },
          // Column type
          columnType: column.column_type as ColumnType,
          // Column subtype
          columnSubType: column.column_subtype as ColumnSubType,
        });
        // Store the column ID in state for further actions
        setClickedColumnId(column._id);
      } catch (error) {
        logger.error("Error handling cell click.", { error });
        showErrorNotification(
          t("grid.main.error_handling_cell_click_title"),
          t("grid.main.error_handling_cell_click_message"),
        );
      }
    },
    [rows, visibleColumns, setClickedColumnId],
  );
  // STANDARD FUNCTIONS
  // Draw bubble cell and text cell using new renderer, as it is not a custom type
  const drawCell: DrawCellCallback = (args, drawContent) => {
    const { ctx, cell, rect } = args;

    // Custom handled text wrapping - consistent
    if (cell.kind === GridCellKind.Text) {
      const textCell = cell as TextCell;
      const text = String(textCell.data || "");

      // Skip custom rendering for empty text
      if (!text) {
        drawContent();
        return;
      }

      // Fast-path: skip complex/expensive cases to avoid slow rendering for
      // emoji, zero-width joiners, variation selectors, or extremely long text
      const hasComplexGraphemes = /[\u200B\u200D\uFE0F]|[\uD800-\uDFFF]/.test(
        text,
      );
      const isVeryLong = text.length > 800; // safety threshold
      if (hasComplexGraphemes || isVeryLong) {
        drawContent();
        return;
      }

      // Calculate if wrapping is needed
      ctx.save();
      ctx.font = "12px 'Geist Variable'";
      const textWidth = measureTextCached(ctx, text);
      const needsWrapping = textWidth > rect.width - 16;
      ctx.restore();

      // If wrapping is not needed, use default rendering
      if (!needsWrapping) {
        drawContent();
        return;
      }

      // Otherwise, use custom
      ctx.save();
      ctx.font = "12px 'Geist Variable'";
      ctx.fillStyle = "#222222";
      ctx.textBaseline = "top";

      const padding = 8;
      const lineHeight = 18;
      const maxWidth = rect.width - padding * 2;
      const maxHeight = rect.height - padding * 2;

      // Calculate how many lines can fit in the cell
      const maxLines = Math.floor(maxHeight / lineHeight) + 1;

      // Check for a single word (no spaces)
      const isSingleWord = !/\s/.test(text);

      let lines = [];
      let isTruncated = false;

      if (isSingleWord) {
        // For single long words, handle it by iterating the individual characters
        const chars = text.split("");
        let currentLine = "";

        for (let i = 0; i < chars.length; i++) {
          const testLine = currentLine + chars[i];

          if (measureTextCached(ctx, testLine) <= maxWidth) {
            currentLine = testLine;
          } else {
            // Push the line if there is content
            if (currentLine) {
              lines.push(currentLine);

              // Stop upon reaching maxiumum line amount
              if (lines.length >= maxLines) {
                break;
              }

              // Start a new line
              currentLine = chars[i];
            } else {
              lines.push(chars[i]);
              currentLine = "";

              // Stop upon reaching maxiumum line amount
              if (lines.length >= maxLines) {
                break;
              }
            }
          }
        }

        // Add remaining text as last line
        if (currentLine && lines.length < maxLines) {
          lines.push(currentLine);
        }

        // Determine if text was truncated
        isTruncated = chars.length > lines.join("").length;
      } else {
        // Regular text with spaces
        const words = text.split(" ");
        let currentLine = "";
        let wordIndex = 0;

        // Process words into lines
        while (wordIndex < words.length) {
          // Check if this is the last available line
          const isLastPossibleLine = lines.length === maxLines - 1;

          // Get the current word
          const word = words[wordIndex];
          const testLine = currentLine + (currentLine ? " " : "") + word;

          // Check if the word can be added to the current line
          if (measureTextCached(ctx, testLine) <= maxWidth || !currentLine) {
            currentLine = testLine;
            wordIndex++;
          } else {
            // Line is full, push it
            lines.push(currentLine);
            currentLine = "";

            // If maximum number of lines was reached and there are more words,
            // handle the rest in the truncation logic
            if (isLastPossibleLine) {
              break;
            }
          }
        }

        // Add the last line if not empty
        if (currentLine && lines.length < maxLines) {
          lines.push(currentLine);
        }

        // Check if text was truncated (remaining words or current line not processed)
        isTruncated = wordIndex < words.length;
      }

      // Add ellipsis to the last line
      if (isTruncated && lines.length > 0 && lines.length === maxLines) {
        const lastLineIndex = lines.length - 1;
        let lastLine = lines[lastLineIndex];
        const ellipsis = "...";

        if (measureTextCached(ctx, lastLine + ellipsis) <= maxWidth) {
          lines[lastLineIndex] = lastLine + ellipsis;
        } else {
          // Truncate to fit ellipsis
          while (
            lastLine.length > 0 &&
            measureTextCached(ctx, lastLine + ellipsis) > maxWidth
          ) {
            lastLine = lastLine.slice(0, -1);
          }
          lines[lastLineIndex] = lastLine + ellipsis;
        }
      }

      // Calculate vertical positioning to center the text
      const totalTextHeight = lines.length * lineHeight;
      let startY = rect.y + padding;

      // Center text vertically if there is space
      if (totalTextHeight < maxHeight) {
        startY = rect.y + (rect.height - totalTextHeight) / 2;
      }

      // Case for single words that need wrapping
      if (isSingleWord && lines.length > 1) {
        // Use left align
        const startX = rect.x + padding;

        for (let i = 0; i < lines.length; i++) {
          ctx.fillText(lines[i], startX, startY + i * lineHeight);
        }
      } else if (lines.length === 1 || isSingleWord) {
        // For single lines or unwrapped single words, center horizontally
        for (let i = 0; i < lines.length; i++) {
          const lineWidth = measureTextCached(ctx, lines[i]);
          const xPos = rect.x + (rect.width - lineWidth) / 2;
          ctx.fillText(lines[i], xPos, startY + i * lineHeight);
        }
      } else {
        // For regular multi-line text, left align
        const startX = rect.x + padding;

        for (let i = 0; i < lines.length; i++) {
          ctx.fillText(lines[i], startX, startY + i * lineHeight);
        }
      }

      ctx.restore();
      return;
    }

    // BubbleCell
    if (cell.kind === GridCellKind.Bubble) {
      drawBubbleCell(ctx, cell as BubbleCell, rect);
      return;
    }

    // Use default rendering for all other cell kinds
    drawContent();
  };
  const increaseRowHeight = () => {
    setRowHeight((prev) => Math.min(prev + 10, MAX_ROW_HEIGHT));
  };

  const decreaseRowHeight = () => {
    setRowHeight((prev) => Math.max(prev - 10, MIN_ROW_HEIGHT));
  };
  // Clear media cell map on project or sheet change
  useEffect(() => {
    clearMediaCellMap();
  }, [project, sheet]);

  // Match jobs to columns and get their status
  const getColumnProcessingStatus = useCallback(
    (columnId: Id<"column">) => {
      if (!jobs || jobs.length === 0) return null;
      if (failedColumnsSet.has(columnId)) return null;

      // Look for an active job for this column
      const activeJob = jobs.find(
        (job) =>
          job.column_id === columnId &&
          job.job?.progress &&
          (job.job.state === "IN_PROGRESS" || job.job.state === "PENDING") &&
          (job.job.progress.completedCount as number) <
            (job.job.progress.totalCount as number),
      );

      if (!activeJob) return null;

      const completedCount = activeJob.job.progress?.completedCount;
      const totalCount = activeJob.job.progress?.totalCount;
      return {
        progress: (completedCount as number) / (totalCount as number),
        completedCount,
        totalCount,
        state: activeJob.job.state,
      };
    },
    [jobs, failedColumnsSet],
  );

  const drawHeader: DrawHeaderCallback = useCallback(
    (args, drawContent) => {
      const { ctx, column, rect } = args;
      const columnId = column.id as Id<"column">;

      // Check if there's an active job for this column
      const processingStatus = getColumnProcessingStatus(columnId);

      // Render default header if there are no active jobs
      if (!processingStatus) return drawContent();

      // Get progress information and draw progress bar
      const { progress } = processingStatus;

      const progressBarHeight = 3;
      const progressBarY = rect.y + rect.height - progressBarHeight;

      // Draw background
      ctx.fillStyle = "#E5E5E5";
      ctx.fillRect(rect.x, progressBarY, rect.width, progressBarHeight);

      // Draw progress
      ctx.fillStyle = "#FF6B00";
      ctx.fillRect(
        rect.x,
        progressBarY,
        rect.width * progress,
        progressBarHeight,
      );

      // Draw the rest of the header as is
      drawContent();
    },
    [getColumnProcessingStatus],
  );

  const onItemHovered = useCallback(
    (args: GridMouseEventArgs) => {
      if (args.kind === "header") {
        const columnIndex = args.location[0];
        const column = visibleColumns?.[columnIndex];
        if (!column || !failedColumnsSet.has(column._id)) {
          setFailedColumnTooltip(null);
          return;
        }

        if (args.localEventX <= FAILED_ICON_HITBOX_PX) {
          const tooltipText = t("grid.main.failed_column_tooltip");
          const tooltipLeft = args.bounds.x + FAILED_ICON_HITBOX_PX / 2;
          const tooltipTop =
            args.bounds.y + args.bounds.height + FAILED_TOOLTIP_VERTICAL_OFFSET;

          setFailedColumnTooltip((previous) => {
            if (
              previous &&
              previous.text === tooltipText &&
              Math.abs(previous.left - tooltipLeft) < 0.5 &&
              Math.abs(previous.top - tooltipTop) < 0.5
            ) {
              return previous;
            }
            return { left: tooltipLeft, top: tooltipTop, text: tooltipText };
          });
          return;
        }
      }

      setFailedColumnTooltip(null);
    },
    [failedColumnsSet, visibleColumns, t],
  );

  // rows.length is a good indicator if the data finished loading or not
  // Adjust automatic height for right element, as DataGrid gives it too much height

  useEffect(() => {
    const target = document.querySelector(".grid-right-element")
      ?.parentElement as HTMLElement | null;
    if (!target) return;

    const applyHeightFix = () => {
      const originalHeight = target.dataset.originalHeight;

      if (!originalHeight) {
        target.dataset.originalHeight = target.clientHeight.toString();
      } else {
        const currentHeight = target.clientHeight;
        const baseHeight = parseFloat(originalHeight);

        if (currentHeight === baseHeight) {
          const newHeight = baseHeight - 15;
          target.style.height = `${newHeight}px`;
        }
      }
    };

    // Use setTimeout pseudo hook to apply patch reliably
    const initialTimeout = setTimeout(applyHeightFix, 50);

    // Set up MutationObserver for future changes
    const observer = new MutationObserver(() => {
      setTimeout(applyHeightFix, 0); // delay slightly to let DOM settle
    });

    observer.observe(target, {
      attributes: true,
      childList: true,
      subtree: false,
    });

    return () => {
      clearTimeout(initialTimeout);
      observer.disconnect();
    };
  }, [rows, project, sheet]);

  return (
    <>
      {/* <ScrollArea type="always" className="relative w-full p-4 mt-2 bg-white"> */}
      <div className="relative flex items-center justify-center w-full h-full px-4 pt-0 pb-4">
        <>
          <DataEditor
            width="100%"
            height="100%"
            ref={localGridRef}
            columnSelect="none"
            className="grid-container border border-[#e9e9ea] border-solid rounded-sm p-4"
            getCellContent={getCellContent}
            columns={gridColumns}
            rangeSelect="none"
            rows={rows?.length || 0}
            onColumnResize={onResize}
            onVisibleRegionChanged={handleVisibleRegionChanged}
            drawCell={drawCell}
          onCellClicked={handleCellClicked}
          headerHeight={48}
          overscrollX={10}
          verticalBorder={true}
          drawHeader={drawHeader}
          headerIcons={headerIcons}
          rowHeight={rowHeight}
          onItemHovered={onItemHovered}
          theme={{
            bgHeader: "#fcfcfd", // Light gray for headers
            headerFontStyle: "600 12px",
            baseFontStyle: "12px",
              bgCell: "#FFFFFF", // White background for cells
              textDark: "#222222", // Dark text for contrast
              textHeader: "#555555", // Medium dark header text
              bgHeaderHovered: "#f8f8f9",
              bgHeaderHasFocus: "#f8f8f9",
              bgBubbleSelected: "#FCFCFD",
              accentColor: "transparent", // Removes selected highlight
              accentFg: "#f8f8f9",
              accentLight: "#f8f8f9",
              fontFamily: "'Geist Variable', Arial, sans-serif", // Ensures consistency
              textHeaderSelected: "#313139",
              borderColor: "#ebebeb", // Slightly darker than E5E5E5 for more definition
              horizontalBorderColor: "#ebebeb", // Ensure 1px and solid
              headerBottomBorderColor: "#ebebeb", // Stronger header-bottom border for sharper contrast
              drilldownBorder: "transparent",
              roundingRadius: 6,
            }}
            customRenderers={[
              LoadingCellRenderer,
              ErrorCellRenderer,
              FileCellRenderer,
              AudioCellRenderer,
              JSONCellRenderer,
            MarkdownCellRenderer,
          ]}
          // Show prompt view dropdown menu when clicking header menu
          onHeaderMenuClick={handleHeaderMenuClicked}
          maxColumnWidth={1000}
          minColumnWidth={50}
          maxColumnAutoWidth={1000}
          // scrollOffsetX={100}
          rightElement={
            rows.length > 0 ? (
                <div className="grid-right-element flex flex-col pt-2 px-2 justify-start items-center bg-background border-l h-full border-gray-300 mt-[-15px] mr-[-16px]">
                  {/* Add Column Button */}
                  <Label className="text-[10px] text-gray-500 font-normal">
                    {t("grid.main.create_new_column")}
                  </Label>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={columns.length === 0}
                    className="w-6 h-6 mx-3 mt-1 mb-1 rounded-md"
                    title={t("grid.main.create_new_column")}
                    onClick={() => {
                      actions.setPopupStyle({
                        ...popupStyle,
                        visibility: "hidden",
                        opacity: 0,
                      });
                      onNewColumnButtonClick();
                    }}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>

                  {/* Row Height Adjustment Buttons */}
                  <Label className="text-[10px] text-gray-500 font-normal">
                    {t("grid.main.adjust_row_height")}
                  </Label>
                  <div className="flex flex-row justify-center mx-3 mb-3">
                    <Button
                      variant="ghost"
                      size="icon"
                      title={t("grid.main.increase_row_height")}
                      disabled={rowHeight >= MAX_ROW_HEIGHT}
                      className="w-6 h-6 mr-1 rounded-md"
                      onClick={increaseRowHeight}
                    >
                      <Plus className="w-3 h-3" />
                    </Button>
                    <span className="font-[200]">/</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      title={t("grid.main.decrease_row_height")}
                      disabled={rowHeight <= MIN_ROW_HEIGHT}
                      className="w-6 h-6 ml-1 rounded-md"
                      onClick={decreaseRowHeight}
                    >
                      <Minus className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ) : (
                <></>
              )
            }
            rightElementProps={{
              fill: true,
              sticky: true,
            }}
          />
          <GridPopup
            ref={popupRef}
            top={popupStyle.top}
            left={popupStyle.left}
            visibility={popupStyle.visibility}
            opacity={popupStyle.opacity}
            width={popupStyle.width}
            maxWidth={popupStyle.maxWidth}
            clickedCell={clickedCell}
            content={clickedCell?.value}
            onClose={() =>
              actions.updatePopupStyle((prev) => {
                return {
                  ...prev,
                  visibility: "hidden",
                  opacity: 0,
                };
              })
          }
        />
          {failedColumnTooltip && (
            <div
              className="pointer-events-none z-50 rounded bg-gray-900 px-3 py-1 text-xs font-medium text-white shadow-md"
              style={{
                position: "fixed",
                top: failedColumnTooltip.top,
                left: failedColumnTooltip.left,
                transform: "translateX(-50%)",
              }}
            >
              {failedColumnTooltip.text}
            </div>
          )}
          <HeaderDropdown
            clickedColumnId={clickedColumnId}
            projectId={project}
            visibleColumns={visibleColumns}
            dropdownVisible={headerDropdownVisible}
            dropdownPosition={headerDropdownPosition}
            closeHeaderDropdown={() => actions.setHeaderDropdownVisible(false)}
            openShowPromptModal={openShowPromptModal}
            hideColumn={hideColumn}
            handleCreateViewsFromDeepDive={handleCreateViewsFromDeepDive}
            switchToNewSheet={switchToNewSheet}
            setSwitchToNewSheet={setSwitchToNewSheet}
            isResizing={isResizing}
          />
          {/* Safari-specific resize overlay to prevent interactions */}
          {isResizing && (
            <div
              className="absolute inset-0 z-30"
              style={{ pointerEvents: "auto", cursor: "col-resize" }}
            />
          )}
          {/* <ScrollBar orientation="horizontal" /> */}
          {/* </ScrollArea> */}
        </>
      </div>
    </>
  );
};
export default memo(Grid);

import { useMemo, useReducer } from "react";
import { GridState } from "../interfaces/interfaces";
import { SidebarContent } from "../interfaces/interfaces";
import { Rectangle } from "@glideapps/glide-data-grid";
import { Id } from "../../convex/_generated/dataModel";
const initialState: GridState = {
  filteredColumns: [],
  hiddenColumns: [],
  columnWidths: new Map<Id<"column">, number>(),
  visibleRegion: {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  },
  headerDropdownVisible: false,
  headerDropdownPosition: {
    x: 0,
    y: 0,
  },
  clickedCell: null,
  popupStyle: {
    top: 0,
    left: 0,
    visibility: "hidden" as "hidden" | "visible",
    opacity: 0,
    width: "auto",
    //Max width 250px, because having it the same as the column width caused weird visual bugs
    maxWidth: "250px",
  },
  isProgrammaticPopupUpdate: false,
};
// Grid state update action type
type Actions =
  | { type: "SET_FILTERED_COLUMNS"; payload: Id<"column">[] }
  | { type: "SET_HIDDEN_COLUMNS"; payload: Id<"column">[] }
  | { type: "SET_MEDIA_SIDEBAR_CONTENT"; payload: SidebarContent | null }
  | { type: "SET_IS_MEDIA_SIDEBAR_OPEN"; payload: boolean }
  | { type: "SET_COLUMN_WIDTHS"; payload: Map<Id<"column">, number> }
  | { type: "SET_VISIBLE_REGION"; payload: Rectangle }
  | { type: "Set_HEADER_DROPDOWN_VISIBLE"; payload: boolean }
  | { type: "SET_HEADER_DROPDOWN_POSITION"; payload: { x: number; y: number } }
  | { type: "SET_CLICKED_CELL"; payload: GridState["clickedCell"] }
  | { type: "SET_POPUP_STYLE"; payload: GridState["popupStyle"] }
  | {
      type: "UPDATE_POPUP_STYLE";
      payload: (prev: GridState["popupStyle"]) => GridState["popupStyle"];
    }
  | {
      type: "UPDATE_COLUMN_WIDTHS";
      payload: (prev: Map<Id<"column">, number>) => Map<Id<"column">, number>;
    }
  | { type: "SET_IS_PROGRAMMATIC_POPUP_UPDATE"; payload: boolean };
// Reducer for grid
const gridReducer = (state: GridState, action: Actions): GridState => {
  switch (action.type) {
    case "SET_FILTERED_COLUMNS":
      return { ...state, filteredColumns: action.payload };
    case "SET_HIDDEN_COLUMNS":
      return { ...state, hiddenColumns: action.payload };
    case "SET_COLUMN_WIDTHS":
      return { ...state, columnWidths: action.payload };
    case "UPDATE_COLUMN_WIDTHS":
      return { ...state, columnWidths: action.payload(state.columnWidths) };
    case "SET_VISIBLE_REGION":
      return { ...state, visibleRegion: action.payload };
    case "Set_HEADER_DROPDOWN_VISIBLE":
      return { ...state, headerDropdownVisible: action.payload };
    case "SET_HEADER_DROPDOWN_POSITION":
      return { ...state, headerDropdownPosition: action.payload };
    case "SET_CLICKED_CELL":
      return { ...state, clickedCell: action.payload };
    case "SET_POPUP_STYLE":
      return { ...state, popupStyle: action.payload };
    case "UPDATE_POPUP_STYLE":
      return { ...state, popupStyle: action.payload(state.popupStyle) };
    case "SET_IS_PROGRAMMATIC_POPUP_UPDATE":
      return { ...state, isProgrammaticPopupUpdate: action.payload };
    default:
      return state;
  }
};

// Hook to provide state management for the grid, using the reducer
export const useGridReducer = () => {
  const [state, dispatch] = useReducer(gridReducer, initialState);

  // Memoize actions to keep a stable identity across renders.
  const actions = useMemo(() => ({
    setFilteredColumns: (payload: Id<"column">[]) =>
      dispatch({ type: "SET_FILTERED_COLUMNS", payload }),
    setHiddenColumns: (payload: Id<"column">[]) =>
      dispatch({ type: "SET_HIDDEN_COLUMNS", payload }),
    setColumnWidths: (payload: Map<Id<"column">, number>) =>
      dispatch({ type: "SET_COLUMN_WIDTHS", payload }),
    setVisibleRegion: (payload: Rectangle) =>
      dispatch({ type: "SET_VISIBLE_REGION", payload }),
    setHeaderDropdownVisible: (payload: boolean) =>
      dispatch({ type: "Set_HEADER_DROPDOWN_VISIBLE", payload }),
    setHeaderDropdownPosition: (payload: { x: number; y: number }) =>
      dispatch({ type: "SET_HEADER_DROPDOWN_POSITION", payload }),
    setClickedCell: (payload: GridState["clickedCell"]) =>
      dispatch({ type: "SET_CLICKED_CELL", payload }),
    setPopupStyle: (payload: GridState["popupStyle"]) =>
      dispatch({ type: "SET_POPUP_STYLE", payload }),
    updatePopupStyle: (
      payload: (prev: GridState["popupStyle"]) => GridState["popupStyle"],
    ) => dispatch({ type: "UPDATE_POPUP_STYLE", payload }),
    updateColumnWidths: (
      payload: (prev: Map<Id<"column">, number>) => Map<Id<"column">, number>,
    ) => dispatch({ type: "UPDATE_COLUMN_WIDTHS", payload }),
    setIsProgrammaticPopupUpdate: (payload: boolean) =>
      dispatch({ type: "SET_IS_PROGRAMMATIC_POPUP_UPDATE", payload }),
  }), [dispatch]);

  return { state, actions };
};

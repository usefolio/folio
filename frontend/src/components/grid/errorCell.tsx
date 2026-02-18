import { GridCellKind, CustomRenderer } from "@glideapps/glide-data-grid";
import { ErrorCell } from "../../types/types";

const ERROR_STROKE_COLOR = "#9CA3AF"; // Tailwind gray-400
const ERROR_FILL_COLOR = "#F3F4F6"; // Tailwind gray-100
const ICON_STROKE_WIDTH = 1.2;
const X_STROKE_WIDTH = 1.6;
const X_PADDING_RATIO = 0.33;

const ErrorCellRenderer: CustomRenderer<ErrorCell> = {
  kind: GridCellKind.Custom,
  // Determine if the cell matches this renderer
  isMatch: (cell): cell is ErrorCell =>
    (cell.data as { type?: string })?.type === "error-cell",

  // Handle cell draw
  draw: (args) => {
    const { ctx, rect, cell, theme, highlighted } = args;
    const { x, y, width, height } = rect;

    // Extract the error message from cell.data
    const text = cell.data.text;

    // Padding and dimensions
    const padding = theme.cellHorizontalPadding;
    // Radius of the error circle, static
    // so it doesn't change height when row height is increased
    const radius = 6;
    // Padding between the symbol and the right edge
    const symbolPadding = 10;
    // Total width occupied by the error symbol
    const symbolWidth = radius * 2 + symbolPadding + 10;
    // X position of the rectangle covering the symbol
    const symbolX = x + width - symbolWidth;
    const centerY = y + height / 2;
    const centerX = symbolX + symbolWidth / 2;

    // Background
    ctx.fillStyle = highlighted ? "#f8f8f9" : theme.bgCell;
    ctx.fillRect(x + 1, y + 1, width - 2, height - 2);

    // Draw the text
    const baseFont = theme.baseFontStyle ?? "12px";
    ctx.font = `600 ${baseFont} ${theme.fontFamily}`;
    ctx.fillStyle = "#D1D5DB"; // Tailwind gray-300
    ctx.textAlign = "left";
    // Vertically center the text
    ctx.textBaseline = "middle";
    ctx.fillText(text, x + padding, centerY);

    // Draw the rectangle for the error symbol to cover the text, change bg color when highlighted to match the grid
    ctx.fillStyle = highlighted ? "#f8f8f9" : theme.bgCell;
    ctx.fillRect(symbolX + 1, y + 1, symbolWidth - 1, height - 2);

    // Draw the error symbol circle + X in the rectangle
    // Center X position of the symbol    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    ctx.fillStyle = ERROR_FILL_COLOR;
    ctx.strokeStyle = ERROR_STROKE_COLOR;
    ctx.fill();
    ctx.lineWidth = ICON_STROKE_WIDTH;
    ctx.stroke();

    // Draw X inside the circle with proper padding
    const lineOffset = radius * X_PADDING_RATIO;
    ctx.beginPath();
    // Draw the first line of the X
    ctx.moveTo(centerX - lineOffset, centerY - lineOffset);
    ctx.lineTo(centerX + lineOffset, centerY + lineOffset);
    // Draw the second line of the X
    ctx.moveTo(centerX + lineOffset, centerY - lineOffset);
    ctx.lineTo(centerX - lineOffset, centerY + lineOffset);
    ctx.strokeStyle = ERROR_STROKE_COLOR;
    ctx.lineWidth = X_STROKE_WIDTH;
    ctx.stroke();

    // Indicates the cell has been successfully drawn
    return true;
  },

  // Error cells are read-only, no editor needed
  provideEditor: () => undefined,
};

export default ErrorCellRenderer;

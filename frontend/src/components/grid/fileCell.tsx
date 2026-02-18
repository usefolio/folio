import { CustomRenderer, GridCellKind } from "@glideapps/glide-data-grid";
import { FileCellProps } from "../../interfaces/interfaces";
import { FileCell } from "../../types/types";

const FileCellRenderer: CustomRenderer<FileCell> = {
  kind: GridCellKind.Custom,

  // Match function to determine if this renderer handles the cell
  isMatch: (cell): cell is FileCell =>
    (cell.data as FileCellProps).type === "file-cell",

  draw: (args) => {
    const { ctx, rect } = args;
    const { data } = args.cell;
    const { fileName } = data as FileCellProps;

    const CELL_PADDING = 5;
    const ICON_SIZE = 10;
    const TEXT_HEIGHT = 16;

    const INNER_PADDING_X = 4;
    const INNER_PADDING_Y = 1.5;

    ctx.font = `550 12px 'Geist Variable'`;
    ctx.textBaseline = "middle";
    const displayName = Array.isArray(fileName)
      ? fileName.join(", ")
      : fileName;
    const textWidth = ctx.measureText(displayName).width;

    const iconTextSpacing = 6;
    const bubbleHeight = TEXT_HEIGHT + INNER_PADDING_Y * 2;
    const bubbleWidth =
      textWidth + INNER_PADDING_X * 2 + ICON_SIZE + iconTextSpacing;

    const bubbleX = rect.x + CELL_PADDING;
    const bubbleY = rect.y + (rect.height - bubbleHeight) / 2;

    const iconX = bubbleX + INNER_PADDING_X;
    const iconY = bubbleY + (bubbleHeight - ICON_SIZE) / 2;

    const textStartX = iconX + ICON_SIZE + iconTextSpacing;

    let displayText = displayName;
    const maxBubbleWidth = rect.x + rect.width - bubbleX - CELL_PADDING;

    if (bubbleWidth > maxBubbleWidth) {
      let fitWidth = 0;
      let i = 0;

      const ellipsisWidth = ctx.measureText("...").width;
      const targetWidth =
        maxBubbleWidth -
        INNER_PADDING_X * 2 -
        ICON_SIZE -
        iconTextSpacing -
        ellipsisWidth;

      while (i < displayName.length && fitWidth < targetWidth) {
        fitWidth += ctx.measureText(displayName[i]).width;
        i++;
      }

      if (fitWidth > targetWidth && i > 0) {
        i--;
      }

      displayText = displayName.substring(0, i) + "...";
      const truncatedTextWidth = ctx.measureText(displayText).width;
      const truncatedBubbleWidth =
        truncatedTextWidth + INNER_PADDING_X * 2 + ICON_SIZE + iconTextSpacing;

      const bubbleColor = "#F3F4F6"; // Light gray background
      const textColor = "#4B5563"; // Medium gray text
      const borderColor = "#E5E7EB"; // Light gray border

      ctx.fillStyle = bubbleColor;
      ctx.beginPath();
      ctx.rect(bubbleX, bubbleY, truncatedBubbleWidth, bubbleHeight);
      ctx.fill();

      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 1;
      ctx.stroke();

      drawFileIcon(ctx, iconX, iconY, ICON_SIZE);

      ctx.textBaseline = "middle";
      ctx.fillStyle = textColor;
      ctx.textAlign = "left";
      // Text matches position with the center of the icon
      ctx.fillText(displayText, textStartX, bubbleY + bubbleHeight / 1.75);
    } else {
      const bubbleColor = "#F3F4F6"; // Light gray background
      const textColor = "#4B5563"; // Medium gray text
      const borderColor = "#E5E7EB"; // Light gray border

      ctx.fillStyle = bubbleColor;
      ctx.beginPath();
      ctx.rect(bubbleX, bubbleY, bubbleWidth, bubbleHeight);
      ctx.fill();

      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 1;
      ctx.stroke();

      drawFileIcon(ctx, iconX, iconY, ICON_SIZE);

      ctx.textBaseline = "middle";
      ctx.fillStyle = textColor;
      ctx.textAlign = "left";
      ctx.fillText(displayText, textStartX, bubbleY + bubbleHeight / 2);
    }

    return true; // Return true to indicate the cell was fully handled
  },

  provideEditor: undefined, // No editor functionality for this cell type
};

// Function to draw a more rectangular file icon similar to Lucide React style
function drawFileIcon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
) {
  ctx.strokeStyle = "#4B5563"; // Medium gray color to match the play icon
  ctx.lineWidth = 1.5;

  // Calculate dimensions for a more rectangular shape
  const width = size;
  const height = size * 1.15; // Make it slightly taller than it is wide
  const foldSize = width * 0.25; // Smaller fold for a cleaner look

  ctx.beginPath();
  // Start at top-left
  ctx.moveTo(x, y);
  // Top edge to the start of the fold
  ctx.lineTo(x + width - foldSize, y);
  // Diagonal fold edge
  ctx.lineTo(x + width, y + foldSize);
  // Right edge
  ctx.lineTo(x + width, y + height);
  // Bottom edge
  ctx.lineTo(x, y + height);
  // Left edge back to start
  ctx.closePath();
  ctx.stroke();

  // Draw the fold line
  ctx.beginPath();
  ctx.moveTo(x + width - foldSize, y);
  ctx.lineTo(x + width - foldSize, y + foldSize);
  ctx.lineTo(x + width, y + foldSize);
  ctx.stroke();
}

export default FileCellRenderer;

import { CustomRenderer, GridCellKind } from "@glideapps/glide-data-grid";
import { MarkdownCell, MarkdownCellProps } from "../../interfaces/interfaces";
import i18n from "../../i18n";

const MarkdownCellRenderer: CustomRenderer<MarkdownCell> = {
  kind: GridCellKind.Custom,

  isMatch: (cell): cell is MarkdownCell =>
    (cell.data as MarkdownCellProps).type === "markdown-cell",

  draw: (args) => {
    const { ctx, rect } = args;

    // Configuration
    const CELL_PADDING = 5;
    const INNER_PADDING_X = 6;
    const BUBBLE_HEIGHT = 20;

    const nameText = i18n.t("global.markdown");

    // Text Styling
    ctx.textBaseline = "middle";
    const bubbleY = rect.y + (rect.height - BUBBLE_HEIGHT) / 2;

    // Measure Texts
    // Name
    ctx.font = "550 12px 'Geist Variable'";
    const nameWidth = ctx.measureText(nameText).width;

    // Calculate Bubble & Content Positions
    const bubbleWidth = nameWidth + INNER_PADDING_X * 2;
    const bubbleX = rect.x + CELL_PADDING;

    const iconX = bubbleX + INNER_PADDING_X;
    const nameX = iconX;
    const contentY = bubbleY + BUBBLE_HEIGHT / 2;

    // Draw Bubble
    ctx.beginPath();
    ctx.rect(bubbleX, bubbleY, bubbleWidth, BUBBLE_HEIGHT);

    // Styling for the bubble
    ctx.fillStyle = "#F3F4F6";
    ctx.fill();

    ctx.strokeStyle = "#E5E7EB";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Draw Content
    const textColor = "#4B5563"; // Medium gray text
    ctx.fillStyle = textColor;

    // Draw name
    ctx.font = "550 12px 'Geist Variable'";
    ctx.fillText(nameText, nameX, contentY);

    return true;
  },

  provideEditor: undefined,
};

export default MarkdownCellRenderer;

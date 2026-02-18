import { CustomRenderer, GridCellKind } from "@glideapps/glide-data-grid";
import { AudioCellProps, AudioCell } from "../../interfaces/interfaces";

// A cell similar to bubble cells in its functionality except with an integrated play icon
const AudioCellRenderer: CustomRenderer<AudioCell> = {
  kind: GridCellKind.Custom,

  isMatch: (cell): cell is AudioCell =>
    (cell.data as AudioCellProps).type === "audio-cell",

  draw: (args) => {
    const { ctx, rect } = args;
    const { data } = args.cell;
    const { fileName } = data as AudioCellProps;

    const CELL_PADDING = 5;
    const ICON_SIZE = 10;
    const TEXT_HEIGHT = 16;

    const INNER_PADDING_X = 4;
    const INNER_PADDING_Y = 1.5;

    ctx.font = `550 12px 'Geist Variable'`;
    ctx.textBaseline = "middle";
    const textWidth = ctx.measureText(fileName).width;

    const iconTextSpacing = 6;
    const bubbleHeight = TEXT_HEIGHT + INNER_PADDING_Y * 2;
    const bubbleWidth =
      textWidth + INNER_PADDING_X * 2 + ICON_SIZE + iconTextSpacing;

    const bubbleX = rect.x + CELL_PADDING;
    const bubbleY = rect.y + (rect.height - bubbleHeight) / 2;

    const iconX = bubbleX + INNER_PADDING_X;
    const iconY = bubbleY + (bubbleHeight - ICON_SIZE) / 2;

    const textStartX = iconX + ICON_SIZE + iconTextSpacing;

    let displayText = fileName;
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

      while (i < fileName.length && fitWidth < targetWidth) {
        fitWidth += ctx.measureText(fileName[i]).width;
        i++;
      }

      if (fitWidth > targetWidth && i > 0) {
        i--;
      }

      displayText = fileName.substring(0, i) + "...";
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

      drawPlayIcon(ctx, iconX, iconY, ICON_SIZE);

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

      drawPlayIcon(ctx, iconX, iconY, ICON_SIZE);

      ctx.textBaseline = "middle";
      ctx.fillStyle = textColor;
      ctx.textAlign = "left";
      ctx.fillText(displayText, textStartX, bubbleY + bubbleHeight / 2);
    }

    return true;
  },

  provideEditor: undefined,
};
// Play button similar to lucide react icons
function drawPlayIcon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
) {
  ctx.strokeStyle = "#4B5563"; // Medium gray color
  ctx.lineWidth = 1.5;

  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y + size);
  ctx.lineTo(x + size / 1.15, y + size / 2);
  ctx.closePath();
  ctx.stroke();
}

export default AudioCellRenderer;

import { type CustomRenderer, GridCellKind } from "@glideapps/glide-data-grid";
import { LoadingCellProps } from "../../interfaces/interfaces";
import { LoadingCell } from "../../types/types";
// Configuration constants for the spinner animation
// How fast the spinner rotates
const SPIN_SPEED = 0.005;
const CIRCLE_RADIUS = 8.5;
const LINE_WIDTH = 2.5;
const LOADER_COLOR = "hsl(25, 100%, 50%)";

const LoadingCellRenderer: CustomRenderer<LoadingCell> = {
  kind: GridCellKind.Custom,

  // Determines whether this renderer should handle a given cell
  isMatch: (cell): cell is LoadingCell =>
    (cell.data as LoadingCellProps).kind === "loading-cell",

  // Draw function, which renders the content of the loading cell
  draw: (args) => {
    const { ctx, rect, requestAnimationFrame } = args;

    // Draw the cell background specified in the theme
    ctx.strokeStyle = LOADER_COLOR;
    // Draw the cell border that matches the overall grid styling
    ctx.lineWidth = LINE_WIDTH;
    ctx.lineCap = "round";

    // Snap to half-pixel to reduce subpixel anti-aliasing jitter on rotation
    const toHalf = (v: number) => Math.round(v * 2) / 2;
    const centerX = toHalf(rect.x + rect.width / 2);
    const centerY = toHalf(rect.y + rect.height / 2);

    // Rotation angle based on the current time for animation
    const rotationAngle = (Date.now() * SPIN_SPEED) % (2 * Math.PI);

    // Draw rotating arc
    ctx.beginPath();
    ctx.arc(
      centerX,
      centerY,
      CIRCLE_RADIUS,
      rotationAngle,
      rotationAngle + Math.PI * 1.5, // 75% of the circle
      false,
    );
    ctx.stroke();

    // Ensure the spinner keeps spinning by requesting the grid to re-render the cell for the next animation frame
    requestAnimationFrame();
    // Inform the grid that this cell has been fully handled
    return true;
  },

  provideEditor: undefined,
};

export default LoadingCellRenderer;

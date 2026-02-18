import { Rectangle } from "@glideapps/glide-data-grid";
import { DataEditorRef } from "@glideapps/glide-data-grid";
import { BubbleCell } from "@glideapps/glide-data-grid";

// A reference to the grid, initialized as null. This is needed for resetting playback progress and rendering cells when progress changes.
export const gridRef = { current: null } as { current: DataEditorRef | null };

// A shared state map for tracking media in grid cells
// Keys are "rowIndex-columnIndex" strings, and values hold URLs
export const mediaCellMap = new Map<
  string,
  {
    type: string;
    fileName: string[];
    columnSubType: string;
    cellInfo: { rowIndex: number; columnIndex: number };
  }
>();
// Registers a media cell in the state.
export const registerMediaCell = (
  rowIndex: number,
  columnIndex: number,
  // Type of media
  type: string,
  fileName: string[],
  columnSubType: string,
) => {
  const key = `${rowIndex}-${columnIndex}`;
  mediaCellMap.set(key, {
    type,
    fileName,
    columnSubType,
    cellInfo: { rowIndex, columnIndex },
  });
};
export const clearMediaCellMap = () => {
  mediaCellMap.clear();
};

// Handles clicks on media cells.
// Opens a sidebar displaying media data from the clicked cell.
export const handleMediaCellClick = (rowIndex: number, columnIndex: number) => {
  const key = `${rowIndex}-${columnIndex}`;
  return mediaCellMap.get(key) || null;
};
// Color palette with hex values
const colorPalette = {
  // Blues
  blue: { bg: "#DBEAFE", text: "#1E40AF", border: "#BFDBFE" },
  skyBlue: { bg: "#E0F2FE", text: "#0369A1", border: "#BAE6FD" },
  lightBlue: { bg: "#EFF6FF", text: "#1D4ED8", border: "#DBEAFE" },
  deepBlue: { bg: "#BFDBFE", text: "#1E3A8A", border: "#93C5FD" },
  navyBlue: { bg: "#C7D2FE", text: "#312E81", border: "#A5B4FC" },

  // Purples
  purple: { bg: "#F3E8FF", text: "#5B21B6", border: "#E9D5FF" },
  lavender: { bg: "#FAF5FF", text: "#6D28D9", border: "#F3E8FF" },
  violet: { bg: "#EDE9FE", text: "#5B21B6", border: "#DDD6FE" },
  fuchsia: { bg: "#FAE8FF", text: "#86198F", border: "#F5D0FE" },

  // Reds
  red: { bg: "#FEE2E2", text: "#991B1B", border: "#FECACA" },
  crimson: { bg: "#FECACA", text: "#7F1D1D", border: "#FCA5A5" },
  rose: { bg: "#FFE4E6", text: "#9F1239", border: "#FECDD3" },
  ruby: { bg: "#FEF2F2", text: "#B91C1C", border: "#FEE2E2" },

  // Oranges
  orange: { bg: "#FFEDD5", text: "#9A3412", border: "#FED7AA" },
  amber: { bg: "#FEF3C7", text: "#92400E", border: "#FDE68A" },
  tangerine: { bg: "#FED7AA", text: "#7C2D12", border: "#FDBA74" },

  // Yellows
  yellow: { bg: "#FEF9C3", text: "#854D0E", border: "#FEF08A" },
  lemon: { bg: "#FEFCE8", text: "#A16207", border: "#FEF9C3" },

  // Greens
  green: { bg: "#DCFCE7", text: "#166534", border: "#BBF7D0" },
  emerald: { bg: "#D1FAE5", text: "#065F46", border: "#A7F3D0" },
  lime: { bg: "#ECFCCB", text: "#3F6212", border: "#D9F99D" },
  mint: { bg: "#F0FDF4", text: "#14532D", border: "#DCFCE7" },
  forest: { bg: "#BBF7D0", text: "#14532D", border: "#86EFAC" },

  // Teals/Cyans
  teal: { bg: "#CCFBF1", text: "#115E59", border: "#99F6E4" },
  cyan: { bg: "#CFFAFE", text: "#155E75", border: "#A5F3FC" },
  aqua: { bg: "#ECFEFF", text: "#0E7490", border: "#CFFAFE" },

  // Pinks
  pink: { bg: "#FCE7F3", text: "#9D174D", border: "#FBCFE8" },
  hotPink: { bg: "#FBCFE8", text: "#831843", border: "#F9A8D4" },
  lightPink: { bg: "#FDF2F8", text: "#BE185D", border: "#FCE7F3" },

  // Browns
  brown: { bg: "#FDE68A", text: "#78350F", border: "#FCD34D" },

  // Grays
  charcoal: { bg: "#374151", text: "#F3F4F6", border: "#4B5563" },
  lightGray: { bg: "#E5E7EB", text: "#4B5563", border: "#D1D5DB" },

  // Additional vibrant colors
  turquoise: { bg: "#5EEAD4", text: "#115E59", border: "#2DD4BF" },
  coral: { bg: "#FDA4AF", text: "#9F1239", border: "#FB7185" },
};
export const hexColorPalette = Object.fromEntries(
  Object.entries(colorPalette).map(([key, value]) => [key, value]),
);
// Get color for a tag or array of tags
// For individual tags: consistent color based on hash
// For arrays: sequential color assignment for maximum diversity
export const getColorForTag = (tags: string | string[]) => {
  // Special tag colors
  const specialTagColors: Record<string, string> = {
    positive: "green",
    negative: "red",
    neutral: "gray",
  };

  // Color sequence grouped by color families for better distribution
  // Each subarray contains colors from similar families
  const colorGroups = [
    // Reds/Pinks
    ["red", "crimson", "ruby", "rose", "hotPink", "lightPink", "coral"],
    // Greens
    ["green", "emerald", "forest", "lime", "mint"],
    // Blues
    ["blue", "deepBlue", "skyBlue", "lightBlue", "navyBlue"],
    // Purples
    ["purple", "violet", "lavender", "fuchsia"],
    // Yellows/Oranges
    ["amber", "yellow", "orange", "tangerine", "lemon", "brown"],
    // Teals/Cyans
    ["teal", "cyan", "aqua", "turquoise"],
    // Grays
    ["charcoal", "gray"],
  ];

  // Flatten for accessing by index, but keep track of group sizes for distribution
  const colorSequence = colorGroups.flat();
  const groupSizes = colorGroups.map((group) => group.length);

  // Improved hash function that spreads across color groups first, then within groups
  const getColorFromHash = (str: string) => {
    // Primary hash for selecting color group
    let hash1 = 0;
    // Secondary hash for selecting within group
    let hash2 = 0;

    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash1 = (hash1 << 5) - hash1 + char;
      // Different bit operation for secondary hash
      hash2 = (hash2 << 3) - hash2 + char;
    }

    hash1 = Math.abs(hash1);
    hash2 = Math.abs(hash2);

    // Select color group first (maximizes diversity)
    const groupIndex = hash1 % colorGroups.length;

    // Calculate start index of the selected group in the flattened array
    let startIndex = 0;
    for (let i = 0; i < groupIndex; i++) {
      startIndex += groupSizes[i];
    }

    // Select color within the group
    const withinGroupIndex = hash2 % groupSizes[groupIndex];

    // Return final color
    return colorSequence[startIndex + withinGroupIndex];
  };

  // Handle single tag case
  if (!Array.isArray(tags)) {
    const normalizedTag = String(tags).trim().toLowerCase();

    // Check special tags first
    if (specialTagColors[normalizedTag]) {
      return specialTagColors[normalizedTag];
    }

    // Use enhanced hash function
    return getColorFromHash(normalizedTag);
  }

  // Handle array of tags
  const normalizedTags = tags.map((tag) => String(tag).trim().toLowerCase());
  const result = new Array(normalizedTags.length);

  // Track used colors within this array to maximize diversity when possible
  const usedColors = new Set();

  // Process unique tags first to maintain consistency for the same tag
  const uniqueTags = new Map();
  normalizedTags.forEach((tag, index) => {
    if (!uniqueTags.has(tag)) {
      uniqueTags.set(tag, []);
    }
    uniqueTags.get(tag).push(index);
  });

  // Assign colors to unique tags
  for (const [tag, indices] of uniqueTags.entries()) {
    // Check special tags first
    if (specialTagColors[tag]) {
      const color = specialTagColors[tag];
      indices.forEach((index: number) => {
        result[index] = color;
      });
      usedColors.add(color);
      continue;
    }

    // Use enhanced hash function
    const baseColor = getColorFromHash(tag);

    // Save the color assignment for all instances of this tag
    indices.forEach((index: number) => {
      result[index] = baseColor;
    });
    usedColors.add(baseColor);
  }

  return result;
};

// Parse multitag values that are returned as strings
export const parseMultiTagValue = (
  value: string,
): [] | string[] | undefined => {
  if (!value) return;
  try {
    const parsedValue = JSON.parse(value.replace(/'/g, '"'));

    if (Array.isArray(parsedValue)) {
      return parsedValue
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
    } else {
      return parsedValue.trim() ? [parsedValue.trim()] : [];
    }
  } catch {
    return value.trim() ? [value.trim()] : [];
  }
};
export const drawBubbleCell = (
  ctx: CanvasRenderingContext2D,
  cell: BubbleCell,
  rect: Rectangle,
) => {
  // Define spacing between bubbles
  const bubbleSpacing = 5; // Space between bubbles
  const rowSpacing = 5; // Vertical space between rows

  // Define internal padding inside each bubble
  const innerPaddingX = 4; // Horizontal padding inside the bubble
  const innerPaddingY = 1.5; // Vertical padding inside the bubble
  const textHeight = 16;

  // Bubble dimensions
  const bubbleHeight = textHeight + innerPaddingY * 2;

  // Set the font before measuring text
  ctx.font = `550 12px 'Geist Variable'`;

  // Calculate colors for all tags
  const tagColors = getColorForTag(cell.data) as string[];

  // Calculate how many rows can fit in the cell
  const maxRows = Math.max(
    1,
    Math.floor(rect.height / (bubbleHeight + rowSpacing)),
  );

  // Determine initial rows
  const rows: Array<{
    indices: number[];
    lastBubbleComplete: boolean;
    // Initialize with empty first row
  }> = [{ indices: [], lastBubbleComplete: true }];

  let currentRowWidth = bubbleSpacing; // Start with initial spacing

  // Assign bubbles to rows
  for (let i = 0; i < cell.data.length; i++) {
    const text = cell.data[i];
    if (!text?.trim()) continue;

    // Get text width
    const textWidth = ctx.measureText(text).width;
    const bubbleWidth = textWidth + innerPaddingX * 2;

    // Check bubble would fit in the current row
    if (currentRowWidth + bubbleWidth > rect.width) {
      // Check if it would fit partially
      const remainingWidth = rect.width - currentRowWidth;
      // Show at least 1px of the cut bubble
      const minimumVisibleWidth = 1;

      // Show a partial bubble if there is enough space
      if (remainingWidth >= minimumVisibleWidth) {
        // Add this bubble as partial to the current row
        rows[rows.length - 1].indices.push(i);
        rows[rows.length - 1].lastBubbleComplete = false;

        // Max rows reached, stop adding bubbles
        if (rows.length >= maxRows) break;

        // Start a new row
        rows.push({ indices: [], lastBubbleComplete: true });
        currentRowWidth = bubbleSpacing;
      } else {
        // If there is not enough space for a partial bubble and at max rows, don't add bubbles,
        // instead start a new row
        if (rows.length >= maxRows) break;

        rows.push({ indices: [i], lastBubbleComplete: true });
        currentRowWidth = bubbleSpacing + bubbleWidth;
      }
    } else {
      // Add bubble to current row
      rows[rows.length - 1].indices.push(i);
      currentRowWidth += bubbleWidth + bubbleSpacing;
    }
  }

  // Remove any empty rows
  const nonEmptyRows = rows.filter((row) => row.indices.length > 0);

  // Calculate vertical positioning for all rows
  const totalRowsHeight =
    nonEmptyRows.length * bubbleHeight + (nonEmptyRows.length - 1) * rowSpacing;
  let startY = rect.y + Math.max(0, (rect.height - totalRowsHeight) / 2);

  // Draw each row of bubbles
  for (const row of nonEmptyRows) {
    // Starting position for this row
    let x = rect.x + bubbleSpacing;
    const y = startY;

    // Draw each bubble in the row
    for (let j = 0; j < row.indices.length; j++) {
      const i = row.indices[j];
      const text = cell.data[i];
      if (!text?.trim()) continue;

      // Get the color name for this tag
      const colorName = tagColors[i];

      // Get the color objects from the map
      const colorStyle =
        hexColorPalette[colorName as keyof typeof hexColorPalette] ||
        hexColorPalette.charcoal;

      const bubbleColor = colorStyle.bg;
      const textColor = colorStyle.text;
      const borderColor = colorStyle.border;

      // Text width
      const textWidth = ctx.measureText(text).width;

      // Calculate bubble width with the proper inner padding
      const bubbleWidth = textWidth + innerPaddingX * 2;

      // Check if this is the last bubble in the row and if it should be partial,
      const isPartialLast =
        j === row.indices.length - 1 && !row.lastBubbleComplete;
      const wouldExtendPastEdge = x + bubbleWidth > rect.x + rect.width;

      if (wouldExtendPastEdge || isPartialLast) {
        // Calculate visible width
        const maxWidth = rect.x + rect.width - x;
        const visibleWidth = Math.min(bubbleWidth, maxWidth);

        if (visibleWidth <= 0) break;

        // Draw partially visible bubble
        ctx.fillStyle = bubbleColor;
        ctx.beginPath();
        ctx.rect(x, y, visibleWidth, bubbleHeight);
        ctx.fill();

        // Add a subtle border
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 1;
        ctx.stroke();

        // Clip the text
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, visibleWidth, bubbleHeight);
        ctx.clip();

        // Draw text
        ctx.textBaseline = "middle";
        ctx.textAlign = "center";
        ctx.fillStyle = textColor;
        ctx.fillText(text, x + bubbleWidth / 2, y + bubbleHeight / 2 + 1);
        ctx.restore();
        break;
      }

      // Draw full bubble
      ctx.fillStyle = bubbleColor;
      ctx.beginPath();
      ctx.rect(x, y, bubbleWidth, bubbleHeight);
      ctx.fill();

      // Add a subtle border
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 1;
      ctx.stroke();

      // Draw text
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
      ctx.fillStyle = textColor;
      ctx.fillText(text, x + bubbleWidth / 2, y + bubbleHeight / 2 + 1);

      // Move to next position
      x += bubbleWidth + bubbleSpacing;
    }

    // Move to next row
    startY += bubbleHeight + rowSpacing;
  }
};

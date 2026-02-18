import { CustomRenderer, GridCellKind } from "@glideapps/glide-data-grid";
import { JsonCellProps, JsonCell } from "@/interfaces/interfaces";

// Fix color scheme to match the example correctly
const JSON_COLORS = {
  KEY: "#C27628", // Brown/amber for keys with quotes
  KEY_NAME: "#C27628", // Brown/amber for key names
  STRING: "#448C27", // Green for string values
  NUMBER: "#C27628", // Amber/brown for numbers
  BOOLEAN: "#2673BF", // Blue for booleans
  NULL: "#2673BF", // Blue for null
  BRACKET: "#333333", // Dark gray for brackets and braces
  COLON: "#333333", // Dark gray for colons
  COMMA: "#333333", // Dark gray for commas
  KEY_QUOTES: "#C27628", // Brown/amber for quotes around keys
  STRING_QUOTES: "#448C27", // Green for quotes around string values
};

// Helper function to tokenize JSON
function tokenizeJSON(jsonString: string) {
  try {
    const parsed = JSON.parse(jsonString);
    const formatted = JSON.stringify(parsed, null, 2);

    const tokens: { type: string; value: string }[] = [];
    let inQuotes = false;
    let inKey = false;
    let tokenStart = 0;
    let currentType = "";

    for (let i = 0; i < formatted.length; i++) {
      const char = formatted[i];

      if (char === '"') {
        if (i === 0 || formatted[i - 1] !== "\\") {
          if (!inQuotes) {
            // Check if string is a key
            let isKey = false;
            for (let j = i + 1; j < formatted.length; j++) {
              if (formatted[j] === '"' && formatted[j - 1] !== "\\") {
                // Found end quote
                const nextNonWhitespace = formatted.slice(j + 1).trim()[0];
                if (nextNonWhitespace === ":") {
                  isKey = true;
                }
                break;
              }
            }

            inKey = isKey;
            // Add quote with proper color depending on whether it's for a key or string value
            tokens.push({
              type: isKey ? "KEY_QUOTES" : "STRING_QUOTES",
              value: '"',
            });

            // Starting the content inside quotes
            inQuotes = true;
            tokenStart = i + 1; // Skip the quote
            currentType = inKey ? "KEY_NAME" : "STRING";
          } else {
            // Ending a string - add the content
            tokens.push({
              type: currentType,
              value: formatted.slice(tokenStart, i),
            });
            // Add closing quote
            tokens.push({
              type: inKey ? "KEY_QUOTES" : "STRING_QUOTES",
              value: '"',
            });
            inQuotes = false;
          }
        }
      } else if (!inQuotes) {
        if (char === "{" || char === "}" || char === "[" || char === "]") {
          tokens.push({ type: "BRACKET", value: char });
        } else if (char === ":") {
          tokens.push({ type: "COLON", value: char });
        } else if (char === ",") {
          tokens.push({ type: "COMMA", value: char });
        } else if (/[0-9.-]/.test(char)) {
          // Handle numbers
          let numStr = "";
          let j = i;
          while (j < formatted.length && /[0-9e+\-.]/i.test(formatted[j])) {
            numStr += formatted[j];
            j++;
          }
          //Check if it's a number
          if (numStr && !isNaN(Number(numStr))) {
            tokens.push({ type: "NUMBER", value: numStr });
            i = j - 1;
          } else {
            // Push as text if not
            tokens.push({ type: "TEXT", value: char });
          }
        } else if (/\s/.test(char)) {
          // Check for whitespace
          tokens.push({ type: "WHITESPACE", value: char });
        } else if (
          //Check for booleans
          i + 4 <= formatted.length &&
          formatted.slice(i, i + 4) === "true"
        ) {
          tokens.push({ type: "BOOLEAN", value: "true" });
          i += 3;
        } else if (
          i + 5 <= formatted.length &&
          formatted.slice(i, i + 5) === "false"
        ) {
          tokens.push({ type: "BOOLEAN", value: "false" });
          i += 4;
          // Check for null values
        } else if (
          i + 4 <= formatted.length &&
          formatted.slice(i, i + 4) === "null"
        ) {
          tokens.push({ type: "NULL", value: "null" });
          i += 3;
        } else {
          // Default text
          tokens.push({ type: "TEXT", value: char });
        }
      }
    }

    return tokens;
  } catch (e) {
    // Return error token if JSON is invalid
    return [{ type: "ERROR", value: "Invalid JSON" }];
  }
}

const JSONCellRenderer: CustomRenderer<JsonCell> = {
  kind: GridCellKind.Custom,
  isMatch: (cell): cell is JsonCell =>
    (cell.data as JsonCellProps).type === "json-cell",
  draw: (args, cell) => {
    const { ctx, theme, rect } = args;
    const { x, y, width, height } = rect;
    const data = cell.data as JsonCellProps;

    try {
      const jsonString = data.json;
      // Set up clipping to ensure text stays within cell
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, width, height);
      ctx.clip();

      // Tokenize the JSON
      const tokens = tokenizeJSON(jsonString);

      // Draw the tokens with syntax highlighting
      ctx.font = "11px monospace";
      ctx.textBaseline = "top";

      // Position for drawing
      let currentX = x + 4;
      let currentY = y + 4;

      // Draw tokens
      for (const token of tokens) {
        // Set color based on token type
        if (token.type === "ERROR") {
          // Red for errors
          ctx.fillStyle = "#E45649";
        } else if (token.type === "WHITESPACE") {
          // Handle newlines by resetting X and incrementing Y
          if (token.value === "\n") {
            currentX = x + 4;
            currentY += 15; // Line height
            continue;
          }
        } else {
          ctx.fillStyle =
            // Check for color, if none set textDark from the DataGrid theme
            JSON_COLORS[token.type as keyof typeof JSON_COLORS] ||
            theme.textDark;
        }

        // Check if current position is outside the cell's visible area
        if (currentY > y + height) {
          break; // Skip rendering tokens that are outside the visible area
        }

        // Draw the token
        if (token.type !== "WHITESPACE" || token.value !== "\n") {
          const tokenWidth = ctx.measureText(token.value).width;

          ctx.fillText(token.value, currentX, currentY);
          currentX += tokenWidth;
        }
      }

      ctx.restore();
    } catch (e) {
      // Draw error state

      ctx.fillStyle = "#E45649";
      ctx.font = "12px sans-serif";
      ctx.textBaseline = "middle";
      ctx.fillText("Invalid JSON", x + 8, y + height / 2);
    }

    return true;
  },

  // No editor required
  provideEditor: undefined,
};

export default JSONCellRenderer;

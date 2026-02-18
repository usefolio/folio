// Rules for safe filenames suitable for blob/object storage and cross-platform use
// - Keep letters, numbers, hyphen, underscore, and dot
// - Replace other characters with underscore
// - Collapse consecutive underscores
// - Trim leading/trailing dots, spaces, and underscores
// - Preserve a short, known extension when present (e.g., csv, pdf, md)
// - Avoid Windows reserved device names

const INVALID_CHARS = /[^A-Za-z0-9._-]+/g;
const EDGE_CHARS = /^[\s._-]+|[\s._-]+$/g;
const MULTI_UNDERSCORE = /_+/g;
const CTRL_CHARS = /[\u0000-\u001F\u007F]/g;

const RESERVED_BASENAMES = new Set([
  "CON",
  "PRN",
  "AUX",
  "NUL",
  "COM1",
  "COM2",
  "COM3",
  "COM4",
  "COM5",
  "COM6",
  "COM7",
  "COM8",
  "COM9",
  "LPT1",
  "LPT2",
  "LPT3",
  "LPT4",
  "LPT5",
  "LPT6",
  "LPT7",
  "LPT8",
  "LPT9",
]);

export function sanitizeFileName(
  input: string,
  opts: { maxLength?: number; allowedExts?: string[] } = {},
): string {
  const maxLength = opts.maxLength ?? 128;
  const allowedExts = (opts.allowedExts ?? ["csv", "pdf", "md", "json"]).map(
    (e) => e.toLowerCase(),
  );

  let name = (input || "").replace(CTRL_CHARS, "").trim();
  // Remove URL schemes and plain tokens "http"/"https"
  name = name.replace(/^https?:\/\//i, "");
  name = name.replace(/https?/gi, "");
  if (!name) return "file";

  // Extract extension if it looks reasonable
  let base = name;
  let ext = "";
  const lastDot = name.lastIndexOf(".");
  if (lastDot > 0 && lastDot < name.length - 1) {
    const rawExt = name.slice(lastDot + 1).toLowerCase();
    if (/^[a-z0-9]{1,8}$/.test(rawExt)) {
      ext = allowedExts.includes(rawExt) ? rawExt : rawExt; // keep but still sanitized
      base = name.slice(0, lastDot);
    }
  }

  // Replace invalid chars and tidy up
  base = base.replace(INVALID_CHARS, "_");
  // Ensure only a single dot exists in the final filename (before extension only)
  // Replace any dots in the base name with underscores
  base = base.replace(/\./g, "_");
  base = base.replace(MULTI_UNDERSCORE, "_").replace(EDGE_CHARS, "");

  if (!base) base = "file";

  // Avoid reserved device names (Windows), case-insensitive compare
  if (RESERVED_BASENAMES.has(base.toUpperCase())) {
    base = `_${base}`;
  }

  // Recompute max base length considering extension
  const budget = Math.max(1, maxLength - (ext ? ext.length + 1 : 0));
  if (base.length > budget) base = base.slice(0, budget);
  base = base.replace(EDGE_CHARS, "");
  if (!base) base = "file";

  return ext ? `${base}.${ext}` : base;
}

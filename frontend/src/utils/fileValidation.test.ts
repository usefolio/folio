import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  validateFileSelection,
  analyzeDominantFileType,
} from "./fileValidation";
import type { FileWithProgress } from "@/interfaces/interfaces";

// Mock i18n to avoid depending on runtime translations
vi.mock("@/i18n", () => ({
  __esModule: true,
  default: { t: (k: string, o?: any) => `${k}${o ? JSON.stringify(o) : ""}` },
}));

const makeFile = (name: string, size = 100): File => ({
  name,
  size,
  type: "",
  slice: () => new Blob(),
  stream: () => new ReadableStream(),
  arrayBuffer: async () => new ArrayBuffer(0),
  text: async () => "",
} as unknown as File);

const wrap = (name: string): FileWithProgress => ({
  id: name,
  file: makeFile(name),
  status: "pending",
  progress: 0,
});

describe("fileValidation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks mixed types as invalid (dominant type retained)", () => {
    const files = [wrap("a.csv"), wrap("b.json")];
    const analysis = analyzeDominantFileType(files);
    expect(analysis.hasInvalidFiles).toBe(true);
    expect(analysis.markedFiles.some((f) => f.isInvalid)).toBe(true);
  });

  it("enforces only-one CSV by marking extras", () => {
    const files = [wrap("a.csv"), wrap("b.csv"), wrap("c.csv")];
    const res = validateFileSelection(files);
    const invalid = res.markedFiles.filter((f) => f.isInvalid);
    expect(invalid.length).toBeGreaterThan(0);
  });

  it("preserves pre-invalid unsupported types and returns an error message", () => {
    const supported = wrap("ok.csv");
    const unsupported = {
      ...wrap("img.png"),
      isInvalid: true,
      invalidReason: "invalid-file-type" as const,
    };
    const res = validateFileSelection([supported, unsupported]);
    expect(res.hasInvalidFiles).toBe(true);
    expect(res.errorMessage).toBeTruthy();
    // Ensure the originally unsupported remains invalid
    const png = res.markedFiles.find((f) => f.file.name.endsWith("img.png"));
    expect(png?.isInvalid).toBe(true);
  });
});


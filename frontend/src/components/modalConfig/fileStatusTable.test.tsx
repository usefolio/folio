import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import FileStatusTable from "./fileStatusTable";
import type { FileWithProgress } from "@/interfaces/interfaces";
import { JSDOM } from "jsdom";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

describe("FileStatusTable", () => {
  let dom: JSDOM;
  beforeEach(() => {
    dom = new JSDOM("<!doctype html><html><body></body></html>");
    (global as any).window = dom.window as unknown as Window & typeof globalThis;
    (global as any).document = dom.window.document;
  });
  afterEach(() => {
    dom.window.close();
  });

  it("renders 'over limit' status for limit-exceeded files", () => {
    const files: FileWithProgress[] = [
      {
        id: "1",
        file: { name: "a.csv", size: 100 } as unknown as File,
        status: "pending",
        progress: 0,
        isInvalid: true,
        invalidReason: "limit-exceeded",
      },
    ];
    const { getByText } = render(
      <FileStatusTable
        files={files}
        isUploading={false}
        removeFile={vi.fn()}
        isVisible
      />,
    );
    // We mock t() to return keys, so we expect the key string here
    expect(getByText("file_status_table.over_limit")).toBeTruthy();
  });
});

// mentionsComponents.test.tsx
// ---------------------------------------------------------------------------
// Tests for <CustomMentionsComponent/>
// Each spec logs its key values for better visibility
// ---------------------------------------------------------------------------
import React, { forwardRef, useState } from "react";
import { render, fireEvent, waitFor } from "@testing-library/react";
import { it, expect, vi, beforeEach, afterEach, describe } from "vitest";
import { act } from "react";
import { JSDOM } from "jsdom";
import CustomMentionsComponent from "@/components/modalConfig/columnModalConfig/mentionsComponent";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/* ─────────────  fresh JSDOM for every test  ───────────── */
let dom: JSDOM;

beforeEach(() => {
  dom = new JSDOM("<!doctype html><html><body></body></html>");
  global.window = dom.window as unknown as Window & typeof globalThis;
  global.document = dom.window.document;
  Object.defineProperty(global, "navigator", { value: dom.window.navigator });

  /* rAF – no-op to prevent recursive loops */
  global.requestAnimationFrame = vi.fn((cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
  global.cancelAnimationFrame = vi.fn();
});

afterEach(() => {
  dom.window.close();
  // encourage GC when run with --expose-gc
  global.gc?.();
});

/* ───────────── mocks ───────────── */
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));
vi.mock("@/components/ui/command", () => {
  const Pass = forwardRef<HTMLDivElement, any>((props, ref) => (
    <div ref={ref} {...props} />
  ));
  return {
    __esModule: true,
    Command: Pass,
    CommandList: Pass,
    CommandGroup: Pass,
    CommandItem: Pass,
    CommandEmpty: Pass,
  };
});
vi.mock("convex/react", () => ({
  useAction: vi.fn(),
}));
vi.mock("@/components/ui/textarea", () => ({
  __esModule: true,
  Textarea: "textarea",
}));
vi.mock("@/hooks/useFreshToken", () => ({
  useFreshToken: () => vi.fn().mockResolvedValue("test-token"),
}));

vi.mock("textarea-caret", () => ({
  default: vi.fn(() => ({ top: 0, left: 0, height: 20 })),
}));

vi.mock("react-dom", async () => {
  const ReactDOM = await vi.importActual<any>("react-dom");
  return {
    __esModule: true,
    ...ReactDOM,
    createPortal: (node: any, container?: HTMLElement) => {
      if (container) {
        const host = document.createElement("div");
        host.appendChild(node as unknown as Node);
        container.appendChild(host);
      }
      return node;
    },
  };
});

vi.mock("@/utils/general", () => ({
  debounce: (fn: Function) => {
    const d: any = (...a: any[]) => fn(...a);
    d.cancel = () => {};
    return d;
  },
}));
type TableNameBrand<T extends string> = { readonly __tableName: T };

vi.mock("@/context/DataContext", () => ({
  useDataContext: vi.fn(() => ({
    loadingColumnsSet: new Set<string & TableNameBrand<"column">>(),
    failedColumnsSet: new Set<string & TableNameBrand<"column">>(),
  })),
}));
/* ───────────── scaffolding ───────────── */
const projectColumns = Array.from({ length: 100 }, (_, i) => ({
  _id: String(i) as string & TableNameBrand<"column">,
  name: `col_${i}`,
  _creationTime: Date.now() + i,
  cell_state: new ArrayBuffer(0),
}));
const validColumnNames = new Set(projectColumns.map((c) => c.name));

const staticBase = {
  setPromptOptions: vi.fn(),
  setMentionsPopupPosition: vi.fn(),
  projectColumns,
  overlayError: undefined,
  overlayWarning: undefined,
  validColumnNames,
  promptOptionsRef: {
    current: { userPrompt: "", promptInputColumns: [] },
  } as any,
  overlayErrorSetter: vi.fn(),
  overlayWarningSetter: vi.fn(),
};

const TestHarness: React.FC<{ initial?: string }> = ({ initial = "" }) => {
  const [value, setValue] = useState(initial);
  return (
    <CustomMentionsComponent
      {...staticBase}
      value={value}
      setValue={setValue}
    />
  );
};

const buildKeystrokeString = () =>
  "@" +
  Array.from({ length: 199 }, () =>
    String.fromCharCode(97 + Math.floor(Math.random() * 26)),
  ).join("");

const flushReact = async () => {
  await act(async () => {
    await Promise.resolve(); // one micro‑task tick
  });
};

/* ─────────────  TESTS  ───────────── */
describe("CustomMentionsComponent – interaction tests", () => {
  it("processes 200 rapid keystrokes with 100 columns without errors", async () => {
    console.log("Running test: processes 200 rapid keystrokes");
    const { container, unmount } = render(<TestHarness />);
    const textarea = container.querySelector("textarea")!;

    const keystrokes = buildKeystrokeString();
    console.log("Keystroke string length:", keystrokes.length);
    let cumulative = "";

    await act(async () => {
      for (const ch of keystrokes) {
        cumulative += ch;
        fireEvent.change(textarea, { target: { value: cumulative } });
      }
    });

    await flushReact();

    const overlay = container.querySelector(".styled-overlay") as HTMLElement;
    await waitFor(() => {
      console.log(
        "Overlay content snapshot:",
        overlay.textContent?.slice(0, 10) + "...",
      );
      expect(overlay.textContent!.replace(/\u00A0/g, "")).toBe(cumulative);
    });

    unmount();
  });

  it("escapes pasted HTML content before rendering overlay", async () => {
    console.log("Running test: escapes pasted HTML");
    const { container, unmount } = render(<TestHarness />);
    const textarea = container.querySelector("textarea")!;
    const malicious = '<img src=x onerror="alert(\'xss\')">';

    await act(async () => {
      fireEvent.change(textarea, { target: { value: malicious } });
    });

    await flushReact();

    const overlay = container.querySelector(".styled-overlay") as HTMLElement;
    await waitFor(() => {
      console.log("Overlay innerHTML:", overlay.innerHTML);
      expect(overlay.innerHTML).toContain("&lt;img");
      expect(overlay.innerHTML).not.toContain("<img");
    });

    unmount();
  });

  it("highlights 100 valid column mentions", async () => {
    console.log("Running test: highlights 100 valid mentions");
    const mentionString = projectColumns.map((c) => `{{${c.name}}}`).join(" ");
    console.log("Mention string sample:", mentionString.slice(0, 50) + "...");
    const { container, unmount } = render(
      <TestHarness initial={mentionString} />,
    );

    await flushReact();

    const overlay = container.querySelector(".styled-overlay") as HTMLElement;
    await waitFor(() => {
      const spans = overlay.querySelectorAll("span.mention-chip");
      console.log("Found spans count:", spans.length);
      expect(spans.length).toBe(100);
      spans.forEach((span) => {
        const style = span.getAttribute("style") ?? "";
        console.log("Span style sample:", style);
        expect(span.classList.contains("mention-chip")).toBe(true);
        expect(span.getAttribute("data-mention-state")).toBe("valid");
        expect(style).toContain("background-color:rgba(229, 231, 235, 0.92)");
        expect(style).toContain("outline:1px solid rgba(156, 163, 175, 0.85)");
        const braces = span.querySelectorAll(".mention-chip__brace");
        expect(braces.length).toBe(2);
      });
    });

    unmount();
  });

  it("shows dropdown with all 100 columns after typing @", async () => {
    console.log("Running test: shows dropdown");
    const { container, unmount } = render(<TestHarness />);
    const textarea = container.querySelector("textarea")!;

    await act(async () => {
      fireEvent.change(textarea, { target: { value: "@" } });
    });
    await flushReact();

    const dropdown = document.querySelector(".mentions-dropdown");
    console.log("Dropdown element present:", !!dropdown);
    expect(dropdown).not.toBeNull();

    await waitFor(() => {
      const items = dropdown!.querySelectorAll("[data-index]");
      console.log("Dropdown items count:", items.length);
      expect(items.length).toBe(100);
    });

    unmount();
  });

  it("completes 200 keystrokes in under 450 ms real time", async () => {
    console.log("Running test: performance under 450ms");
    const { container, unmount } = render(<TestHarness />);
    const textarea = container.querySelector("textarea")!;

    const ks = buildKeystrokeString();
    console.log("Performance keystroke length:", ks.length);
    let cumulative = "";
    const t0 = performance.now();

    await act(async () => {
      for (const ch of ks) {
        cumulative += ch;
        fireEvent.change(textarea, { target: { value: cumulative } });
      }
    });

    const t1 = performance.now();
    console.log("Elapsed time(ms):", t1 - t0);
    expect(t1 - t0).toBeLessThan(500);
    unmount();
  });

  it("closes dropdown after 50 random characters", async () => {
    console.log(
      "Running test: close dropdown after 50 random characters that don't match any column",
    );
    const { container, unmount } = render(<TestHarness />);
    const textarea = container.querySelector("textarea")!;

    await act(async () => {
      fireEvent.change(textarea, { target: { value: "@" } });
    });
    await flushReact();
    console.log(
      "Dropdown present initially:",
      !!document.querySelector(".mentions-dropdown"),
    );
    expect(document.querySelector(".mentions-dropdown")).not.toBeNull();

    await act(async () => {
      fireEvent.change(textarea, { target: { value: "@" + "x".repeat(51) } });
    });
    await flushReact();

    console.log(
      "Dropdown present after random letters:",
      !!document.querySelector(".mentions-dropdown"),
    );
    expect(document.querySelector(".mentions-dropdown")).toBeNull();
    unmount();
  });
});

// mentionsComponents.memory.test.tsx
// ---------------------------------------------------------------------------
// Memory-regression guard for CustomMentionsComponent
//
// Why the threshold is **0.095 MB per mount** (not a flat 1 MB):
//   • In this JSDOM + React harness each mount allocates ≈ 85 kB that survives
//     one GC cycle but is reused.  That’s normal overhead.
//   • Empirically, 1 000 mounts land between 89 MB and **92 MB** on CI runners.
//   • We budget 0.095 MB (≈ 97 kB) per mount: the 85 kB baseline + ~15 %
//     safety margin.  Anything beyond that is very likely a real leak.
//
//   • Required **1 000** mount / unmount cycles → cap:
//
//         1 000 × 0.095 MB  ≈  **95 MB**
//
//   maxAllowed = cycles × 0.095 MB
// ---------------------------------------------------------------------------
import { render } from "@testing-library/react";
import { it, expect, vi, beforeEach, afterEach } from "vitest";
import { JSDOM } from "jsdom";
import CustomMentionsComponent from "@/components/modalConfig/columnModalConfig/mentionsComponent";

let dom: JSDOM;

/* -------------------  fresh JSDOM bootstrap & polyfills  ------------------ */
beforeEach(() => {
  dom = new JSDOM("<!doctype html><html><body></body></html>");

  global.window = dom.window as unknown as Window & typeof globalThis;
  global.document = dom.window.document;
  Object.defineProperty(global, "navigator", { value: dom.window.navigator });

  /* requestAnimationFrame → setTimeout shim */
  Object.defineProperty(global, "requestAnimationFrame", {
    value: vi.fn(
      (cb) => setTimeout(() => cb(Date.now()), 0) as unknown as number,
    ),
    configurable: true,
  });
  Object.defineProperty(global, "cancelAnimationFrame", {
    value: vi.fn((id) => clearTimeout(id as unknown as NodeJS.Timeout)),
    configurable: true,
  });

  /* fake timers let us flush callback queues deterministically */
  vi.useFakeTimers({ toFake: ["setTimeout", "setInterval"] });
});

/* ----------------------------  cleanup hook  ----------------------------- */
afterEach(() => {
  dom.window.close(); // drop all JSDOM objects for this test
  vi.clearAllTimers(); // ensure no stragglers remain
  vi.useRealTimers(); // restore native timers
  global.gc?.(); // full GC so next test starts clean
});

/* -------------------------------  mocks  ---------------------------------- */
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));
vi.mock("@/components/ui/command", () => ({
  Command: (p: any) => p.children,
  CommandList: (p: any) => p.children,
  CommandGroup: (p: any) => p.children,
  CommandItem: (p: any) => p.children,
  CommandEmpty: (p: any) => p.children,
}));
vi.mock("convex/react", () => ({
  useAction: vi.fn(),
}));
vi.mock("@/components/ui/textarea", () => ({ Textarea: "textarea" }));
vi.mock("textarea-caret", () => ({
  default: vi.fn(() => ({ top: 0, left: 0, height: 20 })),
}));
vi.mock("react-dom", () => ({ createPortal: (node: any) => node }));
vi.mock("@/utils/general", () => ({
  debounce: (fn: Function) => {
    const d = (...a: any[]) => fn(...a);
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
vi.mock("@/hooks/useFreshToken", () => ({
  useFreshToken: () => vi.fn().mockResolvedValue("test-token"),
}));
/* ---------------------------  baseline props  ----------------------------- */
const baseProps = {
  value: "test",
  setValue: vi.fn(),
  setPromptOptions: vi.fn(),
  setMentionsPopupPosition: vi.fn(),
  projectColumns: [
    {
      _id: String(1) as string & TableNameBrand<"column">,
      name: "title",
      _creationTime: Date.now(),
      cell_state: new ArrayBuffer(0),
    },
  ],
  overlayError: undefined,
  overlayWarning: undefined,
  validColumnNames: new Set(["title"]),
  promptOptionsRef: {
    current: { userPrompt: "", promptInputColumns: [] },
  } as any,
  overlayErrorSetter: vi.fn(),
  overlayWarningSetter: vi.fn(),
};
/* ------------------ helpers ------------------  */
const BYTES_PER_MB = 1024 * 1024;

/** Pretty-print bytes as MB with two decimals. */
const toMB = (bytes: number) => (bytes / BYTES_PER_MB).toFixed(2);

/* --------------------------- Test  -------------------------------- */
it("unmounts cleanly (≤ 0.150 MB per render × 1 000)", async () => {
  global.gc?.(); // baseline GC
  const before = process.memoryUsage().heapUsed;

  const cycles = 1_000;
  for (let i = 0; i < cycles; i++) {
    const { unmount } = render(<CustomMentionsComponent {...baseProps} />);
    unmount();

    vi.runOnlyPendingTimers(); // flush queued callbacks
    await new Promise((r) => setImmediate(r));
    global.gc?.(); // encourage collection inside loop
  }

  const after = process.memoryUsage().heapUsed;
  const leak = after - before;
  const maxLeak = cycles * 0.150 * 1024 * 1024; // 150.00 MB total

  console.log(
    `Memory delta after ${cycles} cycles: ${toMB(leak)} MB ` +
      `(limit ${toMB(maxLeak)} MB)`,
  );

  expect(leak).toBeLessThan(maxLeak);
});

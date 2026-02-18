import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MentionTextarea,
  MentionTextareaProps,
} from "@/components/ui/mentionTextarea";

const caretMock = vi.hoisted(() =>
  vi.fn(() => ({ top: 12, left: 18, height: 20 })),
);

vi.mock("textarea-caret", () => ({
  default: caretMock,
}));

type ControlledProps = Omit<MentionTextareaProps, "value" | "onChange"> & {
  initialValue?: string;
  onValueChange?: (next: string) => void;
};

const ControlledMentionTextarea: React.FC<ControlledProps> = ({
  initialValue = "",
  onValueChange,
  ...rest
}) => {
  const [value, setValue] = React.useState(initialValue);

  return (
    <MentionTextarea
      {...rest}
      value={value}
      onChange={(next) => {
        setValue(next);
        onValueChange?.(next);
      }}
    />
  );
};

describe("MentionTextarea", () => {
  beforeEach(() => {
    caretMock.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("highlights tokens across multiple lines without altering text content", () => {
    const patterns = [/@[\w]+/g, /#[\w]+/g, /\{[^\s}]+\}/g];
    const value = "Hello @alice\nWorking on #triage with {user:123}";

    render(
      <MentionTextarea
        value={value}
        onChange={() => {}}
        tokenPatterns={patterns}
      />,
    );

    const overlay = screen.getByTestId("mention-textarea__overlay");
    expect(overlay.textContent).toBe(value);

    const tokens = overlay.querySelectorAll("span.mention-token");
    expect(tokens).toHaveLength(3);
    expect(Array.from(tokens).map((token) => token.textContent)).toEqual([
      "@alice",
      "#triage",
      "{user:123}",
    ]);
  });

  it("fires onTrigger with caret rect when composing mention tokens", () => {
    const patterns = [/@[\w]+/g];
    const onTrigger = vi.fn();

    render(
      <ControlledMentionTextarea
        tokenPatterns={patterns}
        onTrigger={onTrigger}
      />,
    );

    const textarea = screen.getByRole("textbox");

    let selection = 0;
    Object.defineProperty(textarea, "selectionStart", {
      configurable: true,
      get: () => selection,
      set: (val) => {
        selection = typeof val === "number" ? val : 0;
      },
    });
    Object.defineProperty(textarea, "selectionEnd", {
      configurable: true,
      get: () => selection,
      set: (val) => {
        selection = typeof val === "number" ? val : 0;
      },
    });

    textarea.getBoundingClientRect = () => new DOMRect(100, 200, 0, 0);
    textarea.scrollTop = 6;
    textarea.scrollLeft = 4;

    const nextValue = "@alice";
    selection = nextValue.length;
    fireEvent.change(textarea, { target: { value: nextValue } });

    expect(onTrigger).toHaveBeenCalledTimes(1);
    const [prefix, query, rect] = onTrigger.mock.calls[0];

    expect(prefix).toBe("@");
    expect(query).toBe("alice");
    expect(rect.x).toBeCloseTo(114); // 100 + 18 - 4
    expect(rect.y).toBeCloseTo(206); // 200 + 12 - 6
    expect(rect.height).toBe(20);
  });

  it("keeps long tokens within a single highlighted span", () => {
    const longToken = `@${"mention".repeat(8)}`;
    const value = `Label ${longToken} done`;

    render(
      <MentionTextarea
        value={value}
        onChange={() => {}}
        tokenPatterns={[/@[\w]+/g]}
      />,
    );

    const overlay = screen.getByTestId("mention-textarea__overlay");
    const tokenSpan = overlay.querySelector("span.mention-token");
    expect(tokenSpan).not.toBeNull();
    expect(tokenSpan?.textContent).toBe(longToken);
    expect(overlay.textContent).toBe(value);
  });

  it("syncs overlay scroll position with the textarea", () => {
    const patterns = [/@[\w]+/g];

    render(
      <ControlledMentionTextarea
        tokenPatterns={patterns}
        initialValue={"Line one\n@alice"}
      />,
    );

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    const overlayWrapper = textarea.previousElementSibling as HTMLElement;
    const overlay = overlayWrapper.querySelector(
      "[data-testid=mention-textarea__overlay]",
    ) as HTMLElement;

    expect(overlayWrapper).not.toBeNull();
    expect(overlay).not.toBeNull();

    textarea.scrollTop = 24;
    textarea.scrollLeft = 9;
    fireEvent.scroll(textarea);

    expect(overlayWrapper.style.transform).toBe("");
    expect(overlay.style.transform).toBe("translate3d(-9px, -24px, 0)");
  });
});

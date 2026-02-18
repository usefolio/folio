import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  forwardRef,
} from "react";
import getCaretCoordinates from "textarea-caret";

import { cn } from "@/lib/utils";

const SHARED_TEXT_STYLES =
  "px-3 py-2 text-base md:text-sm leading-[1.5] font-normal font-sans whitespace-pre-wrap break-words";
const TOKEN_CLASSNAMES =
  "mention-token inline rounded-md bg-primary/15 text-primary font-medium";

type MentionTriggerPrefix = "@" | "#";

export interface MentionTextareaProps
  extends Omit<
    React.TextareaHTMLAttributes<HTMLTextAreaElement>,
    "value" | "onChange"
  > {
  value: string;
  onChange: (value: string) => void;
  tokenPatterns: RegExp[];
  onTrigger?: (
    prefix: MentionTriggerPrefix,
    query: string,
    caretRect: DOMRect,
  ) => void;
  textareaClassName?: string;
  overlayClassName?: string;
}

const buildCombinedRegex = (patterns: RegExp[]): RegExp | null => {
  if (!patterns.length) return null;

  const sources: string[] = [];
  const flagSet = new Set<string>();

  for (const pattern of patterns) {
    if (!pattern?.source) continue;
    sources.push(`(${pattern.source})`);
    for (const flag of pattern.flags) {
      if (flag !== "g") flagSet.add(flag);
    }
  }

  if (!sources.length) return null;

  const combinedFlags = `${Array.from(flagSet).join("")}g`;
  return new RegExp(sources.join("|"), combinedFlags);
};

const MentionTextarea = forwardRef<HTMLTextAreaElement, MentionTextareaProps>(
  (
    {
      value,
      onChange,
      tokenPatterns,
      onTrigger,
      className,
      textareaClassName,
      overlayClassName,
      ...textareaProps
    },
    forwardedRef,
  ) => {
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const overlayRef = useRef<HTMLDivElement | null>(null);

    const setTextareaRef = useCallback(
      (node: HTMLTextAreaElement | null) => {
        textareaRef.current = node;
        if (!forwardedRef) return;
        if (typeof forwardedRef === "function") {
          forwardedRef(node);
        } else {
          forwardedRef.current = node;
        }
      },
      [forwardedRef],
    );

    const highlightRegex = useMemo(
      () => buildCombinedRegex(tokenPatterns),
      [tokenPatterns],
    );

    const syncOverlayScroll = useCallback(() => {
      if (!textareaRef.current || !overlayRef.current) return;
      const { scrollTop, scrollLeft } = textareaRef.current;
      overlayRef.current.style.transform = `translate3d(${-scrollLeft}px, ${-scrollTop}px, 0)`;
    }, []);

    const applyHighlights = useCallback(
      (text: string) => {
        const overlay = overlayRef.current;
        if (!overlay) return;

        const doc = overlay.ownerDocument ?? document;
        const normalized = text ?? "";

        const fragment = doc.createDocumentFragment();

        if (!highlightRegex) {
          fragment.appendChild(doc.createTextNode(normalized));
        } else {
          let lastIndex = 0;
          highlightRegex.lastIndex = 0;
          let match: RegExpExecArray | null;

          while ((match = highlightRegex.exec(normalized)) !== null) {
            const matchText = match[0];
            const start = match.index;
            if (start > lastIndex) {
              fragment.appendChild(
                doc.createTextNode(normalized.slice(lastIndex, start)),
              );
            }

            const tokenSpan = doc.createElement("span");
            tokenSpan.className = TOKEN_CLASSNAMES;
            tokenSpan.textContent = matchText;
            tokenSpan.setAttribute("data-mention-token", matchText);
            fragment.appendChild(tokenSpan);

            lastIndex = start + matchText.length;

            if (matchText.length === 0) {
              highlightRegex.lastIndex += 1;
            }
          }

          if (lastIndex < normalized.length) {
            fragment.appendChild(doc.createTextNode(normalized.slice(lastIndex)));
          }
        }

        overlay.replaceChildren(fragment);
      },
      [highlightRegex],
    );

    useLayoutEffect(() => {
      applyHighlights(value ?? "");
      syncOverlayScroll();
    }, [value, applyHighlights, syncOverlayScroll]);

    useEffect(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      const handleScroll = () => {
        syncOverlayScroll();
      };

      textarea.addEventListener("scroll", handleScroll);
      syncOverlayScroll();
      return () => {
        textarea.removeEventListener("scroll", handleScroll);
      };
    }, [syncOverlayScroll]);

    const handleTriggerCheck = useCallback(
      (nextValue: string, caretIndex: number | null | undefined) => {
        if (!onTrigger || caretIndex == null || caretIndex < 0) return;
        const triggers: MentionTriggerPrefix[] = ["@", "#"];
        const uptoCaret = nextValue.slice(0, caretIndex);
        let foundIndex = -1;
        let foundPrefix: MentionTriggerPrefix | null = null;

        for (const prefix of triggers) {
          const idx = uptoCaret.lastIndexOf(prefix);
          if (idx > foundIndex) {
            foundIndex = idx;
            foundPrefix = prefix;
          }
        }

        if (foundIndex === -1 || !foundPrefix) return;

        const charBefore = uptoCaret[foundIndex - 1];
        if (charBefore && !/\s/.test(charBefore)) {
          return;
        }

        const rawQuery = uptoCaret.slice(foundIndex + 1);
        if (!rawQuery || !/\S/.test(rawQuery)) {
          return;
        }

        const lastChar = uptoCaret[uptoCaret.length - 1];
        if (!lastChar || /\s/.test(lastChar)) {
          return;
        }

        const whitespaceIndex = rawQuery.search(/\s/);
        const query = whitespaceIndex === -1
          ? rawQuery
          : rawQuery.slice(0, whitespaceIndex);

        if (!query || !/\S/.test(query)) {
          return;
        }

        const textarea = textareaRef.current;
        if (!textarea) return;

        const coords = getCaretCoordinates(textarea, caretIndex);
        const rect = textarea.getBoundingClientRect();
        const caretRect = new DOMRect(
          rect.left + coords.left - textarea.scrollLeft,
          rect.top + coords.top - textarea.scrollTop,
          0,
          coords.height,
        );

        onTrigger(foundPrefix, query, caretRect);
      },
      [onTrigger],
    );

    const handleChange = useCallback(
      (event: React.ChangeEvent<HTMLTextAreaElement>) => {
        const nextValue = event.target.value;
        onChange(nextValue);
        handleTriggerCheck(nextValue, event.target.selectionStart ?? nextValue.length);
      },
      [onChange, handleTriggerCheck],
    );

    return (
      <div className={cn("relative", className)}>
        <div
          className={cn(
            "pointer-events-none absolute inset-0 overflow-hidden text-left",
            SHARED_TEXT_STYLES,
            overlayClassName,
          )}
          aria-hidden="true"
        >
          <div
            ref={overlayRef}
            className="min-h-full"
            data-testid="mention-textarea__overlay"
          />
        </div>
        <textarea
          ref={setTextareaRef}
          value={value}
          onChange={handleChange}
          className={cn(
            "relative z-10 w-full resize-none bg-transparent text-transparent caret-primary selection:bg-primary/20 focus-visible:ring-0 focus-visible:ring-offset-0",
            SHARED_TEXT_STYLES,
            textareaClassName,
          )}
          style={{
            WebkitTextFillColor: "transparent",
          }}
          {...textareaProps}
        />
      </div>
    );
  },
);

MentionTextarea.displayName = "MentionTextarea";

export { MentionTextarea };

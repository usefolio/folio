import {
  forwardRef,
  useEffect,
  useState,
  useRef,
  memo,
  type CSSProperties,
} from "react";
import { Button } from "@/components/ui/button";
import { GridPopupProps } from "../../interfaces/interfaces";
import SyntaxHighlighter from "react-syntax-highlighter";
import { atomOneLight } from "react-syntax-highlighter/dist/cjs/styles/hljs";
import { useTranslation } from "react-i18next";
import { showErrorNotification } from "../notification/NotificationHandler";
import AudioPlayer from "./audioPlayer";
import { getColorForTag, parseMultiTagValue } from "../../utils/CellDraw";
import { Loader2, ClipboardCopy, X, ChevronDown } from "lucide-react";
import Tag from "../tags/tag";
import { ScrollArea, ScrollBar } from "../ui/scroll-area";
import { useLogger } from "@/utils/Logger";
import { useBackendClient } from "@/hooks/useBackendClient";
import { useDataContext } from "@/context/DataContext";
import { Id } from "convex/_generated/dataModel";
import { cn } from "@/lib/utils";

const GridPopup = forwardRef<HTMLDivElement, GridPopupProps>(
  (
    {
      top,
      left,
      visibility,
      opacity,
      width,
      content,
      onClose,
      clickedCell,
    },
    ref,
  ) => {
    const { t } = useTranslation();
    const { project } = useDataContext();
    const backendClient = useBackendClient();
    const logger = useLogger("src/components/grid/GridPopup.tsx");
    // Use retry function from the retry handler hook
    const columnSubType = clickedCell?.columnSubType;
    const columnType = clickedCell?.columnType;

    // State to track the audio URL and loading state
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [loadingAudio, setLoadingAudio] = useState<boolean>(false);
    const [copied, setCopied] = useState<boolean>(false);

    // Reference to the <audio> element so it stays persistent
    const audioRef = useRef<HTMLAudioElement | null>(null);
    // Local ref to the container so we can detect outside clicks while still forwarding the parent ref
    const selfRef = useRef<HTMLDivElement | null>(null);
    const [showScrollHint, setShowScrollHint] = useState(false);
    // Refs to measure content and footer for dynamic max-height calculations
    const contentRef = useRef<HTMLDivElement | null>(null);
    const footerRef = useRef<HTMLDivElement | null>(null);
    let formattedContent: string | undefined = content;
    let isJson = columnSubType === "freeForm";
    let isMp3 =
      /\.(mp3|wav|ogg|m4a|flac|aac)$/i.test(content ?? "") ||
      columnSubType === "audio";

    // Convert URLs in plain text into clickable links without duplicating protocol
    const linkifyText = (text: string) => {
      // Match URLs starting with http(s) or www., stopping at whitespace or angle/paren
      const urlRegex = /(?:https?:\/\/|www\.)[^\s<)]+/gi;
      const nodes: JSX.Element[] = [];
      let lastIndex = 0;
      const pushText = (s: string) => {
        if (!s) return;
        nodes.push(<span key={`t-${nodes.length}`}>{s}</span>);
      };

      text.replace(urlRegex, (match: string, offset: number) => {
        // Text before the URL
        pushText(text.slice(lastIndex, offset));

        // Trim trailing punctuation like .,!?)]
        let url = match;
        while (/[.,!?)\]]$/.test(url)) url = url.slice(0, -1);

        const href = /^https?:\/\//i.test(url) ? url : `http://${url}`;
        nodes.push(
          <a
            key={`a-${nodes.length}`}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="underline text-blue-600 hover:text-blue-700 break-words"
          >
            {url}
          </a>,
        );
        lastIndex = offset + match.length;
        return match;
      });
      // Remaining text
      pushText(text.slice(lastIndex));
      return nodes;
    };
    // Calculate dynamic max height: clamp to ~20 lines and not beyond available content
    const MAX_LINES = 15;
    const LINE_HEIGHT = 18; // px
    const FOOTER_ESTIMATE = 40; // px
    const CONTENT_TOP_PADDING = 4; // px (pt-1)
    const approxMaxHeight =
      MAX_LINES * LINE_HEIGHT + FOOTER_ESTIMATE + CONTENT_TOP_PADDING;
    const minPopupHeight =
      LINE_HEIGHT + FOOTER_ESTIMATE + CONTENT_TOP_PADDING; // ~1 line + footer + padding
    const [computedMaxHeight, setComputedMaxHeight] = useState<number>(approxMaxHeight);

    useEffect(() => {
      if (isMp3 || visibility !== "visible") return;

      // Measure after layout so the first render uses accurate dimensions
      const measureHeights = () => {
        const contentHeight = contentRef.current?.scrollHeight ?? 0;
        const footerHeight = footerRef.current?.offsetHeight ?? FOOTER_ESTIMATE;
        const byContent = contentHeight + footerHeight + CONTENT_TOP_PADDING;
        const clamped = Math.min(
          approxMaxHeight,
          Math.max(byContent, minPopupHeight),
        );
        setComputedMaxHeight((prev) => (prev === clamped ? prev : clamped));
      };

      type FrameHandle = number | ReturnType<typeof setTimeout>;
      let frameId: FrameHandle | null = null;

      const requestFrame = (cb: FrameRequestCallback): FrameHandle => {
        if (typeof globalThis.requestAnimationFrame === "function") {
          return globalThis.requestAnimationFrame(cb);
        }
        return setTimeout(() => cb(Date.now()), 16);
      };

      const cancelFrame = (id: FrameHandle | null) => {
        if (id === null) return;
        if (
          typeof globalThis.cancelAnimationFrame === "function" &&
          typeof id === "number"
        ) {
          globalThis.cancelAnimationFrame(id);
        } else {
          clearTimeout(id as ReturnType<typeof setTimeout>);
        }
      };
      const scheduleMeasure = () => {
        cancelFrame(frameId);
        frameId = requestFrame(() => {
          frameId = null;
          measureHeights();
        });
      };

      // Initial measurement after layout settles
      scheduleMeasure();

      const resizeObserver =
        typeof ResizeObserver !== "undefined"
          ? new ResizeObserver(() => scheduleMeasure())
          : null;
      const contentElement = contentRef.current;
      const footerElement = footerRef.current;
      if (resizeObserver) {
        if (contentElement) resizeObserver.observe(contentElement);
        if (footerElement) resizeObserver.observe(footerElement);
      }

      return () => {
        cancelFrame(frameId);
        resizeObserver?.disconnect();
      };
    }, [content, columnSubType, isJson, isMp3, visibility]);
    const handleCopy = async () => {
      if (content) {
        try {
          await navigator.clipboard.writeText(content);
          setCopied(true);
          // Revert button text back to "Copy" after 2 seconds
          setTimeout(() => setCopied(false), 2000);
        } catch (error) {
          logger.error("Failed to copy content to clipboard", { error });
          showErrorNotification(
            t("global.error"),
            t("grid.popup.copy_error", {
              error:
                error instanceof Error
                  ? error.message
                  : t("global.unknown_error"),
            }),
          );
        }
      }
    };
    useEffect(() => {
      let isMounted = true;
      const abortController = new AbortController();
      if (isMp3) {
        // Reset the url to fetch a new one
        setLoadingAudio(true);
        setAudioUrl(null);

        const fetchAudio = async () => {
          try {
            const url = await backendClient.getDownloadUrl({
              fileName: content as string,
              signal: abortController.signal,
              project_id: project as Id<"project">,
            });
            if (isMounted) {
              setAudioUrl(url);
              if (audioRef.current) {
                audioRef.current.src = url as string;
                audioRef.current.load();
              }
            }
          } catch (error) {
            if (!abortController.signal.aborted) {
              console.error("Error fetching audio URL:", error);
              showErrorNotification(
                t("global.error"),
                t("grid.popup.error_fetching_audio", {
                  error:
                    error instanceof Error
                      ? error.message
                      : t("global.unknown_error"),
                }),
              );
            }
          } finally {
            if (isMounted) setLoadingAudio(false);
          }
        };

        fetchAudio();
      }
      // Abort request and buffering when component is unmounted
      return () => {
        isMounted = false;
        abortController.abort();
      };
    }, [content, visibility]);

    if (isJson && typeof formattedContent === "string") {
      try {
        formattedContent = JSON.stringify(
          JSON.parse(formattedContent),
          null,
          2,
        );
      } catch (error) {
        logger.error("Error", { error });
        // Not valid JSON, just display it as plain text
      }
    }
    const tagsArray = parseMultiTagValue(formattedContent as string);
    // Close on outside click
    useEffect(() => {
      if (visibility !== "visible") return;
      const handlePointerDown = (e: MouseEvent | TouchEvent) => {
        const node = selfRef.current;
        if (!node) return;
        if (!node.contains(e.target as Node)) {
          onClose();
        }
      };
      document.addEventListener("mousedown", handlePointerDown, true);
      document.addEventListener("touchstart", handlePointerDown, true);
      return () => {
        document.removeEventListener("mousedown", handlePointerDown, true);
        document.removeEventListener("touchstart", handlePointerDown, true);
      };
    }, [visibility, onClose]);

    // Track overflow to show caret hint inside footer
    useEffect(() => {
      if (visibility !== "visible" || isMp3) return;
      const root = selfRef.current;
      const viewport = root?.querySelector(
        '.popup-scroll-area [data-radix-scroll-area-viewport]'
      ) as HTMLElement | null;
      if (!viewport) return;
      const update = () => {
        const overflowGap = viewport.scrollHeight - viewport.clientHeight;
        // Require a meaningful overflow gap to avoid false-positive hints
        const hasOverflow = overflowGap > 8; // px
        const atBottom =
          viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - 1;
        setShowScrollHint(hasOverflow && !atBottom);
      };
      update();
      viewport.addEventListener('scroll', update, { passive: true } as any);
      const ro = new ResizeObserver(update);
      ro.observe(viewport);
      return () => {
        viewport.removeEventListener('scroll', update as any);
        ro.disconnect();
      };
    }, [visibility, isMp3]);

    useEffect(() => {
      if (isMp3) setShowScrollHint(false);
    }, [isMp3]);

    const sharedPopupStyle: CSSProperties = {
      top,
      left,
      visibility,
      opacity,
      transition: "opacity 0.4s, top 0.2s",
      fontSize: "12px",
      overflow: "hidden",
    };

    const audioPopupStyle: CSSProperties = {
      width: "360px",
      maxWidth: "360px",
      minWidth: "360px",
      resize: "none",
    };

    const textPopupStyle: CSSProperties = {
      width: width,
      maxWidth: "calc(100vw - 24px)",
      height: `${computedMaxHeight}px`,
      maxHeight: `${computedMaxHeight}px`,
      resize: "both",
      // Enforce a true minimum width (250px), allow shrinking to but not below it
      minWidth: "250px",
      minHeight: `${minPopupHeight}px`,
    };

    const popupStyle = isMp3
      ? { ...sharedPopupStyle, ...audioPopupStyle }
      : { ...sharedPopupStyle, ...textPopupStyle };

    return (
      <div
        ref={(node) => {
          selfRef.current = node;
          if (typeof ref === "function") ref(node);
          else if (ref)
            (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
        }}
        className={cn(
          "fixed z-40 overflow-hidden border border-solid rounded-md popup-container bg-background border-border min-h-0 transition-colors hover:border-primary/30 group",
          isMp3 ? "flex flex-col" : "grid grid-rows-[1fr_auto]",
        )}
        onWheelCapture={(e) => {
          if (isMp3) return;
          const scrollEl = selfRef.current?.querySelector(
            '.popup-scroll-area [data-radix-scroll-area-viewport]'
          ) as HTMLElement | null;
          if (!scrollEl) return;
          const canScroll = scrollEl.scrollHeight > scrollEl.clientHeight + 1;
          if (!canScroll) return;
          // Route wheel to the popup content and prevent grid from scrolling
          e.preventDefault();
          e.stopPropagation();
          scrollEl.scrollTop += e.deltaY;
        }}
        style={popupStyle}
      >
        {isMp3 ? (
          <div className="flex flex-col">
            {loadingAudio ? (
              <div className="flex flex-col items-center gap-2 py-4 text-sm">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <span className="text-xs text-muted-foreground">
                  {t("grid.popup.loading_audio")}
                </span>
              </div>
            ) : (
              audioUrl && <AudioPlayer src={audioUrl} ref={audioRef} />
            )}
            <div className="flex flex-none items-center justify-end gap-2 border-t border-border bg-gray-50 px-3 py-2">
              <Button
                size="sm"
                variant="ghost"
                className="h-5 rounded-md text-xs leading-none text-muted-foreground hover:bg-transparent hover:text-primary focus-visible:outline-none focus-visible:ring-0"
                onClick={() => {
                  if (audioRef.current) {
                    audioRef.current.pause();
                  }
                  setAudioUrl(null);
                  onClose();
                }}
              >
                <X className="h-3 w-3 transition-colors" aria-label={t("global.close")} />
              </Button>
            </div>
          </div>
        ) : (
          <>
            <ScrollArea className="popup-scroll-area h-full px-3 pt-1">
              <div
                ref={contentRef}
                className="whitespace-pre-wrap break-words popup-content pb-1"
              >
                {(columnSubType === "multiTag" || columnSubType === "singleTag") &&
                formattedContent !== t("grid.main.cell_clicked_default_value") ? (
                  <div className="flex flex-wrap gap-1">
                    {(() => {
                      const tagColors = getColorForTag(
                        tagsArray as string[],
                      ) as string[];

                      return tagsArray?.map((tag, index) => {
                        const colorName = tagColors[index];

                        return (
                          <Tag key={tag} tag={tag} colorName={colorName}>
                            {tag}
                          </Tag>
                        );
                      });
                    })()}
                  </div>
                ) : (
                  (columnSubType === "multiTag" || columnSubType === "singleTag") &&
                  formattedContent ===
                    t("grid.main.cell_clicked_default_value") && (
                    <span>{t("grid.main.cell_clicked_default_value")}</span>
                  )
                )}
                {isJson ? (
                  <SyntaxHighlighter
                    language="json"
                    style={atomOneLight}
                    customStyle={{
                      padding: "6px",
                      background: "#ffffff",
                    }}
                    className="overflow-auto text-xs leading-snug break-all no-scrollbar"
                  >
                    {formattedContent || ""}
                  </SyntaxHighlighter>
                ) : !isJson &&
                  !isMp3 &&
                  (!columnType || columnType === "noSchema") ? (
                  <div>
                    <div className="whitespace-pre-wrap break-words">
                      {linkifyText(content || "")}
                    </div>
                  </div>
                ) : (
                  !isJson &&
                  !isMp3 &&
                  !columnSubType &&
                  !columnType && (
                    <div className="whitespace-pre-wrap break-words">
                      {linkifyText(content || "")}
                    </div>
                  )
                )}
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
            <div
              ref={footerRef}
              className={`relative flex items-center justify-between gap-2 ${clickedCell?.state === "error" ? "flex-col" : ""} flex-none bg-gray-50 border-t border-border px-3 py-2`}
            >
              {showScrollHint && (
                <div className="pointer-events-none absolute left-1/2 -top-6 -translate-x-1/2 opacity-90 bg-gray-200/70 rounded-sm px-1 py-0.5 shadow-sm animate-pulse">
                  <ChevronDown className="w-4 h-4 text-orange-500" />
                </div>
              )}
              {!isMp3 && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-5 text-xs rounded-md hover:bg-transparent focus-visible:ring-0 focus-visible:outline-none leading-none text-muted-foreground hover:text-primary"
                  onClick={handleCopy}
                  disabled={copied}
                >
                  {copied ? (
                    <span>{t("global.copied")}</span>
                  ) : (
                    <ClipboardCopy className="w-3 h-3 transition-colors" aria-label={t("global.copy")} />
                  )}
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="h-5 text-xs rounded-md hover:bg-transparent focus-visible:ring-0 focus-visible:outline-none leading-none text-muted-foreground hover:text-primary"
                onClick={() => {
                  if (audioRef.current) {
                    audioRef.current.pause();
                  }
                  // Reset URL to refetch for next popup open
                  setAudioUrl(null);
                  onClose();
                }}
              >
                <X className="w-3 h-3 transition-colors" aria-label={t("global.close")} />
              </Button>
            </div>
          </>
        )}
      </div>
    );
  },
);
export default memo(GridPopup);

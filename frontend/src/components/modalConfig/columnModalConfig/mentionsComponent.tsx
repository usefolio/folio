import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  forwardRef,
  KeyboardEvent,
  ChangeEvent,
  FocusEvent,
  useLayoutEffect,
  useMemo,
} from "react";
import ReactDOM from "react-dom";
import getCaretCoordinates from "textarea-caret";
import { debounce } from "@/utils/general";
import { useTranslation } from "react-i18next";
import { Textarea } from "@/components/ui/textarea";
import { Copy, Loader2, Wand2, Undo2 } from "lucide-react";
import {
  TooltipProvider,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import IconButton from "@/components/ui/iconButton";
import {
  MentionsComponentRef,
  MentionsComponentProps,
} from "@/interfaces/interfaces";
import { Doc } from "convex/_generated/dataModel";
import { useDataContext } from "@/context/DataContext";
import { useAccess } from "@/hooks/useAccess";
import { useAction } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import {
  showErrorNotification,
  showSuccessNotification,
} from "@/components/notification/NotificationHandler";
import { useFreshToken } from "@/hooks/useFreshToken";

/**
 * MentionsComponent provides a textarea with @mention functionality for column references
 *
 * This component implements a custom mentions system that:
 * 1. Allows users to type '@' to trigger a dropdown of available columns
 * 2. Transforms selected mentions into {{columnName}} format
 * 3. Provides visual indication of valid/invalid mentions
 * 4. Handles all keyboard navigation and selection within the dropdown
 * 5. Maintains proper positioning of the dropdown relative to the caret
 *
 * The implementation uses a combination of a transparent textarea for input
 * with a styled overlay div to show the highlighted mentions.
 */
const CustomMentionsComponent = forwardRef<
  MentionsComponentRef,
  MentionsComponentProps
>(
  (
    {
      value,
      setValue,
      setPromptOptions,
      setMentionsPopupPosition,
      projectColumns,
      overlayError,
      overlayWarning,
      validColumnNames,
      promptOptionsRef,
      overlayErrorSetter,
      overlayWarningSetter,
      onSend,
      inChat,
      disabled,
      showCopyButton,
    },
    ref,
  ) => {
    const { t } = useTranslation();
    const getToken = useFreshToken();
    const access = useAccess([{ kind: "service", service: "openai" }]);
    const overlayRef = useRef<HTMLDivElement | null>(null);
    const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const dropdownRef = useRef<HTMLDivElement | null>(null);
    const commandListRef = useRef<HTMLDivElement | null>(null);
    const rafIdRef = useRef<number | null>(null);
    // Track whether latest value change came from user typing (vs programmatic)
    const lastInputWasUserRef = useRef(false);
    const isUpdatingOverlayRef = useRef(false);
    const [showDropdown, setShowDropdown] = useState(false);
    const [filterText, setFilterText] = useState("");
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [dropdownPosition, setDropdownPosition] = useState({
      top: 0,
      left: 0,
    });
    const lastMentionStartRef = useRef(-1);
    const [textAreaHeight, _setTextAreaHeight] = useState("auto");
    const atPositionRef = useRef({ atIndex: -1, lineNumber: -1 });
    const heightFrame = useRef<number | null>(null);
    const { loadingColumnsSet } = useDataContext();
    const [originalPrompt, setOriginalPrompt] = useState<string | null>(null);
    const [isEnhancing, setIsEnhancing] = useState(false);
    const enhancePromptAction = useAction(api.prompt.enhance);
    const projectColumnsByName = useMemo(() => {
      const map = new Map<string, Doc<"column">>();
      projectColumns.forEach((col) => {
        map.set(col.name, col);
      });
      return map;
    }, [projectColumns]);
    const handleCopyPrompt = async () => {
      try {
        await navigator.clipboard.writeText(value);
        showSuccessNotification(t("global.copied"), t("global.copy"));
      } catch (error) {
        showErrorNotification(
          t("global.error"),
          t("global.copy_error", {
            error:
              error instanceof Error
                ? error.message
                : t("global.unknown_error"),
          }),
        );
      }
    };
    /**
     * Filter columns based on the current @mention text
     * This enables the typeahead functionality in the dropdown
     */
    const DROPDOWN_W = 224;
    const DROPDOWN_H = 200;
    const VERTICAL_GAP = 24;
    const filteredColumns = projectColumns.filter((col) =>
      col.name.toLowerCase().includes(filterText.toLowerCase()),
    );
    const isColumnLoading = useCallback(
      (column: Doc<"column"> | undefined) => {
        if (!column) return false;
        return loadingColumnsSet.has(column._id);
      },
      [loadingColumnsSet],
    );
    //HTML escape if user types in <sometag></sometag>
    const escapeHtml = (unsafe: string) => {
      return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    };
    /**
     * Adjusts the height of the textarea to match its content
     *
     * This function:
     * - Preserves scroll position and selection during height adjustment
     * - Sets a minimum height for the textarea
     * - Ensures the overlay height matches the textarea
     * - Uses a stateful height value to control the component
     *
     * This is critical for maintaining a consistent UX as text grows
     */
    const adjustTextAreaHeight = useCallback(() => {
      if (!textAreaRef.current) return;
      const ta = textAreaRef.current;

      ta.style.height = "auto";
      let next = ta.scrollHeight;

      // Always allow unlimited growth - parent will handle scrolling
      ta.style.overflowY = "hidden";
      ta.style.height = `${next}px`;

      if (overlayRef.current) {
        overlayRef.current.style.height = ta.style.height;
        overlayRef.current.style.overflowY = "hidden";
      }
    }, []);

    // Manually adjust texarea height to be instant when deleting content from it
    useEffect(() => {
      if (!textAreaRef.current) return;

      const textarea = textAreaRef.current;

      const handleInput = (e: InputEvent) => {
        // Check input type to detect deletions
        if (
          e.inputType &&
          (e.inputType.includes("delete") || e.inputType.includes("backspace"))
        ) {
          // Save state
          const scrollPos = textarea.scrollTop;
          const selStart = textarea.selectionStart;
          const selEnd = textarea.selectionEnd;

          // Queue a reset + recalculation on next frame
          requestAnimationFrame(() => {
            // Reset to minimum height
            textarea.style.height = "80px";

            // Force reflow
            void textarea.offsetHeight;

            // Let natural adjustment happen
            adjustTextAreaHeight();

            // Restore state
            textarea.scrollTop = scrollPos;
            if (document.activeElement === textarea) {
              textarea.setSelectionRange(selStart, selEnd);
            }
          });
        }
      };

      textarea.addEventListener("input", handleInput as EventListener);

      return () => {
        textarea.removeEventListener("input", handleInput as EventListener);
      };
    }, [adjustTextAreaHeight]);
    /**
     * Build overlay markup in a single pass while escaping user-provided text.
     * This avoids flicker and XSS vectors caused by partial rendering.
     */
    const buildOverlayMarkup = useCallback(
      (text: string) => {
        if (!text) {
          return "&nbsp;";
        }

        const mentionRegex = /\{\{(.*?)\}\}/g;
        let lastIndex = 0;
        let result = "";
        let match: RegExpExecArray | null;

        const appendEscaped = (segment: string) => {
          if (!segment) return;
          result += escapeHtml(segment);
        };

        while ((match = mentionRegex.exec(text)) !== null) {
          const [fullMatch, columnName] = match;
          appendEscaped(text.slice(lastIndex, match.index));

          const column = projectColumnsByName.get(columnName);
          const isValid = Boolean(column);
          const isInProgress = column ? loadingColumnsSet.has(column._id) : false;

          const style = (() => {
            if (!isValid) {
              return {
                text: "#991b1b", // red-800 for legibility
                fill: "rgba(254, 226, 226, 0.9)", // red-100 slightly opaque
                stroke: "rgba(248, 113, 113, 0.9)",
              };
            }

            if (isInProgress) {
              return {
                text: "#374151", // gray-700
                fill: "rgba(229, 231, 235, 0.9)", // gray-200
                stroke: "rgba(209, 213, 219, 0.9)",
              };
            }

            return {
              text: "#1f2937", // gray-800
              fill: "rgba(229, 231, 235, 0.92)", // gray-200
              stroke: "rgba(156, 163, 175, 0.85)", // gray-400
            };
          })();

          const spanStyles = [
            `color:${style.text}`,
            `background-color:${style.fill}`,
            `outline:1px solid ${style.stroke}`,
            "outline-offset:0px",
            "border-radius:0.45em",
            "font-weight:inherit",
            "line-height:inherit",
            "padding:0",
            "margin:0",
            "box-decoration-break:clone",
            "-webkit-box-decoration-break:clone",
          ].join(";");

          const braceColor = style.fill;
          const braceSpan = `<span class="mention-chip__brace" style="color:${braceColor}">{{</span>`;
          const closingBraceSpan = `<span class="mention-chip__brace" style="color:${braceColor}">}}</span>`;
          const mentionContent = `${braceSpan}<span class="mention-chip__label">${escapeHtml(columnName)}</span>${closingBraceSpan}`;

          result += `<span class="mention-chip" data-mention-state="${
            isValid ? (isInProgress ? "loading" : "valid") : "invalid"
          }" style="${spanStyles}">${mentionContent}</span>`;
          lastIndex = match.index + fullMatch.length;
        }

        appendEscaped(text.slice(lastIndex));

        return result || "&nbsp;";
      },
      [projectColumnsByName, loadingColumnsSet],
    );

    /**
     * Write the escaped markup to the overlay and sync textarea height.
     */
    const applyOverlayMarkup = useCallback(
      (text: string) => {
        if (isUpdatingOverlayRef.current) return;

        const textarea = textAreaRef.current;
        const overlay = overlayRef.current;

        if (!textarea || !overlay) return;

        isUpdatingOverlayRef.current = true;
        try {
          const markup = buildOverlayMarkup(text);
          if (overlay.innerHTML !== markup) {
            overlay.innerHTML = markup;
          }

          adjustTextAreaHeight();
        } finally {
          isUpdatingOverlayRef.current = false;
        }
      },
      [buildOverlayMarkup, adjustTextAreaHeight],
    );

    const scheduleFrame = useCallback((cb: FrameRequestCallback) => {
      if (typeof requestAnimationFrame === "function") {
        return requestAnimationFrame(cb);
      }
      return (setTimeout(() => cb(Date.now()), 16) as unknown) as number;
    }, []);
    /**
     * Expose methods to parent component through the forwardRef
     *
     * These methods allow the parent to:
     * - Update the overlay directly with new text
     * - Update the overlay safely using requestAnimationFrame for DOM stability
     *
     * This is necessary for coordination between this component and its parent,
     * especially when the parent needs to programmatically update content.
     */
    useImperativeHandle(
      ref,
      () => ({
        updateOverlay: (text: string) => {
          applyOverlayMarkup(text);
        },
        updateOverlaySafely: (text: string) => {
          // Use requestAnimationFrame to ensure DOM stability
          // But still store the current value to avoid stale text
          setValue(text);
          lastInputWasUserRef.current = false;

          scheduleFrame(() => {
            // Double-check if component is still mounted
            if (overlayRef.current && textAreaRef.current) {
              // First reset the textarea height to minimum
              // This ensures proper height recalculation for smaller content
              const textarea = textAreaRef.current;

              // Save current state
              const scrollPos = textarea.scrollTop;
              const selStart = textarea.selectionStart;
              const selEnd = textarea.selectionEnd;
              const hasFocus = document.activeElement === textarea;

              // Reset to minimum height (matching the min-height in CSS)
              textarea.style.height = "80px";

              // Force browser reflow to ensure the height reset takes effect
              void textarea.offsetHeight;

              // Now update overlay with new content
              applyOverlayMarkup(text);

              // Restore scroll position and selection range if needed
              textarea.scrollTop = scrollPos;
              if (hasFocus) {
                textarea.setSelectionRange(selStart, selEnd);
              }
            }
          });
        },
      }),
      [applyOverlayMarkup, scheduleFrame, setValue],
    );
    /**
     * Process text to extract mentions and validate them
     *
     * This function:
     * - Extracts all {{columnName}} patterns from the text
     * - Checks each mention against valid column names
     * - Sets appropriate error/warning messages
     * - Updates the prompt options with the text and valid input columns
     *
     * This is debounced to prevent excessive processing during rapid typing.
     * The validation provides feedback to users about their mentions.
     */
    const processTextForState = useCallback(
      debounce((text: string) => {
        const mentionRegex = /\{\{(.*?)\}\}/g;
        const matches = Array.from(text.matchAll(mentionRegex)) || [];

        const mentions = matches.map((match) => match[0]);

        const invalidMentions = mentions.filter((mention: string) => {
          const columnName = mention.replace(/^\{\{|\}\}$/g, "");
          return !validColumnNames.has(columnName);
        });
        const inProgressMentions = mentions.filter((mention: string) => {
          const columnName = mention.replace(/^\{\{|\}\}$/g, "");
          const column = projectColumns.find((col) => col.name === columnName);
          return column && loadingColumnsSet.has(column._id);
        });

        // When setting the warning message, extract the clean column names without {{}}
        if (inProgressMentions.length > 0) {
          overlayErrorSetter("");

          // Extract just the column names without the {{}} for the warning message
          const cleanColumnNames = inProgressMentions.map((mention) =>
            mention.replace(/^\{\{|\}\}$/g, ""),
          );

          overlayWarningSetter(
            t(
              "modal_manager.column_modal_config.in_progress_mentions_warning",
              {
                inProgressMentions: cleanColumnNames.join(", "),
              },
            ),
          );
        }

        const columnsSet = new Set<string>();
        mentions.forEach((mention) => {
          const match = mention.match(/\{\{(.*?)\}\}/);
          if (match && match[1]) {
            const columnName = match[1];
            if (validColumnNames.has(columnName)) {
              columnsSet.add(columnName);
            }
          }
        });

        if (invalidMentions.length > 0) {
          overlayErrorSetter(
            t("modal_manager.column_modal_config.invalid_mentions_error", {
              invalidMentions: invalidMentions.join(", "),
            }),
          );
          overlayWarningSetter("");
        } else if (inProgressMentions.length > 0) {
          overlayErrorSetter("");
          const clearedColumnNames = inProgressMentions.map((mention) =>
            mention.replace(/^\{\{|\}\}$/g, ""),
          );
          overlayWarningSetter(
            t(
              "modal_manager.column_modal_config.in_progress_mentions_warning",
              {
                inProgressMentions: clearedColumnNames.join(", "),
              },
            ),
          );
        } else {
          overlayErrorSetter("");
          if (!text.trim()) overlayWarningSetter("");
          else if (columnsSet.size > 0) overlayWarningSetter("");
          else
            overlayWarningSetter(
              t("modal_manager.column_modal_config.no_mentions_error_message"),
            );
        }

        setPromptOptions({
          ...promptOptionsRef.current,
          userPrompt: text,
          promptInputColumns: Array.from(columnsSet),
        });
      }, 150),
      [
        loadingColumnsSet,
        validColumnNames,
        overlayErrorSetter,
        overlayWarningSetter,
        setPromptOptions,
        t,
        promptOptionsRef,
      ],
    );

    useEffect(() => {
      processTextForState(value);
    }, [loadingColumnsSet, processTextForState, value]);

    useEffect(
      () => () => {
        processTextForState.cancel();
      },
      [],
    );

    /**
     * Ensure a selected item is visible in the dropdown
     *
     * This function:
     * - Gets the current dropdown and list elements
     * - Finds the currently selected item
     * - Checks if the item is outside the visible area
     * - Scrolls the list to make the item visible if needed
     *
     * This ensures keyboard navigation works properly even with many items.
     */
    const scrollSelectedItemIntoView = useCallback(() => {
      if (!dropdownRef.current) return;

      // Find the dropdown list and selected item
      const listElement = dropdownRef.current.querySelector(".scrollbar-thin");
      if (!listElement) return;

      const selectedItem = listElement.querySelector(
        `[data-index="${selectedIndex}"]`,
      );
      if (!selectedItem) return;

      // Calculate if the selected item is outside visible area
      const listRect = listElement.getBoundingClientRect();
      const itemRect = selectedItem.getBoundingClientRect();

      if (itemRect.bottom > listRect.bottom) {
        // Item is below visible area
        listElement.scrollTop += itemRect.bottom - listRect.bottom;
      } else if (itemRect.top < listRect.top) {
        // Item is above visible area
        listElement.scrollTop -= listRect.top - itemRect.top;
      }
    }, [selectedIndex]);

    /**
     * Get the position of the @ symbol in the textarea
     *
     * This function:
     * - Uses the textarea-caret library to find coordinates
     * - Adjusts for textarea's position and scroll state
     * - Returns viewport-relative coordinates
     *
     * This is essential for positioning the dropdown accurately.
     */
    const getAtSymbolPosition = useCallback(() => {
      if (!textAreaRef.current || atPositionRef.current.atIndex === -1)
        return null;

      const textarea = textAreaRef.current;
      const atIndex = atPositionRef.current.atIndex;

      // Get caret coordinates for the @ character
      const coords = getCaretCoordinates(textarea, atIndex);

      // Adjust for scroll position of textarea
      const rect = textarea.getBoundingClientRect();

      // Return viewport-relative coordinates (for fixed positioning)
      return {
        top: rect.top + coords.top - textarea.scrollTop,
        left: rect.left + coords.left,
      };
    }, []);

    /**
     * Calculate the position of the dropdown based on caret position
     *
     * This function:
     * - Gets the position of the @ symbol
     * - Updates state with the final position
     *
     * This ensures the dropdown appears near the cursor
     */
    const calculateDropdownPosition = useCallback(() => {
      if (
        !textAreaRef.current ||
        !showDropdown ||
        atPositionRef.current.atIndex === -1
      )
        return;

      const caret = getAtSymbolPosition();
      if (!caret) return;

      let top = caret.top + VERTICAL_GAP; // default: below the caret
      let left = caret.left;

      if (top + DROPDOWN_H > window.innerHeight - 8) {
        // flip above, preserving the same 24-px gap
        top = caret.top - DROPDOWN_H - VERTICAL_GAP;
      }
      if (left + DROPDOWN_W > window.innerWidth - 8) {
        left = window.innerWidth - DROPDOWN_W - 8;
      }

      setDropdownPosition({ top, left });
      setMentionsPopupPosition({ top, left });
    }, [showDropdown, getAtSymbolPosition, setMentionsPopupPosition]);
    /**
     * Handle textarea height adjustment with requestAnimationFrame
     *
     * This function:
     * - Cancels any pending animation frame to prevent redundant updates
     * - Schedules a new frame to adjust the height
     *
     * This optimizes performance by batching height adjustments.
     */
    const scheduleHeightAdjust = useCallback(() => {
      if (heightFrame.current != null) {
        cancelAnimationFrame(heightFrame.current);
      }
      // If no frame is pending, execute immediately; otherwise, schedule for the next frame
      if (heightFrame.current === null) {
        adjustTextAreaHeight();
      } else {
        heightFrame.current = requestAnimationFrame(adjustTextAreaHeight);
      }
    }, [adjustTextAreaHeight]);

    // cancel any pending RAF on unmount
    useEffect(
      () => () => {
        if (heightFrame.current != null)
          cancelAnimationFrame(heightFrame.current);
      },
      [],
    );

    /**
     * Handle textarea input changes
     *
     * This function:
     * - Updates the component state with the new value
     * - Checks for @ symbol to trigger the dropdown
     * - Filters dropdown items based on text after @
     * - Handles positioning and visibility of the dropdown
     * - Updates overlay and adjusts height
     *
     * This is the main handler for user input, managing both text updates
     * and the mention functionality.
     */
    const handleTextareaChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
      // Immediately capture the new value and update state to prevent input lag
      const textarea = e.target;
      const newValue = textarea.value;
      const cursorPos = textarea.selectionStart;

      // Mark that the next value change was user-driven
      lastInputWasUserRef.current = true;
      // Update the controlled component value
      setValue(newValue);
      applyOverlayMarkup(newValue);
      // Check if the dropdown should be shown
      const textBeforeCursor = newValue.substring(0, cursorPos);
      const atIndex = textBeforeCursor.lastIndexOf("@");

      if (
        atIndex > -1 &&
        (atIndex === 0 || /\s/.test(textBeforeCursor.charAt(atIndex - 1)))
      ) {
        // Get the text after @ to filter columns
        const mentionText = textBeforeCursor.substring(atIndex + 1);

        // Check if the text is still a potential mention
        const invalidMentionStarterChars = /[@{}/]/;
        const hasInvalidStarters = mentionText.match(
          invalidMentionStarterChars,
        );

        // Always check if there are any matching columns regardless of text length or content
        const hasMatchingColumns = projectColumns.some((col) =>
          col.name.toLowerCase().includes(mentionText.toLowerCase()),
        );

        // Show dropdown based on matching and length criteria
        const MAX_WITHOUT_MATCHES = 50;
        const isExcessivelyLong =
          !hasMatchingColumns && mentionText.length > MAX_WITHOUT_MATCHES;

        if (hasMatchingColumns || (!hasInvalidStarters && !isExcessivelyLong)) {
          setFilterText(mentionText);

          // Only recalculate position if dropdown wasn't already showing
          const wasShowing = showDropdown;

          lastMentionStartRef.current = atIndex;

          // Determine what line the @ is on by counting newlines
          const textUpToAt = newValue.substring(0, atIndex);
          const lineNumber = (textUpToAt.match(/\n/g) || []).length;

          // Store the @ position for later reference
          atPositionRef.current = { atIndex, lineNumber };

          // Reset selection index
          setSelectedIndex(0);

          setShowDropdown(true);
          // Only recalculate position if dropdown wasn't already showing or cursor was moved
          if (!wasShowing) {
            calculateDropdownPosition();
          }
        } else {
          setShowDropdown(false);
        }
      } else {
        setShowDropdown(false);
      }

      // Ensure height is properly adjusted
      scheduleHeightAdjust();
    };

    /**
     * Handle special keyboard events in textarea
     *
     * This function:
     * - Handles arrow keys for navigating dropdown items
     * - Handles Enter/Tab to select a mention
     * - Handles Enter to send chat message if in chat
     *
     * This enables keyboard-only interaction with the mentions dropdown.
     */

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (showDropdown) {
        // ⬇️ keep the existing Arrow / Enter / Tab logic
        switch (e.key) {
          case "ArrowDown":
            e.preventDefault();
            setSelectedIndex((prev) =>
              Math.min(prev + 1, filteredColumns.length - 1),
            );
            return;

          case "ArrowUp":
            e.preventDefault();
            setSelectedIndex((prev) => Math.max(prev - 1, 0));
            return;

          case "Enter":
          case "Tab":
            e.preventDefault();
            if (filteredColumns.length > 0) {
              const col = filteredColumns[selectedIndex];
              if (!isColumnLoading(col)) insertMention(col.name);
            }
            return;
        }
      }
      // ↳ dropdown is *closed* — treat plain Enter as "send"
      if (
        e.key === "Enter" &&
        !e.shiftKey &&
        !e.metaKey &&
        !e.ctrlKey &&
        onSend
      ) {
        e.preventDefault();
        onSend();
      }
    };
    /**
     * Insert a mention at the current cursor position
     *
     * This function:
     * - Replaces the @text with {{columnName}}
     * - Updates the textarea value
     * - Updates the overlay display
     * - Sets the cursor position after the inserted mention
     * - Hides the dropdown
     *
     * This is the core functionality that inserts a selected mention.
     */
    const insertMention = useCallback(
      (columnName: string) => {
        if (!textAreaRef.current) return;

        const textarea = textAreaRef.current;
        const currentValue = textarea.value;
        const cursorPos = textarea.selectionStart;
        const atIndex = lastMentionStartRef.current;

        if (atIndex === -1) return;

        // Replace @mention with {{mention}}
        const before = currentValue.substring(0, atIndex);
        const after = currentValue.substring(cursorPos);
        const mention = `{{${columnName}}} `;
        const newValue = before + mention + after;

        // Update value
        setValue(newValue);
        applyOverlayMarkup(newValue);

        // Update cursor position after the new mention
        const newCursorPos = atIndex + mention.length;

        // Use setTimeout pseudo hook to ensure the textarea is updated before setting selection
        setTimeout(() => {
          if (textAreaRef.current) {
            textAreaRef.current.focus();
            textAreaRef.current.setSelectionRange(newCursorPos, newCursorPos);
          }
        }, 0);

        // Hide dropdown
        setShowDropdown(false);
        atPositionRef.current = { atIndex: -1, lineNumber: -1 };
      },
      [setValue, applyOverlayMarkup, processTextForState],
    );

    /**
     * Function handling textarea focus loss
     *
     * This function:
     * - Delays hiding the dropdown with setTimeout
     * - Checks if focus moved to an ellement within the dropdown
     * - Only hides dropdown if focus moved outside dropdown
     *
     * This prevents the dropdown from closing when clicking on a dropdown item.
     */
    const handleBlur = (_e: FocusEvent<HTMLTextAreaElement>) => {
      // Delay hiding the dropdown to give time for dropdown clicks to register
      setTimeout(() => {
        // Only hide if nothing was clicked in the dropdown
        const activeElement = document.activeElement;
        if (
          activeElement &&
          dropdownRef.current &&
          dropdownRef.current.contains(activeElement)
        ) {
          return;
        }
        setShowDropdown(false);
      }, 150);
    };

    /**
     * Effect: Scroll to selected item when selectedIndex changes
     *
     * This ensures that as the user navigates through the dropdown
     * with keyboard, the selected item is always visible.
     */
    useEffect(() => {
      if (showDropdown) {
        scrollSelectedItemIntoView();
      }
    }, [selectedIndex, showDropdown, scrollSelectedItemIntoView]);

    /**
     * Effect: Update dropdown position when dropdown visibility changes or window resizes
     *
     * This keeps the dropdown correctly positioned relative to the caret
     * even when window size changes or content scrolls.
     */

    const queueDropdownPositionUpdate = useCallback(() => {
      if (rafIdRef.current == null) {
        rafIdRef.current = requestAnimationFrame(() => {
          rafIdRef.current = null;
          calculateDropdownPosition(); // ← existing callback
        });
      }
    }, [calculateDropdownPosition]);

    useEffect(() => {
      if (!showDropdown) return;

      // first render
      queueDropdownPositionUpdate();

      const textarea = textAreaRef.current!;
      textarea.addEventListener("input", queueDropdownPositionUpdate, {
        passive: true,
      });
      textarea.addEventListener("keyup", queueDropdownPositionUpdate, {
        passive: true,
      });
      textarea.addEventListener("paste", queueDropdownPositionUpdate);
      textarea.addEventListener("cut", queueDropdownPositionUpdate);
      textarea.addEventListener("scroll", queueDropdownPositionUpdate, {
        passive: true,
      });

      document.addEventListener(
        "selectionchange",
        queueDropdownPositionUpdate,
        {
          passive: true,
        },
      );

      return () => {
        textarea.removeEventListener("input", queueDropdownPositionUpdate);
        textarea.removeEventListener("keyup", queueDropdownPositionUpdate);
        textarea.removeEventListener("paste", queueDropdownPositionUpdate);
        textarea.removeEventListener("cut", queueDropdownPositionUpdate);
        textarea.removeEventListener("scroll", queueDropdownPositionUpdate);
        document.removeEventListener(
          "selectionchange",
          queueDropdownPositionUpdate,
        );
        if (rafIdRef.current != null) cancelAnimationFrame(rafIdRef.current);
      };
    }, [showDropdown, queueDropdownPositionUpdate]);

    /**
     * Effect: Attach wheel event listener to dropdown when it mounts
     *
     * This prevents scrolling in the dropdown from propagating to parent elements,
     * which would cause unintended scrolling of the page or container.
     */
    useEffect(() => {
      if (!showDropdown || !dropdownRef.current) return;

      // Find the scrollable list element after dropdown is rendered
      const listElement = dropdownRef.current.querySelector(".scrollbar-thin");
      if (listElement) {
        const handleListWheel = (e: Event) => {
          e.stopPropagation();
        };

        listElement.addEventListener("wheel", handleListWheel, {
          passive: false,
        });

        return () => {
          listElement.removeEventListener("wheel", handleListWheel);
        };
      }
    }, [showDropdown]);

    /**
     * Effect: Initial overlay setup
     *
     * This ensures the styled overlay is initialized with the current value and subsequently updates on value changes
     * Also recalculates height of the textarea and styled-overlay when value changes
     */
    useLayoutEffect(() => {
      // Only run heavy overlay styling immediately for non-typing updates
      // Typing path schedules a debounced update instead
      if (!lastInputWasUserRef.current) {
        applyOverlayMarkup(value);
      }
      scheduleHeightAdjust();
    }, [value, applyOverlayMarkup, scheduleHeightAdjust]);

    /**
     * Effect: Create dropdown container on mount
     *
     * This creates a container element in the document for rendering the dropdown
     * via portal, ensuring it can be positioned freely without layout constraints.
     */
    useEffect(() => {
      // Create or find dropdown container in the DOM
      let container = document.getElementById("mentions-dropdown-container");
      if (!container) {
        container = document.createElement("div");
        container.id = "mentions-dropdown-container";
        container.style.position = "fixed";
        container.style.top = "0";
        container.style.left = "0";
        container.style.width = "0";
        container.style.height = "0";
        container.style.overflow = "visible";
        container.style.pointerEvents = "none";
        container.style.zIndex = "9999";
        document.body.appendChild(container);
      }

      return () => {
        if (container && container.parentNode && !container.hasChildNodes()) {
          container.parentNode.removeChild(container);
        }
      };
    }, []);

    /**
     * Effect: Optimize dropdown positioning during scrolling
     *
     * This effect:
     * 1. Throttles position calculations to improve performance
     * 2. Directly updates DOM for smoother animation without re-rendering
     * 3. Maintains dropdown position relative to @ symbol during scrolling
     * 4. Uses both requestAnimationFrame and scroll events for responsive updates
     *
     * The throttling approach ensures smooth visual updates while reducing CPU load,
     * preventing choppy animation when scrolling through large text content.
     */
    // Removed continuous RAF loop for dropdown positioning.
    // Position is updated via event-driven queueDropdownPositionUpdate effect above.

    useEffect(() => {
      return () => {
        // cancel the debounce timeout
        (processTextForState as any).cancel?.();

        // cancel the height-adjust RAF
        if (heightFrame.current !== null) {
          cancelAnimationFrame(heightFrame.current);
        }
      };
    }, [processTextForState]);
    // Enhance Prompt
    const handleEnhancePrompt = async () => {
      if (!value.trim() || isEnhancing) return;
      setIsEnhancing(true);
      if (originalPrompt === null) {
        setOriginalPrompt(value);
      }
      try {
        // Get a token to authenticate the backend request
        const token = await getToken({ template: "convex" });
        if (!token) {
          showErrorNotification(
            t("appWrapper.authentication_error_title"), // Using an existing key
            t("global.authorization_error_message"), // Using an existing key
          );
          throw new Error(t("global.authorization_error_message"));
        }
        const response = await enhancePromptAction({ prompt: value });
        // Update the UI with the response from the backend
        if (response && response.enhancedText) {
          setValue(response.enhancedText);
          lastInputWasUserRef.current = false;
          applyOverlayMarkup(response.enhancedText);
          scheduleHeightAdjust();
        }
      } catch (error) {
        console.error("Error enhancing prompt:", error);
        showErrorNotification(
          t("modal_manager.column_modal_config.enhance_prompt_failed_title"),
          error instanceof Error ? error.message : t("global.unknown_error"),
        );
      } finally {
        setIsEnhancing(false);
      }
    };
    /**
     * Render the dropdown via portal
     *
     * This function:
     * - Creates a dropdown positioned according to current state
     * - Renders it into a portal container for proper layering
     * - Includes event handlers to prevent propagation
     * - Renders filtered columns as selectable items
     *
     * Using portal rendering ensures the dropdown appears above other content.
     */
    const renderDropdown = () => {
      if (!showDropdown) return null;

      const dropdownContainer = document.getElementById(
        "mentions-dropdown-container",
      );
      if (!dropdownContainer) return null;

      return ReactDOM.createPortal(
        <div
          ref={dropdownRef}
          className="mentions-dropdown bg-white shadow-md rounded-md border border-solid border-gray-200 w-56 max-h-[200px] overflow-hidden"
          style={{
            position: "fixed",
            top: `${dropdownPosition.top}px`,
            left: `${dropdownPosition.left}px`,
            pointerEvents: "auto",
            zIndex: 9999,
          }}
          onMouseDown={(e) => {
            // Prevent blur from hiding dropdown while interacting
            e.preventDefault();
          }}
          onWheel={(e) => {
            // Stop wheel events from propagating to prevent parent scrolling
            e.stopPropagation();
          }}
        >
          <Command className="rounded-md w-full">
            <CommandList
              ref={commandListRef}
              className="w-full max-h-[200px] overflow-auto scrollbar-thin"
              onWheel={(e) => {
                // Prevent wheel events from propagating
                e.stopPropagation();
              }}
            >
              {filteredColumns.length === 0 ? (
                <CommandEmpty>
                  {t("modal_manager.column_modal_config.no_columns_found")}
                </CommandEmpty>
              ) : (
                <CommandGroup>
                  {filteredColumns.map((column, index) => {
                    const isInProgress = isColumnLoading(column);
                    return (
                      <CommandItem
                        key={column._id}
                        data-index={index}
                        onSelect={() => {
                          // Only allow selection if not in progress
                          if (!isInProgress) {
                            insertMention(column.name);
                          }
                        }}
                        className={`rounded-md ${selectedIndex === index ? "bg-gray-100" : ""} 
                  ${isInProgress ? "opacity-40 cursor-not-allowed" : "cursor-pointer"} 
                  break-all whitespace-pre-wrap`}
                      >
                        <div className="flex items-center w-full">
                          <div className="flex-1">{column.name}</div>
                          {isInProgress && (
                            <Loader2 className="h-3 w-3 ml-2 animate-spin text-primary" />
                          )}
                        </div>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </div>,
        dropdownContainer,
      );
    };

    /**
     * Main component render
     *
     * This returns:
     * - A container with relative positioning
     * - A styled overlay div that shows colored mentions
     * - A transparent textarea for user input
     * - A dropdown menu portal when @mentions are active
     * - Error messages when applicable
     *
     * The overlay and textarea are layered to appear as a single component.
     */
    return (
      <>
        <div
          ref={containerRef}
          className={`relative w-full mentions-wrapper ${inChat && "border-none"} ${
            overlayError && !inChat
              ? "border border-red-500 focus:border-red-500 focus:ring-red-500"
              : overlayWarning && value && !inChat
                ? "border border-amber-500 focus:border-amber-500 focus:ring-amber-500"
                : "border border-border"
          }`}
        >
          <div className="relative w-full flex-grow">
            {/* Styled overlay for mentions rendering*/}
            <div
              ref={overlayRef}
              className="styled-overlay top-0 absolute w-full h-auto px-3 py-2 text-black pointer-events-none text-sm leading-5 whitespace-pre-wrap break-words z-2 overflow-hidden"
              style={{
                minHeight: "5rem",
                //MacOS fix for misalignment in chat.
                border: `none`, // Invisible border to match textarea
              }}
            ></div>

            <Textarea
              ref={textAreaRef}
              value={value}
              disabled={disabled || isEnhancing}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              onBlur={handleBlur}
              onClick={() => {
                // If the dropdown is open, update its position
                if (showDropdown) {
                  calculateDropdownPosition();
                }
              }}
              className={`w-full whitespace-pre-wrap appearance-none min-h-20 !border-none focus-visible:ring-transparent focus-visible:ring-offset-0 custom-mentions rounded-md relative z-1 px-3 py-2 text-sm leading-5 break-words`}
              placeholder={t(
                "modal_manager.column_modal_config.user_prompt_placeholder",
              )}
              style={{
                height: textAreaHeight,
                resize: "none",
                caretColor: "black",
                overflow: "hidden",
                color: "transparent",
                backgroundColor: "transparent",
              }}
            />

            {/* Render dropdown */}
            {renderDropdown()}

            {!inChat && ((access.ok && !disabled) || showCopyButton) && (
              <div className="flex py-1 items-center h-10 justify-end">
                {originalPrompt !== null && !showCopyButton && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          onClick={() => {
                            if (originalPrompt !== null) {
                              setValue(originalPrompt);
                              lastInputWasUserRef.current = false;
                              applyOverlayMarkup(originalPrompt);
                              setOriginalPrompt(null);
                            }
                          }}
                          size="icon"
                          variant="ghost"
                          className="rounded-md h-8 w-8 mt-1 mr-1"
                        >
                          <Undo2 className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="left">
                        <p>
                          {t(
                            "modal_manager.column_modal_config.undo_enhancement",
                          )}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      {showCopyButton ? (
                        <IconButton
                          onClick={handleCopyPrompt}
                          disabled={!value.trim()}
                          className="mr-1 mt-1"
                          icon={<Copy className="h-5 w-5" />}
                          aria-label={t("global.copy")}
                        />
                      ) : (
                        <Button
                          onClick={handleEnhancePrompt}
                          size="icon"
                          variant="default"
                          disabled={
                            !value.trim() ||
                            (isEnhancing || Boolean(overlayError))
                          }
                          className="rounded-md mr-1 mt-1 h-8 w-8"
                        >
                          {isEnhancing ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                          ) : (
                            <Wand2 className="h-5 w-5" />
                          )}
                        </Button>
                      )}
                    </TooltipTrigger>
                    <TooltipContent side="left">
                      <p>
                        {showCopyButton
                          ? t("global.copy")
                          : t("modal_manager.column_modal_config.enhance_prompt")}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            )}
            {/* Error messages */}
          </div>
        </div>
        {overlayError && (
          <p className="text-red-500 text-sm mt-1">{overlayError}</p>
        )}
      </>
    );
  },
);

export default React.memo(CustomMentionsComponent);

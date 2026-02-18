# Mentions Component Performance Notes

Path: `src/components/modalConfig/columnModalConfig/mentionsComponent.tsx`

## Summary

The Mentions component now renders in a single, fully escaped overlay pass while keeping the dropdown responsive:

- Overlay rendering runs once per change directly from the input handler; there is no longer an "optimistic" vs. "styled" double render.
- All user text is HTML-escaped before being written to `innerHTML`, closing the XSS hole that existed between the optimistic and heavy passes.
- Mention colouring uses a `Map` lookup so valid, invalid, and loading columns are still highlighted without repeatedly iterating the full column array.
- Highlighted mentions now render as pill "chips" with state-specific fill/outline so the `{{column}}` tokens read as inline tags without altering the underlying caret metrics (valid mentions use a neutral gray-on-gray treatment, loading stays muted gray, and invalid remains red).
- Dropdown positioning remains event-driven (no continuous RAF loop) and height adjustments stay coalesced through the existing helpers.

## How It Works Now

- Typing path:
  - Updates `value`, flags the change as user-driven, and immediately renders the escaped overlay.
  - The same helper escapes the entire text, injects mention spans with the appropriate colour, and syncs textarea height.
  - Mention parsing/validation is now triggered from the value-driven effect only, avoiding duplicate debounce work from both the input handler and effect path.

- Programmatic updates:
  - `updateOverlay` calls the same sanitized helper immediately.
  - `updateOverlaySafely` still resets height/selection, but now invokes the single-pass renderer so there is no visual flicker when content shrinks.

- Dropdown positioning:
  - Still event-driven via `queueDropdownPositionUpdate`; only the overlay/textarea rendering changed in this iteration.

## Why This Helps

- Eliminates the race where the optimistic render showed raw HTML before the styled pass sanitized it.
- Keeps per-keystroke work to a single DOM write, so flicker disappears even when pasting large prompts.
- Maintains responsive typing (the helper still runs in-place and avoids redundant layout reads).

## Developer Tips

- When you programmatically change `value`, the component will run the styled overlay in a layout effect. If you need instant UI feedback during bulk updates, you can call the forwarded ref method `updateOverlaySafely` to avoid flicker and allow the component to reconcile height and overlay.
- If you add new event hooks around mentions or dropdown, prefer hooking into the existing `queueDropdownPositionUpdate` instead of adding your own timers/loops.

## Read-only Usage

When rendered with the `showCopyButton` prop, the component displays a copy icon button that copies the current prompt text to the clipboard. This button reuses the shared `IconButton` component for a borderless, square ghost style with an orange hover state, matching the refresh control in the billing sidebar. The **View Prompt** modal uses this to let users copy prompts while keeping the input read-only.

## Shared Overlay Primitive

The column prompt mentions experience still owns its dropdown, validation, and toolbar logic, but the core overlay approach now lives in `src/components/ui/mentionTextarea.tsx`. New mention surfaces can reuse that primitive for caret-safe tagging without reimplementing scroll sync or token wrapping, and we can gradually migrate this component toward it once the remaining column-specific hooks move to a shared layer.

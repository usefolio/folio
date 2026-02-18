# Mention Textarea Overlay

Path: `src/components/ui/mentionTextarea.tsx`

## Summary

`MentionTextarea` renders a native `<textarea>` and mirrors its content into an overlay so mention tokens such as `@alice`, `#triage`, or `{user:123}` can be styled like inline tags without touching the real input. The component:

- Keeps the editable surface 100% native (selection, IME, accessibility stay inside the textarea).
- Mirrors text into a positioned overlay and wraps regex matches in `<span class="mention-token">` elements with rounded backgrounds.
- Syncs scroll offsets so highlights stay aligned while the textarea scrolls.
- Exposes a minimal API: `value`, `onChange(nextValue)`, `tokenPatterns`, and optional `onTrigger(prefix, query, caretRect)` for suggestion popovers.

## API

```tsx
<MentionTextarea
  value={value}
  onChange={setValue}
  tokenPatterns={[ /@[\w]+/g, /#[\w]+/g, /\{[^\s}]+\}/g ]}
  onTrigger={(prefix, query, caretRect) => {
    // prefix is "@" or "#"
    // query includes the characters typed after the trigger with no whitespace
    // caretRect is viewport-relative, ideal for positioning a suggestions popover
  }}
  rows={4}
  placeholder={t("modal_manager.column_modal_config.user_prompt_placeholder")}
/>
```

- `tokenPatterns`: provide one or more `RegExp` instances (without relying on the `g` flag—the component adds it automatically) to flag tokens for highlighting. Patterns run in a single pass across the mirrored text.
- `onTrigger`: fires once the user types `@` or `#` followed by at least one non-space character with the caret still inside the token. Use the `DOMRect` argument to anchor floating suggestion popovers.
- `textareaClassName` / `overlayClassName`: optional overrides for matching bespoke sizing or fonts. Both layers inherit shared padding, font, and line-height so the overlay text lines up with the caret by default.
- Additional native `<textarea>` props (e.g., `placeholder`, `rows`, `disabled`) are forwarded to the input.

## Implementation Details

- The textarea text color is set to transparent (with the caret still visible) so the overlay provides the visible glyphs while the user types. Because the overlay uses `pointer-events: none`, it never steals focus.
- Highlight spans are created with `document.createElement` to avoid unsanitized `innerHTML`; text nodes preserve whitespace and newlines under `white-space: pre-wrap`.
- Scroll sync is handled by translating the overlay content to match `scrollTop`/`scrollLeft`, keeping the highlighted tokens perfectly aligned even for long multi-line entries.

## Tests

- `src/components/ui/mentionTextarea.test.tsx` covers multi-line wrapping, long-token rendering, overlay scroll sync, and `onTrigger` behaviour.
- When adding assertions around caret positioning, hoist shared mocks for `textarea-caret` with `vi.hoisted` so Vitest can initialize them before the `vi.mock` factory runs.

## When to Use

Reach for `MentionTextarea` any time you need inline mention tags but want to avoid `contenteditable` quirks. Existing bespoke implementations (such as the column prompt mentions component) can progressively adopt it to gain the mirrored overlay without reimplementing caret math.

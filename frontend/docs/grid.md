# Grid Performance Guide

This app uses `@glideapps/glide-data-grid` for sheet rendering. To keep scrolling snappy, avoid high‑frequency React state updates during scroll and reflow.

- Avoid state churn: Do not push `visibleRegion` into React state. Track it in a ref inside the grid and do edge detection (near bottom/right) directly in the `onVisibleRegionChanged` callback.
- Popup updates: Only hide the cell popup on scroll when its visibility actually changes. Re-dispatching the same style each frame causes full React re-renders.
- Popup width: Cell popups now keep a minimum width of 250px and expand to the width of the clicked cell if it is wider.
- Audio attachments: Audio cells open in a 360px-wide popup that hugs the player height with no additional padding, keeping controls visible without extra chrome or scrollbars.
- Popup positioning: Popups prefer to open below the cell if there is vertical space; otherwise they open above. They never render to the side, except in the extreme case where you are scrolled fully left and the clicked cell sits at the far right edge—in that case, the popup right-aligns to the cell so it remains under the left neighbor.
- Resizing: Popups are resizable using the native browser corner. Minimum width is preserved, and a minimum height keeps one line of text plus the footer visible. The maximum height is capped by the available text (content + footer + padding), and additionally bounded to roughly 15 lines to avoid overly tall popups.
- First-open sizing: Popup measurements now wait for the content and footer to report real heights, so the very first click renders at the correct size instead of collapsing to the minimum height or drifting away from the target cell.
- First-open alignment: The popup now grabs Glide’s `getBounds` for the clicked cell and seeds the popup style before the first render, so the initial open lines up with the target cell instead of flashing at the far left.
- Default size reset: Each new cell click resets the popup to its default size (column width, auto height) regardless of any prior manual resize.
 - Outside click: Clicking anywhere outside the popup closes it immediately.
- Copy UX: The copy button is icon-only; after clicking it shows “Copied!” briefly.
 - URL linking: Plain-text URLs inside popup content are rendered as clickable links.
// Note: The previous bottom chevron scroll hint is temporarily disabled while investigating an overlay/z-index issue. If needed later, render it inside the footer instead of overlaying the content.
 - Footer styling: Popup footer mirrors the modal topbar’s gray background and thin border (applied at the top), flush with popup edges for a clean reverse-modal look.
- Derived lists: Memoize columns (`gridColumns`) and visible columns via `useMemo` and avoid rebuilding on every render.
- Stable reducer actions: `useGridReducer` memoizes its returned `actions` so the `Grid` prop reference stays stable, enabling `React.memo` to prevent unnecessary re-renders.
- Virtualization: Glide handles virtualization; if column/view counts grow, consider lightening right-side elements or deferring expensive work from draw callbacks.

Complex Grapheme Text

- The grid skips custom wrapping for text containing complex graphemes (emoji, zero‑width joiners/variation selectors) or very long strings. These cases cause expensive `measureText` loops when split character‑by‑character. Falling back to the default renderer keeps scrolling snappy.

Text Measurement Cache

- A tiny LRU cache wraps `measureText` calls to avoid repeated measurement of the same strings. The cache key includes the current canvas `font` and the text. It is capped to 2000 entries to prevent unbounded growth.

See implementation in `src/components/Grid.tsx`.

Loading and Empty-State Gating

- The row pagination hook (`usePaginatedRows`) exposes two flags: `initialLoading` (only before the first page resolves) and `pageLoading` (for subsequent pages).
- `SheetHandler` shows the skeleton only during `initialLoading`, keeping the grid visible while `pageLoading` occurs during scroll-based pagination.
- The empty-sheet overlay appears only after `initialLoading` is false and the server-side counter indicates zero rows.
- Column-level availability is gated via `loadingColumnsSet`, which now inspects the latest job per column. When the freshest job reports `SCHEDULED`, `PENDING`, or `IN_PROGRESS`, the column is marked in-flight so prompts, filters, and the Deep Dive entry stay disabled until processing finishes.
- Failed runs are collected into `failedColumnsSet`. When a column’s newest job ends in `FAILURE`, the grid replaces the spinner with the standard error cell—restyled in gray—and paints a muted, rounded warning badge in the header with a tooltip explaining that the column did not finish processing.

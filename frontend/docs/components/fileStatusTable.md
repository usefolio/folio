# FileStatusTable Component

Path: `src/components/modalConfig/fileStatusTable.tsx`

Purpose: Displays selected files, upload progress, and errors in the New Project modal.

Layout
- Grid columns: icon, name, size, status, remove button.
- Rows have `items-center` for consistent cross-axis alignment.
- The remove (X) button cell uses `flex items-center justify-center` so the icon remains vertically centered regardless of row height.

Accessibility
- The remove button includes an `aria-label` for clarity when using assistive technologies.

Invalid files
- Invalid files are highlighted (e.g., wrong type, extra duplicates) and show a short reason.

Progress
- Uploading files show a compact progress bar with percentage.

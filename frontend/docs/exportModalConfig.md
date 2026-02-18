# ExportModalConfig

- Purpose: Configure which columns and views to include in an export.
- Data sources:
  - Convex action `export_data.fetchAllColumnsAndSheetsForProject` to list exportable columns and views.
  - Optional data warehouse validation via `useBackendClient().listColumns`, which calls the processing backend's `/columns/list` endpoint to enable/disable columns.

## Performance Notes

- Avoid including Convex `useAction` return values in `useEffect` dependency arrays. Their identity can change and retrigger effects, causing repeated fetching and UI thrash.
- We stabilize the action reference with a ref and depend only on `projectId` for the initial load effect. See `src/components/modalConfig/exportModalConfig.tsx`.
- Rendering: The component lists all exportable columns/views. For very large projects, consider virtualizing the lists if necessary.

## UX

- Initial selection: All columns/views are selected, then refined by data warehouse validation (if available).
- Download overlay: When `state.exportDownloadUrl` is set, an overlay shows a link and auto-closes the modal after 5 seconds once clicked.

## i18n

- All visible strings are localized under `modal_manager.export_modal_config.*` in `src/locales/en.json`.


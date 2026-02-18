# Column Modal Configuration

Path: `src/components/modalConfig/columnModalConfig.tsx`

- **Crawl option**: The Crawl enrichment radio is intentionally disabled for now.
  The control now mirrors the other enrichment radios in both styling and hover
  behavior (reduced opacity, consistent border treatment, and `cursor-not-allowed`)
  so it reads as unavailable while remaining in its original position for layout
  consistency.
- **Summary naming**: When the Summarize option is active, selecting a single input
  column automatically fills the new column name with `Summary - <column>` (localized
  via `modal_manager.column_modal_config.summary_column_prefix`). If the user clears
  the selection, the auto-generated name is cleared as well. Users can still override
  the name manually; the auto-fill only runs while the field is blank or still matches
  the default pattern.
- **Tag parsing**: The tag textarea now evaluates both newline and comma delimiters
  and adopts whichever produces the higher number of tags. This lets users paste
  newline-only lists (common from spreadsheets or docs) without manually inserting
  commas, while still preserving the quoted-tag handling for comma-separated input.
- **Tag copy button**: When the modal is opened in read-only mode (showing the
  prompt that produced a column), a copy-to-clipboard icon appears inside the tag
  field's bottom-right corner so the normalized list can be copied directly with
  the detected delimiter.
- **Model availability map**: The allowed LLMs for each prompt variety are defined
  in the `PROMPT_VARIANT_MODEL_MAP` constant near the top of
  `src/components/modalConfig/columnModalConfig.tsx`. Update that shape whenever a
  prompt mode or model is added so the dropdown stays in sync with product copy.

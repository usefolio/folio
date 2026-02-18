Always make sure that you update the documentation when you make changes.

A ton of documentation is inside the README.md file. Then we have a docs folder. Inside that folder we have component-scoped documentation.


## Localization
When adding a string, make sure it is localized. All strings are stored in src/locales/en.json. 

The way strings get localized is something like
```
{t("modal_manager.column_modal_config.gpt_5")}
```

Strings in the localization file are grouped by component or page as you can see.

## Build Verification
After making code changes, run `npm run build` locally to ensure TypeScript and Vite builds complete without errors before considering the task done.

## Adding A Model Provider / Model Type
When you introduce a new LLM provider or model, keep everything in sync so ask/summarize flows and cost estimation keep working.

- Extend the shared enums and helpers in `src/types/types.ts`:
  - Add the model to `LLMModelEnum`.
  - Update `ProviderName`, `MODEL_PROVIDER_MAP`, and `getProviderForModel` so access checks pick up the correct provider id.
  - If the provider needs a friendly name for tooltips, add it to `PROVIDER_DISPLAY_NAMES` via `getProviderDisplayName`.
- Localize the model label in `src/locales/en.json` under `modal_manager.column_modal_config` and reuse the key wherever you surface the model.
- Surface the option in the UI where text-generation prompts are configured (e.g., selectors in `src/components/modalConfig/columnModalConfig.tsx` and `.../schedulingModalConfig.tsx`).
- Update prompts/modals that depend on service credentials (see `src/components/ModalManager.tsx`) so the correct provider is required.
- Capture the addition in the top-level docs: README overview plus any feature-specific guide in `docs/` that references model availability.
- Run `npm run build` to validate TypeScript + Vite.

# Folio

Folio is a desktop app that exposes an MCP (Model Context Protocol) server on `127.0.0.1:8765/mcp`.

## For agents using Folio's tools

Folio must be registered as an MCP server (`claude mcp add --transport http folio http://127.0.0.1:8765/mcp`). Once registered, call its tools by name -- do NOT make raw HTTP requests to the MCP endpoint. The MCP transport is handled automatically.

Available tools: `project_metadata`, `sampler`, `row_sampler`, `request_history`, `column_in_progress_jobs`, `configure_document_classification_enrichment`, `run_prompt`, `run_structured_extraction`, `configure_view_creation_filter`.

## Repository structure

This repo contains Folio's public documentation and Claude Code skills (not the application source code). The app is distributed as compiled binaries via GitHub releases.

- `skills/install/` -- Skill for installing Folio and connecting it as an MCP server
- `skills/sensemaking/` -- Skill for multi-step document review pipelines
- `skills/criteria-search/` -- Skill for criteria-based document evaluation

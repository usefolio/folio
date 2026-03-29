
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/folio_white_horizontal.png" />
    <source media="(prefers-color-scheme: light)" srcset="assets/folio_black_horizontal.png" />
    <img src="assets/folio_black_horizontal.png" alt="Folio" width="380" />
  </picture>
</p>

<h3 align="center">Tabular Document Review with AI</h3>

<p align="center">
  The free desktop alternative to Legora, Harvey and Hebbia.
</p>

<p align="center">
  <img src="assets/demo.gif" alt="Folio demo" width="100%" />
</p>

<!-- <p align="center">
  <a href="#how-it-works">How It Works</a> ·
  <a href="#quickstart">Quickstart</a> ·
  <a href="#roadmap">Roadmap</a> ·
</p> -->

<p align="center">
  <img src="https://img.shields.io/badge/status-early%20alpha-orange" alt="Status: Early Alpha" />
</p>

---

Folio is a desktop app and MCP server for high-stakes document review: legal discovery, financial diligence, compliance, and regulated research. Connect it to Claude Code (or any MCP client) and use AI models to sift through your files and extract relevant insights.

- Curate and search documents at scale. Filter out files that don't fit your criteria.
- Create repeatable workflows for research. Dictate "how to search" not "what to search".
- Synthesize AI insights with rigor. Trace all insights back to the underlying documents.

Most tools in this category (Legora’s Tabular Review, Harvey’s Review Tables and Hebbia’s Matrix) are SaaS-first. Folio runs locally and is highly customizeable.

- Run on your desktop.
- Keep sensitive files inside your environment.
- Use your own API keys for AI vendors.
- Customize to your needs.
- Avoid lock-in.

<!-- <p align="center">
  <img src="" alt="Folio workflow" width="900" />
</p> -->

---

## MCP Integration

Folio runs a local [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server, so AI coding agents like Claude Code can use Folio's tools natively -- no raw HTTP calls needed.

### Quick setup

1. [Download and install Folio](https://github.com/usefolio/folio/releases/latest), then launch it.
2. Register Folio as an MCP server:

```bash
claude mcp add --scope user --transport http folio http://127.0.0.1:8765/mcp
```

3. Start a new Claude Code conversation. Folio's tools (`project_metadata`, `sampler`, `run_prompt`, etc.) will appear as native MCP tools -- call them directly, just like any other tool.

> **Don't curl the MCP endpoint manually.** Once Folio is registered as an MCP server, Claude Code handles the JSON-RPC transport automatically. Use the tools by name.

For detailed setup instructions (platform detection, troubleshooting, port configuration), use the install skill: `/install`.

---
## Extract insights at scale with rigorous processes.

## Search by exclusion
Traditional search is about finding a match to your query. Folio lets you search by exclusion. Categorize your files and then filter down to ones that fit your criteria.

## Systematize your research
Folio lets you define a repeatable "workflow" for your research: retrieve, classify, extract, exclude, retrieve again. Once a workflow is defined, new files can be fed through it automatically.

## Trace results back to documents
Every insight can be traced back to the underlying source document.

---

## Enterprise

For enterprise support, reach out to [![X (Twitter)](https://img.shields.io/badge/@n1babc-000000?style=flat&logo=x)](https://x.com/n1babc)

<p align="center">
  <sub>Built for practitioners who need comprehensive, auditable document review on infrastructure they control.</sub>
</p>

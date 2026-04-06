<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/folio_white_horizontal.png" />
    <source media="(prefers-color-scheme: light)" srcset="assets/folio_black_horizontal.png" />
    <img src="assets/folio_black_horizontal.png" alt="Folio" width="380" />
  </picture>
</p>

<h3 align="center">Agent-Native ETL for Unstructured Data</h3>

<p align="center">
  A local workspace for multi-step extraction pipelines with AI agents.
</p>

<p align="center">
  <a href="https://www.usefolio.ai">Website</a> ·
  <a href="https://www.usefolio.ai">Download for macOS</a>
</p>

<p align="center">
  <img src="assets/demo.gif" alt="Folio demo" width="100%" />
</p>

---

Folio is a local macOS app and MCP server for running structured ETL workflows on large collections of unstructured data.

You import files into a project, each file becomes a row in a table, and then you run bulk LLM operations across rows. Agents do the heavy lifting. Folio gives you the operational surface to steer, validate, and iterate.

## What Folio Solves

Text-only AI interactions are great for quick analysis, but they become fragile once workloads get large:
- You cannot easily observe a multi-step pipeline in a text thread.
- It is difficult to tune one bad step without re-running everything.
- Cost and rate-limit behavior becomes opaque at scale.
- Intermediate outputs are hard to inspect and compare.
- Provenance gets lost when findings are spread across long chats.

Folio addresses those issues by giving agents a table-native ETL workspace with human steering built in.

## The Workflow: Search, Narrow, Fuse

Folio is designed around an iterative loop used in legal, finance, research, and operations workflows.

1. Search
Read and analyze data across the corpus to surface relevant evidence. Search with LLM prompts instead of vector similarity.

2. Narrow
Filter, tag, and slice rows into focused views so expensive operations run only where needed.

3. Fuse
Synthesize structured findings into reports and decision artifacts with source traceability.

## ETL Model in Practice

| Stage | Agent work | Human work | Output |
| --- | --- | --- | --- |
| Ingest | Parse files into a row-based workspace | Choose source files and scope | Queryable dataset |
| Transform | Label, summarize, extract, classify | Approve prompts and cost | New columns with structured data |
| Validate | Return per-row outputs and evidence | Audit edge cases and failures | Grounded, corrected rows |
| Branch | Run deeper operations on filtered subsets | Define views and priorities | Focused analysis branches |
| Load/Export | Produce tabular/report outputs | Decide format and destination | CSV/report-ready deliverables |

## Core Capabilities

### 1. Multi-format ingestion
Folio is built for messy professional data, not just clean text:
- PDFs and scanned PDFs
- Audio/video files (for transcript workflows)
- CSV and Parquet datasets
- Mixed corpora in a single project

### 2. Bulk LLM operations across rows
You can run reusable operations over hundreds or thousands of rows:
- Labeling and classification
- Structured extraction into explicit fields
- Summaries and row-level Q&A
- Criteria-based flags (for example yes/no rubric checks)

### 3. View-based pipeline branching
Instead of one monolithic run, you can branch:
- Create filtered views using SQL-like constraints
- Run deeper steps on targeted subsets
- Keep exploratory and production views separate

### 4. Human approval loop
Operations are proposed before execution so you can:
- Inspect prompts and target row sets
- Evaluate expected spend before committing
- Approve, adjust, or reject work

### 5. Job observability at scale
For large datasets, Folio exposes operational state:
- Row-by-row progress
- Completion and error visibility
- Batch behavior across large workspaces

### 6. Budget-aware execution
Folio emphasizes cost control:
- Pre-run cost estimation
- Spend awareness during pipeline operation
- View-level narrowing to reduce unnecessary token usage

### 7. Grounded outputs
Folio is designed for auditability:
- Findings are attached to rows/documents
- Evidence can be traced to underlying sources
- Pipelines can be re-run and refined instead of treated as one-shot output

## Agent Integration

Folio works with Claude Code, Codex, Cursor, and other agent environments through MCP.

Primary integration pattern:

```bash
claude mcp add --scope user --transport http folio http://127.0.0.1:8765/mcp
```

After registration, start a new conversation so tools load in-session.

If you use a skills-based Claude Code workflow, you may also see the Folio setup path documented as:

```bash
npx skills add usefolio/folio
```

## Architecture and Trust Boundaries

Folio is local-first by design.

1. Local workspace
Documents are stored and managed on your machine.

2. Model/API processing
Inference requests are sent to your configured model provider(s) using your own API keys.

3. Heavy compute offload
Compute-intensive operations such as OCR/transcription fan-out can run via your own Modal account.

4. Data handling model
Folio does not function as a remote SaaS document store. The operating model is local storage with in-transit processing where required by external services.

## Model Strategy

Folio is built as agent infrastructure rather than a single-model product:
- It integrates with agent tooling through MCP.
- It supports provider flexibility through BYO API keys.
- It keeps the workspace and pipeline structure independent from any one model vendor.

## Scaling Behavior and Limits

Folio is designed for large corpora, but throughput depends on your provider and account limits.

Important constraints:
- API rate limits can cap parallel request throughput.
- Higher corpus sizes require tighter prompt and view scoping.
- Failures should be treated as a pipeline concern (retry and isolate), not a one-shot chat failure.

For Anthropic keys, check limits here:
- https://platform.claude.com/settings/limits

## Representative Workloads

Teams currently use Folio for:

1. Customer support analysis
Transcribe and label large call/ticket datasets, isolate high-impact clusters, and generate response-ready summaries.

2. Financial document extraction
Extract revenue metrics, guidance, covenant details, and risk indicators from filings, decks, and transcripts.

3. Legal and compliance review
Tag large contract/case corpora, extract clause-level fields, and maintain evidence-linked outputs for review.

4. Literature and evidence review
Load paper corpora, run criteria-based filtering, and synthesize grounded summary matrices.

5. Criteria-based search at scale
Apply explicit yes/no checks across thousands of documents to build decision-grade subsets.

## Example Pipeline

A typical run on a large corpus:

1. Ingest all files into a new project.
2. Run a first-pass labeling prompt over all rows.
3. Create focused views from labels.
4. Run structured extraction only on relevant subsets.
5. Validate edge rows and re-run weak steps.
6. Synthesize and export final tables/reports.

This pattern avoids paying full-corpus costs for every deep step.

## Quickstart

1. Download Folio from usefolio.ai.
2. Launch the desktop app.
3. Add your model provider API key(s) in Folio.
4. Connect your Modal account for heavy operations.
5. Register Folio as an MCP server in your agent environment.
6. Start a new agent conversation.
7. Create a project and import files.
8. Run a first labeling/extraction pass.
9. Filter to high-value subsets and iterate.
10. Export structured outputs.

## Links

Website: https://www.usefolio.ai

For enterprise support, reach out to [@n1babc on X](https://x.com/n1babc) or [@usefolio_ai on X](https://x.com/usefolio_ai) .

<p align="center">
  <sub>Built for teams that need reliable, auditable ETL pipelines for unstructured data on infrastructure they control.</sub>
</p>

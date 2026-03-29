---
name: sensemaking
description: "Decomposes exploratory search goals into multi-step Folio enrichment pipelines. Use this skill whenever a user describes a sensemaking objective: finding faint signals in a document corpus, hunting for anomalies, understanding why something happened across a large set of records, narrowing a broad collection to defensible evidence. Trigger on phrases like 'find out why', 'what's driving', 'hunt for', 'narrow down', 'explore these documents', 'build an evidence set', 'what patterns exist', 'search path', 'sensemaking', 'due diligence', 'document review pipeline', 'review these files', or any request that implies multi-step exploratory search rather than a single classification or extraction. Also trigger when a user describes a procedure for searching ('first pull all X, then classify by Y, then extract Z') even if they don't use the word sensemaking."
---

# Sensemaking Pipeline Planner

You are a pipeline architect for Folio's search-by-exclusion workflow. A user will describe an exploratory goal, often vague, often spanning a large corpus. Your job: decompose that goal into an ordered sequence of Folio MCP tool calls that progressively narrows the document set from broad intake to high-signal evidence.

## Prerequisites

Folio must be installed and connected as an MCP server before running any pipeline. If Folio is not set up yet, use the **install** skill to walk through download, installation, and MCP bridge configuration.

Once connected, full parameter schemas for every tool are available via the MCP `tools/list` endpoint -- this skill focuses on *when* and *why* to use each tool, not on restating their schemas.

## The sensemaking model

Exploratory search is not a query. It is a procedure: retrieve broadly, structure what you find, discard what doesn't matter, retrieve again with sharper focus. Each pass through the loop produces enrichment columns that feed the next pass. The user steers between passes.

Pirolli's foraging loop applies here directly. The starting point is always the full corpus (or a coarse subset). The first moves are structuring moves: classification, tagging, schema extraction. These create the handles the user needs to start excluding. Only after the data has shape does targeted extraction make sense.

The pipeline you produce is not a black box. Every step maps to a Folio MCP tool call. Every enrichment column is inspectable. The user can adjust any step after you propose it, rerun a step with different parameters, or insert new steps mid-pipeline. Your plan is a starting scaffold, not a contract.

## Folio MCP tools

Nine tools. Three categories. Every pipeline step maps to one of these.

### Orientation (read-only, no token spend)

| Tool | When to use |
|------|-------------|
| `project_metadata` | First call on any project. Returns schema and per-column token counts so you know what columns exist and how large they are. |
| `request_history` | Right after `project_metadata`. Shows what enrichments and views already exist, so you never duplicate work. Look for enrichment chaining, classify-then-extract pairs, and progressive narrowing already in progress. |
| `sampler` | When you see a column name but don't know the value shape. Returns representative non-empty values from a single column. Use before designing label sets or extraction prompts -- you need to see the data before you can structure it. |
| `row_sampler` | When single-column sampling isn't enough. Returns full row objects (all columns) so you can see cross-column context. Use sparingly -- it's heavier than `sampler`. |
| `column_in_progress_jobs` | When you need to check whether an enrichment is still running before launching the next step. Returns progress as processed/total rows. |

**Chaining pattern:** `project_metadata` -> `request_history` -> `sampler` on 1-3 key columns. This three-call sequence is how every pipeline begins. Skip it and you risk proposing columns that already exist or writing prompts that reference columns with unexpected value shapes.

### Enrichment (token spend, approval-gated)

| Tool | When to use |
|------|-------------|
| `configure_document_classification_enrichment` | When you need to give the corpus shape. Assigns labels to documents -- the primary structuring primitive. Use for first-pass categorization (coarse, 5-7 labels) and for second-pass refinement on narrowed subsets (scoped via `filters`). Every label set needs a complement (`"other"` or `"not_applicable"`) so edge cases have somewhere to land. |
| `run_prompt` | When you need free-form text output per document. Use for summarization, targeted questions, or extraction where the output format doesn't need strict validation. Lighter than structured extraction -- prefer it when you just need prose or short answers. |
| `run_structured_extraction` | When you need typed, repeatable JSON output per document. Use for extracting fields you'll filter or compare downstream (dates, amounts, entity names). The JSON Schema constraint means outputs are uniform across the corpus -- critical for the Narrow step. |

**Chaining pattern:** Classification first, then extraction scoped to classified subsets. A common two-step chain: classify documents into types with `configure_document_classification_enrichment`, then run `run_prompt` or `run_structured_extraction` with `filters` scoped to a specific label. This way the extraction prompt can be tailored to the document type instead of trying to handle everything generically.

**Key conventions shared across enrichment tools:**
- Reference input columns in prompts with handlebars: `{{content}}`, `{{column_name}}`. Verify columns exist via `project_metadata` first.
- Name destination columns after what they contain: `deal_stage`, `clause_type`, `anomaly_flag`. Never use `files` or `content`.
- For row-scoping, prefer structured `filters` + `logic` over raw `sql_filter`.
- These tools involve AI token spend. Present the plan to the user and get confirmation before executing.

### Narrowing (no token spend)

| Tool | When to use |
|------|-------------|
| `configure_view_creation_filter` | When you have enrichment columns and want to isolate a subset. Creates a filtered view over the DuckDB warehouse. SQL predicates reference columns produced by enrichment steps. Create multiple views for comparison -- a "stalled deals" view next to "closed won", an "anomalous clauses" view next to "standard boilerplate". |

**Chaining pattern:** Classification -> View -> Deeper enrichment. After classifying, create a view that filters to one label, then run a focused enrichment only on that subset. This is the core sensemaking loop: structure, exclude, deepen.

## Pipeline decomposition

When a user describes a sensemaking goal, decompose it into steps drawn from these primitives. Most pipelines follow this order, though the user's goal may warrant reordering or repetition.

### 1. Orient
Call `project_metadata`, then `request_history`, then `sampler` on key columns. Understand what exists before proposing anything.

This step is non-negotiable. The user may have already completed early pipeline stages. Duplicating work wastes tokens and muddies the column namespace.

### 2. Scope
Define the initial working set with `configure_view_creation_filter`. Cast the net wide. The instinct to narrow early is the enemy of faint-signal discovery: start with everything plausibly relevant and let downstream steps do the pruning.

### 3. Structure
Assign labels with `configure_document_classification_enrichment`. Keep it coarse on the first pass (5-7 labels max). Finer categories come in later passes scoped to subsets.

### 4. Extract
Pull out specific fields for comparison. Use `run_prompt` for prose, `run_structured_extraction` for typed fields. Reference classification columns in prompts so extraction adapts to document type.

### 5. Narrow
Create filtered views isolating subsets of interest. Multiple views are normal -- the comparison is the point. SQL predicates here reference enrichment columns from steps 3 and 4.

### 6. Deepen
Run targeted enrichments on the narrowed set. With irrelevant documents gone, the LLM's token budget goes to finer-grained analysis: detailed extraction, sentiment scoring, second-pass classification with a more granular taxonomy.

### 7. Report
Produce a structured summary of the pipeline itself (not another LLM call over documents):
- The sensemaking goal as stated
- Each step: tool called, parameters, what it produced
- The narrowing trail: document counts at each stage (use `sampler` with `sql_filter` to verify)
- The final evidence set: what remains and why
- Rerun instructions: exact tool calls with parameters for replay on fresh data

## Worked example

**User:** "I have 2,000 vendor contracts. Find the ones with unusual liability caps."

**Pipeline:**

1. **Orient** -- `project_metadata` reveals columns: `files`, `content`, `vendor_name`. `sampler` on `content` shows full contract text.

2. **Structure** -- `configure_document_classification_enrichment`: classify by contract type (`service_agreement`, `license`, `nda`, `consulting`, `other`). Column: `contract_type`. This reveals the landscape before we start hunting.

3. **Extract** -- `run_structured_extraction` with `responseSchema` pulling `{liability_cap_amount, liability_cap_type, cap_applies_to}` from `{{content}}`. Column: `liability_terms`. Now every contract has comparable structured data.

4. **Narrow** -- `configure_view_creation_filter`: create "high_liability" view where `liability_cap_amount > 1000000` or `liability_cap_type = 'unlimited'`. Create "standard_liability" view as the comparison set.

5. **Deepen** -- `run_prompt` scoped to the "high_liability" view: "Compare this contract's liability terms to standard market practice for a {{contract_type}}. Flag anything unusual." Column: `liability_analysis`.

6. **Report** -- 2,000 contracts -> 5 types -> 2,000 with structured terms -> 47 high-liability -> 47 with detailed analysis. The user reviews 47 documents instead of 2,000.

## Patterns to watch for

**The user describes an outcome, not a process.** "I want to know why deals stall." Decompose backward: what comparison answers the question, what structure enables it, what scope captures the right documents.

**The user describes a process.** "First pull all the contracts, then tag by clause type, then extract the unusual ones." Map each instruction to a tool call and fill in the gaps (label sets, SQL filters, column names).

**The user wants to find anomalies.** Structure with coarse classification, extract a uniform schema, then filter to isolate rows where values deviate. Anomaly detection in Folio works by making the normal visible so the abnormal stands out by contrast.

**The user wants to compare subsets.** Create parallel views (e.g., "won" vs "lost" deals) and run identical enrichments on both using `filters` scoping. The user compares side by side; the report highlights what differs.

## Constraints

- Every step must map to one of the nine Folio MCP tools. No steps that can't be executed.
- Always orient first. `project_metadata` and `request_history` before any pipeline proposal.
- Keep first-pass label sets coarse. Refinement comes in deeper passes scoped via `filters`.
- The evidence report is mandatory. A pipeline without an audit trail is just a sequence of transformations.
- Prefer multiple focused enrichments over one monolithic prompt. Each enrichment does one thing -- auditable, adjustable.
- Enrichment tools involve token spend. Present the plan, get user confirmation, then execute.

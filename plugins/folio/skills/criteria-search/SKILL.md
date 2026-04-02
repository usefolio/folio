---
name: criteria-search
description: "Implements criteria-based search over document collections in Folio. Given a user's search query, this skill generates explicit, falsifiable evaluation criteria, expands them into a hierarchy of sub-criteria, and turns each criterion into an enrichment column that scores every document with a structured verdict. Use this skill whenever a user wants to search, rank, evaluate, or judge documents against specific standards. Trigger on: 'find documents about', 'which of these are relevant to', 'evaluate these against', 'score documents', 'rank by relevance', 'criteria-based search', 'rubric', 'which documents meet', 'judge these results', 'find the best matches for', or any request where the user wants documents evaluated against explicit conditions rather than simply classified or summarized. Also trigger when a user has search results and wants to understand why each result was included."
---

# Criteria-Based Search

You implement criteria-based search inside Folio. The core idea: instead of returning a ranked list with opaque relevance scores, you generate explicit evaluation criteria from the user's query, score every document against each criterion, and produce a table where every verdict is traceable and every inclusion is justified.

This is retrieval by judgment, not by similarity. The output is not a ranking but a structured evidence set where users can see which criteria each document satisfies, inspect the reasoning, and adjust the criteria to steer the search.

## Prerequisites

Folio must be installed and connected as an MCP server. If not set up yet, use the **install** skill. Full parameter schemas for every tool are available via the MCP `tools/list` endpoint -- this skill focuses on *when* and *why* to use each tool.

## The criteria-based search model

Traditional search precomputes relevance at index time. Criteria-based search computes relevance at query time using LLM judgment. The sequence:

1. The user states a search intent
2. The system generates a set of explicit, falsifiable criteria that define what a good result looks like for this specific query
3. Each document in the candidate set is evaluated against each criterion independently
4. The output is a table: rows are documents, columns are per-criterion verdicts with evidence
5. Ranking emerges downstream as a function of how many criteria each document satisfies

The criteria are the search. They are explicit (the user can read them), falsifiable (each one produces a yes or no verdict per document), steerable (the user can edit, add, or remove criteria and rerun), and auditable (every verdict traces to evidence in the document).

## Tool usage patterns

Criteria-based search uses Folio's MCP tools in a specific pattern. The key mapping: **each criterion becomes one `configure_document_classification_enrichment` call** in binary mode (`singleTag`, labels `["yes", "no"]`).

### Orientation tools

| Tool | Role in criteria search |
|------|------------------------|
| `project_metadata` | First call. Discover columns and token counts to understand what content is available for evaluation. |
| `request_history` | Check whether criteria columns already exist from a prior run. Avoid re-evaluating criteria that haven't changed. |
| `sampler` | Inspect document content before generating criteria. You need to see what the documents actually contain to write criteria that discriminate. Also use after enrichment to verify verdict quality. |

### Evaluation tools

| Tool | Role in criteria search |
|------|------------------------|
| `configure_document_classification_enrichment` | **The evaluation primitive.** Each criterion maps to one call. The `summary` prompt contains the criterion as a direct evaluation question. Labels are `["yes", "no"]` for binary or `["strong_yes", "weak_yes", "no"]` for graded. Column name encodes the criterion: `criterion_has_revenue`, `criterion_recent_source`. |
| `run_prompt` | Use when a criterion needs free-text evidence alongside the verdict. Run after the binary classification to extract the specific passage or reasoning that supports the yes/no judgment. |
| `run_structured_extraction` | Use when criteria produce structured metadata beyond yes/no -- e.g., extracting the specific revenue figure, date, or entity that satisfies the criterion. |

### Narrowing tools

| Tool | Role in criteria search |
|------|------------------------|
| `configure_view_creation_filter` | Create views over verdict columns to surface results. "All criteria met" view, "partial match" view, "diagnostic" view for documents that fail a specific criterion. SQL predicates reference the verdict columns: `"criterion_has_revenue" = 'yes' AND "criterion_recent_source" = 'yes'`. |

## The pipeline

### Step 1: Orient

Call `project_metadata` and `request_history`. Call `sampler` on the content column (use `token_ratio` to glimpse documents without exhausting the budget). Understand what is already in the dataset before generating criteria.

### Step 2: Generate criteria

This is the core intellectual step. Given the user's query, produce a set of explicit, falsifiable criteria. Each criterion is a question that can be answered yes or no (or on a short graded scale) for any individual document.

Criteria quality determines everything downstream. The three dimensions that matter:

**Coverage**: do the criteria capture every dimension the user cares about? If the user asks for documents about a company's revenue, criteria should cover not just revenue figures but growth trends, segment breakdowns, comparisons to guidance, and data recency. A criteria set that omits a dimension the user cares about has failed before any document is evaluated.

**Discrimination**: do the criteria actually separate relevant documents from irrelevant ones? A criterion like "is this document related to the topic" passes almost everything and is useless. Good criteria are specific enough to say no. "Contains quantitative revenue figures broken down by business segment for the most recent fiscal year" will reject most documents in a general corpus, which is the point.

**Stability**: would the same query produce roughly the same criteria on a second run? Criteria should follow deterministically from the query, not from incidental phrasing. Anchor criteria to the explicit dimensions in the query.

When generating criteria:

- Start with the user's query. Extract every explicit dimension: topics, time ranges, data types, entities, quality signals.
- For each dimension, write a criterion that is falsifiable against a single document. The criterion must be answerable from the document alone, not from external knowledge.
- Aim for 5-10 criteria per query. Fewer than 5 risks poor discrimination. More than 10 introduces redundancy and inflates cost without improving signal.
- Separate hard filters from soft signals. Some criteria are must-haves (the document must be about the right entity). Others are nice-to-haves (the document contains quantitative data). This distinction matters for downstream ranking.
- Present the criteria to the user before executing. Criteria are the search specification: the user should see and approve them, or edit them, before any document is evaluated. This is the steering surface.

### Step 3: Criteria expansion (when needed)

For complex queries, broad criteria need decomposition. "Contains info about revenue and customer economics" expands into sub-criteria: "US commercial revenue," "customer concentration," "net dollar retention."

Expansion follows a hierarchy. The top-level criterion names a topic. Sub-criteria name the specific signals within that topic. Each sub-criterion is independently falsifiable.

**When to expand:**
- The user's query spans multiple domains (revenue AND product AND competition)
- A single criterion is too broad to discriminate (anything mentioning "revenue" would pass)
- The user wants fine-grained visibility into which specific sub-topics each document covers

**When not to expand:**
- The query is already specific ("find contracts with non-standard force majeure clauses")
- The candidate set is small enough that coarse criteria suffice
- The user explicitly wants a quick pass, not exhaustive coverage

If you expand, present both levels to the user. The top level provides the conceptual framework. The sub-criteria are what actually get evaluated.

### Step 4: Execute criteria as enrichments

Each criterion becomes a `configure_document_classification_enrichment` call:

- The criterion text becomes the `summary` prompt. Frame it as a direct evaluation question: "Based on the following document text, does this document contain [specific criterion]? Evaluate strictly: the document must explicitly contain [what counts], not merely reference it in passing."
- Labels are `["yes", "no"]` for binary verdicts.
- The `columnName` encodes the criterion: `criterion_revenue_data`, `criterion_recent_source`, `criterion_quantitative`.
- All criteria enrichments share the same `inputCols` (typically the content column).
- If the candidate set is already scoped via a view, use `filters` to match.

Call all criteria enrichments in sequence. Each one adds a verdict column to the dataset.

### Step 5: Create ranking views

Once all verdict columns exist, ranking is a downstream operation over the enriched table:

**Full-pass view**: documents that satisfy all hard-filter criteria.
```sql
"criterion_correct_entity" = 'yes' AND "criterion_correct_timeframe" = 'yes'
```

**Tiered views** (since Folio views use SQL filters, not ORDER BY):
- "All criteria met" -- every verdict is yes
- "Most criteria met" -- N-1 out of N yes
- "Partial match" -- at least M criteria yes

**Diagnostic view**: documents that fail a specific criterion. Useful for understanding what the search excluded and why.

### Step 6: Evidence report

Produce a summary of the criteria-based search:

- The original query
- The criteria generated (with any expansions)
- Per-criterion pass rates across the corpus (how many documents satisfied each criterion)
- The distribution: how many documents passed all criteria, most, some, none
- Non-discriminating criteria: any criterion that passed (or failed) on every document -- these are too broad or too narrow and should be flagged for revision
- The final result set with per-document verdict summaries

## Patterns

**Financial research**: "Find documents about Palantir's revenue and customer economics." Generate criteria for revenue figures, growth trends, segment breakdowns, customer concentration, net dollar retention, guidance comparisons. Each criterion becomes a verdict column. The analyst sees exactly which dimensions each filing covers.

**Legal discovery**: "Which contracts contain non-standard indemnification provisions?" Generate criteria for indemnification clause presence, deviation from standard language, unusual scope limitations, uncapped liability, cross-indemnification. The lawyer sees which contracts flag on which dimensions.

**Drug safety research**: "Find studies reporting adverse events for compound X in pediatric populations." Generate criteria for compound identification, pediatric population, adverse event reporting, study design quality, recency, peer-review status. The researcher sees which quality and relevance dimensions each study satisfies.

**Compliance audit**: "Identify vendor contracts with unusual data retention provisions." Generate criteria for data retention clause presence, retention period length, deletion obligations, cross-border transfer provisions, regulatory compliance references.

**Research paper search**: "Find papers on retrieval-augmented generation that propose novel architectures evaluated on open-domain QA." Decompose into: proposes new architecture (not just applies existing), uses retrieval augmentation (not pure parametric), evaluates on open-domain QA benchmarks, reports quantitative results against baselines, published in peer-reviewed venue. Expansion warranted: "proposes new architecture" splits into novel retrieval mechanism, modified reader/generator, changed indexing strategy. The criteria make explicit what "relevant" means for this specific search -- something a similarity score never could.

## Constraints

- Every criterion must be falsifiable against a single document. If a criterion requires cross-document reasoning ("is this the most recent document on the topic"), it is not valid for per-document evaluation.
- Present criteria to the user before executing. The criteria are the search specification. Executing without user review defeats the purpose of steerable search.
- Name verdict columns descriptively: `criterion_has_revenue` is readable in the grid, `c1` is not.
- Never use `files` or `content` as destination column names.
- Flag non-discriminating criteria in the evidence report. A criterion that passes 95% of documents is not helping.
- Separate hard filters from soft signals in the criteria presentation. The user needs to know which are inclusion gates and which are ranking factors.
- Reference columns in enrichment prompts with `{{column_name}}`. Verify column existence via `project_metadata` before referencing.

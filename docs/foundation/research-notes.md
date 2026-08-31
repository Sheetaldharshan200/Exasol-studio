# Exasol Studio Research Notes

Related documents:

- [requirements.md](./requirements.md)
- [architecture.md](./architecture.md)
- [llm-wiki.md](./llm-wiki.md)

## 1. Research Scope

This note captures the source-grounded research pass used to build the documentation suite. The uploaded `SKILL.md` was treated as the primary source map for Exasol repositories, ecosystem tools, and agentic integration patterns.

## 2. Primary Sources Reviewed

### Official Exasol Documentation

- Main Exasol docs: `docs.exasol.com/db/latest/home.htm`
- AI build agents docs
- Ask your database docs
- AI GitHub resources
- Virtual Schemas docs
- Lakehouse Turbo docs
- driver documentation for JDBC, ODBC, Rust, and WebSockets API

### Official Exasol GitHub Repositories

- `exasol/mcp-server`
- `exasol/exasol-personal`
- `exasol/docker-db`
- `exasol/virtual-schemas`
- `exasol/cloud-storage-extension`
- `exasol/exasol-testcontainers`
- `exasol/exasol-driver-ts`
- `exasol/websocket-api`
- `exasol/extension-manager`

### Exasol Labs Repositories

- `exasol-labs/exasol-vscode`
- `exasol-labs/exapump`
- `exasol-labs/exarrow-rs`
- `exasol-labs/exasol-json-tables`
- `exasol-labs/exasol-scheduler`
- `exasol-labs/exasol-agent-skills`
- `exasol-labs/exasol-labs-text2sql-mcp-server`

## 3. Key Findings

- Exasol now has a credible agentic toolchain story centered on MCP Server, agent-building docs, and governance-oriented patterns.
- The Exasol ecosystem clearly differentiates between official repositories and Labs/community tooling. The product and its docs must preserve that distinction.
- There is enough ecosystem maturity to justify building Exasol Studio as a serious platform, but not enough signal to treat every adjacent repo as a stable runtime dependency.
- The strongest technical foundation for the desktop product is still a product-owned shell and orchestration layer, not a wrapper around existing tools.

## 4. Gaps and Inconsistencies Identified

- `SKILL.md` is rich on ecosystem inventory but intentionally light on product-specific architecture decisions. This suite fills that gap.
- Some Labs repositories are highly relevant but should be treated as inspiration, optional integrations, or reference implementations rather than mandatory architectural pillars.
- The source material does not prescribe a single connectivity strategy for a desktop product with strong streaming, cancellation, and safety needs.
- The source material does not fully define support expectations for every listed ecosystem integration.
- Exasol's ecosystem overview lists the Rust crate as community-maintained and not officially supported by Exasol, so Rust-native adoption requires a deliberate support and coverage validation spike.

## 5. Inferred Decisions

The following decisions are inferred rather than directly specified:

- Exasol Studio remains Exasol-first rather than multi-database-first.
- A dedicated connectivity boundary is preferred over direct database calls from the UI layer.
- AI is designed as a governed action layer with reviewable outputs, not a free-form autonomous operator.
- Plugin seams should exist early, while public marketplace behavior waits until APIs and permission boundaries mature.

## 6. Recommendations

- Validate the Rust-native connectivity layer early with a prototype focused on authentication, TLS, large result streaming, cancellation, and metadata coverage.
- Treat Exasol MCP Server as a first-class integration and design influence for agent workflows.
- Reuse ideas from `exasol-vscode`, but do not overfit the desktop architecture to the constraints of a code-editor extension.
- Keep Labs integrations clearly labeled in docs, product settings, and future marketplace surfaces.
- Add source refresh checkpoints to release planning so ecosystem assumptions do not silently drift.

## 7. Review Notes

- Completeness check: sources, findings, gaps, inferred decisions, and recommendations are covered.
- Consistency check: aligns with the support-level heuristics and architecture decisions in the rest of the suite.

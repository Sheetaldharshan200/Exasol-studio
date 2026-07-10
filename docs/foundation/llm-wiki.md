# Exasol Studio LLM Wiki

Related documents:

- [README.md](./README.md)
- [requirements.md](./requirements.md)
- [architecture.md](./architecture.md)
- [agent.md](./agent.md)

## 1. Project Overview

`Exasol Studio` is a desktop-native Exasol workbench for developers, DBAs, analysts, architects, and AI-assisted workflows. It is not a generic SQL editor and not a thin browser app packaged inside Tauri.

Primary product themes:

- Exasol-first workflows
- desktop-native UX
- AI assistance with governance
- enterprise-ready extensibility

## 2. Repository Summaries

This foundation assumes a future repository containing:

- desktop app source
- Rust orchestration crates
- connectivity service
- shared packages
- tests
- docs and ADRs

## 3. Exasol Repository Knowledge Base

The uploaded `SKILL.md` is the primary ecosystem map. Use the following support model consistently:

- `github.com/exasol`: official Exasol-maintained repositories
- `github.com/exasol-labs`: Labs/community/prototype repositories, support level must be verified
- vendor docs outside Exasol: third-party ecosystem integrations

### Most Relevant Repositories for Exasol Studio

#### Official

| Repository | Link | Why it matters |
|---|---|---|
| `exasol/mcp-server` | `https://github.com/exasol/mcp-server` | governed agent-facing access and diagnostics reference |
| `exasol/exasol-personal` | `https://github.com/exasol/exasol-personal` | local and demo deployment path |
| `exasol/docker-db` | `https://github.com/exasol/docker-db` | disposable local database environment |
| `exasol/extension-manager` | `https://github.com/exasol/extension-manager` | extension lifecycle reference |
| `exasol/virtual-schemas` | `https://github.com/exasol/virtual-schemas` | federation and external access patterns |
| `exasol/cloud-storage-extension` | `https://github.com/exasol/cloud-storage-extension` | object-storage file workflows |
| `exasol/exasol-testcontainers` | `https://github.com/exasol/exasol-testcontainers` | integration test harness reference |
| `exasol/exasol-driver-ts` | `https://github.com/exasol/exasol-driver-ts` | TypeScript/JavaScript driver option |
| `exasol/websocket-api` | `https://github.com/exasol/websocket-api` | protocol reference for product-owned Rust-native driver implementation |

#### Labs

| Repository | Link | Why it matters |
|---|---|---|
| `exasol-labs/exasol-vscode` | `https://github.com/exasol-labs/exasol-vscode` | developer UX reference implementation |
| `exasol-labs/exapump` | `https://github.com/exasol-labs/exapump` | CLI import/export and file movement reference |
| `exasol-labs/exarrow-rs` | `https://github.com/exasol-labs/exarrow-rs` | Arrow/native Rust performance reference |
| `exasol-labs/exasol-json-tables` | `https://github.com/exasol-labs/exasol-json-tables` | JSON workflow reference |
| `exasol-labs/exasol-scheduler` | `https://github.com/exasol-labs/exasol-scheduler` | auditable SQL-native scheduling pattern |
| `exasol-labs/exasol-agent-skills` | `https://github.com/exasol-labs/exasol-agent-skills` | coding-agent guidance reference |
| `exasol-labs/exasol-labs-text2sql-mcp-server` | `https://github.com/exasol-labs/exasol-labs-text2sql-mcp-server` | experimental governed text-to-SQL reference |

#### Community

| Project | Link | Why it matters |
|---|---|---|
| `exasol` Rust crate | `https://crates.io/crates/exasol` | community-maintained Rust connectivity option; verify support and feature coverage before adopting |

## 4. Coding Standards

- keep architecture boundaries explicit
- prefer typed contracts over stringly-typed commands
- minimize coupling between UI and infrastructure
- document non-obvious trade-offs in ADRs
- redact secrets everywhere
- treat AI and plugin writes as review-required by default

## 5. Development Workflow

1. start from `tasks.md`
2. confirm requirement and architecture impact
3. implement smallest safe slice
4. validate locally
5. update docs when behavior or structure changes
6. record architectural decisions in ADRs when needed

## 6. Architecture Explanations

### Why Tauri and Rust?

The product needs a native desktop shell, secure local integrations, and reliable performance. Tauri and Rust keep the host boundary explicit and suit a security-sensitive desktop tool.

### Why a Driver Service Boundary?

Large result streaming, cancellation, and driver isolation are easier to manage when database connectivity is separated from the webview-facing shell.

### Why Exasol-First?

The business goal is to beat generic tools by being deeply aligned with Exasol workflows, not by becoming another broad database client.

## 7. Common Workflows

### Core Query Workflow

- connect to Exasol
- browse or search for an object
- open SQL console scoped to connection and schema
- execute selection or statement
- inspect result, plan, history, and AI guidance

### AI Review Workflow

- request AI action
- review context scope
- inspect generated patch or SQL
- approve or reject
- log result and provenance

### Import Workflow

- pick source
- validate and map
- generate plan or SQL
- run as job
- inspect completion and failures

## 8. Troubleshooting

### If a source claim looks stale

- check the official Exasol docs first
- check whether the repo is under `exasol` or `exasol-labs`
- verify whether the capability is official, Labs, or third-party

### If architecture decisions seem to drift

- inspect ADRs
- compare `requirements.md` and `architecture.md`
- update traceability before broadening scope

### If an AI workflow feels unsafe

- check provider policy
- check redaction behavior
- ensure review mode is enabled
- confirm environment is not production without explicit approval

## 9. Frequently Asked Questions

### Is Exasol Studio a generic database IDE?

No. The current foundation is intentionally Exasol-first.

### Are Labs repositories treated as production dependencies?

Not automatically. Labs projects are inputs, references, or optional integrations and must be labeled accordingly.

### Does AI execute SQL autonomously?

No. Generated SQL is reviewable and risky operations require approval.

### Can Studio support local AI?

Yes. The architecture expects provider-neutral AI, including local-model scenarios.

## 10. Design Decisions to Remember

- public plugin marketplace is not MVP
- native desktop behavior is part of the product, not polish
- result streaming and spooling are core architecture concerns
- official and Labs Exasol tooling must be distinguished everywhere
- semantic grounding is preferred over free-form text-to-SQL guessing

## 11. Best Practices

- prefer primary sources
- document decisions once and reference them
- keep UI calm and dense
- isolate risky work behind policies and review
- validate large-data workflows early

## 12. Future Roadmap Highlights

- shared workspaces and collaboration
- enterprise policies and approval flows
- extension SDK
- visual modeling and richer administration
- semantic layer and metadata enrichment

## 13. AI Agent Usage Guidelines

- follow [agent.md](./agent.md)
- update `tasks.md` when scope changes
- write ADRs for architectural shifts
- never treat hidden context as durable knowledge

## 14. Review Notes

- Completeness check: overview, repositories, standards, workflow, architecture, troubleshooting, FAQ, decisions, best practices, roadmap, and agent usage are covered.
- Consistency check: wiki matches the support heuristics and Exasol-first scope used across the rest of the suite.

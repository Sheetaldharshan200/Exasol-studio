# Exasol Studio Requirements

Related documents:

- [README.md](./README.md)
- [design.md](./design.md)
- [architecture.md](./architecture.md)
- [tasks.md](./tasks.md)
- [agent.md](./agent.md)
- [llm-wiki.md](./llm-wiki.md)

## 1. Purpose

Define the product, business, technical, and delivery requirements for `Exasol Studio`, a desktop-native Exasol development, administration, and AI-assisted operations environment.

## 2. Business Goals

- Establish Exasol Studio as the preferred daily IDE and operations workspace for Exasol users.
- Reduce dependence on generic SQL clients for Exasol-specific workflows.
- Improve developer, DBA, and analyst productivity through Exasol-aware workflows and AI assistance.
- Create a durable product foundation that can support commercial packaging, enterprise governance, and future extensibility.
- Position Exasol Studio as the front door for Exasol's AI, extension, and ecosystem capabilities.

## 3. Technical Goals

- Deliver a fast, cross-platform desktop application using React, TypeScript, Tauri, and Rust.
- Provide Exasol-first development and administration workflows with strong safety controls.
- Support multiple connection modes, including local development and managed Exasol environments.
- Integrate official Exasol ecosystem building blocks where appropriate, especially MCP Server, drivers, IMPORT/EXPORT flows, Virtual Schemas, and AI agent patterns.
- Build a plugin-ready architecture without overcommitting to a public marketplace in the MVP.
- Provide a governed AI action layer that supports local and remote model providers.

## 4. Functional Requirements

### FR-1 Connection and Workspace Management

- Users can create, test, save, group, favorite, and label Exasol connections.
- Users can persist workspace layouts, open files, open query consoles, favorites, and recent activity.
- Secrets must be stored in the OS keychain, not in plain-text workspace files.
- The application must support separate safety modes for development, staging, and production connections.

### FR-2 Exasol Object Exploration

- Users can browse schemas, tables, views, scripts, virtual schemas, connections, users, roles, sessions, and relevant system objects.
- Explorer navigation must support filtering, search, favorites, recents, and context actions.
- Object nodes must expose DDL preview, metadata summary, dependencies, and privilege information when available.
- Unsupported generic database concepts must not be shown unless a capability layer confirms support.

### FR-3 SQL Editing and Execution

- Users can create SQL consoles, scratch files, saved SQL files, and SQL notebooks.
- The SQL editor must support syntax highlighting, schema-aware completion, diagnostics, quick fixes, formatting, multi-cursor editing, and history.
- Users can execute statements, selections, scripts, and explain actions with cancellation support.
- Result sets must be streamed, virtualized, exportable, and recoverable after transient UI issues.

### FR-4 Results, Diagnostics, and Monitoring

- Users can inspect query results, errors, execution plans, query history, active sessions, locks, and long-running operations.
- Users can open a Query Cockpit view that correlates SQL, result metadata, runtime statistics, plan information, and AI guidance.
- Users can export results and generated artifacts with explicit metadata about source query and destination.

### FR-5 Import, Export, and External Data Workflows

- Users can build guided import/export flows for common Exasol-supported paths.
- The product must generate and explain IMPORT/EXPORT statements where appropriate.
- The product should surface relevant Exasol ecosystem options from `SKILL.md`, including Virtual Schemas, Cloud Storage Extension, Lakehouse Turbo, `exapump`, and `exarrow-rs`.
- File-based flows must support preview, mapping, validation, and recovery information.

### FR-6 AI Assistance

- Users can invoke AI from the chat sidebar, editor, explorer, results, plans, errors, and command palette.
- AI must support SQL generation, explanation, optimization, error diagnosis, documentation generation, dependency explanation, and migration drafting.
- AI actions must disclose context scope, provider, model, and whether raw data is being sent externally.
- Destructive or environment-changing AI actions require user approval and visible generated SQL or instructions.

### FR-7 Extensibility

- The architecture must support future plugins for AI providers, visualizations, import/export adapters, inspector panels, and theming.
- The initial implementation must define extension boundaries, permission contracts, and versioning expectations.
- Public marketplace capability is explicitly out of MVP scope.

### FR-8 Administration and Governance

- Users can review sessions, roles, privileges, and selected governance metadata.
- The application must classify execution risk and warn on destructive or production-sensitive operations.
- The product should support future managed policy controls for enterprise deployments.

### FR-9 Documentation and Developer Enablement

- The repository must include clear architecture, delivery, and agent documentation.
- Future human and AI contributors must be able to bootstrap without hidden project context.

## 5. Non-Functional Requirements

### Performance

- Cold start target: less than 2.5 seconds to interactive shell on a typical developer workstation.
- Warm start target: less than 1 second to restored shell.
- Editor typing and UI interactions must stay within a 16ms frame budget under normal load.
- Large result grids and explorer trees must rely on virtualization and incremental loading.

### Reliability

- Workspace recovery must preserve unsaved editor content, layout state, and recent operational context.
- Long-running jobs must survive transient UI failures without losing backend job state.
- Driver-side failures must be isolated from the desktop shell where possible.

### Security

- Secrets must be stored in the OS keychain or equivalent secure store.
- Local logs, exports, AI prompts, and crash artifacts must redact secrets.
- The application must enforce least-privilege and human approval gates for risky actions.
- Plugin and agent operations must be permissioned and auditable.

### Accessibility

- The product must target WCAG 2.2 AA.
- All primary workflows must be keyboard-operable.
- Visual state must not depend on color alone.

### Maintainability

- Components must be organized by bounded feature areas.
- Shared types and contracts must be explicit across frontend, Rust core, and driver layers.
- Core workflows must be testable in isolation and through end-to-end automation.

### Scalability

- The architecture must handle large metadata estates and large result sets without assuming all data fits in webview memory.
- The design must support future multi-window, plugin, enterprise policy, and collaboration layers.

## 6. User Stories

- As a SQL developer, I want schema-aware completion and fast query execution so that I can iterate without switching tools.
- As a DBA, I want clear production safety controls and session visibility so that I can operate confidently.
- As a data engineer, I want guided import and export flows so that I can move data safely and repeatably.
- As an analyst, I want AI to explain unfamiliar schemas and SQL errors so that I can become productive faster.
- As an architect, I want dependencies, DDL, and migration drafts so that I can govern change across environments.
- As an enterprise administrator, I want policy hooks and audited AI/provider behavior so that the product can be adopted safely.

## 7. Acceptance Criteria

### Product Foundation Acceptance

- The documentation suite exists, is cross-linked, and is internally consistent.
- Requirements map to design, architecture, and delivery tasks.
- At least one documented architecture path exists for secure Exasol connectivity, AI integration, and plugin extensibility.

### MVP Acceptance

- A user can connect to Exasol, browse objects, edit SQL, execute queries, view results, cancel execution, and inspect errors.
- A user can recover the previous session after restart.
- A user can configure at least one local or remote AI provider and invoke approved AI actions.
- The product can generate or guide import/export workflows using Exasol-native concepts.

### Governance Acceptance

- Production-marked connections trigger safety UX.
- Secret material is not persisted in plain-text project files.
- AI and plugin actions expose provenance and permissions.

## 8. Assumptions

- The project target is `Exasol Studio`, based on the existing product specification in this workspace.
- `SKILL.md` is treated as the canonical map of the Exasol extension ecosystem and agent-adjacent tooling.
- Exasol Studio will initially focus on Exasol rather than generic multi-database support.
- The product can bundle or orchestrate a driver-side process if required for stable connectivity.
- The product can store non-secret workspace metadata locally.

## 9. Constraints

- Use only supported or clearly labeled Labs/community integrations from the Exasol ecosystem.
- Avoid unsupported claims about support level, stability, or production readiness for Labs projects.
- Do not assume every generic database management action maps cleanly to Exasol capabilities.
- Desktop shell technology is fixed to React, TypeScript, Tauri, and Rust for this foundation.

## 10. Risks

- Exasol connectivity and advanced feature support may depend on the chosen driver architecture.
- The product can become overly broad if it tries to replicate every feature of all competitors in the MVP.
- AI assistance can introduce governance, privacy, and trust risks without strict approval and provenance mechanisms.
- Some Exasol Labs projects may evolve faster than the Studio integration plan.
- Rich desktop UX can regress into a web-app-in-a-shell if native capabilities are not used intentionally.

## 11. Dependencies

### Internal Dependencies

- Stable shared contracts across frontend, Rust core, and driver integration layer.
- Local workspace state store and result spooling strategy.
- Secure credential integration.

### Exasol Ecosystem Dependencies

- Official Exasol docs and drivers
- Exasol MCP Server
- Exasol VS Code extension patterns
- Exasol Personal and Docker DB for local development/testing
- Exasol Testcontainers or equivalent test harnesses
- Virtual Schemas, Cloud Storage Extension, Lakehouse Turbo, `exapump`, `exarrow-rs`, and related ecosystem references

### External Technology Dependencies

- Tauri v2
- Monaco editor
- SQLite
- Selected AI provider SDKs or HTTP integrations

## 12. Future Requirements

- Public extension SDK and marketplace
- Shared team workspaces
- Policy-managed enterprise deployment
- Visual schema designer and ERD editing
- Agent routines and approvals
- SaaS/platform administration integrations
- Deeper change-management integration with Terraform, dbt, Sqitch, and scheduler workflows

## 13. Requirements Traceability Summary

| Requirement Area | Design Coverage | Architecture Coverage | Delivery Coverage |
|---|---|---|---|
| Connection/workspace | [design.md](./design.md) sections 3, 5, 8 | [architecture.md](./architecture.md) sections 2, 4, 8 | [tasks.md](./tasks.md) Epics 1 and 2 |
| SQL/editor/results | [design.md](./design.md) sections 4, 5, 9 | [architecture.md](./architecture.md) sections 3, 4 | [tasks.md](./tasks.md) Epics 2 and 3 |
| Import/export/external data | [design.md](./design.md) sections 5 and 7 | [architecture.md](./architecture.md) sections 5 and 7 | [tasks.md](./tasks.md) Epic 4 |
| AI assistance | [design.md](./design.md) sections 6 and 8 | [architecture.md](./architecture.md) sections 4 and 6 | [tasks.md](./tasks.md) Epic 5 |
| Extensibility/governance | [design.md](./design.md) sections 6, 8, 10 | [architecture.md](./architecture.md) sections 6, 7, 9 | [tasks.md](./tasks.md) Epics 5 and 6 |

## 14. Review Notes

- Completeness check: functional, non-functional, business, technical, and future requirements are covered.
- Consistency check: requirement language matches the project scope defined in the existing product specification.
- Improvement applied: generic database-client wording was replaced with Exasol-first language to align with the source material and reduce ambiguity.


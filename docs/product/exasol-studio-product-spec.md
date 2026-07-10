# Exasol Studio Product Specification

Date: 2026-06-30

Prepared from:

- Master prompt attached in Codex.
- `/Users/sheetaldharshan.a/Downloads/DESIGN.md`, a reconstructed Exasol brand and style system.
- Current official product and documentation sources listed in "Sources Consulted".

## 1. Executive Summary

Exasol Studio should be a desktop-native development and administration environment built specifically for Exasol. It should not feel like a generic SQL editor with an Exasol connection option. Its advantage should come from four commitments:

1. Exasol-first workflows for schemas, tables, views, scripts, virtual schemas, connections, IMPORT/EXPORT, system tables, privileges, sessions, query history, performance diagnostics, and SaaS/cloud operations.
2. A native-feeling desktop shell with durable workspaces, fast startup, resizable and dockable panels, command-driven workflows, keyboard access, and multi-monitor support.
3. AI as an action layer woven through the editor, object explorer, results grid, monitoring, import/export, errors, and administration. Chat is one surface, not the product.
4. A durable platform architecture: React and TypeScript for the interface, Tauri and Rust for desktop and orchestration, an Exasol driver service for connectivity, secure local storage, a typed command bus, and a permissioned plugin model.

The strongest competitor pattern is DataGrip's IDE depth plus VS Code/Cursor-style command and agent workflows, with TablePlus-level visual restraint and Navicat-level workflow breadth. The opportunity is to exceed them by being dramatically better at Exasol-specific work: context-aware SQL, one-click diagnostics, safe production workflows, fast metadata navigation at enterprise scale, AI-assisted performance investigation, and import/export flows that know Exasol's strengths and constraints.

## 2. Product Vision

Exasol Studio is the preferred daily workspace for anyone building, tuning, operating, or understanding Exasol systems.

The product should help users answer these questions quickly:

- What exists in this Exasol environment?
- Where is the object, query, error, dependency, session, or permission I need?
- What is safe to run right now?
- Why is this query slow or failing?
- How do I move data in or out reliably?
- How do I make a change without accidentally harming production?
- What can AI do for me in this exact database context?

The long-term product should become an Exasol platform cockpit: database IDE, operations console, AI partner, observability surface, migration assistant, documentation generator, and extensible workspace.

## 3. Product Philosophy

Core principles:

- Desktop-first: use native menus, dialogs, keychains, notifications, file associations, window restoration, and OS conventions.
- Exasol-first: avoid a generic cross-database object model where it hides Exasol concepts.
- Keyboard-first: every action has a command, every command can have a shortcut, every panel is reachable without a pointer.
- Progressive disclosure: default to a quiet, focused workspace; reveal advanced controls through context, command palette, and inspectors.
- Non-destructive by default: preview scripts, require production confirmations, support rollback plans where possible, and preserve local recovery state.
- AI with user control: AI proposes, explains, reviews, and automates only behind clear approvals and audit trails.
- Performance as UX: metadata loading, results rendering, search, cancellation, and workspace restore must feel immediate even against large installations.
- Accessibility as a baseline: WCAG 2.2 AA, visible focus, screen-reader structure, high contrast, reduced motion, and scalable UI density.

## 4. Critical Evaluation of `DESIGN.md`

`DESIGN.md` is useful as a brand source, but it appears reconstructed from Exasol's public marketing website. A desktop database studio needs a more utilitarian design language.

Recommended adaptations:

- Keep the core brand: deep teal `#002E40`, signal green `#5FC33B`, white surfaces, Inter as the main UI font, and restrained enterprise tone.
- Do not use marketing-page scale in the app shell. `museo-sans` display typography can appear in welcome, empty, onboarding, and release-note surfaces, but dense IDE screens should use Inter or the system UI stack.
- Reduce product chrome radius. The source system uses 15px cards, but a professional database IDE should use 4px to 8px radii for panes, grids, trees, tabs, and buttons. Large card radii can make operational tools feel soft and imprecise.
- Reserve signal green for positive primary actions, successful state, and one focal CTA per surface. Do not use green as generic decoration.
- Add semantic and data-visualization palettes. The brand palette lacks warning, danger, info, neutral ramps, and categorical chart colors needed for query plans, monitoring, diagnostics, and data profiling.
- Treat dark theme as first-class, not an inverted afterthought. Many database professionals work in dark IDEs for long sessions.
- Do not overuse cards. The main product should be a dense, dockable workspace with panels, splitters, tabs, grids, trees, and inspectors.

Recommended product corrections to the master prompt:

- "Create Database" and "Drop Database" should be split between Exasol SQL capabilities and platform/SaaS administration. Exasol Studio should not imply unsupported SQL object operations.
- Object explorer must be capability-aware. Items such as materialized views, triggers, and indexes may not map cleanly to Exasol the same way they do in other systems. Show Exasol-native object types first, then expose generic or future driver-plugin types only when supported.
- A public plugin marketplace should not ship in the MVP. Build internal extension seams early, then public SDK and marketplace after APIs stabilize.
- AI should not be positioned as magic. It should expose provenance, schema scope, safety checks, cost controls, and whether data or metadata leaves the machine.

## 5. Competitive Analysis

### DataGrip

Strengths: deep IDE model, schema-aware completion, inspections, quick fixes, refactoring, diagrams, schema diff, data compare, import/export, local history, run configurations, keymaps, plugin ecosystem, and AI query explanation/generation.

Weaknesses: can feel heavy, generic across engines, administrative workflows vary by driver, UI density can be intimidating, and Exasol-specific workflows are not the product center.

Lesson: match the SQL intelligence and IDE discipline, exceed it with Exasol-native diagnostics, workflows, and AI actions.

### DBeaver

Strengths: broad database support, mature Eclipse-style workbench, navigator, projects, secure storage, import/export, dashboards, mock data, data editor panels, driver breadth, and enterprise/team editions.

Weaknesses: broadness creates complexity, visual polish is inconsistent, discoverability can suffer, startup and UI responsiveness can feel workbench-heavy, and AI is not the main interaction model.

Lesson: borrow breadth selectively, but ship a calmer Exasol-specific experience with better defaults.

### DbVisualizer

Strengths: cross-database client, focused SQL editor, visual query builder, AI assistant, explain-plan visualization, result charts, export, version control, and simpler mental model than heavier IDEs.

Weaknesses: less deeply integrated than a dedicated vendor-native studio, fewer platform-level Exasol workflows, and limited agentic automation.

Lesson: make routine database work simple, then add Exasol-specific expert depth where it matters.

### pgAdmin

Strengths: strong PostgreSQL administration, object dialogs, query tool, view/edit data, schema diff, ERD, PSQL, process watcher, backup/restore, and pgAgent.

Weaknesses: PostgreSQL-specific, web-app feel, lower desktop-native polish, and less keyboard/AI-centered than modern IDEs.

Lesson: vendor-specific depth wins. Exasol Studio should be for Exasol what pgAdmin is for PostgreSQL, but more desktop-native and AI-native.

### TablePlus

Strengths: native feel, speed, low visual noise, inline edit, safe mode, quick open, tabs/windows, history/favorites, streaming results, keyboard shortcuts, and restraint.

Weaknesses: intentionally limited scope, less administrative depth, plugin system is immature, and AI is not central.

Lesson: keep the daily UI as fast and focused as TablePlus, while offering advanced capabilities through panels, commands, and workspaces.

### Navicat Premium

Strengths: broad workflow coverage: AI assistant, Ask AI actions, object designer, data profiling, import/export, data generation, visual explain, models, BI dashboards, data dictionary, synchronization, automation, collaboration, secure connections, and native apps.

Weaknesses: feature breadth can feel suite-like rather than IDE-like, pricing and edition complexity, and generic multi-database design can dilute engine-specific excellence.

Lesson: Navicat defines the broad capability bar. Exasol Studio can win by making these capabilities feel coherent and Exasol-aware.

### SQL Server Management Studio

Strengths: comprehensive administration, object explorer, query editor, execution plans, performance tools, BI administration, security management, and now GitHub Copilot preview in SSMS 22.

Weaknesses: Windows-centric, visually legacy, not a modern cross-platform desktop experience, and tied to Microsoft SQL infrastructure.

Lesson: professional DBAs expect deep admin tooling. Exasol Studio should match the seriousness while feeling modern on macOS, Windows, and Linux.

### Azure Data Studio

Strengths: modern editor, IntelliSense, snippets, Git, terminal, dashboards, extensions, charting, notebooks, object explorer, cross-platform footprint.

Weaknesses: retired as of February 28, 2026. It was also thinner than SSMS for deep administration.

Lesson: VS Code-like database UX has demand, but lifecycle ownership matters. Exasol Studio should avoid becoming a thin extension shell with uncertain product direction.

### Oracle SQL Developer

Strengths: end-to-end Oracle environment: worksheet, DBA console, reports, data modeler, migrations, PL/SQL IDE, performance/security/storage administration, SQLcl companion, and browser-based Database Actions.

Weaknesses: Oracle-specific legacy feel, Java app weight, and AI experience is less central than modern coding tools.

Lesson: a vendor-native studio should combine development, administration, modeling, loading, and migration rather than stop at query editing.

### Visual Studio Code

Strengths: command palette, activity bar, extension ecosystem, integrated terminal, source control, flexible layout, AI agents, MCP, custom instructions, permissions, sandboxing, and enterprise policies.

Weaknesses: database support depends on extensions, UX can fragment, and it is not database-first.

Lesson: borrow the workbench model, command grammar, extension seams, and agent governance, but optimize the core around database objects and query execution.

### Cursor

Strengths: agent-first coding, cloud agents, CLI, code review, semantic search, background work, multi-agent collaboration, and a product surface designed around handing off tasks.

Weaknesses: software-code domain, not database administration; agent autonomy can be risky when mapped directly to production databases.

Lesson: Exasol Studio should support database agents, but with stricter permissions, dry runs, role checks, production safety, and SQL execution approvals.

### GitHub Copilot

Strengths: editor chat, agent mode, model choice, custom and third-party agents, MCP, IDE/CLI/GitHub/project-tool integration, cloud agents, and centralized agent work tracking.

Weaknesses: code-first, database context depends on integrations, and production data safety is outside the main product model.

Lesson: Exasol Studio should bring the same "assistant where you work" model to database tasks.

### Claude Code and Claude Desktop

Strengths: reads codebases, edits files, runs commands, terminal/IDE/desktop/browser surfaces, visual diff review, recurring tasks, multiple sessions, MCP, memory, hooks, custom skills, and agent teams.

Weaknesses: development-agent focus, can overfit to code workflows, and direct database mutation needs extra guardrails.

Lesson: adopt multi-surface agent patterns, sessions, memory, and scheduled routines, but make database privileges, data privacy, and approvals first-class.

### OpenCode

Strengths: open source AI coding agent, terminal/IDE/desktop availability, multi-session support, many model providers, local-model compatibility, LSP integration, and privacy-first positioning.

Weaknesses: engineering-code focus, early desktop beta, and less mature enterprise governance than larger platforms.

Lesson: local and provider-neutral AI support is now table stakes for developer tools.

## 6. Feature Comparison Matrix

Legend: Strong = mature/core, Medium = present but limited or generic, Weak = absent or not a focus, N/A = not applicable.

| Capability | DataGrip | DBeaver | DbVisualizer | pgAdmin | TablePlus | Navicat | SSMS | Azure Data Studio | Oracle SQL Developer | VS Code/Cursor/Copilot/Claude/OpenCode | Exasol Studio Target |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Native desktop feel | Medium | Medium | Medium | Weak | Strong | Strong | Medium | Medium | Medium | Medium | Strong |
| Exasol-specific depth | Medium | Medium | Medium | N/A | Weak | Weak | N/A | Weak | N/A | Weak | Strong |
| SQL editor intelligence | Strong | Medium | Medium | Medium | Medium | Medium | Medium | Medium | Strong | Strong for code | Strong |
| Schema-aware completion | Strong | Medium | Medium | Medium | Medium | Medium | Medium | Medium | Strong | Weak for DB | Strong |
| Object explorer | Strong | Strong | Medium | Strong | Medium | Strong | Strong | Medium | Strong | Weak for DB | Strong |
| Import/export | Strong | Strong | Medium | Medium | Medium | Strong | Strong | Medium | Strong | Weak | Strong |
| Admin operations | Medium | Strong | Medium | Strong | Weak | Strong | Strong | Weak | Strong | Weak | Strong |
| Monitoring | Medium | Medium | Medium | Medium | Weak | Medium | Strong | Medium | Strong | Weak | Strong |
| ER/modeling | Medium | Medium | Medium | Medium | Weak | Strong | Medium | Weak | Strong | Weak | Strong later |
| AI inline/editor | Medium | Medium | Medium | Weak | Weak | Strong | Medium | Medium | Weak | Strong | Strong |
| AI agent workflows | Weak | Weak | Weak | Weak | Weak | Weak | Weak | Medium | Weak | Strong | Strong with DB guardrails |
| Plugin ecosystem | Strong | Medium | Weak | Medium | Weak | Weak | Weak | Strong but retired | Weak | Strong | Medium MVP, Strong later |
| Keyboard productivity | Strong | Medium | Medium | Medium | Strong | Medium | Medium | Strong | Medium | Strong | Strong |
| Production safety | Medium | Medium | Weak | Medium | Medium | Medium | Strong | Medium | Strong | Weak | Strong |
| Workspace persistence | Strong | Strong | Medium | Medium | Medium | Strong | Medium | Strong | Medium | Strong | Strong |
| Visual polish | Medium | Medium | Medium | Weak | Strong | Medium | Weak | Medium | Weak | Strong | Strong |

## 7. How Exasol Studio Can Exceed Competitors

Exasol Studio can exceed competitors by avoiding the generic-tool trap. The core differentiators should be:

- Exasol-aware metadata graph: objects, privileges, dependencies, virtual schemas, scripts, connections, sessions, and statistics are indexed into a local graph for instant search and AI context.
- Query cockpit: editor, results, history, plan, runtime stats, errors, locks, session context, and AI explanation live together.
- Production safety layer: environment labels, read-only mode, destructive action previews, risk scoring, required approvals, and operation history.
- AI action fabric: the same AI command can appear inline, in context menus, command palette, result grid, explain plan, monitoring alerts, and object explorer.
- Import/export excellence: guided workflows that generate Exasol-native IMPORT/EXPORT statements, explain prerequisites, recommend secure connection objects, and monitor progress via sessions.
- Desktop performance: virtualized metadata trees and result grids, streaming results, background indexing, cancellation, and local recovery.
- Provider-neutral AI: OpenAI, Codex, Claude, Gemini, GitHub Copilot, Ollama, LM Studio, OpenRouter, Azure OpenAI, custom OpenAI-compatible APIs, MCP, and future plugins.
- Extensible but governed: stable APIs, signed plugins, permissions, and enterprise policy.

## 8. User Personas

| Persona | Goals | Pain points | Daily workflows | Productivity challenges |
|---|---|---|---|---|
| DBA | Keep systems healthy, secure, performant | Hidden lock/session issues, slow manual admin, fear of destructive changes | Monitor sessions, permissions, imports, exports, users, roles | Needs fast diagnostics and safe production tooling |
| SQL Developer | Write, test, refactor SQL | Weak completion, fragmented history, context switching | Build queries, inspect schemas, compare results, debug errors | Needs schema-aware editing and quick object navigation |
| Backend Developer | Validate app database behavior | Does not live in DB tools all day | Open recent connection, run query, inspect data, export fixtures | Needs simplicity, snippets, Git-friendly files |
| Data Engineer | Load, transform, validate data | Import/export syntax complexity, cloud credential safety | IMPORT/EXPORT, staging tables, quality checks, job monitoring | Needs guided flows, retries, observability |
| Data Scientist | Explore data and generate datasets | SQL friction, lack of notebooks, limited profiling | Query, sample, profile, export to Python/R tools | Needs notebooks, charts, AI explanation |
| BI Developer | Understand schemas and metrics | Hard to trace dependencies and definitions | Explore views, test queries, document datasets | Needs lineage, data dictionary, favorites |
| Architect | Govern data model and evolution | Schema drift, poor documentation | Review ERDs, dependencies, migration scripts | Needs compare, diagrams, generated docs |
| Analyst | Answer questions quickly | SQL confidence, connection complexity | Natural-language query drafts, result export, charting | Needs safe AI help and discoverable workflows |
| Beginner | Learn Exasol | SQL errors, unfamiliar object model | Connect, browse, run samples, understand errors | Needs guided onboarding and friendly explanations |
| Enterprise Team Admin | Manage standards and access | Inconsistent settings and unsafe local credentials | Roll out policies, providers, plugins, telemetry choices | Needs managed configuration and auditability |

## 9. User Journeys

1. First connection: user opens Studio, chooses Exasol SaaS, Exasol Personal, or manual connection, tests credentials, saves secrets to OS keychain, picks workspace profile, and lands in a live explorer.
2. Daily query: user opens quick switcher, jumps to a favorite schema, creates a SQL console scoped to a connection/schema, gets schema-aware completion, executes selection, sees streamed results, pins result tab, and saves query to project.
3. Debug failed SQL: error appears inline with diagnostic; user invokes "Explain and fix"; AI uses SQL, error, schema, and Exasol docs context; user reviews patch and applies it into editor.
4. Performance investigation: user runs query with plan collection, opens Query Cockpit, sees plan, runtime, session stats, row counts, and AI summary; Studio suggests low-risk rewrites and what to verify.
5. Import data: user drags a CSV/Parquet file, wizard samples and profiles it, maps columns, recommends table DDL, generates secure IMPORT flow, monitors progress, and shows rejected rows.
6. Export data: user selects result/table, chooses target, previews row limits and sensitive columns, generates EXPORT, runs in background, and records artifact metadata.
7. Production change: user edits object, Studio marks environment as Production, generates DDL diff, explains risk, requires typed confirmation or approval policy, executes, and records audit entry.
8. Explore unfamiliar schema: user opens schema summary, sees hot tables, recent queries, dependencies, row counts, documentation status, and AI-generated orientation.
9. Permission review: DBA selects user/role, sees effective privileges, object access matrix, risky grants, and generated remediation script.
10. Recovery after crash: Studio reopens windows, tabs, unsaved scratch files, running operation logs, and query history exactly where the user left off.

## 10. Information Architecture

Primary shell:

- Native menu bar: File, Edit, View, Navigate, Run, Database, Tools, AI, Window, Help.
- Top toolbar: workspace selector, connection selector, schema selector, run/cancel, transaction mode, environment badge, search, command palette, AI action, notifications.
- Activity bar: Explorer, Search, SQL, Data, Import/Export, Monitor, AI, Projects, Extensions, Settings.
- Left side bar: contextual tree or search panel based on activity.
- Center editor area: tabbed editors, SQL consoles, notebooks, object designers, diagrams, dashboards.
- Right side bar: AI assistant, inspector, object details, query plan details, properties.
- Bottom panel: results, output/logs, query history, tasks/jobs, problems, terminal-like command output where appropriate.
- Status bar: connection status, current user/schema, transaction mode, autocommit, row limit, elapsed time, memory/result spool status, AI provider, background jobs, sync state.

Relationships:

- Activity bar changes the primary left panel, not the whole app.
- Command palette can invoke every top-menu, toolbar, context-menu, and AI action.
- AI actions inherit context from the focused surface: SQL selection, object, result grid, error, plan, session, or import job.
- Search spans local files, query history, metadata cache, settings, commands, and optionally data search when a connection is active.
- Favorites, recents, and history are global concepts surfaced in explorer, command palette, and welcome.
- Notifications are actionable and link to jobs, errors, updates, approvals, and recovery.

## 11. Navigation Hierarchy

Top-level hierarchy:

1. Workspace
2. Connections
3. Projects and files
4. Database objects
5. Editors and consoles
6. Results and jobs
7. Monitoring and administration
8. AI sessions and actions
9. Settings and extensions

Explorer hierarchy:

- Workspace
  - Connections
    - Connection group
      - Connection
        - Schemas
          - Schema
            - Tables
            - Views
            - Scripts/UDFs
            - Functions and procedures where supported
            - Virtual schemas
            - Connections
            - Privileges
        - Users and roles
        - Sessions
        - System tables
        - Statistics
        - Imports/exports/jobs
  - Projects
    - SQL files
    - Notebooks
    - Data files
    - Markdown docs
    - Migration bundles
  - Favorites
  - Recent
  - History

Command palette hierarchy:

- Run commands
- Navigate to object/file/query
- AI actions
- Database actions
- Layout actions
- Settings
- Plugins
- Help and diagnostics

## 12. Desktop Layout Specification

Required behavior:

- Panels are resizable with accessible splitters.
- Left, right, and bottom panels can be hidden, pinned, moved, and restored.
- Editors support tabs, split panes, vertical/horizontal groups, pinned tabs, preview tabs, and dirty state.
- Tool panels can be docked or floated. Floating windows retain size, position, monitor, and tab state.
- Multi-window support: separate query window, monitor dashboard, ERD, or AI session on another monitor.
- Layouts persist per workspace and per profile.
- Workspace profiles: Developer, DBA, Analyst, Data Engineer, Minimal, Presentation, High Contrast.
- Native dialogs for file open/save, folder selection, credential prompts, certificate import, and update installation.
- Native notifications for completed jobs, failed jobs, lost connection, update ready, long query finished.
- Context menus exist for tree nodes, tabs, editor selection, result cells, result columns, plans, charts, jobs, and notifications.
- Breadcrumbs show current object path and allow jump/quick actions.
- Window restoration reopens all windows, tabs, split layout, selected panels, cursor positions, unsaved drafts, and last active connection state without reconnecting silently to production.

## 13. Screen-by-Screen Specifications

### Welcome and Empty State

Purpose: orient new and returning users without marketing clutter.

Required content:

- Recent workspaces and connections.
- Create connection, open project, open file, import data, browse docs, configure AI.
- Exasol Personal and Exasol SaaS quick-start cards.
- Recovery banner if a previous session crashed.
- AI setup prompt only when no provider exists, dismissible.

### Connection Manager

Required capabilities:

- Connection groups, favorites, pinning, labels, color badges, environment type.
- Exasol SaaS, Exasol Personal, manual host/port, native connection URL/protocol advanced mode.
- Username/password, OpenID/OAuth where supported by the driver, Kerberos where configured, TLS options, certificate pinning/fingerprint fields.
- Test connection with detailed diagnostics.
- Secure credential storage in OS keychain.
- Per-connection defaults: schema, row limit, autocommit, read-only, query timeout, statement separator, metadata refresh interval.
- Production safety: require read-only default or destructive confirmation.

### Main Workspace

The first screen after connection should show:

- Explorer scoped to connection.
- Editor with new SQL console or last active tab.
- Right inspector collapsed by default.
- Bottom result panel collapsed until execution.
- Status bar visible.

### Database Explorer

Purpose: fast object navigation and context actions.

Required states:

- Connected, connecting, disconnected, failed auth, stale metadata, offline cache.
- Lazy-loaded tree nodes with child counts where cheap.
- Filter box with fuzzy matching and type filters.
- Inline object preview on hover or right inspector.

### SQL Editor

Purpose: primary coding surface.

Required states:

- New console, saved SQL file, scratch SQL, read-only generated SQL, notebook SQL cell.
- Connection/schema binding visible in tab and toolbar.
- Run selection, run statement, run script, explain, explain analyze where supported, cancel.
- Diagnostics and quick fixes inline.

### Results Grid

Required behavior:

- Streaming rows with clear loading state.
- Virtualized rows and columns.
- Column profiling, filters, sort, find, copy, export, chart, AI explain column.
- Large-result safeguards: row limits, memory budget, spool to local file, background export.
- Editable cells only when safe and supported; all edits are staged with review before commit.

### SQL Notebook

Purpose: repeatable analysis and documentation.

Required cells:

- SQL, Markdown, chart, AI note, result snapshot.
- Parameter cells for reusable analysis.
- Export to Markdown, HTML, PDF later, and SQL script.

### Object Detail

Tabs:

- Overview
- Columns
- Data preview
- DDL
- Dependencies
- Grants
- Statistics
- Recent queries
- Documentation
- AI summary

### Import Wizard

Steps:

1. Source selection: local file, remote URL, S3, Azure Blob, Google Cloud, JDBC source, Exasol connection.
2. File/profile sample: delimiter, encoding, headers, nulls, dates, decimals, compression, Parquet metadata.
3. Target: existing table, new table, temporary result set.
4. Mapping: columns, types, transformations, reject/error table.
5. Security: connection object recommendation, credential masking, TLS/certificate choice.
6. Preview generated IMPORT.
7. Run and monitor.
8. Summary and rejected-row handling.

### Export Wizard

Steps:

1. Source selection: table, view, query, result tab.
2. Destination: local, remote, cloud, JDBC target.
3. Format: CSV, Parquet where supported, JSON/Excel via client-side export, SQL insert script.
4. Safety: sensitive-column warning, row count estimate, environment policy.
5. Preview generated EXPORT/client export plan.
6. Run and monitor.

### Monitoring Dashboard

Panels:

- Active sessions.
- Running queries.
- Locks and blockers.
- Import/export jobs.
- Resource usage where available.
- Query history and slow-query candidates.
- Health cards with explainable alerts.

### Session Manager

Required capabilities:

- Filter by user, schema, duration, state, statement type.
- Show SQL text with sensitive masking.
- Cancel own query; DBA can kill session when privilege allows.
- Blocker chain view.
- AI explain: "What is happening and what can I safely do?"

### Permissions Manager

Views:

- User/role list.
- Effective privileges.
- Object grants.
- Risk flags.
- Generated GRANT/REVOKE scripts.
- Approval workflow later.

### AI Assistant and Agent Center

Surfaces:

- Right sidebar chat.
- Inline editor action.
- Hover explanation.
- Context menu action.
- Command palette action.
- Error diagnostic action.
- Results grid action.
- Execution plan action.
- Object explorer action.
- Monitoring incident action.

Agent Center should show ongoing AI tasks, context used, tools requested, approvals, cost estimate, provider/model, and output artifacts.

### Settings

Major sections:

- General
- Appearance
- Layouts
- Editor
- SQL and execution
- Connections
- Security and credentials
- AI providers
- MCP and tools
- Import/export
- Results grid
- Monitoring
- Keyboard shortcuts
- Extensions
- Updates
- Privacy and telemetry
- Diagnostics
- Enterprise policy

### Plugin Marketplace

MVP should show installed built-in modules only. Later releases add marketplace, plugin details, permissions, reviews, signing, updates, and enterprise allow/deny lists.

## 14. Component Inventory

Shell:

- App window, title bar integration, native menu, top toolbar, status bar, activity bar, side bar, bottom panel, right inspector, splitters, dock manager.

Navigation:

- Tree view, breadcrumbs, command palette, quick open, tabs, pinned tabs, recent list, favorites list, search results.

Editor:

- Monaco-based SQL editor, notebook editor, markdown editor, data file preview, diff viewer, DDL viewer, generated SQL preview.

Data:

- Virtualized grid, column header menu, row detail drawer, cell editor, filter row, profile panel, chart preview, export menu, staged edit review.

Database:

- Connection card, object node, DDL panel, dependency graph, ERD canvas, object designer, privilege matrix, session row, plan node.

AI:

- Chat panel, inline prompt, action chip, context picker, approval sheet, diff review, provider/model selector, token/cost indicator, source/context disclosure.

Feedback:

- Toast, notification center, progress job, skeleton row, empty state, error boundary, recoverable error card, destructive action confirmation, update banner.

Forms:

- Text input, password/secret input, combobox, multi-select, radio, checkbox, switch, segmented control, slider, table editor, file picker, certificate picker.

## 15. SQL Editor Specification

Core requirements:

- Multi-tab editing with saved files, unsaved scratch files, query consoles, notebooks, generated SQL previews.
- Split editors horizontally and vertically.
- Pinned tabs, preview tabs, dirty indicators, close protection.
- Autosave and session recovery.
- Undo/redo across editing operations; local history for saved and scratch files.
- Bookmarks, code folding, minimap optional, outline, breadcrumbs.
- Multi-cursor editing, column selection, search/replace, regex search.
- Snippets and templates for SELECT, WITH, CREATE TABLE, IMPORT, EXPORT, GRANT, session diagnostics.
- Formatting with configurable style and Exasol dialect awareness.
- Linting and diagnostics for syntax, unresolved objects, ambiguous aliases, unsafe DDL/DML, missing WHERE in UPDATE/DELETE, production-risk statements.
- Quick fixes: qualify object, add alias, wrap identifier, format statement, generate SELECT list, convert to CTE, add LIMIT/FETCH where appropriate, explain error.
- Schema-aware completion for schemas, tables, views, columns, functions, scripts, roles, users, connections, variables, snippets, and recent identifiers.
- Hover docs for functions, objects, columns, privileges, warnings, AI explanation.
- Parameter hints and signature help for functions and scripts where metadata is available.
- Connection switching at tab level; warn before switching dirty or transaction-bound console.
- Transaction controls: autocommit indicator, manual commit/rollback, transaction state, pending transaction warning.
- Execution controls: run statement, run selection, run script, run current cell, explain, cancel, stop after current statement, timeout, row limit.
- Query history with filters by connection, schema, file, date, status, duration, user tag, favorite.
- Result tabs linked to execution run; each result knows SQL, connection, time, row count, duration, status, and export history.
- Large file optimization: lazy tokenization, worker parsing, disable expensive diagnostics above thresholds, incremental semantic index.

Editor architecture:

- Monaco editor with custom Exasol language grammar.
- SQL parser service in Rust or WASM for statement boundaries and diagnostics.
- Metadata completion service backed by local metadata cache plus live refresh.
- LSP-like protocol between frontend and backend for completions, hovers, diagnostics, formatting, and code actions.

## 16. Database Explorer Specification

Core requirements:

- Multiple connections.
- Connection groups, pinned connections, favorites, recent objects.
- Lazy loading, virtualized tree, background refresh, stale indicators.
- Search and filtering by object type, owner/schema, name, comment, dependency, privilege, recent use.
- Drag and drop: drop table into editor inserts qualified name; drop columns inserts list; drag file into schema starts import; drag object to favorites pins it.
- Context menus: open console here, select top rows, view DDL, copy name, copy qualified name, generate SELECT/INSERT/DDL, refresh, add favorite, compare, document, ask AI.
- Inline rename only where supported and safe. Otherwise generate reviewed DDL.
- Object preview: columns, row count estimate, owner, grants, dependencies, last analyzed/statistics where available.
- DDL preview and DDL diff.
- Dependency graph with upstream/downstream filters.
- Capability-aware node display. Unsupported object families are hidden by default.

Exasol-native nodes:

- Schemas.
- Tables and columns.
- Views.
- Scripts/UDFs.
- Virtual schemas.
- Connections.
- Users and roles.
- Privileges.
- Sessions.
- System tables in `SYS` and `EXA_STATISTICS`.
- Statistics and query history where accessible.
- Import/export activity.

## 17. Database Administration Features

MVP admin:

- Connection and credential management.
- User and role browser.
- Effective privilege viewer.
- Session manager.
- Object DDL viewer/generator.
- IMPORT/EXPORT wizard.
- Object search.
- Metadata browser.
- Monitoring dashboard.
- Query cancellation.
- Read-only and production safety modes.

V1 admin:

- Role and user manager with generated scripts.
- Permission matrix and risk flags.
- Schema compare and DDL migration generator.
- Dependency viewer.
- Data generator.
- Mock data generator.
- Data compare.
- Health dashboard.
- Audit viewer where system tables/logs allow.

Later:

- Visual schema designer.
- ER diagram authoring.
- Visual query builder.
- Backup/restore integrations if supported through Exasol platform APIs.
- SaaS database/cluster lifecycle management where authenticated APIs exist.
- Enterprise approvals for destructive actions.

Important boundary:

Exasol Studio should distinguish database SQL operations from platform administration. If a feature requires Exasol SaaS or external platform APIs, the UI should label it as "Platform" and show availability based on configured account capabilities.

## 18. File and Project Management

Supported local artifacts:

- `.sql`
- `.csv`
- `.xlsx`
- `.json`
- `.xml`
- `.yaml` / `.yml`
- `.md`
- `.txt`
- `.zip`
- database dump/export artifacts
- notebook files, recommended `.exanb`
- workspace files, recommended `.exaworkspace`

Required capabilities:

- Open, save, save as, autosave, auto recovery.
- Recent files and projects.
- Workspace folders.
- Drag/drop multiple files.
- Native file dialogs.
- Import wizard for files dropped onto a connection/schema.
- Export wizard with local artifact tracking.
- Version history for scratch files and generated scripts.
- Crash recovery for unsaved and temp files.
- Optional Git integration for projects: status, diff, commit, branch, but not required for MVP.

## 19. AI Assistant Specification

AI product model:

- AI is a set of contextual actions, not only a chat panel.
- Every AI answer must show context used: SQL selection, object names, schema sample, error text, plan, docs snippets, result sample, or none.
- Every action that can modify SQL, data, objects, settings, credentials, files, or plugins requires explicit review and approval.
- Production connections require stricter approvals and default to dry-run script generation.

Capabilities:

- Generate SQL from natural language.
- Explain SQL.
- Optimize SQL.
- Debug SQL errors.
- Generate DDL and DML.
- Generate test data.
- Explain execution plans.
- Summarize schemas.
- Generate object documentation.
- Generate migration drafts.
- Refactor SQL.
- Review SQL for correctness, performance, safety, and style.
- Convert SQL dialects into Exasol where possible.
- Suggest query rewrites and data layout strategies.
- Explain Exasol errors.
- Generate comments and docstrings.
- Create import/export scripts.
- Explain permissions.
- Summarize result sets without sending full sensitive data by default.

Context layers:

- Immediate focus: selection, cursor statement, object, result, error, plan node.
- Workspace context: open files, recent queries, favorite objects, project docs.
- Metadata context: schemas, columns, constraints, grants, dependencies, comments.
- Runtime context: connection, user, schema, autocommit, row limit, environment, session stats.
- Documentation context: curated Exasol docs and local help index.
- User policy context: privacy mode, allowed providers, forbidden data classes.

AI safety:

- Never send result data to remote providers unless the user explicitly allows data sharing for that action.
- Default AI context for remote providers should include metadata and SQL, not raw data rows.
- Mask secrets, connection strings, tokens, passwords, certificate material, and obvious PII samples.
- Show provider/model before request.
- Support offline/local-only mode.
- Log AI actions locally with prompt summary, context categories, provider, model, timestamp, and approved changes, but not secrets.

AI UX:

- Inline actions should stream concise output.
- Insertion is one click: insert at cursor, replace selection, open as new tab, apply diff.
- Chat supports pinned conversations per workspace, named threads, and links to objects/files/results.
- AI actions can be favorited into command palette.
- AI suggestions should be dismissible and quiet.

## 20. AI Provider Architecture

Provider registry:

- OpenAI.
- OpenAI Codex.
- Azure OpenAI.
- GitHub Copilot where permitted by API/extension terms.
- Anthropic Claude.
- Gemini.
- Ollama.
- LM Studio.
- OpenRouter.
- Custom OpenAI-compatible endpoints.
- Future provider plugins.

Provider capabilities model:

- Chat.
- Streaming.
- Function/tool calling.
- Structured output.
- Vision.
- Embeddings.
- Local model.
- Reasoning model.
- Context window.
- Data residency labels.
- Cost estimator.

Configuration:

- API key or auth flow stored in OS keychain.
- Model picker with recommended defaults.
- Temperature, max tokens, context limit, reasoning effort where supported.
- Provider fallback chain.
- Per-action model defaults.
- Test connection.
- Team policy lock support.

MCP:

- MCP servers are configured per workspace or globally.
- Tools are permissioned by connection, workspace, and action type.
- Database mutation tools require approval.
- External MCP servers are disabled by default in enterprise-restricted workspaces.

Embeddings:

- Local vector index for docs, workspace SQL, object comments, saved explanations.
- Remote embeddings only if user/team enables.
- No raw result-data indexing by default.

## 21. Plugin System Design

Principle: design extension seams early, but ship public marketplace later.

MVP internal extension points:

- AI provider adapters.
- Import/export adapters.
- Visualization renderers.
- Theme packs.
- SQL snippets/templates.
- Object inspector panels.
- Metadata providers.

Future public plugin types:

- Themes.
- Database drivers.
- Editor extensions.
- AI providers.
- Import/export extensions.
- Visualization plugins.
- Language packs.
- Workspace commands.
- Admin panels.

Runtime model:

- UI contributions run in isolated webview or iframe-like sandbox with a strict message bridge.
- Compute-heavy or system-access plugins run out-of-process.
- Data-driver plugins use a signed native sidecar or WASM component when feasible.
- Plugins declare permissions: filesystem, network domains, database read, database write, metadata, secrets, AI context, clipboard, notifications.
- All plugin calls cross a typed permission gateway.

Marketplace requirements:

- Signed packages.
- Semantic versioning.
- Compatibility ranges.
- Update channels.
- Enterprise allow/deny list.
- Permission diff on update.
- Crash isolation and plugin safe mode.
- Hot reload only for UI/theme/dev plugins, not privileged native plugins.

## 22. Workspace Management

Workspace contents:

- Connections references, not secrets.
- Open tabs and layouts.
- Project folders.
- Favorites.
- Query history references.
- AI conversation links.
- Local metadata cache pointers.
- Workspace settings overrides.
- Saved dashboards and notebooks.

Workspace profiles:

- Developer: editor/explorer/results.
- DBA: explorer/monitor/session/permissions.
- Analyst: notebook/results/charts/AI.
- Data Engineer: import/export/jobs/editor.
- Minimal: explorer/editor/results only.

Persistence:

- Local workspace database in SQLite.
- Secrets only in OS keychain.
- Crash recovery snapshots separate from user-saved workspace.
- Workspace can be exported without secrets.

## 23. Settings Architecture

Settings scopes:

- Application.
- Workspace.
- Project folder.
- Connection.
- Profile.
- Enterprise policy.

Conflict resolution:

Enterprise policy > connection policy > workspace > project > user default > app default.

Settings UI requirements:

- Searchable settings.
- JSON advanced editor.
- Reset to default.
- Show source/scope of setting.
- Export/import settings profile.
- Keyboard shortcut recorder.
- Provider credential test.
- Privacy and telemetry visible in one place.

## 24. Design System

Brand-derived tokens:

- Primary: `#002E40`.
- Secondary action: `#5FC33B`.
- Tertiary dark teal: `#204E55`.
- Surface: `#FFFFFF`.
- Tinted surface: `#F2F9FF`.
- Text primary: `#111827` rather than pure black for dense UI.
- Text secondary: `#4A5464`.
- Text muted: `#767676`.

Additional required semantic tokens:

- Danger: `#D92D20`.
- Warning: `#B54708`.
- Info: `#0B6B8A`.
- Success: `#2F8F2F`, visually distinct from CTA green.
- Focus: `#193D50`.
- Selection: `rgba(0, 46, 64, 0.14)`.
- Grid line: `#E4E7EC`.
- Dark surface: `#071D26`.
- Dark panel: `#0E2B36`.

Typography:

- App UI: Inter, system fallback.
- Display/onboarding: museo-sans if licensed and available, otherwise Inter.
- Code: JetBrains Mono, SF Mono, Consolas, monospace.
- Editor default: 13px or 14px.
- Tree/grid default: 12px or 13px.
- Body: 14px.
- Headings inside app panels: 14px to 18px, not marketing-scale.

Spacing:

- Base grid: 8px.
- Dense controls: 4px, 6px, 8px.
- Panel padding: 8px to 16px.
- Dialog padding: 24px.
- Avoid oversized whitespace in workbench surfaces.

Radius:

- Controls: 5px.
- Panels/cards: 6px to 8px.
- Menus/popovers: 8px.
- Pills: 9999px only for badges/chips.

Elevation:

- Prefer borders and subtle shadows.
- Popovers: `0 8px 24px rgba(15, 23, 42, 0.16)`.
- Cards: `0 4px 15px rgba(0, 0, 0, 0.075)` only in non-dense surfaces.

Iconography:

- Use lucide-style outline icons or a consistent icon set.
- Database-object icons must be distinguishable by shape, not color alone.

Density:

- Comfortable, compact, and dense modes.
- Compact/dense should preserve WCAG target sizes through row height choices and keyboard use.

## 25. Interaction and Motion Guidelines

- Motion duration: 100ms to 180ms for menus, hover, focus, panel open/close.
- Use subtle opacity/transform only.
- No decorative motion in the workbench.
- Respect reduced motion.
- Long operations show progress within 250ms.
- Query start, cancel, complete, and fail states must be visually immediate.
- Drag/drop surfaces show precise insertion targets.
- Destructive actions use confirmation only when the action is high-risk; otherwise use undo or staged review.

## 26. Accessibility Guidelines

Targets:

- WCAG 2.2 AA.
- Full keyboard operation.
- Screen-reader labels for trees, grids, tabs, splitters, editor controls, charts, and dialogs.
- Visible focus ring.
- High contrast light and dark themes.
- Color-blind-safe status indicators with text/icon/shape.
- Reduced motion.
- Scalable fonts.
- Result grid must expose table semantics, selected cell, row/column headers, sort state, and edit state.
- Command palette must be a complete keyboard alternative to pointer navigation.
- Error messages must state what happened, why it likely happened, and what the user can do next.

## 27. Performance Strategy

Targets:

- Cold start: under 2.5 seconds to shell on typical developer laptop.
- Warm start: under 1 second to restored shell.
- Metadata tree expand: immediate skeleton, first useful children under 300ms when cached.
- Editor typing latency: under 16ms frame budget.
- Result grid scroll: 60fps for large virtualized data.
- Cancellation request acknowledged within 250ms UI time.

Techniques:

- Lazy metadata loading.
- Virtualized trees and grids.
- Background metadata indexing.
- Per-connection metadata cache with TTL and manual refresh.
- Incremental search index using Tantivy or SQLite FTS.
- Streaming query results.
- Result spooling to Arrow/Parquet/SQLite local temp store for large results.
- Backpressure between driver service and UI.
- Web workers for parsing, formatting, and expensive client transforms.
- Rust async tasks for database operations.
- Separate job queue for long-running imports/exports.
- Avoid sending large result sets through Tauri IPC as JSON. Use chunked binary or file-backed transfer.

## 28. Security Architecture

Core controls:

- Credentials stored only in OS keychain.
- Optional encrypted local vault for portable profiles, protected by OS keychain or user passphrase.
- Secrets masked in UI, logs, crash reports, AI prompts, and exported workspace files.
- Tauri commands are minimal, typed, capability-scoped, and validated.
- Webview cannot access filesystem, shell, network, database, or secrets except through approved commands.
- Content Security Policy locked down.
- Plugin permissions and signing.
- TLS and certificate configuration per connection.
- Connection fingerprint/certificate pinning where applicable.
- Production safety mode by connection.
- Audit log for executed SQL, admin actions, plugin actions, AI actions, and setting changes, with privacy controls.
- Crash reporting opt-in and scrubbed.

Threat model highlights:

- Malicious SQL file tries to exfiltrate secrets through AI or plugins.
- Plugin attempts unauthorized database writes.
- Prompt injection through table comments or result data manipulates AI actions.
- User accidentally runs destructive query in production.
- Credentials leak through logs, telemetry, history, generated scripts, or crash dumps.
- Compromised workspace file alters provider endpoint or plugin permissions.

Mitigations:

- Context sanitization.
- AI action approvals.
- Read-only and production policies.
- Permission prompts with stable scopes.
- Signed plugins and enterprise policy.
- Secret redaction everywhere.
- Workspace trust model similar to IDE restricted mode.

## 29. Technical Architecture

### Frontend

- React.
- TypeScript.
- TailwindCSS with token-driven theme.
- Monaco editor.
- TanStack Query for server/cache synchronization.
- Zustand or Jotai for local UI state.
- TanStack Router or equivalent lightweight routing for internal views.
- Virtualization via TanStack Virtual or equivalent.
- Charting with a performant canvas/SVG hybrid, chosen after prototype.

### Desktop

- Tauri v2.
- Native menus, dialogs, notifications, window state, updater, logging, single-instance, deep links/file associations.
- Strict command capabilities per window.
- Multi-window support.

### Rust Core

Responsibilities:

- App lifecycle.
- Workspace storage.
- Command bus.
- Connection registry.
- Job orchestration.
- Metadata cache.
- Query execution orchestration.
- Result spooling.
- AI provider orchestration.
- Plugin manager.
- Secure storage bridge.
- Logging and diagnostics.

### Exasol Connectivity Recommendation

Recommended MVP: Rust app orchestrates a Rust-native Exasol driver service. The service should
implement the Exasol protocol adapter behind a typed internal contract, with WebSockets API support
or a vetted Rust crate as the initial spike path.

Why:

- Rust keeps the desktop connectivity path close to the Tauri core, avoids a bundled Java runtime,
  and gives tighter control over cancellation, backpressure, result paging, and diagnostics.
- Exasol Studio is Exasol-first, so a product-owned protocol adapter can optimize metadata loading,
  system-view discovery, SQL execution, and result streaming for Exasol instead of inheriting a
  generic SQL client model.
- The UI and app core already use a driver-service boundary, so JDBC/ODBC can remain fallback
  adapters without becoming the product default.

Trade-offs:

- Rust-native connectivity must be validated early against authentication, TLS, import/export,
  cancellation, large result streaming, and Exasol-specific metadata behavior.
- The community Rust crate and custom protocol path may not cover every enterprise feature on day
  one, so compatibility adapters may still be required for some environments.
- Owning a protocol adapter increases maintenance responsibility, test coverage needs, and release
  discipline.

Architecture:

- React UI <-> Rust Core through typed Tauri commands and events.
- Rust Core <-> Driver Service through an internal async command bus or local JSON-RPC/gRPC channel.
- Driver Service manages connection pools, statements, cancellation, metadata queries, streaming
  result chunks, import/export helpers, and protocol error mapping.
- Results are chunked to Rust spool store, then UI reads pages.
- Driver service is killable and restartable without crashing the app.

Later:

- Add JDBC/ODBC compatibility adapters only for unsupported enterprise features.
- Add SaaS/platform API adapter if Exasol provides stable APIs for database lifecycle.
- Add generic database driver plugin only after Exasol-first product is mature.

## 30. Folder Structure Recommendations

```text
exasol-studio/
  apps/
    desktop/
      src-tauri/
      src/
        app/
        shell/
        features/
          connections/
          explorer/
          editor/
          results/
          import-export/
          monitor/
          ai/
          settings/
          extensions/
        components/
        design-system/
        hooks/
        state/
        workers/
        tests/
  crates/
    core/
    workspace-store/
    command-bus/
    metadata-cache/
    query-engine/
    result-spool/
    ai-core/
    plugin-host/
    security/
    diagnostics/
  driver-service/
    exasol-jdbc/
  packages/
    sql-language/
    design-tokens/
    shared-types/
    e2e-fixtures/
  docs/
    architecture/
    product/
    qa/
    security/
  tools/
    scripts/
    ci/
```

## 31. State Management Strategy

Frontend state:

- Local UI state: panel visibility, split sizes, selected tabs, transient filters.
- Server state: metadata, query jobs, results, settings, connection status via TanStack Query.
- Editor state: Monaco models, dirty state, cursor, undo stack, local history.
- Workspace state: persisted through Rust workspace store.

Backend state:

- SQLite for workspace metadata, history indexes, layouts, settings, and job records.
- OS keychain for secrets.
- File-backed result spool for large query results.
- Cache invalidation by connection, schema, object, TTL, and explicit refresh.

Event model:

- Typed events: connectionChanged, metadataRefreshed, queryStarted, queryChunk, queryCompleted, queryFailed, jobProgress, aiActionRequested, aiActionCompleted, pluginCrashed.
- Frontend subscribes by workspace/window/tab scope.

## 32. Database Layer Design

Primary services:

- ConnectionService: create/test/connect/disconnect/reconnect.
- MetadataService: load schemas, objects, columns, grants, dependencies, system tables.
- QueryService: execute, stream, cancel, explain, transaction controls.
- ResultService: spool, page, profile, export, stage edits.
- ImportExportService: generate scripts, run jobs, monitor progress.
- AdminService: sessions, users, roles, grants, health signals.
- SafetyService: classify SQL risk, environment policy, confirmation requirements.

Query execution lifecycle:

1. Editor sends execution request with SQL, selection range, connection, schema, options.
2. SafetyService classifies statement.
3. User approves if required.
4. QueryService submits to driver service.
5. Driver streams schema, chunks, stats, warnings, errors.
6. ResultService spools and indexes.
7. UI renders result page and updates job state.
8. Query history records normalized metadata.

## 33. AI Layer Design

Services:

- ProviderRegistry.
- ModelCatalog.
- ContextBuilder.
- PolicyEngine.
- PromptTemplateRegistry.
- ToolRouter.
- MCPRegistry.
- RedactionService.
- AIActionLog.
- EmbeddingIndex.

AI action lifecycle:

1. Surface invokes action with focus context.
2. ContextBuilder creates minimal context bundle.
3. RedactionService masks sensitive values.
4. PolicyEngine checks provider, data sharing, environment, and tool permissions.
5. User reviews context if action is sensitive.
6. Provider streams response.
7. If output modifies SQL/files/settings/database, diff review is required.
8. Accepted changes are applied and logged.

Database tools:

- `get_metadata`
- `search_objects`
- `get_object_ddl`
- `get_dependencies`
- `get_query_plan`
- `run_readonly_query` with row limits and approval rules
- `generate_import_plan`
- `generate_migration_plan`

No AI tool should execute DDL/DML directly without explicit approval and visible SQL.

## 34. Testing Strategy

Test layers:

- Unit tests for Rust services, SQL classification, prompt builders, metadata parsers, settings precedence.
- Type tests for command contracts and shared types.
- Frontend component tests for tree, grid, dialogs, AI panels, settings, shortcuts.
- Integration tests against Exasol Personal or test container/environment where feasible.
- Driver-service contract tests with fixtures.
- Golden tests for generated SQL, DDL diffs, import/export scripts.
- E2E tests with Tauri WebDriver or platform-appropriate automation.
- Accessibility tests: keyboard paths, screen-reader labels, contrast, reduced motion.
- Performance tests: large metadata tree, large result grid, large SQL file, long-running query cancellation.
- Security tests: secret redaction, permission enforcement, plugin sandbox, prompt injection fixtures.

Release gates:

- No secret leakage in logs.
- Crash recovery verified.
- Query cancellation verified.
- Production safety prompts verified.
- Key flows work without AI provider.
- Key flows work offline with cached metadata.

## 35. Error Handling Strategy

Error model:

- Human-readable summary.
- Technical detail expandable.
- Cause category.
- Recovery action.
- Copy diagnostics.
- Link to logs or docs.
- AI explain action where appropriate.

Categories:

- Connection.
- Authentication.
- Authorization/privileges.
- SQL syntax.
- Runtime query.
- Import/export.
- File parsing.
- Driver service.
- AI provider.
- Plugin.
- Workspace/storage.
- Update.

Error principles:

- Never leave users at a dead end.
- Do not hide SQLSTATE/error codes.
- Preserve failed query and context.
- Retry only when safe.
- For partial import/export failure, show successful rows/files, rejected rows, and generated repair actions.

## 36. Logging and Diagnostics

Logs:

- App lifecycle.
- Connection events without secrets.
- Query execution metadata, not full result data by default.
- Driver service stdout/stderr captured and redacted.
- AI actions and provider errors.
- Plugin lifecycle.
- Performance spans.
- Crash reports.

Diagnostics UI:

- Log viewer.
- Export support bundle.
- Redaction preview before export.
- System info.
- Driver versions.
- Tauri/webview versions.
- AI provider test.
- Connection test transcript.

Privacy:

- Telemetry opt-in or enterprise-managed.
- No SQL text telemetry by default.
- No result data telemetry.
- Clear local retention settings.

## 37. Update Strategy

Channels:

- Stable.
- Beta.
- Nightly/internal.
- Enterprise pinned.

Requirements:

- Signed updates.
- Release notes shown before install.
- Rollback option where feasible.
- Plugin compatibility checks.
- Driver-service version compatibility checks.
- Enterprise policy can disable auto-update.
- Critical security updates can be highlighted without forcing restart.

## 38. Crash Recovery Strategy

Persist frequently:

- Open workspaces and windows.
- Tab list.
- Editor content and cursor.
- Unsaved scratch files.
- Split sizes.
- Query history.
- Job records.
- Result spool metadata.
- AI conversation drafts.

Recovery flow:

1. On next launch, show recovery banner.
2. Restore shell layout.
3. Reopen files and scratch buffers.
4. Show interrupted jobs as failed/interrupted, not running.
5. Offer to reconnect connections individually.
6. Preserve logs and support bundle.

## 39. Phased Implementation Roadmap

Phase 0: Foundations

- Product architecture decisions.
- Exasol connectivity spike with Rust-native driver service.
- Tauri shell spike.
- Monaco SQL editor spike.
- Result streaming/spooling spike.
- Security and keychain spike.
- Design system tokens.

MVP: Developer Studio

- Connection manager.
- Workspace shell.
- Explorer with schemas/tables/views/scripts/connections/users/roles/system tables.
- SQL editor with completion, execution, cancellation, history.
- Results grid with virtualization and export.
- Basic object detail and DDL view.
- Import wizard for CSV and Parquet path generation where supported.
- AI provider configuration.
- AI actions: generate SQL, explain SQL, fix error, explain object.
- Settings, shortcuts, recovery, diagnostics.
- Dark and light themes.

V1: Professional Exasol Workbench

- Monitoring dashboard.
- Session manager.
- Permission viewer.
- DDL diff and migration generator.
- SQL notebook.
- Data profiling.
- Advanced import/export.
- Query plan cockpit.
- AI plan/explain/optimize actions.
- Metadata search index.

V1.5: Team and Admin

- Role/user manager.
- Production policies.
- Workspace sharing without secrets.
- Documentation generator.
- Data compare.
- Mock data generator.
- Plugin beta.
- Enterprise policy beta.

V2: Platform and Ecosystem

- Public plugin SDK and marketplace.
- Visual schema designer.
- ERD editor.
- Visual query builder.
- SaaS/platform lifecycle integrations.
- Agent routines.
- Collaboration and approvals.
- Advanced observability.

Enterprise Edition

- Managed settings.
- Provider governance.
- Plugin allow/deny lists.
- Audit export.
- SSO.
- Shared team workspaces.
- Approval workflows.
- Private marketplace.

## 40. MVP vs Future Feature Prioritization

| Feature | MVP | V1 | Later | Enterprise |
|---|---:|---:|---:|---:|
| Connection manager | Yes | Enhance | Enhance | Policy |
| SQL editor | Yes | Enhance | Enhance | Policy |
| Schema-aware completion | Yes | Enhance | Enhance |  |
| Results grid | Yes | Enhance | Enhance |  |
| Query history/favorites | Yes | Enhance | Enhance | Shared |
| Object explorer | Yes | Enhance | Enhance |  |
| DDL viewer | Yes | Diff | Designer | Approval |
| Import/export wizard | Basic | Advanced | Automation | Policy |
| AI provider setup | Yes | Enhance | Marketplace | Governance |
| AI inline actions | Basic | Strong | Agents | Governance |
| Monitoring | Basic | Strong | Observability | Audit |
| Sessions/locks | Basic | Strong | Automation | Policy |
| Permissions | Read | Manage | Analyze | Approval |
| Notebooks | No | Yes | Share | Govern |
| ERD/schema designer | No | View | Edit | Govern |
| Plugin system | Internal | Beta | Public | Private marketplace |
| Collaboration | No | Light | Strong | Strong |

## 41. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Rust-native Exasol connectivity is incomplete | Blocks core workflows | Validate WebSockets/Rust crate spike early, keep JDBC/ODBC compatibility adapter behind the same contract |
| Desktop app feels like web app in a frame | Weak differentiation | Use native menus, dialogs, keychain, windows, shortcuts, OS integration |
| AI creates unsafe SQL | Data loss or trust loss | Dry runs, risk scoring, approvals, production policy, no direct mutation by AI |
| Metadata at enterprise scale is slow | Poor UX | Lazy loading, cache, virtualized tree, background index |
| Plugin system adds security risk | Data or credential exposure | Delay public plugins, permission model, signing, sandbox |
| Scope creep delays MVP | Product never ships | Ship developer core first, phase admin/modeling/collab |
| Brand system too marketing-like | UI feels unprofessional | Adapt tokens for dense desktop IDE |
| Result data leaks to AI/telemetry | Security incident | Local-only default for data, explicit consent, redaction |
| Cross-platform native behavior differs | Support burden | Platform abstraction layer and per-OS QA matrix |
| Exasol platform APIs vary | Admin feature gaps | Capability detection and modular platform adapters |

## 42. Open Questions and Assumptions

Open questions:

- Which Exasol versions must be supported at launch?
- Which authentication flows are mandatory: username/password, OpenID, Kerberos, SSO, MFA?
- Is Exasol SaaS lifecycle management in scope, and are stable APIs available?
- Which Rust driver path should be first: Exasol WebSockets API implementation, community Rust crate, or hybrid adapter?
- Which enterprise features require a JDBC/ODBC compatibility adapter after the Rust-native MVP?
- Which AI providers are legally/commercially allowed in the target customer environments?
- Are team collaboration and shared workspaces required before v1?
- What telemetry posture is acceptable for enterprise customers?
- Is Exasol Studio open source, commercial, or hybrid?
- What is the minimum supported OS version for macOS, Windows, and Linux?

Assumptions:

- MVP is a desktop application, not a browser app.
- The product can store local metadata caches.
- Users will operate against production systems, so safety is mandatory.
- AI must work with zero, one, or many configured providers.
- Exasol-specific capability is more important than generic multi-database breadth.

## 43. Innovation Challenge: 100 Differentiating Ideas

| # | Idea | Problem it solves | Target users | Why valuable | Complexity | Release |
|---:|---|---|---|---|---|---|
| 1 | Query Safety Score | Users cannot quickly judge risk before execution | DBA, SQL developer | Turns risk into an explicit review signal | M | MVP |
| 2 | Production Blast Radius Preview | DDL/DML impact is unclear | DBA, architects | Shows affected objects, rows, grants, and dependencies before action | L | V1 |
| 3 | Schema Drift Radar | Environments quietly diverge | Architects, data engineers | Flags drift between dev/test/prod before releases break | L | V1 |
| 4 | Object Heat Map | Large schemas hide important objects | Analysts, developers | Ranks objects by use, recency, and dependency importance | M | V1 |
| 5 | AI Schema Tour | New users do not know where to start | Beginners, analysts | Creates a guided orientation for any schema | M | MVP |
| 6 | Import Autopsy | Failed imports are painful to debug | Data engineers | Explains root cause, bad rows, and repair options | M | V1 |
| 7 | Plan Storyboard | Execution plans are hard to interpret | Developers, DBA | Converts plan phases into a readable performance narrative | L | V1 |
| 8 | Session Replay | Query incidents disappear after the fact | DBA | Reconstructs timeline from query, session, locks, and logs | L | Enterprise |
| 9 | Data Contract Monitor | BI and app consumers break after schema changes | Architects, BI developers | Watches declared contracts and warns before breaking changes | L | Enterprise |
| 10 | Virtual Schema Health Check | Virtual-schema issues are buried | Data engineers, DBA | Checks reachability, latency, mappings, and recent failures | M | V1 |
| 11 | Privilege What-If Simulator | Permission changes are risky | DBA, security teams | Previews effective access after proposed grants/revokes | L | V1 |
| 12 | DDL Time Machine | Users need to understand object evolution | Developers, architects | Shows historical DDL snapshots from local history and migrations | M | V1 |
| 13 | Query Intent Tags | Query history becomes noisy | Developers, analysts | Tags queries by purpose such as debug, export, report, admin | S | MVP |
| 14 | Smart Join Compass | Users forget relationships in wide schemas | SQL developers | Suggests plausible joins with confidence and source evidence | M | V1 |
| 15 | Natural Language Object Finder | Object names are hard to remember | Everyone | Finds "customer revenue table" even when names differ | M | MVP |
| 16 | Semantic Metadata Search | Plain search misses synonyms and comments | Analysts, BI developers | Searches names, comments, lineage, docs, and embeddings | M | V1 |
| 17 | Result Anomaly Spotlight | Outliers are missed in large grids | Analysts, data scientists | Highlights unusual values, null spikes, and distribution shifts | M | V1 |
| 18 | Column Meaning Resolver | Cryptic column names slow work | Analysts, beginners | Infers likely meaning from names, comments, values, and joins | M | V1 |
| 19 | Row Sample Privacy Classifier | Users may send sensitive data to AI | Enterprise teams | Flags PII-like samples before AI or export actions | L | Enterprise |
| 20 | Explain Plan Diff | Optimizations are hard to compare | DBA, developers | Compares plans before/after edits and explains changes | M | V1 |
| 21 | Rollback Script Drafting | Changes ship without undo path | DBA, developers | Generates reviewed rollback candidates beside forward DDL | M | V1 |
| 22 | Safe Paste Mode | Pasted SQL may contain unsafe statements | Everyone | Classifies pasted scripts and highlights risky blocks | S | MVP |
| 23 | Transaction Sandbox | Users want to test mutations safely | Developers | Wraps changes in a controlled rollback-first workflow | M | V1 |
| 24 | Offline Metadata Briefcase | Users need to inspect schemas offline | Architects, analysts | Encrypted read-only metadata snapshots for travel/review | M | V1 |
| 25 | Workspace Risk Dashboard | Risk is scattered across settings | Team leads, DBA | Summarizes production tabs, open transactions, secrets, policies | M | Enterprise |
| 26 | Credential Expiry Coach | Expired credentials interrupt work | Everyone | Warns and guides refresh before failure | M | V1 |
| 27 | Secure Connection Object Builder | External data access setup is error-prone | Data engineers | Builds Exasol connection objects with masking and validation | M | V1 |
| 28 | Import Rehearsal Mode | Import mistakes waste time and resources | Data engineers | Samples, maps, validates, and estimates before real load | M | MVP |
| 29 | Data Freshness Timeline | Users do not know if data is current | Analysts, BI developers | Shows load/query/update signals as a freshness story | L | V1 |
| 30 | Query Cost Budget | Long queries surprise users | DBA, developers | Lets teams set duration/row/result-size budgets per workspace | M | Enterprise |
| 31 | Result Memory Gauge | Large results crash or slow clients | Everyone | Shows memory/spool pressure and safer export options | S | MVP |
| 32 | Slow Query Triage Inbox | Performance work lacks queue discipline | DBA | Turns slow queries into a review inbox with ownership | M | V1 |
| 33 | Lock Chain Narrator | Lock blockers are difficult to read | DBA | Explains blocker chains and safe next actions | M | V1 |
| 34 | Compare Lens | Comparing environments is tedious | Architects, DBA | Overlays object, data, grant, and setting differences | L | V1 |
| 35 | Named Execution Contexts | Users repeat connection/schema/settings setup | Developers | Saves context presets for recurring work | S | MVP |
| 36 | Prompt Context Picker | AI context is opaque | Everyone | Lets users choose exact SQL, metadata, docs, and data scope | M | MVP |
| 37 | AI Provenance Tags | Users cannot trust AI answers | Everyone | Labels every answer with context sources and provider/model | M | MVP |
| 38 | Data Masking Preview | Users do not know what will leave the app | Security, analysts | Shows redacted prompt/context before remote AI calls | M | MVP |
| 39 | Personal SQL Style Coach | Teams see inconsistent SQL | Developers | Learns user's style and suggests consistent formatting/refactors | M | V1 |
| 40 | Team SQL Style Gates | Shared SQL quality is inconsistent | Team leads | Enforces style checks before saved scripts or migrations | M | Enterprise |
| 41 | Documentation Debt Meter | Important objects lack comments/docs | Architects, BI teams | Shows undocumented hot objects and prioritizes doc work | S | V1 |
| 42 | Data Dictionary Drafts | Documentation is manual | BI developers, analysts | Generates reviewable object and column documentation | M | V1 |
| 43 | BI Lineage Capture | BI dependencies are invisible | BI developers | Links exported queries and views to reports/dashboards | L | Enterprise |
| 44 | Query Notebook Runbook | Operational SQL is not repeatable | DBA, data engineers | Converts notebooks into parameterized runbooks | M | V1 |
| 45 | Incident Mode Workspace | During incidents, normal UI is noisy | DBA, SRE | Reconfigures layout for sessions, locks, logs, and notes | M | Enterprise |
| 46 | DBA Morning Brief | Health checks are repetitive | DBA | Daily generated summary of slow queries, failures, locks, drift | M | Enterprise |
| 47 | Migration Flight Check | Release scripts miss prerequisites | Developers, architects | Validates grants, dependencies, environment, rollback, and locks | L | V1 |
| 48 | Schema Change Narrative | Diffs are hard for reviewers | Architects, reviewers | Converts schema diffs into human-readable release notes | M | V1 |
| 49 | Usage-Based Explorer Ordering | Alphabetical trees bury work | Everyone | Reorders optional views by recent and frequent use | S | MVP |
| 50 | Hot Path Favorites | Users repeat object chains | Developers, analysts | Pins recurring object paths, not just objects | S | MVP |
| 51 | One-Handed Command Mode | Mouse-heavy work is slow | Keyboard users | Optimizes navigation and actions around command palette chains | M | MVP |
| 52 | Error Timeline | Errors recur without context | Developers | Shows when similar errors happened and how they were fixed | M | V1 |
| 53 | Result Story Cards | Results need quick communication | Analysts | Turns result summaries into shareable cards with query provenance | M | V1 |
| 54 | Data Quality Microchecks | Users run manual validation queries | Data engineers | Suggests null, uniqueness, range, and distribution checks | M | V1 |
| 55 | CSV Repair Suggestions | CSV parsing errors are cryptic | Data engineers, analysts | Suggests delimiter, encoding, quote, and type fixes | S | MVP |
| 56 | Parquet Mismatch Assistant | File schema and table schema drift | Data engineers | Explains column/type mismatches and repair choices | M | V1 |
| 57 | Cloud Credential Audit | Storage credentials are hard to assess | Security, data engineers | Reviews connection objects for risky patterns and expiry | L | Enterprise |
| 58 | Least-Privilege Generator | Grants are often too broad | DBA, security | Generates minimal GRANT script for a task | M | V1 |
| 59 | Role Conflict Detector | Role inheritance causes surprises | DBA | Flags contradictory or risky effective permissions | L | Enterprise |
| 60 | Sensitive Object Badging | Users cannot see risk in explorer | Everyone | Marks regulated, production, or protected objects in-context | M | Enterprise |
| 61 | Production Quiet Hours Guard | Heavy jobs run at bad times | DBA, data engineers | Warns or blocks expensive work during protected windows | M | Enterprise |
| 62 | Scheduled Dry Run | Scheduled jobs fail late | Data engineers | Runs validation-only checks before scheduled execution | L | Enterprise |
| 63 | AI Pair DBA | DBA tasks require expert knowledge | DBA, beginners | Step-by-step assistant for sessions, locks, grants, and imports | M | V1 |
| 64 | Agent Approval Queue | AI work needs governance | Team leads, DBA | Central queue for proposed SQL, scripts, and admin actions | L | Enterprise |
| 65 | Local-Only AI Indicator | Users forget privacy mode | Security, everyone | Persistent UI badge proving no remote AI is active | S | MVP |
| 66 | Model Fitness Benchmark | Providers vary by SQL quality | AI admins | Runs local benchmark on Exasol prompts and ranks models | M | V1 |
| 67 | Provider Privacy Matrix | Provider settings are confusing | Enterprise admins | Compares data residency, logging, tools, and model features | M | Enterprise |
| 68 | MCP Tool Firewall | External tools expand risk | Security, AI users | Limits MCP tools by workspace, connection, and action type | L | Enterprise |
| 69 | Prompt Injection Sentinel | Metadata/result text can attack AI | Security, AI users | Detects suspicious instructions inside comments or data samples | L | Enterprise |
| 70 | Workspace Trust Mode | Shared workspace files can be unsafe | Everyone | Opens unknown workspaces in restricted mode | M | MVP |
| 71 | Plugin Permission Simulator | Users cannot assess plugin risk | Admins, developers | Shows exactly what a plugin could access before install | M | Later |
| 72 | Plugin Crash Quarantine | Bad plugins destabilize apps | Everyone | Disables crashing plugins and offers safe restart | M | Later |
| 73 | Layout Memory Per Task | One layout does not fit all work | Everyone | Restores panels per task type such as query, import, monitor | M | MVP |
| 74 | Multi-Monitor Layout Presets | Advanced users spread work across screens | DBA, power users | One command opens monitor/editor/AI windows on saved displays | M | V1 |
| 75 | Focus Trail Breadcrumbs | Users lose context in deep navigation | Everyone | Shows path across connection, schema, object, tab, and result | S | MVP |
| 76 | Recent Failure Shelf | Failed jobs disappear | Data engineers, DBA | Keeps failures visible until reviewed or dismissed | S | MVP |
| 77 | Result Cell Explain | Individual cells need context | Analysts | Explains value, column, type, nullability, and related docs | M | V1 |
| 78 | Private Chart Suggestions | Charting can leak data to AI | Analysts | Suggests chart types from local schema/profile only | M | V1 |
| 79 | Quick Sample Builder | Users need reproducible samples | Data scientists | Creates sampled tables/results with provenance and limits | M | V1 |
| 80 | Test Data from Shape | Fixtures are tedious | Developers | Generates synthetic data from schema and constraints | M | V1 |
| 81 | Synthetic Privacy Proof | Synthetic data may resemble real rows | Security, developers | Scores synthetic output against real samples locally | L | Enterprise |
| 82 | Query Fingerprint Clustering | Similar queries flood history | DBA, developers | Groups query variants into fingerprints for analysis | M | V1 |
| 83 | SQL Snippet Evolution | Snippets get stale | Teams | Tracks snippet usage and suggests cleanup or promotion | S | Later |
| 84 | Dependency Warnings Inline | SQL edits break downstream objects | Developers | Warns while editing when referenced objects have dependents | M | V1 |
| 85 | Rename Impact Planner | Renames are risky | Architects, DBA | Finds dependent SQL, views, docs, and notebooks before rename | L | V1 |
| 86 | Cross-Schema Reference Map | Dependencies across schemas are hidden | Architects | Visual map of cross-schema references and ownership boundaries | L | V1 |
| 87 | Environment Packs | Teams configure environments inconsistently | Team leads | Shares non-secret connection policies, labels, and defaults | M | Enterprise |
| 88 | Onboarding Missions | Beginners do not learn product capabilities | Beginners | Guided tasks using sample data and safe local connections | M | MVP |
| 89 | Contextual Exasol Help | Docs are separate from work | Everyone | Surfaces exact docs based on error, SQL, object, or wizard step | M | MVP |
| 90 | AI Draft Review Linter | AI SQL can look plausible but wrong | Developers | Static checks every AI-generated SQL draft before insertion | M | MVP |
| 91 | Admin Action Receipt | Admin work lacks handoff trail | DBA | Generates receipt with SQL, actor, time, target, and outcome | M | V1 |
| 92 | Support Bundle Redaction Preview | Support exports may leak data | Enterprise admins | Shows exact files and redactions before creating bundle | M | MVP |
| 93 | Connection Health Contract | Connection quality varies | Everyone | Defines expected latency/TLS/auth settings and flags drift | M | V1 |
| 94 | Background Metadata Budget | Metadata refresh can overload systems | DBA | Throttles refresh work by connection and time window | M | MVP |
| 95 | Cache Confidence Labels | Cached metadata may be stale | Everyone | Shows freshness and source of every cached object detail | S | MVP |
| 96 | Access Trend Badges | Important table changes are missed | DBA, analysts | Badges objects with rising/falling access or update activity | M | V1 |
| 97 | Cancellation Confidence | Users do not know if cancel worked | Everyone | Shows cancel requested, acknowledged, server state, and fallback | M | MVP |
| 98 | Export Chain of Custody | Data exports need accountability | Security, analysts | Records source query, row count, target, checksum, and actor | L | Enterprise |
| 99 | Secretless Workspace Share | Sharing workspaces risks credentials | Teams | Exports layout, queries, docs, and settings without secrets | M | V1 |
| 100 | Exasol Studio Labs | Innovation needs controlled rollout | Product teams | Lets users enable experimental features with feedback capture | M | Later |

## 44. Sources Consulted

- DataGrip features: https://www.jetbrains.com/datagrip/features/
- DBeaver documentation: https://dbeaver.com/docs/dbeaver/
- DbVisualizer features: https://www.dbvis.com/features/
- pgAdmin documentation: https://www.pgadmin.org/docs/pgadmin4/latest/
- TablePlus product page: https://tableplus.com/
- Navicat Premium product page: https://www.navicat.com/en/products/navicat-premium
- SQL Server Management Studio documentation: https://learn.microsoft.com/en-us/ssms/sql-server-management-studio-ssms
- Azure Data Studio documentation and retirement notice: https://learn.microsoft.com/en-us/azure-data-studio/what-is-azure-data-studio
- Oracle SQL Developer product page: https://www.oracle.com/database/sqldeveloper/
- Visual Studio Code documentation: https://code.visualstudio.com/docs
- VS Code agents documentation: https://code.visualstudio.com/docs/agents/overview
- Cursor product page: https://cursor.com/en-US
- GitHub Copilot product page: https://github.com/features/copilot
- OpenAI Codex documentation: https://developers.openai.com/codex/
- Claude Code documentation: https://code.claude.com/docs/en/overview
- OpenCode product page: https://opencode.ai/
- Exasol documentation: https://docs.exasol.com/
- Exasol system tables documentation: https://docs.exasol.com/db/latest/sql_references/system_tables.htm
- Exasol IMPORT documentation: https://docs.exasol.com/db/latest/sql/import.htm
- Exasol EXPORT documentation: https://docs.exasol.com/db/latest/sql/export.htm
- Tauri documentation: https://v2.tauri.app/start/
- Tauri security documentation: https://v2.tauri.app/security/

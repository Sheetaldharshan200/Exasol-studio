# Exasol Studio Delivery Tasks

Related documents:

- [requirements.md](./requirements.md)
- [design.md](./design.md)
- [architecture.md](./architecture.md)
- [agent.md](./agent.md)
- [graphify/README.md](./graphify/README.md)

## 1. Task System Rules

This file is the execution source of truth for project delivery.

Rules:

- every implementation change must map to a task in this file
- every completed phase must update its checkbox state
- every phase includes validation and test expectations
- architecture or scope changes must update the relevant checklist and supporting docs

Status legend:

- `[ ]` not started
- `[-]` in progress
- `[x]` complete
- `[!]` blocked or needs decision

## 2. Current Status

### Foundation Work

- [x] Product specification created
- [x] Technical foundation docs created
- [x] Project folder scaffolded
- [x] ADR baseline created
- [x] Agent configuration baseline created
- [x] Graphify documentation baseline created
- [x] Graphify tooling installed
- [x] Delivery task plan upgraded into execution-grade checklist
- [x] Multi-window agent operating model upgraded
- [x] Graphify SVG rendering validated on this machine
- [x] Graphify HTML index generation validated on this machine

### Implementation Readiness

- [x] Repository shape established
- [x] Frontend workspace bootstrapped
- [ ] Rust workspace bootstrapped
- [ ] Driver service proof of concept built
- [ ] CI workflows implemented
- [ ] Test harness wired

### Local First-Install Stack

- [x] Studio-owned macOS Exasol Personal lifecycle implemented
- [x] Studio-owned Windows/Linux Docker-or-Podman Exasol Nano lifecycle implemented
- [x] Pinned PyExasol, ExaPump, MCP server, Semantic Views, Exasol agent skills, and Fable Method wired into first install
- [x] Semantic capability gated on an authenticated install/readiness probe
- [x] Rust unit tests, type checks, and production builds pass
- [ ] Release smoke test on clean macOS, Windows, and Linux machines

## 3. Delivery Milestones

| Milestone | Goal | Exit Gate |
|---|---|---|
| M0 | Foundation accepted | docs, tasks, ADRs, and repo scaffold approved |
| M1 | Shell foundation working | desktop app starts, persists state, and restores layout |
| M2 | Query MVP working | user can connect, browse, edit, run, cancel, and view results |
| M3 | DBA tooling working | sessions, plans, diagnostics, and safety workflows are viable |
| M4 | AI MVP working | provider config, contextual actions, review flow, and logs work |
| M5 | Data movement working | import/export and external-data flows are usable and testable |
| M6 | Release candidate ready | CI, packaging, docs, tests, and hardening are complete |

## 4. Phase 0: Foundation and Bootstrapping

### Objectives

- establish executable repository foundations
- validate core technology choices
- reduce architecture risk before feature implementation

### Work Checklist

- [x] Create repository structure
- [x] Create top-level contributor docs
- [x] Create architecture, design, requirements, and wiki docs
- [x] Create ADR baseline
- [x] Create initial graphify docs directory
- [x] Create root workspace manifest and base package metadata
- [ ] Create Rust workspace manifest
- [x] Create desktop app package manifest
- [ ] Create baseline lint and format strategy
- [ ] Create local environment examples and bootstrap instructions

### Tests and Validation

- [ ] Verify repository layout matches architecture doc
- [ ] Verify all docs cross-link cleanly
- [ ] Verify no required top-level folder is undocumented
- [ ] Verify workspace bootstrapping instructions are reproducible on a clean machine

### Done Criteria

- root manifests exist
- repo bootstraps without manual guessing
- docs and folder ownership are aligned

## 5. Phase 1: Desktop Shell and State Foundation

### Objectives

- stand up the Tauri shell and frontend host
- create durable local state and layout persistence

### Work Checklist

- [x] Initialize desktop UI workspace
- [ ] Initialize Tauri host project
- [x] Create base shell layout with activity bar, sidebars, bottom panel, and status bar
- [ ] Define shared command and event contracts
- [ ] Implement workspace store crate
- [ ] Implement window and layout persistence
- [ ] Implement secure credential bridge interface
- [ ] Add app startup and recovery flow skeleton

### Tests and Validation

- [ ] App launches successfully on a developer machine
- [ ] Window layout persists across restart
- [ ] Unsaved workspace state survives restart
- [ ] Secret values are not written to plain-text project files
- [ ] Command contracts compile and are type-safe

### Done Criteria

- desktop shell opens reliably
- state persists predictably
- secure storage boundary exists

## 6. Phase 2: Connectivity and Query MVP

### Objectives

- deliver the main user workflow: connect, browse, edit SQL, execute, inspect results

### Work Checklist

- [ ] Prototype Exasol connectivity boundary
- [ ] Decide and document initial driver strategy
- [ ] Implement connection manager UI
- [ ] Implement connection testing flow
- [ ] Implement explorer tree and lazy metadata loading
- [ ] Implement SQL editor with base Exasol language support
- [ ] Implement run statement, run selection, and cancel query
- [ ] Implement result streaming and paging baseline
- [ ] Implement result tab model and query history baseline
- [ ] Implement workspace restore for open editors and consoles

### Tests and Validation

- [ ] Can connect to a local or disposable Exasol instance
- [ ] Can browse schemas and objects without UI lockups
- [ ] Can execute and cancel a long-running query
- [ ] Can reopen the app and recover the previous session
- [ ] Large result paging works without exhausting renderer memory

### Done Criteria

- a developer can do daily SQL work inside Studio
- cancellation and recovery are not fake

## 7. Phase 3: Diagnostics and DBA Workflows

### Objectives

- make the product viable for operational and deeper debugging work

### Work Checklist

- [ ] Implement query history panel
- [ ] Implement error classification and diagnostics view
- [ ] Implement object inspector and DDL preview
- [ ] Implement dependency view baseline
- [ ] Implement session manager
- [ ] Implement lock and blocker inspection baseline
- [ ] Implement query plan viewer baseline
- [ ] Implement risk classification and production safety badges
- [ ] Implement approval UX for destructive operations

### Tests and Validation

- [ ] Failed SQL preserves diagnostics and retry context
- [ ] Session manager reflects live activity accurately
- [ ] Destructive queries in production-marked connections trigger approvals
- [ ] DDL preview and dependency views match sampled objects
- [ ] Query plan view handles representative Exasol output

### Done Criteria

- DBA workflows are usable without leaving the product
- safety controls are visible and enforceable

## 8. Phase 4: AI and Agent Workflows

### Objectives

- add governed AI assistance that helps without bypassing review and safety

### Work Checklist

- [ ] Implement AI provider registry
- [ ] Implement provider settings and secret storage integration
- [ ] Implement context builder for editor, explorer, results, and diagnostics
- [ ] Implement redaction service
- [ ] Implement AI review dialog and patch apply flow
- [ ] Implement chat sidebar baseline
- [ ] Implement inline AI actions for SQL generation and explanation
- [ ] Implement audit logging for AI actions
- [ ] Implement model and provider provenance display
- [ ] Implement multi-window agent handoff support in product UX where applicable

### Tests and Validation

- [ ] Provider configuration can be saved and tested
- [ ] AI actions show provider and context scope
- [ ] Sensitive values are redacted before external provider calls
- [ ] Generated SQL requires review before execution
- [ ] AI logs record prompt metadata without storing secrets
- [ ] New-window agent handoffs preserve enough context to continue work safely

### Done Criteria

- AI is useful, reviewable, and governed
- window-aware agent workflows are documented and testable

## 9. Phase 5: Data Movement and External Data

### Objectives

- support imports, exports, and ecosystem-aware external data workflows

### Work Checklist

- [ ] Implement import wizard baseline
- [ ] Implement export wizard baseline
- [ ] Implement job manager UI for long-running data movement
- [ ] Implement file preview, mapping, and validation flow
- [ ] Surface Exasol ecosystem guidance for Virtual Schemas, Cloud Storage Extension, and related paths
- [ ] Add failure recovery notes and repair suggestions
- [ ] Add artifact metadata tracking for exports

### Tests and Validation

- [ ] CSV import path works end to end
- [ ] Export path produces expected artifact metadata
- [ ] Failed import exposes useful recovery details
- [ ] Long-running jobs remain visible after UI navigation
- [ ] Ecosystem guidance labels official versus Labs inputs correctly

### Done Criteria

- common data movement workflows are guided, traceable, and recoverable

## 10. Phase 6: Extensibility, CI, and Release Hardening

### Objectives

- make the repository scalable for a growing team and safer for release

### Work Checklist

- [ ] Implement internal extension manifest shape
- [ ] Define plugin permission model
- [ ] Add CI workflow files
- [ ] Add unit, integration, and e2e test runners
- [ ] Add graphify render and validation scripts to CI
- [ ] Add diagnostics and support bundle baseline
- [ ] Add packaging and signing plan
- [ ] Add release checklist and versioning policy
- [ ] Add enterprise policy extension design hooks

### Tests and Validation

- [ ] CI runs lint, type, unit, integration, and e2e stages
- [ ] Graphify docs validate cleanly
- [ ] Release packaging completes for target platforms
- [ ] Plugin permission enforcement is testable
- [ ] Support bundle redacts secrets correctly

### Done Criteria

- the repo can scale without losing quality
- release preparation is repeatable

## 11. Kiro-Style Workstreams

### Workstream A: Architecture Integrity

- [x] Architecture baseline documented
- [ ] Driver-service ADR finalized
- [ ] Plugin boundary contracts finalized
- [ ] Shared type ownership rules finalized

### Workstream B: Product Usability

- [ ] First-run experience designed
- [ ] Core query workflow polished
- [ ] Error and recovery UX polished
- [ ] Multi-window workflow UX validated

### Workstream C: AI Safety and Trust

- [x] AI governance principles documented
- [ ] Review-only AI mutation flow implemented
- [ ] Prompt redaction tests added
- [ ] Provider provenance UX implemented

### Workstream D: Delivery Discipline

- [x] Foundation task system documented
- [ ] CI pipelines active
- [ ] Release checklist active
- [ ] Documentation drift checks active

## 12. Test Matrix

| Test Area | Phase | Owner | Required Before |
|---|---|---|---|
| Repo bootstrap validation | 0 | Project agent | M0 approval |
| Layout persistence | 1 | QA and safety agent | M1 |
| Secret handling | 1 | QA and safety agent | M1 |
| Connectivity spike | 2 | Architecture and integration agents | M2 |
| Query run and cancel | 2 | QA and safety agent | M2 |
| Large result handling | 2 | QA and safety agent | M2 |
| Session and plan workflows | 3 | QA and safety agent | M3 |
| Production safety approvals | 3 | QA and safety agent | M3 |
| AI redaction and review | 4 | QA and safety agent | M4 |
| New-window handoff validation | 4 | Documentation and QA agents | M4 |
| Import/export recovery | 5 | QA and safety agent | M5 |
| Graphify validation | 6 | Documentation agent | M6 |
| CI and release packaging | 6 | Project and QA agents | M6 |

## 13. Blockers and Decision Queue

- [ ] Finalize initial Exasol driver boundary choice
- [ ] Decide root JavaScript workspace toolchain details
- [ ] Decide Rust workspace naming and crate split
- [ ] Decide whether rendered graph assets should be committed or generated in CI only

## 14. Documentation and Task Sync Checklist

- [x] `requirements.md` reflects current scope
- [x] `design.md` reflects architecture direction
- [x] `architecture.md` references current ADRs
- [x] `agent.md` includes multi-window workflow rules
- [x] graphify tooling is installed and documented
- [x] graphify rendering works locally with browserless Node rendering
- [ ] CI workflow docs reflect actual workflow files

## 15. Review Notes

- Completeness check: phases, epics, checklists, tests, done criteria, blockers, and sync rules are covered.
- Consistency check: tasks align with the architecture and multi-window agent model.
- Improvement applied: this file now acts as an operational checklist instead of a narrative roadmap only.

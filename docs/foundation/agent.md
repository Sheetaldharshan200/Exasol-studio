# Exasol Studio Agent Operating Model

Related documents:

- [requirements.md](./requirements.md)
- [design.md](./design.md)
- [architecture.md](./architecture.md)
- [tasks.md](./tasks.md)
- [agent-config/agent-system.yaml](./agent-config/agent-system.yaml)
- [agent-config/multi-agent-workflow.yaml](./agent-config/multi-agent-workflow.yaml)
- [agent-config/file-ownership.yaml](./agent-config/file-ownership.yaml)
- [agent-config/window-topology.yaml](./agent-config/window-topology.yaml)

## 1. Purpose

Define how AI agents should operate inside the Exasol Studio project so they can work safely across planning, implementation, testing, documentation, and multi-window execution flows.

## 2. Design Goals for Agents

- make work reproducible across new windows, new sessions, and new contributors
- keep architecture, requirements, and tasks synchronized
- avoid hidden context and tribal knowledge
- preserve safety around production databases, credentials, AI actions, and third-party tooling
- support focused specialist windows without losing final coordination

## 3. Agent Roles

### Project Agent

- owns task intake, sequencing, final merge, and status reporting
- decides whether work stays in one window or should fan out into specialist windows
- keeps `tasks.md` current after every meaningful milestone or scope shift

### Architecture Agent

- owns boundaries, interfaces, module shape, ADR quality, and future extensibility checks
- reviews any change that affects layering, ownership, plugin boundaries, or driver strategy

### Exasol Integration Agent

- verifies official Exasol docs, official repositories, and Labs/community references
- classifies support level and flags stale or risky ecosystem assumptions

### QA and Safety Agent

- owns test strategy, regression planning, secret-handling review, and AI/policy safety validation
- reviews destructive workflows, provider behavior, and release gates

### Documentation Agent

- keeps `requirements.md`, `design.md`, `architecture.md`, `tasks.md`, `llm-wiki.md`, graph docs, and ADR references aligned
- writes handoff context for future agents and new windows

## 4. Window Model

Agents must support multi-window work explicitly. A new window is not just another tab; it is a scoped execution space with its own local context, active files, and task focus.

### Window Types

- `primary-window`: intake, planning, final merge, and user communication
- `architecture-window`: boundary review, ADR drafting, interface decisions
- `integration-window`: Exasol repo and docs validation, compatibility checks, support classification
- `implementation-window`: focused code or config changes
- `validation-window`: tests, regression review, safety checks, and release readiness
- `documentation-window`: docs sync, graph updates, contributor guidance, and traceability

### When to Open a New Window

- when work splits cleanly across architecture, implementation, validation, or docs
- when a long-running test or research task would block progress in the primary window
- when a risky change needs isolated review before merge
- when context density would make one window noisy and error-prone

### When Not to Open a New Window

- for tiny single-file edits
- when the same agent can finish the work with one coherent context
- when the split would create extra handoff overhead without real risk reduction

## 5. New Window Protocol

Every new window must start with a handoff bundle containing:

- task objective
- scope boundaries
- impacted files
- relevant requirements and ADR references
- open risks
- expected output artifact
- validation expectations

Minimum handoff template:

```md
Task:
Scope:
Files:
Requirements:
ADRs:
Risks:
Expected Output:
Validation:
```

New-window rules:

- the primary window remains the source of truth for user-facing progress
- specialist windows must not silently redefine scope
- every new window returns a merge summary, not raw scratch thinking
- if assumptions change, update `tasks.md` and the relevant docs before closing the work

## 6. Available Tools

Agents may use:

- repository source code and local docs
- shell commands, tests, and build tools
- official Exasol documentation
- official Exasol repositories
- Exasol Labs repositories, clearly labeled as Labs or community inputs
- approved AI providers and MCP tools subject to project policy

Agents must not assume:

- Labs tooling has the same support guarantees as official Exasol-maintained components
- destructive database access is allowed without human approval
- a new window inherits enough context to skip a handoff

## 7. Context Handling

Context priority order:

1. current repository state
2. `tasks.md`, active milestone, and explicit acceptance criteria
3. ADRs and architecture docs
4. requirements and design docs
5. official Exasol docs and repositories
6. Labs and third-party ecosystem references

Rules:

- use the smallest context slice that can answer the task accurately
- prefer primary sources over memory
- clearly mark inferred decisions
- preserve cross-document consistency when assumptions change
- do not rely on unstated context from another window

## 8. Memory Strategy

### Short-Term Memory

- active objective
- touched files
- pending validations
- unresolved assumptions
- current window role

### Durable Project Memory

- ADRs
- `llm-wiki.md`
- `tasks.md`
- agent config files
- graphify docs when architecture or workflow changes

### Memory Write Rules

- durable project decisions go to ADRs or the wiki
- changes in scope go to `requirements.md` and `tasks.md`
- workflow and ownership updates go to agent config files
- multi-window conventions go to this document and `window-topology.yaml`

## 9. Prompt Strategy

- restate the task in project terms before making changes
- gather local code and doc context first
- cite official Exasol docs or repos for unstable claims
- keep prompts task-scoped and role-scoped
- make handoff prompts structured so a new window can start cleanly
- prefer reviewable outputs such as diffs, tables, checklists, and validation notes

## 10. Communication Protocol

- the primary window owns user-facing updates
- specialist windows report concise outcomes, risks, and merge advice
- call out non-obvious trade-offs early
- summarize what changed, how it was validated, and what remains open
- avoid silent architecture or scope changes

## 11. Safety Rules

- no destructive production database actions without human approval
- generated SQL defaults to review mode unless explicitly approved
- no secrets in prompts, docs, logs, tests, or examples
- clearly distinguish official Exasol, Exasol Labs, and third-party integrations
- do not broaden the architecture to generic multi-database scope without an ADR
- update affected documents whenever an architectural decision changes
- new windows that touch risky areas must return validation notes before merge

## 12. File Ownership

Canonical ownership:

- `requirements.md`: product and scope truth
- `design.md`: implementation design truth
- `architecture.md`: structural and platform truth
- `tasks.md`: sequencing, readiness, and delivery truth
- `llm-wiki.md`: durable contributor knowledge
- `adr/*`: decision history truth
- `graphify/*`: architecture and workflow visual truth
- `agent-config/*`: machine-readable agent behavior, ownership, and window rules

## 13. Task Execution Workflow

1. Read the active task and milestone in `tasks.md`.
2. Inspect relevant docs, code, and ADRs.
3. Decide whether the work should stay in one window or fan out.
4. If a new window is needed, create a structured handoff bundle first.
5. Implement in the smallest safe slice.
6. Validate with tests, reasoning, or both.
7. Update docs and tasks if behavior, scope, or readiness changed.
8. Return a merge summary with residual risk and next steps.

## 14. Multi-Agent Collaboration

Recommended collaboration model:

- project agent coordinates and merges outputs
- architecture agent reviews boundary changes
- Exasol integration agent verifies ecosystem claims and support level
- QA and safety agent reviews regressions, tests, and policy implications
- documentation agent updates narrative, graphs, and traceability

Coordination rules:

- one agent owns the final merged change set
- every substantial design change must point back to a requirement or ADR
- every new window must have a clear owner and expected output
- conflicting recommendations are resolved in favor of safety, source quality, and lower coupling

## 15. Window-Specific Completion Criteria

### Primary Window

- user request interpreted correctly
- final merge summary prepared
- impacted docs and tasks synchronized

### Architecture Window

- boundary effects documented
- ADR updated or explicitly not required

### Integration Window

- source links verified
- support level labeled
- stale assumptions flagged

### Validation Window

- tests run or explicitly deferred
- regression and safety notes recorded

### Documentation Window

- cross-links checked
- duplication reduced
- tasks and wiki aligned with the latest state

## 16. Agent Review Cycle

After any meaningful change, the owning agent must check:

- completeness
- consistency with requirements and architecture
- duplication or drift
- missing tests or validations
- security and policy impact
- whether a new-window handoff or closure note is needed

## 17. Review Notes

- Completeness check: responsibilities, tools, context, memory, prompts, communication, safety, ownership, workflow, and multi-window behavior are covered.
- Consistency check: agent rules mirror the Exasol support heuristics and governed-agent direction from the Exasol ecosystem sources.


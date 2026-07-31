# Design — Skills Marketplace

## Provider install mechanisms (grounded in the repo's install.sh)
| Target        | Detection                              | Install command                                                        |
|---------------|----------------------------------------|-----------------------------------------------------------------------|
| Studio agent  | always present (in-app)                 | existing `skillsApi` (save pack to the agent)                          |
| Claude Code   | `claude` on PATH                        | `claude plugin marketplace add exasol-labs/exasol-agent-skills` then `claude plugin install exasol --scope user` |
| Codex         | `codex` on PATH                         | `npx --yes skills add exasol-labs/exasol-agent-skills --agent codex`   |
| Cursor        | `cursor` on PATH (or app detected)      | `npx --yes skills add exasol-labs/exasol-agent-skills --agent cursor`  |
| others        | provider CLI on PATH                    | `npx --yes skills add … --agent <id>`                                  |

`npx skills` generalizes across agents, so new providers are one table row, no
new install code. Each external install is a `run_streamed` shell-out with its
output surfaced in the install console (same UX as component installs).

## Skills catalog source (Studio-side)
- A `skills-catalog.json` (baked in `resources/`, later CI-published like
  `catalog.json`): `{ generatedAt, official: [{id,name,description}], }`.
  Generated from the repo's `plugins/exasol/skills/*/SKILL.md` frontmatter by a
  small script (reused by CI). The app reads this, never the repo directly.
- Built-in packs stay hard-coded in the UI (Studio-agent skills), as today.

## Backend (Rust) — new commands
- `skills_detect_agents() -> Vec<AgentTarget>`: `{ id, name, installed, install_url }`.
  Reuses the existing AI-client detection where possible (the MCP client
  detection already knows Claude/Codex/Cursor); adds a PATH check for the
  install CLI.
- `skills_install(target_id: String) -> ()`: dispatch on target → run the
  provider command via `run_streamed` (emits to the install console). Studio
  agent handled in the frontend via `skillsApi` (no Rust needed) OR a thin
  passthrough. Refuse unknown/uninstalled targets.
- Pure helper `agent_install_command(target_id) -> (program, args)` — unit
  tested (table above), no shell-out in the test.

## Frontend
- Rework `SkillsTab.tsx` into the Skills Marketplace: a catalog list (official +
  built-in, source-badged, filterable) reusing the existing card/section styling
  from `Marketplace.tsx` for consistency (no native selects, icons only).
- Install flow: a small target-picker popover (checkboxes: Studio agent +
  detected providers, all-detected checked by default; uninstalled providers
  shown disabled with an install link). "Install to N" runs each selected
  target's install and reports per-target success/failure.
- Built-in packs keep their current Studio-agent save path.

## Slices
1. **Catalog + Studio-agent install** (this change's first shippable slice):
   unified list (official baked list + built-in packs), source badges, filter;
   built-in packs install to the Studio agent as today; official entries are
   listed (install wired in slice 2). `skills-catalog.json` + generator script.
2. **External-provider install**: `skills_detect_agents` + `skills_install` +
   `agent_install_command` (tested) + the target-picker UI; Claude Code + Codex.
3. **More providers** (Cursor, Gemini, etc.) via the `npx skills --agent` row;
   per-target result reporting; "not installed" + install links.

## Tests
- `agent_install_command` table test (Rust `#[cfg(test)]`): each known target →
  expected program+args; unknown target → None/err.
- The skills-catalog generator: a pure parse test (SKILL.md frontmatter → entry)
  in the generator script's language.

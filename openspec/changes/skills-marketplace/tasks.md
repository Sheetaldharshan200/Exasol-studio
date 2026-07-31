# Tasks

Legend: [ ] todo · [x] done. Phased so each slice ships + is Codex-reviewed.

## Slice 1 — Unified catalog + Studio-agent install
- [ ] `resources/skills-catalog.json` + a generator script that reads the
      official repo's `plugins/exasol/skills/*/SKILL.md` frontmatter (name,
      description) into `{ generatedAt, official: [...] }`. Baked; CI-published
      later. Test: generator frontmatter-parse (pure).
- [ ] Rework `SkillsTab.tsx` → Skills Marketplace: one list combining official
      (from skills-catalog.json) + built-in role packs, source-badged
      (`official`/`built-in`), filterable. Reuse Marketplace card styling; icons
      only, no native selects. Built-in packs keep the current Studio-agent save.

## Slice 2 — External-provider install (Claude Code + Codex + Cursor) ✅ core done
- [x] Rust `skills_market.rs`: `install_commands(target_id)` (pure, table:
      claude-code → `claude plugin marketplace add`/`install`; codex/cursor →
      `npx skills add … --agent <id>`), `tooling_present` (provider CLI on PATH),
      `skills_targets()`, `install_skills()` (run_streamed each command; refuse
      unknown/uninstalled). Commands `skills_list_targets`/`skills_install_target`
      registered; ipc bindings + mock + `SkillTarget` type. Tests cover the
      command table + unknown target + the target list.
- [x] SkillsTab → Skills Marketplace section (`ExasolSkillsForAgents`): lists the
      official skill set, per-target Install for detected providers, external
      link for uninstalled ones. Built-in role packs below stay Studio-agent.
- [ ] Multi-select "install to N at once" (today it's one button per target) +
      Studio-agent target inside the same picker.

## Slice 3 — More providers + polish
- [ ] Add Cursor / Gemini / others via the `npx skills --agent <id>` row.
- [ ] Per-target result surfacing; "not installed" badges + install links.
- [ ] Deep-link from onboarding / an "add skills" nudge.

## Cross-cutting
- [ ] Codex-review each slice; tsc + cargo test + vite build green before commit.
- [ ] Trust model: official skills list comes from the Studio-side catalog, never
      a live query to the skills repo (only the install action calls provider
      tooling).

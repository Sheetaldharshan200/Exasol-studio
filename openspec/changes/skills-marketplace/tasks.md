# Tasks

Legend: [ ] todo · [x] done. The design evolved with user feedback across three
rounds — the final shipped shape (commit 7b2fa6b) supersedes the earlier
persona-pack plan.

## Final shipped design (2026-08-01)
- [x] **Official skills page** (SkillsTab full rewrite): all 18
      exasol-labs/exasol-agent-skills listed individually (minimal divide-y
      rows, lowercase, full width, Exasol-green tab selection) + a Bundles tab
      whose 5 role bundles contain ONLY official skills. "add all" menu on top.
- [x] **Multi-select add menu** (shadcn DropdownMenuCheckboxItem, stays open
      while picking): exa-ai (ExasolMark logo) / claude code (Anthropic logo) /
      codex (OpenAI logo); one "add to N agents" applies per destination
      independently and names failures; uninstalled agents link out.
- [x] **Real per-agent installed state**: skills_installed_official scans
      ~/.claude/skills, ~/.agents/skills, ~/.codex/skills (paths verified with a
      live skills-CLI install). "added" only when EVERY installed agent has the
      skill; the menu ticks agents that already do; map refreshes after adds.
- [x] **Backend**: OFFICIAL_SKILL_IDS allowlist; per-skill installs via the
      cross-agent skills CLI (`npx skills add <repo> -a <agent> -s <ids> -g -y`
      — per-skill support verified against the CLI's --help); exa-ai installs
      fetch SKILL.md (frontmatter parsed) and save via the agent skill API.
      11 Rust unit tests.
- [x] Earlier rounds (superseded but retained in history): whole-set installs
      via `claude plugin install exasol@exasol-skills` / `npx skills add
      --agent codex` (still used by skills_install_target); persona SKILL.md
      writer (skills_install_persona — symlink-refusing, collision-rejecting,
      kept for programmatic use).
- [x] Removed per user direction: hand-written role packs, custom-skill
      authoring form, chip checkboxes, pack modal, drag reorder.

## Cross-cutting
- [x] Codex-reviewed across rounds (plugin-id fix, symlink/collision guards,
      partial-failure reporting, menu hoisting); final-state review re-run
      post-ship, findings folded in.
- [ ] Later: surface skill descriptions fetched from the repo (baked catalog)
      instead of hand-written one-liners; remove/uninstall actions per agent.

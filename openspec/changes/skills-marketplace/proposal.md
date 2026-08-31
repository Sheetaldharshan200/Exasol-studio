# Proposal — Skills Marketplace (one place to install Exasol skills into every agent)

## Why
Today the Skills tab only manages **Studio's own in-app agent** (built-in role
packs saved via `skillsApi`). But users run other AI agents too — Claude Code,
Codex, Cursor — and Exasol publishes a curated skill set
(`exasol-labs/exasol-agent-skills`, 18 skills). There is no single place to
discover Exasol-recommended skills and push them into *whichever* agents the
user actually has. The user wants the Skills tab to become a **Skills
Marketplace**: browse Exasol-recommended skills once, then install them into the
local agent **and** every detected external provider — "all in one place."

## What
1. **Unified skills catalog.** One list combining:
   - **Exasol official** skills from `exasol-labs/exasol-agent-skills` (name +
     description surfaced from each `SKILL.md` frontmatter), and
   - the existing **built-in role packs** (Data Scientist, BI Developer,
     Analytics Engineer, Data Analyst) already in the Skills tab.
   Each entry is labelled by source (`official` vs `built-in`).
2. **Per-install target picker.** Installing a skill shows every agent detected
   on this machine as checkboxes — Studio's own agent **+** Claude Code, Codex,
   Cursor, … — defaulting to all detected. The user chooses where it lands.
3. **Install via each provider's OWN tooling** (never hand-written skill dirs):
   - **Studio agent** → existing in-app `skillsApi` (unchanged).
   - **Claude Code** → `claude plugin marketplace add <repo>` +
     `claude plugin install exasol --scope user`.
   - **Codex / Cursor / others** → `npx skills add exasol-labs/exasol-agent-skills
     --agent <id>`.
   This mirrors the repo's official `install.sh`, so installs use the supported,
   trustworthy path and Studio never guesses a provider's internal layout.
4. **Installed-providers only.** Detect which agent CLIs are present. Providers
   that aren't installed show a "not installed" badge + a link to their install
   page — Studio does **not** download the CLIs themselves.

## Non-goals
- **Not** installing/downloading the AI agent CLIs themselves (Codex, Claude
  Code) — skills go only into already-installed providers (user directive).
- **Not** authoring a Studio-specific skill format — reuse the official repo's
  skills and the existing built-in packs as-is.
- **Not** per-skill granular install into external providers in v1: the official
  tooling installs the Exasol skill set as a bundle. Studio lists the individual
  skills for discovery but installs the bundle into external providers; the
  Studio agent still takes individual packs (as today).
- **Not** live-fetching the repo for display on the hot path — the official
  catalog is resolved from a Studio-side source (baked/`catalog.json`), matching
  the "users only see the Studio side" trust model.

## Trust model alignment
Consistent with the verified-only marketplace: the list of official skills shown
comes from Studio's side (a baked/CI-published skills catalog), not a live query
to the skills repo. Only the *install action* invokes the provider's tooling
(which itself pulls the pinned Exasol plugin/skills).

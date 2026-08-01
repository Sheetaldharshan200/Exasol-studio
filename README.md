# Exasol Studio

**A desktop app for working with [Exasol](https://www.exasol.com) databases — with a built-in AI assistant that speaks SQL so you don't have to.**

Ask questions in plain words. Exa (the assistant) finds the right tables, writes and runs the SQL, builds dashboards, and loads your files — showing you every step and asking before it changes anything.

---

## Download & install

### ⬇️ Get the installer — [**Releases ›**](../../releases/latest)

Download the one file for your computer and open it. That's the whole install.

| Your computer | Download | Then |
|---|---|---|
| **Mac** — Apple Silicon (M1–M4) | **[`ExasolStudio-Mac-AppleSilicon.dmg`](../../releases/latest)** | Open the DMG, drag into **Applications** |
| **Mac** — Intel | **[`ExasolStudio-Mac-Intel.dmg`](../../releases/latest)** | Open the DMG, drag into **Applications** |
| **Windows** | **[`ExasolStudio-Windows-64bit-setup.exe`](../../releases/latest)** | Run it — installs for you, no admin |
| **Linux** | **[`ExasolStudio-Linux-64bit.AppImage`](../../releases/latest)** (or `.deb` / `.rpm`) | `chmod +x` and run |

> On macOS this demo build isn't Apple-notarized yet, so the first launch shows
> a Gatekeeper prompt — **right-click the app → Open → Open** (once). Or use the
> command-line backup below, which clears that for you.

### No permission to run the installer? Try the command line

Locked-down machine, can't get admin, or the installer is blocked? These install
into **your user space — no admin rights needed** — and are a clean way to just
try it. **One command each** — no separate tap/bucket step.

**macOS** (needs [Homebrew](https://brew.sh)) — installs into `~/Applications`,
**no admin password**:
```sh
brew install --cask --appdir="$HOME/Applications" sheetaldharshan200/tap/exasol-studio
```
Upgrade: `brew upgrade --cask exasol-studio` · Remove: `brew uninstall --cask exasol-studio`

**Windows** (needs [Scoop](https://scoop.sh), itself installable without admin):
```powershell
scoop install https://raw.githubusercontent.com/Sheetaldharshan200/homebrew-tap/HEAD/bucket/exasol-studio.json
```
Update: `scoop update exasol-studio` · Remove: `scoop uninstall exasol-studio`

> The one macOS command **auto-adds the tap and installs in a single step**, so
> `brew upgrade` keeps working — no `brew tap` line needed. `--appdir` keeps it
> in your home folder so it never asks for an admin password. (Drop `--appdir`
> to install to `/Applications` instead — that one asks for admin once.)

### No Homebrew or Scoop? One-line direct installers

These need **no package manager** — they pull the **latest release** straight
from GitHub, pick the right build for your machine, and install it (macOS →
`/Applications`, Linux → `~/.local/bin`, Windows → per-user, no admin).

**macOS / Linux:**
```sh
curl -fsSL https://raw.githubusercontent.com/Sheetaldharshan200/Exasol-studio/main/scripts/install.sh | sh
```

**Windows (PowerShell):**
```powershell
irm https://raw.githubusercontent.com/Sheetaldharshan200/Exasol-studio/main/scripts/install.ps1 | iex
```

Unlike the pinned Homebrew/Scoop packages, these always fetch whatever the
newest published release is. Re-run the same command to upgrade.

### Enterprise / IT (managed fleet)

Deploy silently to many machines through your MDM — no per-user prompts:

- **macOS** — a signed, notarized `.pkg` pushed via **Jamf / Intune / Kandji**
  installs to `/Applications` with zero user interaction.
- **Windows** — the `.exe` installs silently with `/S`, or ship the MSIX/WinGet
  package through **Intune**.
- **Linux** — the `.deb` / `.rpm` via your existing config-management (apt/yum).

Silent, promptless installs require code-signing + notarization (macOS) and a
signed installer (Windows). The exact certificates, secrets, and MDM steps are
in **[docs/INSTALL.md](docs/INSTALL.md#enterprise-fleets)**.

### First run

Open the app. **No database yet?** The built-in Marketplace installs a free
local Exasol on your machine in about two minutes — one click, verified
download. Updates then arrive automatically.

## What can I do with it?

Type things like this into the AI panel:

- *"What tables do I have?"*
- *"Which product made the most money last month?"*
- *"Load this file into a table"* — then drop a CSV/Parquet file on the chat
- *"Build me a sales dashboard with a summary"* — then export it as a **PDF report**
- *"Why is this query slow?"*

Exa runs on **local AI models by default** (a built-in one is a click away — your data never leaves your machine), or any cloud model you add a key for. It shows every SQL statement it runs, and anything that *changes* data waits for your **Allow / Deny**.

Everything else you'd expect is here too: a SQL editor, schema browser, dashboards you can edit by hand, data import/export, and connection management with encrypted password storage.

## What's inside

A quick, honest tour of what the app actually gives you today:

**Write & run SQL**
- Monaco SQL editor with autocomplete and multi-statement runs
- Live execution progress, and an execution log (time, status, rows, exec/fetch split)

**Read results**
- Fast, paginated result grid that prefetches the next page
- A **Filter** box, one-click **Export CSV**, and a side inspector: click any cell to see its full value, plus query statistics (time, rows, cols, throughput, avg/row)
- Edit rows in place for single-table results

**Understand performance**
- A **Query Performance** tab that shows Exasol's real execution plan (from profiling): per-step time share, measured bottlenecks, and concrete tuning advice — no guessing

**Dashboards & BI**
- Build dashboards by hand or ask the AI; drag/resize panels, many chart types
- Built-in **System dashboards** (query performance, sessions, DB size) that are read-only so they can't be broken
- Open a dashboard to view and edit it; export one as a PDF report

**AI assistant & MCP**
- Exa: ask in plain words — it inspects schemas, writes SQL, shows every step, and asks before changing data
- Local models by default; add a cloud key only if you want to
- Studio is one **MCP gateway** for every connected database, so other AI clients can query them through a single endpoint

**Connect & manage**
- Encrypted password vault (passwords are never shown to the AI)
- Connection properties, driver management, virtual schemas, and data import/export
- One-click local **Exasol Personal** for a zero-setup database

**Local-first & cross-platform**
- One codebase runs on macOS, Windows, and Linux
- The app, the AI runtime, and the local database all run on your machine

## ⌨Prefer a terminal?

Install the CLI from **AI Settings → Terminal CLI → Install command**, then:

```
exa-agent                 # chat with your database in the terminal
exa-agent --continue      # pick up where you left off
/connect                  # guided connection (password hidden)
```

Same brain as the app — it shares your models, memory, and knowledge of your schemas. Paste a file path to attach it; press `/` to see all commands.

## Privacy, in one paragraph

Local-first by design: the app, the AI runtime, the local database, and your data all live on your machine. Cloud AI models are used **only** if you add an API key and pick one. Connection passwords are encrypted in a local vault and are never shown to the AI.

---

## For developers

Monorepo: **Tauri 2 + Rust** shell, **React 19** frontend, and a TypeScript agent runtime (`packages/agent-core`) built on **LangGraph + LangChain** — shipped both as the app's sidecar and as the `exa-agent` CLI.

- [docs](./docs/README.md) — architecture, ADRs, the [agentic AI blueprint](./docs/agentic-ai-blueprint.md), and the [runtime decision record](./docs/runtime-vs-langgraph.md)
- [apps/desktop](./apps/desktop/README.md) — the desktop app (React + Tauri)
- [packages/agent-core](./packages/agent-core) — the agent: graph orchestration, tools, knowledge graph, sessions
- [crates](./crates/README.md), [services](./services/exasol-driver-service/README.md), [tests](./tests/README.md), [tools](./tools/README.md)

```bash
pnpm install
pnpm --filter @exasol-studio/agent-core evals   # 47-case reliability regression suite (CI-gated)
pnpm dev:desktop                                # frontend dev mode
./scripts/build-local.sh --bundles app          # local signed build
```

Every agent failure found in the field becomes an eval case *before* it's fixed — `packages/agent-core/evals/` is both the test suite and the honest history of what small models get wrong.

Releases are tag-driven (`v*`): five platforms build in parallel, the eval suite gates the release, and artifacts ship signed with auto-updater manifests. The `mirror-*` releases are internal storage for the in-app Marketplace — not downloads for humans.

---

## Contributing & community

Issues and pull requests are welcome — it's the fastest way the app gets better.

### 🐛 Found a bug?

[**Open a bug report ›**](../../issues/new). Please include:
- what you did (steps to reproduce),
- what you expected vs. what happened, and
- your OS and app version.

### 💡 Want a feature?

[**Request it ›**](../../issues/new). Describe the *problem* you're trying to
solve, not only the solution you have in mind — it helps us find the simplest
fix. Browse [existing issues](../../issues) first in case it's already there
(a 👍 helps us prioritise).

### 🔧 Want to contribute code?

Fork the repo, branch, and open a pull request:

```bash
pnpm install                 # set up the workspace
# ... make your change ...
pnpm test                    # keep it green — add tests for new logic
```

Then push your branch and [**open a PR ›**](../../compare) that describes the
change and links the issue it closes.

A few house rules (all in [CONTRIBUTING.md](./CONTRIBUTING.md)):
- **KISS** — the simplest thing that works; no speculative abstraction. Extract
  pure logic into small, testable modules instead of growing big files.
- **Tests, not just happy paths** — cover empty input, nulls, boundaries, and
  error cases. Nothing is merged red.
- **Match the codebase** — icons (not emoji) in the app UI, theme-safe CSS, one
  codebase for every platform.

New here? Skim [CONTRIBUTING.md](./CONTRIBUTING.md) and the
[docs](./docs/README.md), and you're good to go.

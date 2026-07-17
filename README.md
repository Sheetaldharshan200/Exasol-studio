# Exasol Studio

**A desktop app for working with [Exasol](https://www.exasol.com) databases — with a built-in AI assistant that speaks SQL so you don't have to.**

Ask questions in plain words. Exa (the assistant) finds the right tables, writes and runs the SQL, builds dashboards, and loads your files — showing you every step and asking before it changes anything.

---

## Get it (2 minutes)

1. Go to **[Releases](../../releases/latest)** and download the one file for your computer:

   | Your computer | File to download |
   |---|---|
   | Mac (Apple Silicon — M1/M2/M3/M4) | `ExasolStudio-Mac-AppleSilicon.dmg` |
   | Mac (Intel) | `ExasolStudio-Mac-Intel.dmg` |
   | Windows | `ExasolStudio-Windows-64bit-setup.exe` |
   | Linux | `ExasolStudio-Linux-64bit.AppImage` (or `.deb` / `.rpm`) |

2. **Mac:** open the DMG, drag the app into **~/Applications** — no admin password needed.
   **Windows:** run the installer — it installs just for you, no admin prompt.
   **Linux:** make the AppImage executable and run it.

3. Open the app. **No database yet?** The built-in Marketplace installs a free local Exasol on your machine in about two minutes — one click, verified download.

That's it. Updates arrive automatically.

## What can I do with it?

Type things like this into the AI panel:

- *"What tables do I have?"*
- *"Which product made the most money last month?"*
- *"Load this file into a table"* — then drop a CSV/Parquet file on the chat
- *"Build me a sales dashboard with a summary"* — then export it as a **PDF report**
- *"Why is this query slow?"*

Exa runs on **local AI models by default** (a built-in one is a click away — your data never leaves your machine), or any cloud model you add a key for. It shows every SQL statement it runs, and anything that *changes* data waits for your **Allow / Deny**.

Everything else you'd expect is here too: a SQL editor, schema browser, dashboards you can edit by hand, data import/export, and connection management with encrypted password storage.

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

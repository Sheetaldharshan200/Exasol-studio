# Exasol Studio — knowledge base (seed)

Persistent decisions/how-tos for Exasol Studio. Grow this over time
(`wiki_write_page` / `wiki_log_append`). Repo guide: `docs/knowledge-tools.md`.

## Architecture
- Tauri 2 (Rust, `apps/desktop/src-tauri`) + React 19 / Vite / Tailwind v4 /
  shadcn (`apps/desktop/src`). Node `agent-core` AI sidecar (`packages/agent-core`).
- IPC: typed `src/lib/ipc.ts` ⇄ Rust `#[tauri::command]`s registered in `lib.rs`.
- Central icon registry: `src/components/ui/boxicons.ts` + `<Icon>`. Icons only,
  never emoji. Theme vars are full colors → use `var(--x)`, not `hsl(var(--x))`.

## Feature notes / decisions
- **Dashboards**: react-grid-layout v2; persist layout at `onDragStop`/`onResizeStop`
  (onLayoutChange fires mid-drag and re-rendering the controlled grid breaks the
  drag). shadcn/Recharts for bar/line/area/pie/donut/radar/radial; ECharts for
  heatmap/treemap/funnel/gauge/scatter + custom option. Live auto-refresh polls
  (Exasol has no change feed); pauses when hidden; drops ticks while a query runs.
- **Notebook**: multiple named notebooks (localStorage). Markdown cells use TipTap
  (StarterKit v3 already bundles underline+link — do NOT re-add them). Import from
  dashboard brings rendered chart cells. Export md/html/pdf.
- **Assistant**: small local models narrate tool calls as prose — `rescueTextCalls`
  in agent-core recovers them. Composer `'''` opens a real code-block editor.
- **DBA console**: RBAC-gated by the connected user's live grants
  (EXA_USER_ROLE_PRIVS / EXA_USER_SYS_PRIVS); DB stays the authority.
  Confirmations are plain-language (Now → After → recoverable), SQL behind a
  disclosure. DDL builders + quoting in `src/features/workbench/dba-sql.ts`.

## Build / run
- Local app: `EXASOL_PREBUNDLE=0 ./scripts/build-local.sh --bundles app` (repo root).
  The script masks pipe exit codes — verify the built binary mtime before relaunch,
  or wrap with `set -o pipefail` + an explicit OK/FAILED marker.
- Commits: no Co-Authored-By trailer. Releases are tag-triggered (`v*`).

## Open items
- Result-table inline save needs live-DB end-to-end verification.
- Whether to ship a *shared* (committed) llm-wiki vs per-machine.

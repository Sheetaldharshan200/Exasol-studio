## Context

See proposal.md — Why. Studio already has: a Node `agent-core` sidecar that is a running HTTP
server with a web transport tier (`web-gateway.json`) and an app-control bridge (webview
long-polls `/gateway/actions/next`, runs an action, posts the result); echarts chart panels and
`bi/report-export.ts` (markdown→HTML/MD) in the existing `Dashboards.tsx`; the `notebook-artifact-hub`
capability already declaring the notebook as Studio's single artifact surface. Constraints that
shape this design: no file may approach the KISS size limits (`ExasolStudio.tsx`, `Dashboards.tsx`
are already offenders — do not grow them); pure logic must be `node:test`-able out of the React
tree; self-sustained (no dependency on user-installed tools — runtimes are bundled/fetched);
icons only; one frontend build for desktop and web.

## Goals / Non-Goals

**Goals:**
- One document model that the renderer, the notebook view, the user's editor, and the assistant
  all operate on — no second representation to keep in sync.
- Assistant edits expressed as small, validated document operations that are trivial for a model
  to emit and safe to apply.
- Reuse the existing sidecar for refresh and live serving; reuse `report-export.ts` for snapshots.
- Every non-UI decision (patch apply, param binding, layout packing, snapshot build) is a pure
  function with unit tests.

**Non-Goals (design-level):**
- No new UI framework or grid dependency if a small hand-rolled grid suffices.
- No server process beyond the existing sidecar.
- No always-on/headless scheduling; no cloud hosting (covered in proposal Non-Goals).

## Decisions

### D1: One JSON document, patched — not two models
The dashboard is a single JSON document (`DashboardDoc`: `{title, theme, params[], widgets[]}`;
each widget `{id, type, layout, style, props, query}`). The notebook view and canvas view are two
renderers over the same array — canvas reads `layout`, notebook ignores it and renders in order.
`model.ts` exports pure `applyOp(doc, op) -> {doc, error?}` where `op` is one of
`create | add_widget | update_widget | set_layout | set_param | restyle | remove_widget`.
- *Why:* dual-view and "assistant authors the same thing the user edits" fall out for free; one
  place to validate and test. *Alternative rejected:* separate notebook and dashboard models with
  a converter — two schemas to evolve, conversion bugs, exactly the drift KISS warns against.

### D2: Assistant manipulates via ops through the existing bridge — never the DOM
Add a `dashboard` engine tool whose calls are the `applyOp` operations, surfaced to the webview
as a `dashboard.*` family on the existing app-control bridge (`studio-actions.ts` /
`studio-action-names.ts`). The webview applies the op to the live document and persists. Unknown
widget/target → op rejected with a message, document unchanged (spec: dashboard-canvas).
- *Why:* reuses the bridge we already built; ops are a closed, testable allow-list; the model
  emits data, not UI gestures. *Alternative rejected:* assistant emits a whole document each edit
  — larger tokens, clobbers concurrent user edits, no partial-failure story.

### D3: Open widget registry keyed by `type`
A registry maps `type -> { render, defaultProps, editor? }`. The document schema does not
enumerate types; an unknown type renders a placeholder (spec). New widget = register a renderer.
- *Why:* satisfies "don't restrict what can be added." *Alternative rejected:* a `WidgetType`
  union — every new widget touches the model and its validation.

### D4: Params + `:name` binding for cross-filter and drill-down
Filter/search widgets write to named params; a pure `bindParams(query, params)` substitutes
`:name` and returns the bound SQL and the set of params it used, so the scheduler knows which
widgets a param change invalidates. Drill-down is a param write scoped to the clicked value.
- *Why:* one mechanism (params) serves filters, search, and drill-down. Binding is pure and
  tested (empty params, missing param, quoting/escape, identifier case-fold).

### D5: Persistence as one JSON file per dashboard, with a results cache
Each dashboard is a file under the app data dir (`dashboards/<id>.json`) holding the document plus
a `cache` of each widget's last successful result and `lastRefreshed`. Open restores the doc and
paints the cache before any query runs (spec: dashboard-canvas). Rust owns the file I/O and token
minting; the pure serializer/migrator is tested.
- *Why:* simplest durable store, human-inspectable, survives shutdown. *Alternative rejected:*
  storing dashboards as rows in Exasol — couples an app artifact to a specific connection and
  makes offline reopen impossible.

### D6: Refresh is driven app-side for the open dashboard (amended)
**Amended during implementation.** In-app live refresh is driven by the mounted dashboard
(per-widget timers in `useWidgetData`, interval resolved by the pure `effectiveIntervalMs`),
reusing the existing `executeSql` path — simpler than a sidecar scheduler, with no dependency
on the lazily-started sidecar, and identical observable behavior (per-widget toggle, resume on
reopen from the persisted config, a failed tick keeps the last result). The interval decision is
pure and tested (`refresh.test.ts`); the timer is the only impure shell. The **sidecar/server**
still owns refresh for a *shared* dashboard (Phase 4), where the served page must refresh
independently of any open tab — that is a distinct context from the in-app view. Original intent
retained below for reference.

### D6 (original): Refresh scheduler lives in the sidecar, re-armed from disk
On sidecar start it reads each dashboard's saved refresh config and arms per-widget timers; a tick
re-runs the widget's bound query and pushes the result to the webview and the cache. Only runs
while the app is open; each widget records `lastRefreshed`; a failed tick keeps the last result
and flags the error (spec: dashboard-live-refresh). The tick decision (which widgets are due,
given now + intervals + param invalidation) is a pure function, tested; the timer is the only
impure shell.
- *Why:* the sidecar is already running and connected; no new process. *Alternative rejected:* a
  standalone daemon — violates self-sustained and adds lifecycle we don't need.

### D7: Sharing = snapshot + sidecar-served live + bundled cloudflared
- **Snapshot:** `buildSnapshot(doc, cache) -> html|md`, extending `report-export.ts`; PDF via the
  existing print path. Pure, offline, tested.
- **LAN live:** a read-only, token-gated route on the sidecar's web tier serving one dashboard;
  the token is minted per share and required on every request (spec: dashboard-sharing).
- **Public:** bundle the `cloudflared` binary (fetched like the Node runtime), launched by Rust in
  front of the sidecar's share route. Quick mode = trycloudflare ephemeral URL; Stable mode = a
  named tunnel whose credentials are stored so the URL returns across restarts. While the app is
  off, the tunnel is down; a static snapshot published for the share is served as the offline
  fallback and the link goes live again on reopen.
- *Why cloudflared over ngrok/nginx:* single static binary, free ephemeral URLs with no account,
  named tunnels for a stable URL; nginx solves neither reachability nor NAT and would be an
  external dependency the user must install. *Alternative rejected:* requiring a user-run tunnel —
  breaks self-sustained.

### D8: New feature lives in `features/dashboard/`, nothing grows the offenders
`features/dashboard/`: `model.ts` (+ `model.test.ts`), `params.ts` (+ test), `registry.ts`,
`snapshot.ts` (+ test), `DashboardCanvas.tsx`, `WidgetFrame.tsx`, widget renderers, `editor` bits.
Engine: `dashboard` tool in `tools.ts`, `dashboard-refresh.ts` scheduler, new gateway routes.
`ExasolStudio.tsx` and `Dashboards.tsx` are not grown; where the old Dashboards rail is retired
(per notebook-artifact-hub), code is removed, not moved wholesale.

## Risks / Trade-offs

- **Public link exposes data to the internet** → strong gating: a high-entropy per-share token
  required on the page *and every sub-request* (asset, data, API); the token is scoped to one
  dashboard and carries no app authority; wrong/unknown tokens get an identical refusal so shares
  can't be probed; no route enumerates dashboards or shares; the shared payload carries only
  rendered results — never widget SQL, connection strings, or credentials. Shares are opt-in, off
  by default, revocable, and rotatable. The exposure notice is shown before a link is created.
- **Stable named tunnel needs one-time credential setup** → Quick mode requires nothing and is the
  default for ad-hoc sharing; Stable is offered when the user wants a durable URL, with the setup
  done once and stored.
- **Bundling cloudflared adds a fetched binary per platform** → fetch on first use of public
  sharing (not at install), same pattern as the Node runtime; verify checksum; feature degrades to
  snapshot + LAN if the fetch fails.
- **Freeform grid is more complex than a linear list** → keep the grid math pure and tested; start
  with a fixed-column grid with drag/resize and add finer control later without touching the model.
- **Live-refresh load on the database** → per-widget intervals with a sane floor; refresh only
  visible/enabled widgets; a failed/slow query backs off rather than stacking.
- **Concurrent user + assistant edits to one document** → ops apply to the current in-memory doc
  and persist last-write-wins per widget; ops are small so collisions are narrow, and an op
  targeting a since-removed widget fails cleanly rather than resurrecting it.

## Migration Plan

- Existing persisted notebooks/dashboards continue to load; a legacy dashboards tab loads without
  error (already covered by notebook-artifact-hub). New dashboards are written in the new document
  format from the start; no bulk migration.
- Ship in the proposal's phase order (model+renderer → AI control → live refresh → sharing); each
  phase is independently shippable and testable, so the change can land incrementally behind the
  existing surfaces.
- Rollback: the feature is additive under `features/dashboard/` plus new engine routes; disabling
  the `dashboard` tool and the dashboard entry point reverts behavior to the prior notebook flow.

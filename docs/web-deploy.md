# One codebase, every platform

There is ONE frontend and ONE build artifact (`apps/desktop/dist`). The same
build ships as:

- **Desktop** — embedded in the Tauri shell (native Rust backend over IPC)
- **Web** — served as a static SPA (Vercel or any static host)
- **Mobile (future)** — Tauri 2 Mobile wraps the SAME frontend for iOS/Android

Only the **transport** differs, resolved in one place (`src/lib/ipc.ts`):

1. **Tauri IPC** — when running inside a Tauri shell (desktop, later mobile)
2. **Hosted backend** — when `VITE_BACKEND_URL` is set: every command POSTs to
   `<backend>/ipc/<command>` with its args as JSON. This is the exact contract
   the Phase-2 headless server implements — same command names as the Rust
   `#[tauri::command]`s.
3. **Built-in mock** — plain browser with no backend: ~85 commands answer with
   demo data (`src/lib/ipc-mock.ts`), so the whole UI is explorable.

The AI sidecar resolves the same way: Tauri bridge inside the shell, direct
HTTP via `VITE_AGENT_URL` on the web.

## Deploy to Vercel

The repo root carries `vercel.json` — import the GitHub repo into Vercel and it
builds `apps/desktop` with Vite and serves `apps/desktop/dist` as a SPA. No
other settings needed.

## Wiring a REAL AI backend (optional)

`agent-core` is already a standalone HTTP server. Host it anywhere
(Fly/Railway/VM), then set a Vercel env var:

```
VITE_AGENT_URL=https://your-agent-host.example.com
```

The web build then talks to it directly over HTTP (`/v1/...`) instead of the
Tauri bridge. Without the variable, AI panels show a plain "needs a hosted
backend" message.

Known Phase-1 limits (honest list):
- Database access is MOCKED in the browser — real Exasol connections need the
  Phase-2 headless backend (an HTTP counterpart to the Rust Tauri commands).
- Agent event streaming uses the Tauri event bridge; over plain HTTP the panel
  works request/response, streaming needs the SSE path (Phase 2).
- Anything touching local files, the vault, or BucketFS stays desktop-only.

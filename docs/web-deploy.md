# Web deployment (demo build)

The desktop app's frontend also runs in a plain browser: outside Tauri, every
IPC command falls back to the built-in mock (`src/lib/ipc-mock.ts`, ~85
commands with demo data), so the full UI is explorable without a native
backend. This is **Phase 1 — a demo**, not the full product on the web.

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

# Design

## Serving the build

`panorama.rs` registers the `panorama` URI scheme. A request for a path maps to
`<market>/panorama/unpacked/<path>` (the Marketplace's extraction of the pwa
zip); `/` and unknown extensionless paths serve `index.html`, and `index.html`
is served with the bridge script (`panorama-shim.js`, compiled in) inserted
before its first `<script>`. MIME comes from the extension. Nothing outside
the unpacked directory is reachable: the path is normalised and checked. The
tab's frame URL is `panorama://localhost/` on macOS and Linux and
`http://panorama.localhost/` on Windows — Tauri's own mapping.

## The bridge

The shim defines what Panorama's `shellBridge()` looks for: `__TAURI__.core.invoke`
and `__TAURI__.event.listen`, plus a truthy `__TAURI_INTERNALS__` so
`inDesktopShell()` holds (no service worker, no browser-mode agent endpoint).
`invoke(cmd, args)` posts `{panoramaShell: 1, id, cmd, args}` to the parent and
resolves on the matching reply; `listen` resolves to a no-op unlisten — no
shell events flow. The host (`PanoramaTab`) accepts messages only from its own
frame's window and answers an allow-list:

| command | answer |
|---|---|
| `database_proxy` | the proxy URL from `panorama_status` |
| `exasol_deployments` | `panorama_deployments()` — Studio's connections as `{installed: true, deployments: [{name, status, infrastructure, url, username}]}` |
| `exasol_deployment_credentials` | `panorama_credentials(name)` — `{url, username, password}` for that connection, read from the vault at the click |
| `update_status`, `report_timing`, `agent_*`, `claude_*` | `null` / `{}` — nothing to say, nothing breaks |
| anything else | rejected: "not available inside Studio" |

Replies go back with the frame's origin as target. The credential crosses
the host page once, in memory, on the way to a page that encrypts it to the
database — the same path Panorama's own shell uses.

## The proxy

A loopback `TcpListener` on an ephemeral port, a random token per app run.
Each connection: WebSocket accept with a header callback that refuses an
`Origin` other than the tab's own (`panorama://localhost`, `http://panorama.localhost`,
`tauri://localhost`, `http://tauri.localhost`); the request line must carry
`token=` (this run's) and `target=` (`ws(s)://host:port`); the target's
host and port must equal a saved connection's, otherwise the socket closes
with a reason. Upstream: `ws://` plain; `wss://` through rustls — verified
against the platform roots when that connection's TLS mode starts with
`verify`, accepted without verification otherwise. Frames are copied both
ways until either side closes. Nothing is decoded.

## Install

`panorama` becomes `install: "web-app"` with a `gh-asset` pattern for the pwa
zip. The install path downloads, verifies the `.sha256` beside it, extracts
into `unpacked/`, and links nothing.

## Files

- `src-tauri/src/panorama.rs` (+ `panorama-shim.js`), pure and tested:
  `origin_allowed`, `parse_asked`, `target_allowed`, `mime_for`, `safe_path`,
  `inject_shim`, `deployments_from`.
- `features/panorama/PanoramaTab.tsx`, `bridge.ts` (pure, tested).
- Shell: `TabView` `panorama`, rail item, open/render/deep link.
- Cargo: `async-tungstenite` (tokio), `tokio-rustls`, `rustls-native-certs`.

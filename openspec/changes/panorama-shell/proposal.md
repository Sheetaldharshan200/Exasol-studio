# Panorama inside Studio: Studio as Panorama's shell

## Why

Panorama (exasol-labs/exasol-panorama) is the ecosystem's exploration canvas:
every result is a box on an infinite plane and every arrow says where it came
from. It belongs beside Query Performance as the traceability view. Its web
build runs in any browser frame — except that a browser refuses a `wss://`
handshake to a self-signed certificate and never offers an exception, which
makes the most common local database, Exasol Personal, unreachable from a
frame. Panorama's own desktop application solves this with a *shell*: a
loopback socket proxy that decides about certificates, handed to the page
through a Tauri command. Studio can be that shell.

## What

- The Marketplace installs Panorama's **web build** (the `pwa` zip of its
  release, checksum-verified) as a new `web-app` install kind.
- Studio **serves** that build to a tab on its own scheme (`panorama://`)
  with a small bridge script prepended, so the page sees a desktop shell:
  `__TAURI_INTERNALS__` and `__TAURI__.core.invoke` / `event.listen` exist,
  and each command travels to the tab's host by `postMessage` and back.
- Studio **answers Panorama's shell commands** from what it already knows:
  `database_proxy` — the URL of a loopback WebSocket proxy Studio runs;
  `exasol_deployments` — Studio's saved connections, shaped as Panorama's
  deployments; `exasol_deployment_credentials` — the chosen connection's
  address and credential, fetched at the click and never held in the page;
  the update, timing and agent commands — harmless no-answers.
- The **proxy** forwards frames between the page and the database, bound to
  loopback, refusing any origin but the tab's own and any token but the one
  minted for this session, and connecting only to the address of a saved
  Studio connection — verifying the certificate when that connection's TLS
  mode says so, accepting it otherwise, which is exactly Studio's own rule
  for that database.

## Non-goals

- Query Performance stays. Panorama is exploration and lineage; the profile
  view is the profile view.
- Panorama's agent endpoint (its MCP for Claude) is not bridged; the in-app
  agent has its own tools.
- Exports that need a native save dialog are Panorama's browser fallback.

## Capabilities

- `component-hosting` (modified): a component that needs a desktop shell gets
  one from Studio.

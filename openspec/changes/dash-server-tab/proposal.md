# Dashboards through dash-server, not a second dashboard engine

## Why

Studio grew its own dashboard engine — a canvas, widgets, a document store,
an agent tool set that writes JSON specs, a live-share server — while the
ecosystem already has **dash-server**: an agent-first host for Dash apps,
built for Exasol, operated through MCP, hosted apps at `/apps/<name>`,
Git-backed state. Two engines for one job means two things to maintain and
two answers when someone asks the agent for a dashboard.

The direction is plain: Studio hosts the ecosystem's components inside its
tabs and drives them; it does not duplicate them. Dashboards go through
dash-server. The notebook keeps its cells, charts and the built-in System
dashboards, which are live views of the engine and not a dashboard product.

## What

- **Remove** the Dashboards rail item and sidebar panel, the Dashboard tab
  and canvas (`features/dashboard`, 43 files), the notebook's *Open as
  dashboard* button and *Import dashboard* menu, the Rust dashboard document
  commands, the assistant's dashboard authoring actions, and agent-core's
  dashboard store, tools, prompt guidance, text-rescue rules and live-share
  server. Also the agent's HTML **artifact** tool and tab: when someone asks
  the agent for a dashboard or an artifact, it builds it in dash-server.
- **Add** a `Dashboards` full-tab view that hosts dash-server: installed from
  the Marketplace (already an item), started by Studio for a chosen
  connection (its credentials handed over in the process environment, never
  a file), its hosted apps listed through its own MCP inventory and rendered
  in the tab. Stopped when Studio exits.
- **Give the in-app agent dash-server's MCP** (`/mcp`, Streamable HTTP) so
  "make me a dashboard" is built there, and tell it so in its prompt.

## Non-goals

- Studio does not become a Dash app editor. The agent edits through MCP; the
  person sees the result.
- Panorama's tab and shell are a separate change (`panorama-shell`).
- Hosted-mode auth for dash-server is not configured; it runs in local mode
  on loopback, as it does by default.

## Capabilities

- `component-hosting` (new): a component's web UI runs inside a Studio tab,
  started, stopped and fed its connection by Studio.
- `agent-tools` (modified): the agent builds dashboards and artifacts through
  dash-server; its own dashboard and artifact tools are gone.

# Graphify

This directory contains renderable Mermaid diagrams for the Exasol Studio system architecture, dependencies, workflows, and lifecycle.

Files:

- [system-architecture.md](./system-architecture.md)
- [module-dependencies.md](./module-dependencies.md)
- [data-flow.md](./data-flow.md)
- [agent-workflow.md](./agent-workflow.md)
- [development-lifecycle.md](./development-lifecycle.md)
- [repository-relationships.md](./repository-relationships.md)
- [cicd-workflow.md](./cicd-workflow.md)

These diagrams are documentation assets, not the source of truth by themselves. When the implementation changes, update the related architecture and design documents first, then refresh the diagrams.

## Tooling

Graphify tooling is available from the repository root:

- `pnpm graphify:check`: validate that each graph markdown file contains exactly one Mermaid diagram
- `pnpm graphify:render`: render the Mermaid diagrams to `docs/foundation/graphify/rendered`
- `pnpm graphify:html`: build a browsable HTML gallery at `docs/foundation/graphify/site/index.html`
- `pnpm graphify`: run validation, SVG rendering, and HTML generation together

Graphify path conventions are centralized in `.graphify/config.json` so future tooling can reuse the same source, rendered, and site locations.

Generated render output is ignored by Git and can be reproduced locally or in CI. The HTML site can be regenerated at any time from the Mermaid source files.

The current renderer uses a browserless Node path with `mermaid` and `jsdom`, which avoids dependency on a local Chrome or Chromium runtime.

## Current Validation State

- source validation is working
- Graphify render dependencies are installed in the repository toolchain
- SVG rendering works locally with the browserless renderer
- rendered SVG output is written to `docs/foundation/graphify/rendered`
- HTML gallery output is written to `docs/foundation/graphify/site/index.html`

If rendering fails in the future, verify the root `mermaid` and `jsdom` dependencies, confirm `.graphify/config.json` still matches the repository layout, and rerun `pnpm graphify`.

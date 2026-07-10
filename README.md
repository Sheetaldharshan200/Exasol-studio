# Exasol Studio

`Exasol Studio` is a desktop-native Exasol development and administration environment designed for maintainability, scalability, and future AI-assisted workflows.

## Repository Layout

- [docs](./docs/README.md): product, architecture, delivery, ADR, agent, and contributor documentation
- [apps/desktop](./apps/desktop/README.md): React and Tauri desktop application
- [crates](./crates/README.md): Rust domain and platform modules
- [services/exasol-driver-service](./services/exasol-driver-service/README.md): Exasol connectivity boundary and driver orchestration
- [packages](./packages/README.md): shared contracts, SQL language assets, tokens, and fixtures
- [tests](./tests/README.md): end-to-end, integration, and performance validation
- [tools](./tools/README.md): scripts, automation, and CI helpers

## Architecture Principles

- Exasol-first product scope
- Clean separation between UI, orchestration, and database connectivity
- Governed AI actions with review and traceability
- Extensible internal boundaries before public plugin marketplace scope
- Documentation and ADRs treated as first-class project assets

## Starting Point

The current foundation docs live here:

- [Technical Foundation](./docs/foundation/README.md)
- [Product Specification](./docs/product/exasol-studio-product-spec.md)
- [Graphify HTML Index](./docs/foundation/graphify/site/index.html)

## Current Status

This repository now includes the first frontend shell implementation for the desktop workbench, a browserless Graphify render pipeline, and a browsable HTML diagram index in support of implementation planning and review.

## Useful Commands

- `pnpm dev:desktop`: start the desktop frontend in local development mode
- `pnpm build:desktop`: build the frontend workbench
- `pnpm typecheck:desktop`: run frontend TypeScript checks
- `pnpm graphify`: validate Mermaid sources, render SVGs, and refresh the Graphify HTML index

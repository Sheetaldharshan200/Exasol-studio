# Desktop App

This package will contain the desktop product shell and primary user experience.

## Structure

- `src/app`: app bootstrap and routing
- `src/shell`: workbench layout, chrome, and window composition
- `src/features`: feature-oriented modules such as connections, explorer, editor, results, AI, and monitoring
- `src/components`: reusable UI pieces that are not feature-owned
- `src/design-system`: tokens, themes, and UI primitives
- `src/hooks`: shared hooks
- `src/state`: frontend state bindings and adapters
- `src/workers`: browser workers for expensive local tasks
- `src/tests`: frontend-focused tests
- `src-tauri`: native desktop host and Rust bridge layer

## Boundary

The desktop app owns presentation and interaction state. It must not own secret storage, direct database communication, or policy-critical decisions.

## Current Implementation

The current frontend includes:

- a desktop workbench shell with activity rail, top bar, left explorer, center SQL editor, results grid, right AI panel, and status bar
- a Graphify-aware side mode for architecture browsing
- shared theme tokens and base workspace wiring through Vite and React

## Local Development

From the repository root:

- `pnpm dev:desktop`
- `pnpm build:desktop`
- `pnpm typecheck:desktop`

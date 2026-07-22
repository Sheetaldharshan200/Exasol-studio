# Contributing

Start here before implementation work spreads across the repository.

## First Read

1. [docs/foundation/README.md](./docs/foundation/README.md)
2. [docs/foundation/tasks.md](./docs/foundation/tasks.md)
3. [docs/foundation/architecture.md](./docs/foundation/architecture.md)
4. [docs/foundation/agent.md](./docs/foundation/agent.md)

## Working Rules

- keep Exasol-first scope unless an ADR changes it
- do not hide architecture changes inside feature work
- update docs when repository structure, workflows, or boundaries change
- keep official Exasol and Exasol Labs references clearly distinguished
- treat AI, plugins, and production-sensitive actions as governed surfaces

## Where Work Goes

- UI and app shell: `apps/desktop`
- backend modules: `crates`
- connectivity boundary: `services/exasol-driver-service`
- shared contracts and assets: `packages`
- docs and ADRs: `docs`
- automation: `tools`
- validation: `tests`

## Before Merging

- confirm impacted docs are updated
- confirm new boundaries or major trade-offs are captured in ADRs
- confirm tests or validation notes are added in the appropriate place


## Project knowledge tools

This repo uses **graphify** (codebase knowledge graph), **llm-wiki** (persistent
decisions KB), and an **Obsidian-style notes vault** so project understanding
compounds across contributors and sessions. Set them up once with
`./scripts/setup-knowledge-tools.sh`, then query graphify for architecture
questions and record durable decisions in llm-wiki. Full guide:
[docs/knowledge-tools.md](docs/knowledge-tools.md). AI coding assistants also
read the repo-root `CLAUDE.md`.

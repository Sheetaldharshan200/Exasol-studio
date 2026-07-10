# Exasol Studio Technical Foundation

Date: 2026-06-30

This directory is the production-oriented documentation suite for `Exasol Studio`, a desktop-native Exasol development and administration environment.

This foundation is based on:

- [Exasol Studio product specification](../product/exasol-studio-product-spec.md)
- `/Users/sheetaldharshan.a/Downloads/SKILL.md`, used as the primary Exasol ecosystem knowledge source
- Current official Exasol documentation and repository references captured throughout this suite

## Document Map

- [requirements.md](./requirements.md): product requirements, user stories, acceptance criteria, constraints, risks, dependencies, and future scope
- [design.md](./design.md): high-level and low-level design, APIs, workflows, diagrams, security, performance, and testing
- [architecture.md](./architecture.md): system and module architecture, repository shape, deployment architecture, patterns, technology decisions, and ADR index
- [tasks.md](./tasks.md): epics, milestones, phased delivery plan, dependencies, complexity, and validation checklist
- [agent.md](./agent.md): AI agent operating model, safety rules, prompt strategy, memory, context handling, and multi-agent collaboration
- [llm-wiki.md](./llm-wiki.md): knowledge base for future developers and AI agents
- [research-notes.md](./research-notes.md): verified source notes, gaps, and recommendations from the research phase
- [graphify/README.md](./graphify/README.md): rendered architecture, dependency, workflow, and CI/CD diagrams
- [adr](./adr): architectural decision records
- [agent-config](./agent-config): machine-readable agent configuration and ownership metadata

## Scope and Assumptions

This suite assumes the project being defined is `Exasol Studio`, not a generic Exasol extension catalog browser. The uploaded `SKILL.md` is treated as the authoritative catalog of Exasol repositories, official integrations, and agentic building blocks that Exasol Studio should integrate with or learn from.

Where the source material does not define an implementation detail directly, this suite:

- makes the inference explicit
- chooses the most conservative production-grade option
- records rationale and trade-offs

## Review Status

This documentation pass includes a consistency review across requirements, design, architecture, delivery tasks, and agent guidance. Cross-links are intentional and should be updated together when scope changes.

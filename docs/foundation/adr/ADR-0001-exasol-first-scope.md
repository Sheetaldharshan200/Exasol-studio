# ADR-0001: Exasol-First Product Scope

Status: Accepted

## Context

The product could be designed either as a generic database client with Exasol support or as a purpose-built Exasol-native workbench.

## Decision

Exasol Studio will be Exasol-first in its initial architecture, features, documentation, and workflow design.

## Rationale

- matches the product goal and market positioning
- aligns with the uploaded product specification
- lets the product outperform generic tools through deep Exasol awareness
- reduces early complexity in capability modeling and admin feature abstraction

## Trade-Offs

- slower path to generic multi-database support
- some shared database-IDE patterns must be adapted instead of copied directly

## Consequences

- object models, explorers, diagnostics, and AI grounding use Exasol terminology first
- generic driver/plugin abstractions are delayed until core Exasol workflows are mature


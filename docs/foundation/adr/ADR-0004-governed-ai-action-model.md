# ADR-0004: Governed AI Action Model

Status: Accepted

## Context

The source material emphasizes agentic workflows, MCP, semantic grounding, least privilege, and auditability. A database desktop product also carries production and data-governance risk.

## Decision

AI in Exasol Studio will operate as a governed action layer with explicit context disclosure, redaction, approval gates, and audit logging.

## Rationale

- aligns with Exasol's own agentic safety guidance
- reduces risk from free-form autonomous actions
- makes provider-neutral AI adoption safer for enterprise teams

## Trade-Offs

- more UX complexity than a casual chat assistant
- some users may perceive extra review steps as friction

## Consequences

- AI actions need policy, provenance, and review UX from the start
- production or destructive operations remain human-approved


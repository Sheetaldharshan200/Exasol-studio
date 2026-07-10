# ADR-0002: Tauri Plus Rust Desktop Architecture

Status: Accepted

## Context

The project requires a cross-platform desktop shell with native integrations, secure boundaries, and good performance characteristics.

## Decision

Use Tauri v2 for the desktop host and Rust for the orchestration core.

## Rationale

- strong fit for secure native desktop apps
- native capability access without turning the product into a browser app
- aligns with the requested technology stack
- supports a clear separation between UI and integration logic

## Trade-Offs

- adds coordination cost between frontend and Rust layers
- requires discipline in command contracts and integration testing

## Consequences

- typed command and event contracts become core project assets
- desktop-native behaviors are expected, not optional


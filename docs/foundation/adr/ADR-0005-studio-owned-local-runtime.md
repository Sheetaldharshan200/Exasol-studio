# ADR-0005: Studio-Owned Local Runtime and First-Install Stack

Status: Accepted

## Context

Exasol Personal local deployments are supported natively on macOS. Windows and
Linux need the Exasol Nano container image through Docker or Podman. Exasol
Studio also needs a predictable first-install AI/data stack without depending
on a separate starter-kit runtime or its lifecycle scripts.

## Decision

Exasol Studio owns local runtime orchestration and durable component state:

- macOS installs a checksum-pinned Exasol Personal launcher and uses
  `exasol install local` plus the native lifecycle commands.
- Windows and Linux pull an immutable multi-architecture `exasol/nano` OCI
  digest and manage a persistent
  loopback-only Docker/Podman container and volume.
- Studio installs a hash-locked, mutually compatible PyExasol + MCP Server
  environment, verified ExaPump binaries, and bundles pinned Exasol agent
  skills and Fable Method, and loads/probes the pinned
  Semantic Views framework before advertising semantic capability.
- Generated credentials are private on disk, stored in the Studio vault for
  connection profiles, and never embedded in logs or agent prompts.
- The MCP server authenticates as a collision-resistant, ownership-marked,
  Studio-managed read-only database user; readiness rejects unsafe effective
  system, role, object, connection, ownership, or impersonation grants;
  administrator credentials remain reserved for bootstrap and lifecycle work.
- The Exasol Personal Local Starter Kit may inform compatibility behavior, but
  is not packaged, executed, or treated as Studio runtime state.

## Rationale

- matches the actual platform support boundary
- makes first install and later auto-start deterministic and observable
- avoids coupling application behavior to an external orchestration layer
- lets semantic and MCP capabilities remain readiness-gated

## Trade-Offs

- Studio must maintain platform-specific lifecycle behavior and generated
  artifact locks
- Docker/Podman availability remains an external prerequisite off macOS
- component upgrades are resolved daily but become user-visible with a
  validated application build

## Consequences

- local runtime and component state live below the application data directory
- release validation must cover macOS Personal and Windows/Linux Nano paths
- supply-chain hashes, an immutable Nano OCI digest, the Python lockfile,
  skills commits, and readiness probes are part of the release contract
- a scheduled GitHub Actions workflow resolves upstream stable releases,
  compatible Python packages, immutable source revisions, checksums, and image
  digests; it commits only a changed candidate that passes platform validation
- a platform is explicitly unsupported when the selected ExaPump release does
  not publish that binary; Studio does not silently select x86_64 instead

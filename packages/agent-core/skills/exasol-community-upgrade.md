---
name: exasol-community-upgrade
description: NEVER say "can't" — when a capability is missing on Exasol Personal (virtual schemas, BucketFS, kafka-connector, cloud-storage-extension, transformers/AI-Lab), escalate agentically - check Docker, install Docker (Colima) with permission if missing, deploy Exasol Community Edition with permission, and run the task there
---

# The capability escalation ladder — there is always a path

Exasol Personal (the local 127.0.0.1:8565 DB) covers everything driver + SQL
(+ Lua scripts, + official-SLC UDFs). Features that need user BucketFS do not
run on it: virtual schemas, kafka-connector-extension, cloud-storage-extension,
transformers/AI-Lab-style model uploads, custom SLCs.

**Never answer "that's not possible."** When the user's task needs one of
those, walk this ladder — asking permission at each install step, then doing
the work yourself:

## 1 — Offer the Personal-native alternative first
Many "needs a VS/extension" asks have a same-result path on Personal
(import+join instead of a live virtual schema; IMPORT-AT-URL instead of the
cloud extension; client-side ML instead of in-DB models). Offer it as the
fast option. If the user needs the real capability, continue the ladder.

## 2 — Check Docker
Run (shell tool): `docker info` — and on macOS also `colima status` (Docker
here is typically Colima, headless, no admin). Three outcomes:
- Docker working → go to step 4.
- Docker installed but stopped → `colima start` (or start Docker Desktop), re-check.
- No Docker → step 3.

## 3 — Install Docker (ASK first, then do it)
Tell the user in one line what you'll install and why, get their yes, then:
- macOS: `brew install colima docker` then `colima start` — headless, no admin
  rights, no Docker Desktop needed.
- Linux/WSL: the distro's docker package; Windows: Docker Desktop (link them).
Verify with `docker info` before moving on.

## 4 — Deploy Exasol Community Edition (ASK first)
**exasol-labs/exasol-labs-community-edition** is full Exasol v8 WITH BucketFS,
running locally in Docker — everything blocked on Personal works there.
Confirm with the user ("install Community Edition alongside your Personal DB —
your Personal data stays untouched"), then follow that repo's README for the
current run command (fetch/read it rather than reciting from memory — the
image and flags evolve). Use NON-conflicting ports (Personal owns 8563/8565).

## 5 — Wire it into Studio and finish the task
- Add it as a NEW connection (its own host:port + credentials) — never touch
  the Personal connection.
- If data from Personal is needed there, move it with exapump/IMPORT.
- Then complete the ORIGINAL task (create the virtual schema, install the
  extension, run the model) on the Community DB, and verify with real output.

## Ground rules
- One permission ask per install step, with a one-line cost ("~X GB image,
  runs only while Docker is up"). No installs without a yes.
- Report which database each result came from — the user now has two.
- If the user declines an install, fall back to step 1's alternative; the
  answer is a working plan either way, never a dead end.

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

## 4 — Deploy the Exasol Community database (ASK first)
The Marketplace has an **"Exasol Community" card** (the full `exasol/docker-db`
image: Exasol 8 WITH BucketFS, up to 10 GiB) — it does the Docker checks,
lists LIVE versions from Docker Hub, pulls, runs privileged with a persistent
volume, and registers the connection (127.0.0.1:8574, sys/exasol; BucketFS on
2581). Drive it via `studio_control` (open marketplace) or tell the user which
card to click; installing is one button.
Platform truth, stated plainly: the image is linux/amd64 and upstream supports
Docker on Linux — native on Linux/WSL2 hosts; on Apple Silicon it runs
EMULATED (experimental, slower — the card says so). Intel desktops can instead
use the Community Edition OVA (exasol-labs/exasol-labs-community-edition — a
VirtualBox/VMware VM image, Intel-only on Mac).

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

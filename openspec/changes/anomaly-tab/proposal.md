# Anomalies: typed decisions over rows, locally

## Why

Fraud and discrepancy checks in Studio today mean writing the rule by hand
in SQL. The rules that matter most — "does this transaction look wrong for
its kind", "is this vendor unusual for this account" — are judgments, not
predicates, and nobody writes them as SQL. Meanwhile a new class of model
answers exactly such typed questions (yes/no, a choice, a score) about a
record in one forward pass, with calibrated probabilities, in milliseconds,
on a laptop CPU, without generating a word of text.

This change adds an **Anomalies** tab: pick a connection and a query, state
the decisions in plain language, run them over the rows on this machine, and
get a scored, filterable result. The engine is **Ollaya** — an open,
Apache-2.0 decision-model runtime (one binary, `ollaya serve`) — running the
open **Laya** decision models (Apache-2.0, Convai Innovations). Ollaya is
installed through the Marketplace like every other component and driven by
Studio; nothing leaves the machine.

## What

- A `decisions` capability in Rust: start `ollaya serve` when it is not
  running, list and pull models through Ollaya's own CLI, and answer typed
  questions about a batch of rows through its `/api/decide` endpoint.
- An **Anomalies** workspace tab (full-tab view, like Marketplace): source
  (connection + SQL), decisions (presets for fraud and discrepancy, editable
  questions of the three types), the engine's state, and results — the rows
  with one column per decision, a flag threshold, the flagged count, CSV
  export.
- A Marketplace item for Ollaya, installed from its GitHub release for this
  platform, with a `perPlatform` release coordinate: the pattern matches one
  file per platform and the host picks — an explicit flag, not a guess.

## Non-goals

- **No writes to the database.** Results live in the tab and in an exported
  file; a "save flagged rows" step can come later, as a review-first action.
- **No cloud.** The hosted service that speaks the same wire format is one
  URL away, but this change does not add it.
- **No text generation, no explanations.** Decision models answer typed
  questions; the Assistant explains.
- **Linux is not served yet**: Ollaya ships Linux as `.tar.zst`, which Studio
  does not extract. The item says so on Linux rather than offering a button.

## Capabilities

- `anomaly-detection` (new).
- `marketplace-installs` (modified): a release coordinate may declare one
  file per platform.

# Design

## The engine, Studio-managed

Ollaya is one binary. The Marketplace installs it (`gh-asset`, `onPath`,
`perPlatform`) into Studio's bin directory; `decisions.rs` resolves it there
first, then on PATH (a by-hand install counts). `ollaya serve` listens on
`127.0.0.1:11435`. Studio never assumes it runs: every call goes through
`ensure_serving`, which probes `GET /api/tags` and, when nothing answers,
spawns `ollaya serve` (output discarded), keeps the child in managed state,
polls for up to twenty seconds, and kills it on app exit — the same life the
local LLM engine has. A daemon started by the person or the CLI is adopted,
not duplicated.

Models are pulled through `ollaya pull <name>`, streamed to the marketplace
log under the job id `anomaly`, so the tab reuses the same progress plumbing
as an install. A model name is validated (`name[:tag]`, lowercase, dots,
dashes, underscores) before it reaches a command line or a request.

## One row, one state

`POST /api/decide` takes `{ model, state, questions, keep_alive }`. The state
is the row as an object — column name → value — so the model sees the
record the way an analyst would, not a joined string. Questions are the
TypeSafe schema Ollaya shares with `/v1/systemone`: keyed by id, each
`{ type: "noul" | "choice" | "score", instructions, criteria? }`. Answers come
back keyed the same way: `noul` → a probability, `choice` → the label with
per-label probabilities and confidence, `score` → the expected level with
per-level probabilities. Rows are sent four at a time; progress is emitted
per row; a failure names the row.

## The tab

Four regions, top to bottom, no modal:

1. **Engine** — installed? serving? which models are present; a model field
   with Pull; when Ollaya is missing, one button to its Marketplace item.
2. **Source** — connection (a dropdown, never a native select), SQL with a
   row cap, Run. The query runs through the same `execute_sql` the editor
   uses, so history, drivers and cancellation behave the same.
3. **Decisions** — presets (*Fraud screen*, *Discrepancy check*) that fill
   the editor; each question has an id, a type, instructions and, for choice
   and score, its criteria. Pure helpers turn the editor into the request.
4. **Results** — a fixed-layout grid: the row's columns, then one column per
   decision showing the answer and its probability; a *flag on* picker (which
   decision) and a threshold; flagged rows first; the count; Export CSV.

Flag value per type, so any decision can drive the threshold: `noul` → its
probability; `score` → expected level ÷ (levels − 1); `choice` → 1 − P(first
option), the first option being the "nothing wrong" label by convention in
the presets and stated in the editor.

## Files

- `src-tauri/src/decisions.rs` — engine, pull, decide; pure `valid_model_name`,
  `decide_body`, `answers_of` tested.
- `features/anomaly/decisions.ts` — types, presets, `rowState`, `toQuestions`,
  `flagValue`, `rankFlagged`, `toCsv`; tested.
- `features/anomaly/AnomalyTab.tsx` plus `EngineBar.tsx`, `QuestionsEditor.tsx`,
  `ResultsGrid.tsx` — each under the size rule.
- Shell: `TabView` gains `anomalies`; the rail gains the item; the shell opens
  it like Marketplace.
- `assets.ts`: `perPlatform` narrows a pattern's matches by the host's
  platform rules; the verifier accepts several matches for such an item.

# Tasks

## 1. Engine (Rust)
- [x] `decisions.rs`: resolve the binary (Studio bin dir, then PATH), probe,
      spawn `ollaya serve`, adopt a running daemon, kill on exit.
- [x] `decisions_status`, `decisions_pull` (streamed under job `anomaly`),
      `decisions_decide` (four in flight, per-row progress, row-naming errors).
- [x] Pure + tested: `valid_model_name`, `decide_body`, `answers_of`.

## 2. Marketplace item
- [x] `perPlatform` on `gh-asset`: `pickAsset` narrows several matches by the
      platform rules; verifier accepts ≥1 match; tests.
- [x] Catalogue: `ollaya` (kind server, binary, onPath). Detection by binary.

## 3. Tab
- [x] `decisions.ts` pure helpers + presets, tested.
- [x] `EngineBar`, `QuestionsEditor`, `ResultsGrid`, `AnomalyTab`.
- [x] Shell: view, icon, rail item, open/focus, deep link, toolbar exclusion.

## 4. Review
- [x] Codex review; fix; build; PR.

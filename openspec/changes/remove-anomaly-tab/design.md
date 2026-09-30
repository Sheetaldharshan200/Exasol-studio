# Design

A straight removal. Every reference was found by grepping for the tab's view
id, the engine's command names and the item id; each site was deleted rather
than stubbed, so no dead branch remains:

- Shell: `tabs.ts` view + icon, `ActivityRail.tsx` item + full-tab set,
  `ExasolStudio.tsx` import, open function, rail handler, deep link, toolbar
  exclusion, render branch.
- IPC: `DecisionStatus`, `DecideOutcome`, the three `decisions*` calls.
- Rust: module, managed state, command registration, kill on exit,
  `ollaya` detection.
- Catalog: the `ollaya` item and the `ollaya-dev` owner allowance in the
  catalog test.

The `perPlatform` narrowing in `assets.ts` and its test keep their Ollaya
file names as a fixture: the layout (one archive per platform, a `.sha256`
sibling, a DMG to ignore) is what the rule was written against.

---
title: Semantic layer auto-sync — design decisions and findings
category: architecture
created: 2026-09-09
---

# Semantic layer auto-sync — what the next contributor must know

The Semantic Views layer self-maintains: every DB change from every surface
triggers a debounced validate pass (`semantic-sync.ts`), schema changes also
regenerate published metadata surfaces, and coverage gaps (datasets with no
model) are reported. Findings that shaped it:

## Framework contract facts (exasol-labs/exasol-semantic-views 0.2)
- `REFRESH_SEMANTIC_SURFACE(model)` **wraps PUBLISH_MODEL** — run it only on
  `STATUS='PUBLISHED'` models or you silently publish a draft.
- `CREATE SEMANTIC VIEW` is refused by design (`SEMANTIC_DDL_010`) — new
  models bootstrap through the admin scripts; `CALL_ADMIN_JSON(name, json)`
  is the uniform by-name entry with parameter validation
  (`SEMANTIC_ADMIN_100/101`); `APPLY_SEMANTIC_DEFINITION(def, dry_run)` has a
  snapshot/simulate/rollback dry-run — always dry-run first, and check the
  result row's `STATUS` (a refusal is `STATUS='ERROR'`, not an exception).
- `VALIDATE_MODEL` is NOT read-only: it records validation runs. It was
  pulled off the no-approval allowlists for exactly that reason.
- Exasol string literals escape by doubling single quotes; backslash is not
  an escape (Codex verified against the docs) — `lit()` quote-doubling is
  sufficient for the CALL_ADMIN_JSON literals, with the script name locked
  to `^[A-Z0-9_]+$`.

## Bugs only live runs caught
- **EXECUTE SCRIPT through driver.execute() throws AFTER the script's side
  effects committed** (scripts return result tables). In the DAG executor
  that failed the step and DOUBLE-RAN the script on retry ("duplicate model
  name"). Scripts route through the query path; approval is unchanged
  (classifySql marks EXECUTE as write).
- Framework parameter names come from its published signatures
  (`COMPILE_SQL` takes `original_sql`, not `sql_text`) — the by-name
  validation is your friend; don't guess.

## Sync design rules
- One choke point: `DbRegistry.onWrite` fires from execute/executeIsolated
  and from bulkLoad **only after COMMIT** (observers must never act on
  statements a rollback can retract).
- `classifySemanticImpact`: DDL → schema (validate + refresh published),
  data loads → validate only (published views are live SQL — nothing to
  regenerate), any OTHER `EXECUTE SCRIPT` → schema (Lua `pquery` can run
  DDL; drafting a model should trigger a pass); ONLY the sync's own
  VALIDATE_MODEL/REFRESH_SEMANTIC_SURFACE calls are exempt — that exact
  pair is what makes self-triggering impossible. Leading SQL comments are
  stripped before classifying.
- Connect-time pass is VALIDATE-ONLY: republishing every surface on every
  app start is churn without proof of a schema change.
- Coverage excludes published schemas dynamically BY NAME from
  `SYS_SEMANTIC.MODELS.PUBLISHED_SCHEMA` — never by `SEMANTIC_` prefix
  (a real user dataset may carry that prefix). Catalog casing is preserved
  for quoted identifiers; matching is case-insensitive.
- Permission asks must show the FULL payload that will run — truncated
  previews let material changes hide past the cut.

## Surfaces
Loop tools: `semantic_models` / `semantic_admin` / `semantic_apply_definition`
(+ the compilers). Gateway: `GET/POST /gateway/semantic*` + `semantic_models`
/ `semantic_call` MCP tools — read-only scripts only; catalog mutations go
through approved plans (`execute_plan` with EXECUTE SCRIPT steps). Both share
`SEMANTIC_READONLY_SCRIPTS` and `semanticOverview()`. Golden evals gain the
`semantic-first` case, skipped honestly where the framework is absent.

// Semantic-layer upkeep (spec §6, hardened): classify which statements can
// change what the semantic model means, and summarize the framework's
// validation output. Pure logic ONLY — the debounced runner that talks to
// the database lives in semantic-sync.ts.
//
// Framework facts (exasol-labs/exasol-semantic-views):
//   SYS_SEMANTIC.MODELS(MODEL_NAME, STATUS 'DRAFT'|'PUBLISHED', ACTIVE_VERSION_ID)
//   SEMANTIC_ADMIN.VALIDATE_MODEL('m')          — records issues
//   SEMANTIC_ADMIN.REFRESH_SEMANTIC_SURFACE('m') — republishes metadata views
//     (wraps PUBLISH_MODEL, so it must only run on already-PUBLISHED models)
//   SEMANTIC_CATALOG.CURRENT_VALIDATION_ISSUES  — the live issue list

/**
 * What a statement can do to the semantic layer:
 * - "schema": DDL that can break model BINDINGS (dropped column, renamed
 *   table) — needs validation AND a republish of the metadata surface.
 * - "data": loads/mutations — the published views are live SQL so nothing
 *   breaks, but the model is revalidated (debounced) so drift in the
 *   catalog's freshness is visible, not silent.
 * - "none": reads, and the framework's own EXECUTE SCRIPT calls (which must
 *   never re-trigger the sync that issued them).
 */
export type SemanticImpact = "schema" | "data" | "none";

const SCHEMA_RE = /^(CREATE|ALTER|DROP|RENAME)\b/i;
const DATA_RE = /^(INSERT|UPDATE|DELETE|MERGE|IMPORT|TRUNCATE)\b/i;
// A script can do ANYTHING (Lua pquery may run DDL — the in-DB offload path),
// so scripts are conservatively schema-impacting. The ONLY exceptions are the
// two calls the sync itself issues — anything else, including other
// SEMANTIC_ADMIN scripts (drafting a model SHOULD trigger a validation pass),
// re-marks the connection.
const SCRIPT_RE = /^EXECUTE\s+SCRIPT\b/i;
const OWN_SYNC_RE = /^EXECUTE\s+SCRIPT\s+SEMANTIC_ADMIN\s*\.\s*(VALIDATE_MODEL|REFRESH_SEMANTIC_SURFACE)\s*\(/i;

/** Leading whitespace and comments hide the verb — strip before matching. */
function firstStatementToken(sql: string): string {
  let s = sql;
  for (;;) {
    const before = s;
    s = s.replace(/^\s+/, "").replace(/^--[^\n]*\n?/, "").replace(/^\/\*[\s\S]*?\*\//, "");
    if (s === before) return s;
  }
}

export function classifySemanticImpact(sql: string): SemanticImpact {
  const s = firstStatementToken(sql);
  if (OWN_SYNC_RE.test(s)) return "none";
  if (SCHEMA_RE.test(s) || SCRIPT_RE.test(s)) return "schema";
  if (DATA_RE.test(s)) return "data";
  return "none";
}

export type SemanticIssueRow = { model: string; severity: string; rule: string; message: string };

export type SemanticSyncResult = {
  connectionId: string;
  /** What triggered it — the strongest impact seen since the last run. */
  impact: Exclude<SemanticImpact, "none">;
  models: { name: string; validated: boolean; refreshed?: boolean; error?: string }[];
  issueCount: number;
  issues: string[];
  /** User schemas with tables that NO model binds — new datasets land here. */
  uncoveredSchemas: string[];
  elapsedMs: number;
};

/** Human lines for the UI notice — capped, worst first. */
export function formatIssues(rows: SemanticIssueRow[], cap = 5): string[] {
  const rank = (s: string) => (/^err/i.test(s) ? 0 : /^warn/i.test(s) ? 1 : 2);
  return [...rows]
    .sort((a, b) => rank(a.severity) - rank(b.severity))
    .slice(0, cap)
    .map((r) => `${r.model} [${r.severity}] ${r.rule}: ${r.message}`.slice(0, 200));
}

/** Merge two pending impacts — "schema" always wins (it implies a refresh). */
export function mergeImpact(a: SemanticImpact, b: SemanticImpact): SemanticImpact {
  if (a === "schema" || b === "schema") return "schema";
  if (a === "data" || b === "data") return "data";
  return "none";
}

/**
 * Schemas that must never be reported as "missing a semantic model":
 * Exasol system schemas, the framework's own schemas (by their literal
 * names — models' PUBLISHED schemas are excluded dynamically by the caller,
 * not by prefix), and Studio's internal fixtures (evals, DAG smoke tests,
 * integration runs).
 */
export const INTERNAL_SCHEMA_RE = /^(SYS$|EXA_|SYS_SEMANTIC$|SEMANTIC_ADMIN$|SEMANTIC_CATALOG$|SEMANTIC_AGENT$|STUDIO_EVALS$|EVAL_FIXTURE$|DAG_SMOKE|ITEST_)/i;

/**
 * Coverage gap: user schemas that hold tables but are bound by NO semantic
 * model — a freshly loaded dataset shows up here, so the agent can offer to
 * draft a model for it instead of leaving it semantically invisible.
 * Matching is case-insensitive (unquoted Exasol identifiers fold to upper),
 * but the RETURNED names keep the catalog's exact casing so quoted
 * case-sensitive schemas stay addressable.
 */
export function uncoveredSchemas(schemasWithTables: string[], boundSchemas: string[]): string[] {
  const bound = new Set(boundSchemas.map((s) => s.toUpperCase()));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of schemasWithTables) {
    const key = s.toUpperCase();
    if (!s || bound.has(key) || INTERNAL_SCHEMA_RE.test(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out.sort();
}

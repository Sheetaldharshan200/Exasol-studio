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
  if (SCHEMA_RE.test(s)) return "schema";
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

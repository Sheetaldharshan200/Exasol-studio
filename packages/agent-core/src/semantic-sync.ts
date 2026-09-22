// Semantic-layer sync runner: whenever the agent CHANGES the database
// (schema or data, from any surface — run_sql, batches, imports, DAG plan
// steps), the Semantic Views models on that connection are revalidated and,
// after schema changes, their published metadata surfaces are regenerated.
// Debounced (a 40-file import triggers ONE pass), serialized per connection,
// and a no-op on databases without the framework. Classification is pure
// (semantic.ts, tested); this file is I/O glue on isolated sessions.

import { classifySemanticImpact, formatIssues, mergeImpact, uncoveredSchemas, type SemanticImpact, type SemanticSyncResult } from "./semantic.ts";
import type { DbRegistry } from "./db.ts";
import { log } from "./log.ts";

const DEBOUNCE_MS = 2500;
const q = (s: string) => s.replace(/'/g, "''");

type SyncDb = Pick<DbRegistry, "queryIsolated">;
type QueryFn = (id: string, sql: string) => Promise<{ columns: string[]; rows: unknown[][]; rowCount: number }>;

export type SemanticOverview = {
  installed: boolean;
  models: { name: string; status: string; publishedSchema: string | null; description: string | null }[];
  issues: { model: string; severity: string; rule: string; message: string }[];
  schemasWithoutModel: string[];
};

/**
 * One snapshot of the semantic layer's state — models, open validation
 * issues, and datasets no model covers. Shared by the loop tool
 * (semantic_models) and the gateway route so both surfaces agree.
 */
export async function semanticOverview(query: QueryFn, connectionId: string): Promise<SemanticOverview> {
  const probe = await query(
    connectionId,
    "SELECT COUNT(*) FROM SYS.EXA_ALL_TABLES WHERE TABLE_SCHEMA = 'SYS_SEMANTIC' AND TABLE_NAME = 'MODELS'",
  );
  if (Number(probe.rows[0]?.[0] ?? 0) === 0) {
    return { installed: false, models: [], issues: [], schemasWithoutModel: [] };
  }
  const modelRows = await query(
    connectionId,
    "SELECT MODEL_NAME, STATUS, PUBLISHED_SCHEMA, DESCRIPTION FROM SYS_SEMANTIC.MODELS WHERE ACTIVE_VERSION_ID IS NOT NULL ORDER BY MODEL_NAME",
  );
  const models = modelRows.rows.map((r) => ({
    name: String(r[0] ?? ""),
    status: String(r[1] ?? ""),
    publishedSchema: r[2] == null ? null : String(r[2]),
    description: r[3] == null ? null : String(r[3]),
  }));
  let issues: SemanticOverview["issues"] = [];
  try {
    const rows = await query(
      connectionId,
      "SELECT MODEL_NAME, SEVERITY, RULE_CODE, MESSAGE FROM SEMANTIC_CATALOG.CURRENT_VALIDATION_ISSUES ORDER BY CREATED_AT DESC LIMIT 20",
    );
    issues = rows.rows.map((r) => ({ model: String(r[0] ?? ""), severity: String(r[1] ?? ""), rule: String(r[2] ?? ""), message: String(r[3] ?? "") }));
  } catch {
    /* issues view unavailable on older revisions */
  }
  let schemasWithoutModel: string[] = [];
  try {
    const bound = await query(
      connectionId,
      "SELECT DISTINCT e.SOURCE_SCHEMA FROM SYS_SEMANTIC.ENTITIES e JOIN SYS_SEMANTIC.MODELS m ON e.MODEL_ID = m.MODEL_ID AND e.VERSION_ID = m.ACTIVE_VERSION_ID " +
        "UNION SELECT DISTINCT PUBLISHED_SCHEMA FROM SYS_SEMANTIC.MODELS WHERE PUBLISHED_SCHEMA IS NOT NULL",
    );
    const withTables = await query(
      connectionId,
      "SELECT DISTINCT TABLE_SCHEMA FROM SYS.EXA_ALL_TABLES WHERE TABLE_SCHEMA NOT IN ('SYS', 'EXA_STATISTICS')",
    );
    schemasWithoutModel = uncoveredSchemas(
      withTables.rows.map((r) => String(r[0] ?? "")),
      bound.rows.map((r) => String(r[0] ?? "")),
    );
  } catch {
    /* coverage is best-effort */
  }
  return { installed: true, models, issues, schemasWithoutModel };
}

export class SemanticSync {
  private pending = new Map<string, Exclude<SemanticImpact, "none">>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private running = new Set<string>();

  private readonly db: SyncDb;
  private readonly onResult: (result: SemanticSyncResult) => void;
  private readonly debounceMs: number;

  constructor(db: SyncDb, onResult: (result: SemanticSyncResult) => void, opts?: { debounceMs?: number }) {
    this.db = db;
    this.onResult = onResult;
    this.debounceMs = opts?.debounceMs ?? DEBOUNCE_MS;
  }

  /** Called from the DbRegistry write hook — every write from every surface. */
  noteWrite(connectionId: string, sql: string): void {
    const impact = classifySemanticImpact(sql);
    if (impact === "none") return;
    this.schedule(connectionId, impact);
  }

  /** Called when a connection (re)registers: changes made OUTSIDE the agent
   *  (exapump, other clients) since the last session get caught here. This is
   *  a VALIDATE-ONLY pass ("data" impact) — republishing every surface on
   *  every app start would be churn without proof of a schema change; when
   *  validation finds drift, the issues surface and the fix (or republish)
   *  is a deliberate action. */
  noteConnect(connectionId: string): void {
    this.schedule(connectionId, "data");
  }

  private schedule(connectionId: string, impact: Exclude<SemanticImpact, "none">): void {
    const merged = mergeImpact(this.pending.get(connectionId) ?? "none", impact);
    this.pending.set(connectionId, merged as Exclude<SemanticImpact, "none">);
    clearTimeout(this.timers.get(connectionId));
    this.timers.set(
      connectionId,
      setTimeout(() => void this.run(connectionId), this.debounceMs),
    );
  }

  private async run(connectionId: string): Promise<void> {
    if (this.running.has(connectionId)) {
      // A pass is active — keep the mark; it reschedules when the pass ends.
      this.timers.set(
        connectionId,
        setTimeout(() => void this.run(connectionId), this.debounceMs),
      );
      return;
    }
    const impact = this.pending.get(connectionId);
    if (!impact) return;
    this.pending.delete(connectionId);
    this.timers.delete(connectionId);
    this.running.add(connectionId);
    const started = Date.now();
    try {
      const result = await this.revalidate(connectionId, impact, started);
      if (result) this.onResult(result);
    } catch (e) {
      // Sync must never break the write that triggered it.
      log.warn("semantic sync failed", { connectionId, error: e instanceof Error ? e.message : String(e) });
    } finally {
      this.running.delete(connectionId);
    }
  }

  private async revalidate(
    connectionId: string,
    impact: Exclude<SemanticImpact, "none">,
    started: number,
  ): Promise<SemanticSyncResult | null> {
    // Installed at all? Most databases won't have the framework — stay silent.
    const probe = await this.db.queryIsolated(
      connectionId,
      "SELECT COUNT(*) FROM SYS.EXA_ALL_TABLES WHERE TABLE_SCHEMA = 'SYS_SEMANTIC' AND TABLE_NAME = 'MODELS'",
    );
    if (Number(probe.rows[0]?.[0] ?? 0) === 0) return null;

    const modelRows = await this.db.queryIsolated(
      connectionId,
      "SELECT MODEL_NAME, STATUS, PUBLISHED_SCHEMA FROM SYS_SEMANTIC.MODELS WHERE ACTIVE_VERSION_ID IS NOT NULL ORDER BY MODEL_NAME",
    );
    // Published schemas hold generated views, not user data — they are
    // excluded from coverage dynamically (by name, not by prefix guess).
    const publishedSchemas = modelRows.rows.map((r) => String(r[2] ?? "")).filter(Boolean);
    const models: SemanticSyncResult["models"] = [];
    for (const row of modelRows.rows) {
      const name = String(row[0] ?? "");
      const published = String(row[1] ?? "") === "PUBLISHED";
      if (!name) continue;
      const entry: SemanticSyncResult["models"][number] = { name, validated: false };
      try {
        await this.db.queryIsolated(connectionId, `EXECUTE SCRIPT SEMANTIC_ADMIN.VALIDATE_MODEL('${q(name)}')`);
        entry.validated = true;
      } catch (e) {
        entry.error = (e instanceof Error ? e.message : String(e)).slice(0, 200);
      }
      // The metadata surface is regenerated only after SCHEMA changes and
      // only for models that are ALREADY published — REFRESH wraps
      // PUBLISH_MODEL, and publishing a draft is an admin decision, not ours.
      if (impact === "schema" && published && entry.validated) {
        try {
          await this.db.queryIsolated(connectionId, `EXECUTE SCRIPT SEMANTIC_ADMIN.REFRESH_SEMANTIC_SURFACE('${q(name)}')`);
          entry.refreshed = true;
        } catch (e) {
          entry.refreshed = false;
          entry.error = (e instanceof Error ? e.message : String(e)).slice(0, 200);
        }
      }
      models.push(entry);
    }
    if (!models.length) return null;

    let issueCount = 0;
    let issues: string[] = [];
    try {
      const rows = await this.db.queryIsolated(
        connectionId,
        "SELECT MODEL_NAME, SEVERITY, RULE_CODE, MESSAGE FROM SEMANTIC_CATALOG.CURRENT_VALIDATION_ISSUES ORDER BY CREATED_AT DESC LIMIT 50",
      );
      issueCount = rows.rowCount;
      issues = formatIssues(
        rows.rows.map((r) => ({
          model: String(r[0] ?? ""),
          severity: String(r[1] ?? ""),
          rule: String(r[2] ?? ""),
          message: String(r[3] ?? ""),
        })),
      );
    } catch {
      /* issues view unavailable — report the validation runs alone */
    }

    // Coverage: a NEW dataset (schema with tables, bound by no active model)
    // is semantically invisible — report it so the agent can offer a draft.
    let uncovered: string[] = [];
    try {
      const bound = await this.db.queryIsolated(
        connectionId,
        "SELECT DISTINCT e.SOURCE_SCHEMA FROM SYS_SEMANTIC.ENTITIES e JOIN SYS_SEMANTIC.MODELS m ON e.MODEL_ID = m.MODEL_ID AND e.VERSION_ID = m.ACTIVE_VERSION_ID",
      );
      const withTables = await this.db.queryIsolated(
        connectionId,
        "SELECT DISTINCT TABLE_SCHEMA FROM SYS.EXA_ALL_TABLES WHERE TABLE_SCHEMA NOT IN ('SYS', 'EXA_STATISTICS')",
      );
      uncovered = uncoveredSchemas(
        withTables.rows.map((r) => String(r[0] ?? "")),
        [...bound.rows.map((r) => String(r[0] ?? "")), ...publishedSchemas],
      );
    } catch {
      /* coverage is best-effort — validation results still stand */
    }

    return { connectionId, impact, models, issueCount, issues, uncoveredSchemas: uncovered, elapsedMs: Date.now() - started };
  }
}

import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { generateText, type LanguageModel } from "ai";
import type { DbRegistry } from "./db.ts";
import { log } from "./log.ts";

// The schema knowledge graph: tables/columns as nodes, FK + inferred join
// edges, FTS5 search. This is what lets small local models answer precisely
// against big schemas — kb_search returns a few hundred tokens of exactly
// the right tables instead of a full-schema dump.

export type TableCard = {
  schema: string;
  table: string;
  kind: string;
  rows: number | null;
  comment: string | null;
  /** AI-generated one-line meaning (cuts token usage in cards). */
  meaning?: string;
  columns: { name: string; type: string }[];
  columnCount?: number;
  joins: string[];
};

const JOIN_HINT_RE = /(ID|KEY|CODE|NR|NUM)$/i;

export class KnowledgeGraph {
  private db: DatabaseSync;

  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true });
    this.db = new DatabaseSync(join(dataDir, "kb.db"));
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS kb_tables(
        conn TEXT, schema TEXT, name TEXT, kind TEXT, rows INTEGER, comment TEXT,
        PRIMARY KEY (conn, schema, name)
      );
      CREATE TABLE IF NOT EXISTS kb_columns(
        conn TEXT, schema TEXT, tbl TEXT, name TEXT, type TEXT, comment TEXT,
        PRIMARY KEY (conn, schema, tbl, name)
      );
      CREATE TABLE IF NOT EXISTS kb_edges(
        conn TEXT, kind TEXT,
        src_schema TEXT, src_table TEXT, src_col TEXT,
        dst_schema TEXT, dst_table TEXT, dst_col TEXT
      );
      CREATE TABLE IF NOT EXISTS kb_meta(conn TEXT PRIMARY KEY, crawled_at INTEGER);
      CREATE VIRTUAL TABLE IF NOT EXISTS kb_fts USING fts5(
        conn UNINDEXED, schema UNINDEXED, tbl UNINDEXED, body
      );
    `);
    // Additive migration for AI semantics.
    try {
      this.db.exec("ALTER TABLE kb_tables ADD COLUMN semantic TEXT");
    } catch {
      // column already exists
    }
  }

  private annotating = new Set<string>();

  /**
   * AI semantics: give unannotated tables a one-line meaning in a single
   * batched model call. Cheap, incremental, and it makes kb_search cards
   * far smaller — the meaning replaces walls of column lists.
   */
  async annotateMissing(conn: string, model: LanguageModel, cap = 12): Promise<number> {
    if (this.annotating.has(conn)) return 0;
    this.annotating.add(conn);
    try {
      const pending = this.db
        .prepare("SELECT schema, name FROM kb_tables WHERE conn=? AND semantic IS NULL LIMIT ?")
        .all(conn, cap) as { schema: string; name: string }[];
      if (!pending.length) return 0;
      const specs = pending.map((t) => {
        const cols = this.db
          .prepare("SELECT name, type, comment FROM kb_columns WHERE conn=? AND schema=? AND tbl=? LIMIT 40")
          .all(conn, t.schema, t.name) as { name: string; type: string; comment: string | null }[];
        return `${t.schema}.${t.name}: ${cols.map((c) => c.name + (c.comment ? ` (${c.comment})` : "")).join(", ")}`;
      });
      const res = await generateText({
        model,
        system:
          'For each database table, write ONE short line describing what it holds and what it is used for, based only on its name and columns. Reply as strict JSON: {"SCHEMA.TABLE": "meaning", ...}. No other text.',
        prompt: specs.join("\n"),
        temperature: 0.1,
      });
      const jsonMatch = res.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return 0;
      const map = JSON.parse(jsonMatch[0]) as Record<string, string>;
      let saved = 0;
      const upd = this.db.prepare("UPDATE kb_tables SET semantic=? WHERE conn=? AND schema=? AND name=?");
      for (const t of pending) {
        const meaning = map[`${t.schema}.${t.name}`];
        if (typeof meaning === "string" && meaning.trim()) {
          upd.run(meaning.trim().slice(0, 200), conn, t.schema, t.name);
          saved++;
        }
      }
      if (saved) log.info("kb semantics annotated", { conn, saved });
      return saved;
    } catch (e) {
      log.warn("kb annotation failed", { error: String(e) });
      return 0;
    } finally {
      this.annotating.delete(conn);
    }
  }

  crawledAt(conn: string): number | null {
    const row = this.db.prepare("SELECT crawled_at FROM kb_meta WHERE conn = ?").get(conn) as
      | { crawled_at: number }
      | undefined;
    return row?.crawled_at ?? null;
  }

  /** Crawl the connected database's catalog into the graph. */
  async refresh(connId: string, registry: DbRegistry): Promise<{ tables: number; columns: number; edges: number }> {
    const tables = await registry.queryAll(
      connId,
      `SELECT TABLE_SCHEMA AS S, TABLE_NAME AS N, 'TABLE' AS K, TABLE_ROW_COUNT AS R, TABLE_COMMENT AS C
         FROM SYS.EXA_ALL_TABLES
       UNION ALL
       SELECT VIEW_SCHEMA, VIEW_NAME, 'VIEW', NULL, VIEW_COMMENT FROM SYS.EXA_ALL_VIEWS`,
    );
    const columns = await registry.queryAll(
      connId,
      `SELECT COLUMN_SCHEMA AS S, COLUMN_TABLE AS T, COLUMN_NAME AS N, COLUMN_TYPE AS TY, COLUMN_COMMENT AS C
         FROM SYS.EXA_ALL_COLUMNS
        WHERE COLUMN_SCHEMA NOT IN ('SYS','EXA_STATISTICS')`,
    );
    const fks = await registry
      .queryAll(
        connId,
        `SELECT CONSTRAINT_SCHEMA AS S, CONSTRAINT_TABLE AS T, COLUMN_NAME AS COL,
                REFERENCED_SCHEMA AS RS, REFERENCED_TABLE AS RT, REFERENCED_COLUMN AS RC
           FROM SYS.EXA_ALL_CONSTRAINT_COLUMNS
          WHERE REFERENCED_TABLE IS NOT NULL`,
      )
      .catch(() => ({ columns: [], rows: [] as unknown[][], rowCount: 0, truncated: false }));

    const tx = this.db;
    tx.exec("BEGIN");
    try {
      // Keep AI semantics across re-crawls — they cost a model call each.
      const kept = new Map<string, string>(
        (tx.prepare("SELECT schema, name, semantic FROM kb_tables WHERE conn = ? AND semantic IS NOT NULL").all(connId) as {
          schema: string;
          name: string;
          semantic: string;
        }[]).map((r) => [`${r.schema}.${r.name}`, r.semantic]),
      );
      for (const t of ["kb_tables", "kb_columns", "kb_edges", "kb_fts"]) {
        tx.prepare(`DELETE FROM ${t} WHERE conn = ?`).run(connId);
      }
      const insT = tx.prepare(
        "INSERT OR REPLACE INTO kb_tables(conn, schema, name, kind, rows, comment, semantic) VALUES (?,?,?,?,?,?,?)",
      );
      const insC = tx.prepare("INSERT OR REPLACE INTO kb_columns(conn, schema, tbl, name, type, comment) VALUES (?,?,?,?,?,?)");
      const insE = tx.prepare(
        "INSERT INTO kb_edges(conn, kind, src_schema, src_table, src_col, dst_schema, dst_table, dst_col) VALUES (?,?,?,?,?,?,?,?)",
      );
      const insF = tx.prepare("INSERT INTO kb_fts(conn, schema, tbl, body) VALUES (?,?,?,?)");

      const colByTable = new Map<string, { name: string; type: string; comment: string | null }[]>();
      for (const r of columns.rows) {
        const [s, t, n, ty, c] = r as [string, string, string, string, string | null];
        insC.run(connId, s, t, n, ty, c ?? null);
        const key = `${s}.${t}`;
        if (!colByTable.has(key)) colByTable.set(key, []);
        colByTable.get(key)!.push({ name: n, type: ty, comment: c });
      }
      for (const r of tables.rows) {
        const [s, n, k, rows, c] = r as [string, string, string, number | null, string | null];
        if (s === "SYS" || s === "EXA_STATISTICS") continue;
        insT.run(connId, s, n, k, rows ?? null, c ?? null, kept.get(`${s}.${n}`) ?? null);
        const cols = colByTable.get(`${s}.${n}`) ?? [];
        const body = [n, c ?? "", ...cols.map((x) => `${x.name} ${x.comment ?? ""}`)].join(" ");
        insF.run(connId, s, n, body);
      }
      let edgeCount = 0;
      for (const r of fks.rows) {
        const [s, t, col, rs, rt, rc] = r as [string, string, string, string, string, string];
        insE.run(connId, "fk", s, t, col, rs, rt, rc);
        edgeCount++;
      }
      // Inferred join hints: key-ish column names matched after stripping a
      // short table prefix (TPC-H style: C_CUSTKEY ↔ O_CUSTKEY → CUSTKEY).
      const byCol = new Map<string, { s: string; t: string; col: string }[]>();
      for (const r of columns.rows) {
        const [s, t, n] = r as [string, string, string];
        if (!JOIN_HINT_RE.test(n)) continue;
        const norm = n.replace(/^[A-Z]{1,2}_/, "");
        if (!byCol.has(norm)) byCol.set(norm, []);
        byCol.get(norm)!.push({ s, t, col: n });
      }
      for (const [, sites] of byCol) {
        if (sites.length < 2 || sites.length > 8) continue; // too generic → noise
        for (let i = 0; i < sites.length; i++) {
          for (let j = i + 1; j < sites.length; j++) {
            if (sites[i].t === sites[j].t) continue;
            insE.run(connId, "join_hint", sites[i].s, sites[i].t, sites[i].col, sites[j].s, sites[j].t, sites[j].col);
            edgeCount++;
          }
        }
      }
      tx.prepare("INSERT OR REPLACE INTO kb_meta VALUES (?, ?)").run(connId, Date.now());
      tx.exec("COMMIT");
      log.info("kb refreshed", { conn: connId, tables: tables.rowCount, columns: columns.rowCount, edges: edgeCount });
      return { tables: tables.rowCount, columns: columns.rowCount, edges: edgeCount };
    } catch (e) {
      tx.exec("ROLLBACK");
      throw e;
    }
  }

  /** Find the tables relevant to a question + their join context. */
  search(conn: string, question: string, limit = 5): TableCard[] {
    const tokens = [...new Set(question.toUpperCase().split(/[^A-Z0-9_]+/).filter((t) => t.length > 2))];
    if (!tokens.length) return [];
    let hits: { schema: string; tbl: string }[] = [];
    try {
      const match = tokens.map((t) => `"${t.replace(/"/g, "")}"*`).join(" OR ");
      hits = this.db
        .prepare("SELECT schema, tbl FROM kb_fts WHERE kb_fts MATCH ? AND conn = ? LIMIT ?")
        .all(match, conn, limit * 2) as { schema: string; tbl: string }[];
    } catch {
      // FTS syntax edge case → fall back to LIKE below.
    }
    if (!hits.length) {
      const like = `%${tokens[0]}%`;
      hits = this.db
        .prepare("SELECT schema, tbl FROM kb_fts WHERE conn = ? AND body LIKE ? LIMIT ?")
        .all(conn, like, limit * 2) as { schema: string; tbl: string }[];
    }
    const seen = new Set<string>();
    const picked: { schema: string; tbl: string }[] = [];
    for (const h of hits) {
      const key = `${h.schema}.${h.tbl}`;
      if (!seen.has(key)) {
        seen.add(key);
        picked.push(h);
      }
      if (picked.length >= limit) break;
    }
    return picked.map((h) => this.card(conn, h.schema, h.tbl)).filter((c): c is TableCard => Boolean(c));
  }

  /**
   * Compact landscape of the database: each schema with its highest-row
   * tables. Injected every turn so the model always knows what exists
   * (grounding for generic asks) without a list_schemas round-trip.
   */
  overview(conn: string, perSchema = 8): { schema: string; tables: { name: string; rows: number | null; meaning: string | null }[] }[] {
    let rows: { schema: string; name: string; rows: number | null; semantic: string | null }[] = [];
    try {
      rows = this.db
        .prepare(
          "SELECT schema, name, rows, semantic FROM kb_tables WHERE conn=? ORDER BY schema, COALESCE(rows,0) DESC",
        )
        .all(conn) as { schema: string; name: string; rows: number | null; semantic: string | null }[];
    } catch {
      return [];
    }
    const bySchema = new Map<string, { name: string; rows: number | null; meaning: string | null }[]>();
    for (const r of rows) {
      const list = bySchema.get(r.schema) ?? [];
      if (list.length < perSchema) list.push({ name: r.name, rows: r.rows, meaning: r.semantic });
      bySchema.set(r.schema, list);
    }
    return [...bySchema.entries()].map(([schema, tables]) => ({ schema, tables }));
  }

  /** Compact single-table card: columns + join edges. */
  card(conn: string, schema: string, table: string): TableCard | null {
    const t = this.db
      .prepare("SELECT * FROM kb_tables WHERE conn=? AND schema=? AND name=?")
      .get(conn, schema.toUpperCase(), table.toUpperCase()) as
      | { schema: string; name: string; kind: string; rows: number | null; comment: string | null; semantic: string | null }
      | undefined;
    if (!t) return null;
    const total = (
      this.db
        .prepare("SELECT COUNT(*) AS n FROM kb_columns WHERE conn=? AND schema=? AND tbl=?")
        .get(conn, t.schema, t.name) as { n: number }
    ).n;
    // With a semantic meaning available the card can be much leaner.
    const colCap = t.semantic ? 16 : 60;
    const cols = this.db
      .prepare(`SELECT name, type FROM kb_columns WHERE conn=? AND schema=? AND tbl=? LIMIT ${colCap}`)
      .all(conn, t.schema, t.name) as { name: string; type: string }[];
    const edges = this.db
      .prepare(
        `SELECT * FROM kb_edges WHERE conn=? AND (
           (src_schema=? AND src_table=?) OR (dst_schema=? AND dst_table=?)
         ) LIMIT 20`,
      )
      .all(conn, t.schema, t.name, t.schema, t.name) as {
      kind: string;
      src_schema: string;
      src_table: string;
      src_col: string;
      dst_schema: string;
      dst_table: string;
      dst_col: string;
    }[];
    const joins = edges.map(
      (e) =>
        `${e.src_schema}.${e.src_table}.${e.src_col} = ${e.dst_schema}.${e.dst_table}.${e.dst_col}${e.kind === "join_hint" ? " (inferred)" : ""}`,
    );
    return {
      schema: t.schema,
      table: t.name,
      kind: t.kind,
      rows: t.rows,
      comment: t.comment,
      ...(t.semantic ? { meaning: t.semantic } : {}),
      columns: cols,
      ...(total > cols.length ? { columnCount: total } : {}),
      joins: [...new Set(joins)],
    };
  }

  /** BFS shortest join path between two tables over fk + hint edges. */
  joinPath(conn: string, from: string, to: string): string[] | null {
    const norm = (x: string) => x.toUpperCase();
    const target = norm(to.includes(".") ? to.split(".")[1] : to);
    const start = norm(from.includes(".") ? from.split(".")[1] : from);
    const edges = this.db.prepare("SELECT * FROM kb_edges WHERE conn=?").all(conn) as {
      kind: string;
      src_schema: string;
      src_table: string;
      src_col: string;
      dst_schema: string;
      dst_table: string;
      dst_col: string;
    }[];
    const adj = new Map<string, { next: string; cond: string }[]>();
    for (const e of edges) {
      const a = e.src_table;
      const b = e.dst_table;
      const cond = `${e.src_schema}.${e.src_table}.${e.src_col} = ${e.dst_schema}.${e.dst_table}.${e.dst_col}`;
      if (!adj.has(a)) adj.set(a, []);
      if (!adj.has(b)) adj.set(b, []);
      adj.get(a)!.push({ next: b, cond });
      adj.get(b)!.push({ next: a, cond });
    }
    const queue: { at: string; path: string[] }[] = [{ at: start, path: [] }];
    const visited = new Set([start]);
    while (queue.length) {
      const { at, path } = queue.shift()!;
      if (at === target) return path;
      if (path.length >= 4) continue;
      for (const { next, cond } of adj.get(at) ?? []) {
        if (visited.has(next)) continue;
        visited.add(next);
        queue.push({ at: next, path: [...path, cond] });
      }
    }
    return null;
  }
}

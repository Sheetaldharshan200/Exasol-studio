/**
 * Exa `@`-context providers — the continue.dev "context provider" grammar
 * adapted to a database client. Typing `@` in the composer opens a menu of
 * these; picking one (and, where needed, a schema/table argument) resolves to
 * a {label, body} chip. Chip bodies are prepended to the prompt as fenced
 * context blocks, since the opencode engine takes plain text.
 *
 * Everything here is pure — it turns an `ExaSnapshot` (a read-only view of the
 * app's live schema/SQL/results) into text. That keeps it unit-testable without
 * mounting the panel; see context.test.ts.
 */
import type { SqlCatalog } from "@/lib/sql-completion";
import type { StatementResult } from "@/lib/ipc";

/** A read-only snapshot of the workbench, captured when the menu opens. */
export type ExaSnapshot = {
  connectionName?: string;
  schema?: string;
  schemas: string[];
  catalog: SqlCatalog;
  editorSql: string;
  lastResult: StatementResult | null;
  history: { sql: string }[];
};

/** "file" chips come from the composer's + (attach) button, not the @ menu. */
export type ContextProviderId = "query" | "results" | "table" | "schema" | "connection" | "history" | "file";

export type ContextProvider = {
  id: ContextProviderId;
  /** Token shown after `@`, e.g. `@query`. */
  title: string;
  description: string;
  /** When set, picking the provider opens a second list of these arguments. */
  needsArg: "schema" | "table" | null;
};

/** A resolved context attachment, shown as a chip and injected into the prompt. */
export type ContextChip = { id: string; providerId: ContextProviderId; label: string; body: string };

export const CONTEXT_PROVIDERS: ContextProvider[] = [
  { id: "query", title: "query", description: "The SQL in the active editor tab", needsArg: null },
  { id: "results", title: "results", description: "The most recent query result set", needsArg: null },
  { id: "table", title: "table", description: "A table and its columns", needsArg: "table" },
  { id: "schema", title: "schema", description: "A schema and its tables", needsArg: "schema" },
  { id: "connection", title: "connection", description: "The active connection & current schema", needsArg: null },
  { id: "history", title: "history", description: "Your recent SQL statements", needsArg: null },
];

/** Filter the provider list by the text typed after `@` (case-insensitive). */
export function filterProviders(query: string): ContextProvider[] {
  const q = query.trim().toLowerCase();
  if (!q) return CONTEXT_PROVIDERS;
  return CONTEXT_PROVIDERS.filter((p) => p.title.includes(q) || p.description.toLowerCase().includes(q));
}

/** All `schema.table` names in the catalog, sorted, current schema first. */
export function tableArguments(snap: ExaSnapshot): string[] {
  const names: string[] = [];
  for (const [schema, tables] of snap.catalog.schemas) {
    for (const table of tables.keys()) names.push(`${schema}.${table}`);
  }
  names.sort((a, b) => a.localeCompare(b));
  if (snap.schema) {
    const prefix = `${snap.schema.toUpperCase()}.`;
    names.sort((a, b) => Number(b.toUpperCase().startsWith(prefix)) - Number(a.toUpperCase().startsWith(prefix)));
  }
  return names;
}

/** Schema names for the `@schema` argument list. */
export function schemaArguments(snap: ExaSnapshot): string[] {
  const fromCatalog = [...snap.catalog.schemas.keys()];
  const all = new Set([...snap.schemas, ...fromCatalog]);
  return [...all].sort((a, b) => a.localeCompare(b));
}

/** Render the first `maxRows` of a result set as a GFM markdown table. */
function resultToMarkdown(result: StatementResult, maxRows = 20): string {
  if (result.kind !== "resultSet" || result.columns.length === 0) {
    return result.kind === "rowCount" ? `${result.rowCount} row(s) affected.` : "(no result set)";
  }
  const header = `| ${result.columns.map((c) => c.name).join(" | ")} |`;
  const divider = `| ${result.columns.map(() => "---").join(" | ")} |`;
  const rows = result.rows.slice(0, maxRows).map(
    (r) => `| ${r.map((v) => (v === null || v === undefined ? "NULL" : String(v).replace(/\|/g, "\\|"))).join(" | ")} |`,
  );
  const more = result.rows.length > maxRows ? `\n_…and ${result.rows.length - maxRows} more row(s)._` : "";
  return [header, divider, ...rows].join("\n") + more;
}

/**
 * Resolve a chosen provider (+ optional argument) into a chip. Returns null
 * when the required data isn't available (e.g. `@results` with no results),
 * so the UI can show why nothing was attached.
 */
export function resolveContext(id: ContextProviderId, arg: string | null, snap: ExaSnapshot): ContextChip | null {
  switch (id) {
    case "file":
      // File chips are built directly from the attach button (the picker owns
      // reading the content); nothing to resolve from the workbench snapshot.
      return null;
    case "query": {
      const sql = snap.editorSql.trim();
      if (!sql) return null;
      return { id: "query", providerId: id, label: "query", body: "Active editor SQL:\n```sql\n" + sql + "\n```" };
    }
    case "results": {
      if (!snap.lastResult) return null;
      return {
        id: "results",
        providerId: id,
        label: "results",
        body: `Most recent query result (${snap.lastResult.rowCount} row(s)):\n\n${resultToMarkdown(snap.lastResult)}`,
      };
    }
    case "connection": {
      const body = snap.connectionName
        ? `Connected to ${snap.connectionName}${snap.schema ? `, current schema ${snap.schema}` : ""}.`
        : "Not connected to a database.";
      return { id: "connection", providerId: id, label: "connection", body };
    }
    case "history": {
      const recent = snap.history.slice(0, 10).map((h) => h.sql.trim()).filter(Boolean);
      if (recent.length === 0) return null;
      return {
        id: "history",
        providerId: id,
        label: "history",
        body: "Recent SQL statements:\n" + recent.map((s, i) => `${i + 1}. \`${s.replace(/\s+/g, " ").slice(0, 200)}\``).join("\n"),
      };
    }
    case "schema": {
      const name = (arg ?? snap.schema ?? "").trim();
      if (!name) return null;
      const tables = tablesInSchema(snap.catalog, name);
      const list = tables.length ? tables.join(", ") : "(no tables cached yet)";
      // ID is case-folded so @schema SALES and @schema sales dedupe (lookup is
      // already case-insensitive); the label keeps what the user picked.
      return { id: `schema:${name.toUpperCase()}`, providerId: id, label: `schema ${name}`, body: `Schema ${name} tables: ${list}` };
    }
    case "table": {
      const full = (arg ?? "").trim();
      if (!full) return null;
      const [schema, table] = splitQualified(full);
      const cols = columnsOf(snap.catalog, schema, table);
      const colList = cols.length ? cols.map((c) => `${c.name} ${c.type}`).join(", ") : "(columns not cached yet)";
      return { id: `table:${full.toUpperCase()}`, providerId: id, label: `table ${full}`, body: `Table ${full} columns: ${colList}` };
    }
  }
}

function splitQualified(full: string): [string, string] {
  const dot = full.indexOf(".");
  return dot === -1 ? ["", full] : [full.slice(0, dot), full.slice(dot + 1)];
}

function tablesInSchema(catalog: SqlCatalog, schema: string): string[] {
  const key = [...catalog.schemas.keys()].find((s) => s.toUpperCase() === schema.toUpperCase());
  const tables = key ? catalog.schemas.get(key) : undefined;
  return tables ? [...tables.keys()] : [];
}

function columnsOf(catalog: SqlCatalog, schema: string, table: string): { name: string; type: string }[] {
  const schemaKey = [...catalog.schemas.keys()].find((s) => s.toUpperCase() === schema.toUpperCase());
  const tables = schemaKey ? catalog.schemas.get(schemaKey) : undefined;
  if (!tables) return [];
  const tableKey = [...tables.keys()].find((t) => t.toUpperCase() === table.toUpperCase());
  return tableKey ? tables.get(tableKey) ?? [] : [];
}

/**
 * Assemble the final prompt: the user's message, with any context chips
 * prepended as a single fenced-off block the model reads as ground truth.
 */
export function buildPrompt(userText: string, chips: ContextChip[]): string {
  if (chips.length === 0) return userText;
  // Neutralize any literal </context> inside SQL/results so a chip body can't
  // prematurely close the wrapper and corrupt the prompt structure.
  const context = chips.map((c) => c.body).join("\n\n").replace(/<\/(context)>/gi, "&lt;/$1&gt;");
  return `<context>\n${context}\n</context>\n\n${userText}`;
}

// ── Machine-context sentinel ────────────────────────────────────────────────
// Directives, chips and other machine-added context ride INSIDE the message
// text (the engine runtime has no hidden-part channel), wrapped in this tag
// so the UI can show only what the user actually typed. The model reads the
// tag naturally; strip helpers keep it out of bubbles and exports.

const CTX_OPEN = "<exa_context>";
const CTX_CLOSE = "</exa_context>";

/** Wrap machine context for embedding at the top of an outgoing message. */
export function wrapMachineContext(context: string): string {
  const body = context.trim();
  return body ? `${CTX_OPEN}\n${body}\n${CTX_CLOSE}` : "";
}

/** The user-visible remainder of a message (machine context removed). */
export function stripMachineContext(text: string): string {
  let out = text;
  for (;;) {
    const start = out.indexOf(CTX_OPEN);
    if (start === -1) break;
    const end = out.indexOf(CTX_CLOSE, start);
    if (end === -1) {
      // Unterminated block — drop from the marker on, never render half.
      out = out.slice(0, start);
      break;
    }
    out = out.slice(0, start) + out.slice(end + CTX_CLOSE.length);
  }
  return out.replace(/^\s+/, "").replace(/\s+$/, "");
}

/**
 * Tool-call repair for small local models. Weak models get the INTENT right
 * but the MECHANICS wrong: hallucinated tool names ("execute_sql" instead of
 * run_sql), aliased argument keys ({"query": ...} instead of {"sql": ...}),
 * double-encoded JSON, or stray keys. Instead of failing the turn, we repair
 * deterministically — no second model call, so it's free and predictable.
 * Returns null when a call can't be confidently repaired; the SDK then
 * surfaces the original error to the model as a tool error to recover from.
 */


/** Normalize a name for matching: lowercase, alphanumerics only. */
function norm(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Hallucinated-name → real-tool aliases, from patterns local models actually
 * produce (MCP-style names, generic "query"/"sql" verbs, singular/plural).
 * Keys are normalized (see norm()).
 */
const NAME_ALIASES: Record<string, string> = {
  // run_sql
  executesql: "run_sql", executequery: "run_sql", runquery: "run_sql",
  sql: "run_sql", query: "run_sql", sqlquery: "run_sql", exasolquery: "run_sql",
  executeexasolquery: "run_sql", runsqlquery: "run_sql", dbquery: "run_sql",
  execute: "run_sql", querydatabase: "run_sql",
  // list_schemas
  listschema: "list_schemas", showschemas: "list_schemas", getschemas: "list_schemas",
  schemas: "list_schemas", listexasolschemas: "list_schemas", findexasolschemas: "list_schemas",
  // list_tables
  listtable: "list_tables", showtables: "list_tables", gettables: "list_tables",
  tables: "list_tables", listexasoltables: "list_tables", findexasoltablesandviews: "list_tables",
  listtablesandviews: "list_tables",
  // describe_table
  describe: "describe_table", tableinfo: "describe_table", gettable: "describe_table",
  gettableschema: "describe_table", describeexasoltable: "describe_table",
  describetableorview: "describe_table", getcolumns: "describe_table",
  // get_table_sample
  sample: "get_table_sample", sampletable: "get_table_sample", gettablerows: "get_table_sample",
  previewtable: "get_table_sample", tablesample: "get_table_sample",
  // kb_search
  search: "kb_search", kbsearch: "kb_search", searchschema: "kb_search",
  knowledgesearch: "kb_search", searchtables: "kb_search", findtables: "kb_search",
  // import_csv
  importfile: "import_csv", loadcsv: "import_csv", loaddata: "import_csv",
  importdata: "import_csv", csvimport: "import_csv", loadfile: "import_csv",
  importparquet: "import_csv", loadparquet: "import_csv", uploadcsv: "import_csv",
  pumpdata: "import_csv", exapump: "import_csv",
  // documents
  searchdocs: "search_documents", searchfiles: "search_documents", searchdocument: "search_documents",
  readdoc: "read_document", readfile: "read_document", readattachment: "read_document",
  // misc
  connections: "list_connections", listconnection: "list_connections", getconnections: "list_connections",
  profilesql: "profile_query", profilequery: "profile_query", explain: "profile_query", explainquery: "profile_query",
  savedashboard: "dashboard_save", createdashboard: "dashboard_save",
  listdashboards: "dashboard_list", getdashboard: "dashboard_get",
  rememberinsight: "remember", savememory: "remember", saveinsight: "remember",
  researcher: "spawn_researcher", spawnagent: "spawn_researcher", research: "spawn_researcher",
  joinpath: "kb_join_path", kbjoin: "kb_join_path", subsystem: "kb_subsystem",
  refreshkb: "kb_refresh", kbrefresh: "kb_refresh",
  renderartifact: "render_artifact", createartifact: "render_artifact", artifact: "render_artifact",
  loadskill: "load_skill", useskill: "load_skill",
};

/** Resolve a (possibly hallucinated) tool name to one that exists. */
export function resolveToolName(requested: string, available: string[]): string | null {
  const n = norm(requested);
  // Exact after normalization ("Run_SQL", "run-sql").
  for (const name of available) if (norm(name) === n) return name;
  // Known alias — but only if the target is actually exposed this turn.
  const alias = NAME_ALIASES[n];
  if (alias && available.includes(alias)) return alias;
  // Unique unambiguous prefix/substring ("list_tabl" → list_tables).
  if (n.length >= 4) {
    const matches = available.filter((name) => {
      const m = norm(name);
      return m.startsWith(n) || n.startsWith(m) || m.includes(n);
    });
    if (matches.length === 1) return matches[0];
  }
  return null;
}

/**
 * Argument-key aliases per canonical parameter. Applied only when the target
 * key is missing and the alias key is present — never overwrites good input.
 */
const ARG_ALIASES: Record<string, string[]> = {
  sql: ["query", "statement", "sql_query", "sql_statement", "sql_text", "command", "q"],
  schema: ["schema_name", "schemaname", "database", "db", "target_schema"],
  table: ["table_name", "tablename", "target_table", "view", "view_name"],
  query: ["question", "search", "text", "keywords", "term", "search_query", "input"],
  docId: ["doc_id", "document_id", "file_id", "fileid", "document", "file", "id"],
  name: ["skill", "skill_name", "connection", "connection_name"],
  task: ["prompt", "question", "instruction", "goal"],
  note: ["fact", "memory", "insight", "content", "text"],
  scope: ["type", "kind"],
  limit: ["max", "count", "n", "rows"],
  purpose: ["reason", "why", "description"],
  title: ["name_", "heading"],
};

/** Best-effort parse of a model-produced "JSON" argument payload. */
export function parseLooseArgs(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return {};
  if (typeof raw === "object") return raw as Record<string, unknown>;
  if (typeof raw !== "string") return null;
  let s = raw.trim();
  if (!s || s === "null" || s === "undefined") return {};
  // Strip markdown fences some models wrap arguments in.
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const parsed: unknown = JSON.parse(s);
      if (typeof parsed === "string") {
        // Double-encoded JSON — unwrap and retry.
        s = parsed;
        continue;
      }
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
      return null;
    } catch {
      // Trailing garbage after the object (weak models append prose).
      const start = s.indexOf("{");
      const end = s.lastIndexOf("}");
      if (start !== -1 && end > start) {
        s = s.slice(start, end + 1);
        try {
          const parsed: unknown = JSON.parse(s);
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
        } catch {
          // fall through
        }
      }
      return null;
    }
  }
  return null;
}

type JsonSchemaish = {
  properties?: Record<string, { type?: string | string[] }>;
  required?: string[];
};

/**
 * Repair parsed args against the tool's JSON schema: rename aliased keys,
 * coerce primitive types, drop unknown keys, and reject if a required key is
 * still missing. Deterministic — no guessing at values.
 */
export function repairArgs(args: Record<string, unknown>, schema: JsonSchemaish): Record<string, unknown> | null {
  const props = schema.properties ?? {};
  const required = schema.required ?? [];
  const out: Record<string, unknown> = {};

  // Case-insensitive index of what the model actually sent.
  const sentKeys = new Map<string, string>();
  for (const k of Object.keys(args)) sentKeys.set(norm(k), k);

  for (const target of Object.keys(props)) {
    // 1) exact, then case/format-insensitive ("Schema", "schema-name" ≠ but "SQL" = "sql")
    let sourceKey: string | undefined = Object.prototype.hasOwnProperty.call(args, target) ? target : sentKeys.get(norm(target));
    // 2) known alias, only if the canonical key wasn't provided
    if (sourceKey === undefined) {
      for (const alias of ARG_ALIASES[target] ?? []) {
        const hit = sentKeys.get(norm(alias));
        if (hit !== undefined) {
          sourceKey = hit;
          break;
        }
      }
    }
    if (sourceKey === undefined) continue;
    let value = args[sourceKey];

    // Primitive coercion to the declared type.
    const declared = props[target]?.type;
    const t = Array.isArray(declared) ? declared[0] : declared;
    if (t === "number" || t === "integer") {
      if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) value = Number(value);
    } else if (t === "boolean") {
      if (value === "true") value = true;
      else if (value === "false") value = false;
    } else if (t === "string") {
      if (typeof value === "number" || typeof value === "boolean") value = String(value);
    }
    out[target] = value;
  }

  for (const req of required) {
    if (!(req in out)) return null; // can't invent a required value
  }
  return out;
}

/**
 * Extract tool calls a model wrote as TEXT instead of invoking (chat-template
 * misfires on small local models): bare {"name": "...", "arguments": {...}}
 * objects, <tool_call>-wrapped JSON, and fenced ```json blocks. Scans for
 * balanced top-level {...} blocks and keeps the ones shaped like a call.
 */
export function extractTextToolCalls(text: string): { name: string; args: Record<string, unknown> }[] {
  const out: { name: string; args: Record<string, unknown> }[] = [];
  if (!text || text.indexOf("{") === -1) return out;
  // Unwrap markers so the brace scanner sees the JSON inside.
  const cleaned = text.replace(/<\/?tool_call>|<\/?function_call>|<\|tool_call\|>|\[\/?TOOL_(CALL|REQUEST)\]|```(?:json)?/gi, " ");
  let depth = 0;
  let start = -1;
  let inStr = false;
  let esc = false;
  for (let i = 0; i < cleaned.length; i++) {
    const c = cleaned[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (c === "}") {
      depth--;
      if (depth === 0 && start !== -1) {
        const block = cleaned.slice(start, i + 1);
        start = -1;
        let obj: unknown;
        try {
          obj = JSON.parse(block);
        } catch {
          continue;
        }
        if (!obj || typeof obj !== "object" || Array.isArray(obj)) continue;
        const o = obj as Record<string, unknown>;
        const name = o.name ?? o.tool ?? o.function ?? o.tool_name;
        if (typeof name !== "string" || !name) continue;
        const rawArgs = o.arguments ?? o.parameters ?? o.args ?? o.input ?? o.params ?? {};
        const args = parseLooseArgs(rawArgs);
        if (args === null) continue;
        out.push({ name, args });
        if (out.length >= 4) break; // sanity cap per message
      } else if (depth < 0) {
        depth = 0;
      }
    }
  }
  return out;
}

/**
 * Introspect a zod object schema into the minimal shape repairArgs needs.
 * Best-effort across zod v3 internals; returns null when unrecognizable
 * (callers then pass args through unchanged rather than dropping them).
 */
export function zodSchemaish(schema: unknown): { properties: Record<string, { type?: string }>; required: string[] } | null {
  try {
    // Plain JSON Schema (MCP-bridged tools): read properties/required directly.
    const js = schema as { properties?: Record<string, { type?: string }>; required?: string[]; shape?: Record<string, unknown> };
    if (js?.properties && typeof js.properties === "object" && !js.shape) {
      return { properties: js.properties, required: Array.isArray(js.required) ? js.required : [] };
    }
    const shape = (schema as { shape?: Record<string, unknown> })?.shape;
    if (!shape || typeof shape !== "object") return null;
    const properties: Record<string, { type?: string }> = {};
    const required: string[] = [];
    for (const [key, field] of Object.entries(shape)) {
      let f = field as { _def?: { typeName?: string; innerType?: unknown }; isOptional?: () => boolean };
      const optional = typeof f.isOptional === "function" ? f.isOptional() : false;
      // Unwrap Optional/Default/Nullable to find the base type.
      for (let hops = 0; hops < 5; hops++) {
        const inner = f?._def?.innerType as typeof f | undefined;
        if (!inner) break;
        f = inner;
      }
      const tn = f?._def?.typeName ?? "";
      const type =
        tn === "ZodString" ? "string" : tn === "ZodNumber" ? "number" : tn === "ZodBoolean" ? "boolean" : tn === "ZodEnum" ? "string" : undefined;
      properties[key] = type ? { type } : {};
      if (!optional) required.push(key);
    }
    return { properties, required };
  } catch {
    return null;
  }
}

export type RepairResult = { toolName: string; input: string; note: string } | null;

/**
 * Full repair pipeline for one failed tool call. `availableTools` is the
 * tool set exposed THIS turn; `getSchema` returns the JSON schema for a tool.
 */
export function repairCall(opts: {
  requestedName: string;
  rawInput: unknown;
  tools: Record<string, unknown>;
  getSchema: (toolName: string) => JsonSchemaish;
}): RepairResult {
  const available = Object.keys(opts.tools);
  const resolved = resolveToolName(opts.requestedName, available);
  if (!resolved) return null;
  const parsed = parseLooseArgs(opts.rawInput);
  if (parsed === null) return null;
  // No schema means we cannot repair keys or coerce types — but we must NOT
  // then hand the tool an empty argument object. repairArgs drops every key not
  // declared in `properties`, so an absent/failed schema lookup used to turn a
  // perfectly good {sql: "…"} into {}, and the call failed with a misleading
  // "missing required argument". Pass the parsed args through untouched instead.
  let schema: JsonSchemaish | null;
  try {
    schema = opts.getSchema(resolved) ?? null;
  } catch {
    schema = null;
  }
  const hasProps = !!schema && !!schema.properties && Object.keys(schema.properties).length > 0;
  const fixed = hasProps ? repairArgs(parsed, schema!) : parsed;
  if (fixed === null) return null;
  const renamed = resolved !== opts.requestedName;
  return {
    toolName: resolved,
    input: JSON.stringify(fixed),
    note: renamed ? `${opts.requestedName} → ${resolved}` : "args repaired",
  };
}

// ── Text rescue ────────────────────────────────────────────────────────────
// Small local models sometimes narrate their tool use as PROSE — fake SQL
// procedure calls (`CALL IMPORT_CSV('id','SCHEMA','table','replace')`,
// `CALL DASHBOARD_SAVE('{...}')`) or a bare JSON dashboard spec — instead of
// emitting structured tool calls. Rather than letting a whole fake plan
// become "the answer", extract the recognizable intents into real calls.

/** Balanced-brace JSON scan: parse the object starting at text[start]. */
function parseJsonAt(text: string, start: number): unknown | null {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (esc) { esc = false; continue; }
    if (ch === "\\") { esc = true; continue; }
    if (ch === '"') inStr = !inStr;
    if (inStr) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(text.slice(start, i + 1)); } catch { return null; }
      }
    }
  }
  return null;
}

type DashboardSpec = { title?: unknown; panels?: unknown } & Record<string, unknown>;

/** Unwrap {dashboard:{...}} and validate the minimum dashboard shape. */
function asDashboardSpec(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object") return null;
  const outer = v as DashboardSpec;
  const spec = (outer.dashboard && typeof outer.dashboard === "object" ? outer.dashboard : outer) as DashboardSpec;
  if (typeof spec.title === "string" && Array.isArray(spec.panels) && spec.panels.length) return spec as Record<string, unknown>;
  return null;
}

/** Find a JSON dashboard spec anywhere in prose (fenced or inline). */
function findDashboardJson(text: string): Record<string, unknown> | null {
  let from = 0;
  for (let n = 0; n < 40; n++) {
    const i = text.indexOf('"panels"', from);
    if (i < 0) return null;
    // Walk back to the outermost plausible opening brace for this spec.
    for (let j = i; j >= 0 && i - j < 4000; j--) {
      if (text[j] !== "{") continue;
      const parsed = parseJsonAt(text, j);
      const spec = asDashboardSpec(parsed);
      if (spec) return spec;
    }
    from = i + 8;
  }
  return null;
}

/**
 * Extract real tool calls from a prose-only model turn. Returns [] when
 * nothing is confidently recognizable — never guesses.
 */
export function rescueTextCalls(text: string): { name: string; args: Record<string, unknown> }[] {
  const out: { name: string; args: Record<string, unknown> }[] = [];
  const seen = new Set<string>();
  const push = (name: string, args: Record<string, unknown>) => {
    const key = name + JSON.stringify(args);
    if (!seen.has(key) && out.length < 6) {
      seen.add(key);
      out.push({ name, args });
    }
  };

  // Narrated procedure calls: CALL SOME_TOOL('a', 'b', …)
  const callRe = /\bCALL\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([\s\S]*?)\)\s*;?/g;
  let m: RegExpExecArray | null;
  while ((m = callRe.exec(text))) {
    const which = norm(m[1]);
    const strings = [...m[2].matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((x) => x[1]);
    if (which.includes("import") || which.includes("loadcsv") || which.includes("pump")) {
      const [docId, schema, table, mode] = strings;
      if (docId && schema) {
        push("import_csv", {
          docId,
          schema,
          ...(table ? { table } : {}),
          ...(mode && /replace/i.test(mode) ? { replace: true } : {}),
        });
      }
    } else if (which.includes("dashboardsave") || which.includes("savedashboard") || which.includes("createdashboard")) {
      const spec = strings[0] ? asDashboardSpec((() => { try { return JSON.parse(strings[0]); } catch { return null; } })()) : null;
      if (spec) push("dashboard_save", { dashboard: spec });
    } else if (which.includes("dashboardlist") || which.includes("listdashboard")) {
      push("dashboard_list", {});
    }
  }

  // A bare JSON dashboard spec in the prose (the model "showed" the dashboard
  // instead of saving it).
  if (!out.some((c) => c.name === "dashboard_save")) {
    const spec = findDashboardJson(text);
    if (spec) push("dashboard_save", { dashboard: spec });
  }
  return out;
}

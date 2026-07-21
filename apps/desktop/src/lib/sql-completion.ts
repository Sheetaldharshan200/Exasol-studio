import type { Monaco } from "@monaco-editor/react";
import type { languages } from "monaco-editor";

/**
 * Schema-aware Exasol autocompletion for the Monaco SQL editor.
 * Fed by the live catalog (SYS.EXA_ALL_COLUMNS, cached per connection);
 * context rules pick tables after FROM/JOIN, columns after `alias.` or in
 * SELECT/WHERE, schemas first. Native Monaco — no extra engine, instant.
 */

export type SqlCatalog = {
  /** schema → table → columns (name + type) */
  schemas: Map<string, Map<string, { name: string; type: string }[]>>;
  /** User UDFs / Lua / adapter scripts from SYS.EXA_ALL_SCRIPTS. */
  scripts: { schema: string; name: string; type: string }[];
};

export const emptyCatalog = (): SqlCatalog => ({ schemas: new Map(), scripts: [] });

const KEYWORDS =
  `SELECT FROM WHERE GROUP BY ORDER HAVING LIMIT DISTINCT JOIN INNER LEFT RIGHT FULL OUTER CROSS ON AS AND OR NOT IN EXISTS BETWEEN LIKE IS NULL CASE WHEN THEN ELSE END UNION ALL WITH INSERT INTO VALUES UPDATE SET DELETE MERGE CREATE TABLE VIEW SCHEMA OR REPLACE IF EXISTS DROP ALTER ADD COLUMN RENAME TO TRUNCATE GRANT REVOKE COMMIT ROLLBACK EXPLAIN VIRTUAL USING PARTITION PRELOAD DESC ASC NULLS FIRST LAST IMPORT EXPORT CONNECTION IDENTIFIED BY SCRIPT SCALAR RETURNS EMITS LUA PYTHON3 JAVA R ADAPTER CONSUMER GROUP PRIORITY SESSION SYSTEM ROLE USER PASSWORD FORCE CASCADE RESTRICT DEFAULT COMMENT CONSTRAINT PRIMARY KEY FOREIGN REFERENCES ENABLE DISABLE DISTRIBUTE REORGANIZE FLUSH STATISTICS AUDIT KILL RECOMPRESS PROFILE OVER ROWS RANGE PRECEDING FOLLOWING UNBOUNDED CURRENT ROW QUALIFY REGEXP_LIKE MINUS INTERSECT EXCEPT LOCAL FILE SECURE CSV FBV`.split(" ");

// Exasol-specific statement templates — the fastest way to write the
// statements the generic grammar can't predict.
const SNIPPETS: { label: string; text: string }[] = [
  { label: "IMPORT FROM CSV AT", text: "IMPORT INTO ${1:SCHEMA.TABLE} FROM CSV AT '${2:https://…}' FILE '${3:data.csv}'" },
  { label: "EXPORT INTO CSV AT", text: "EXPORT ${1:SCHEMA.TABLE} INTO CSV AT '${2:https://…}' FILE '${3:out.csv}'" },
  { label: "CREATE PYTHON3 UDF", text: "CREATE OR REPLACE PYTHON3 SCALAR SCRIPT ${1:SCHEMA.MY_UDF}(${2:x DOUBLE}) RETURNS DOUBLE AS\ndef run(ctx):\n    return ctx.${2:x}\n/" },
  { label: "CREATE LUA SCRIPT", text: "CREATE OR REPLACE LUA SCRIPT ${1:SCHEMA.MY_SCRIPT}() RETURNS TABLE AS\n${2:-- body}\n/" },
  { label: "CREATE VIRTUAL SCHEMA", text: "CREATE VIRTUAL SCHEMA ${1:VS_NAME} USING ${2:ADAPTER.SCRIPT} WITH ${3:CONNECTION_NAME = '…'}" },
  { label: "CREATE CONNECTION", text: "CREATE OR REPLACE CONNECTION ${1:CONN_NAME} TO '${2:https://…}' USER '${3:user}' IDENTIFIED BY '${4:secret}'" },
  { label: "MERGE INTO", text: "MERGE INTO ${1:TARGET} t USING ${2:SOURCE} s ON t.${3:ID} = s.${3:ID}\nWHEN MATCHED THEN UPDATE SET ${4:col} = s.${4:col}\nWHEN NOT MATCHED THEN INSERT VALUES (s.*)" },
];

const FUNCTIONS =
  `COUNT SUM AVG MIN MAX MEDIAN STDDEV VARIANCE CAST COALESCE NVL NVL2 DECODE NULLIF GREATEST LEAST ABS ROUND TRUNC FLOOR CEIL MOD POWER SQRT LN LOG EXP SIGN RANDOM UPPER LOWER INITCAP TRIM LTRIM RTRIM LPAD RPAD LENGTH SUBSTR INSTR REPLACE TRANSLATE CONCAT REGEXP_SUBSTR REGEXP_REPLACE REGEXP_INSTR TO_CHAR TO_DATE TO_TIMESTAMP TO_NUMBER CURRENT_DATE CURRENT_TIMESTAMP CURRENT_USER CURRENT_SCHEMA ADD_DAYS ADD_MONTHS ADD_YEARS ADD_HOURS ADD_MINUTES ADD_SECONDS DAYS_BETWEEN MONTHS_BETWEEN YEARS_BETWEEN EXTRACT DATE_TRUNC POSIX_TIME HASH_MD5 HASH_SHA256 ROW_NUMBER RANK DENSE_RANK LAG LEAD FIRST_VALUE LAST_VALUE LISTAGG GROUP_CONCAT ANY_VALUE ZEROIFNULL NULLIFZERO FROM_POSIX_TIME CONVERT_TZ SECONDS_BETWEEN MINUTES_BETWEEN HOURS_BETWEEN WEEK YEAR MONTH DAY HOUR MINUTE SECOND DAYOFWEEK DAYOFYEAR CORR COVAR_POP COVAR_SAMP PERCENTILE_CONT PERCENTILE_DISC RATIO_TO_REPORT NTILE PERCENT_RANK CUME_DIST BIT_AND BIT_OR BIT_XOR BIT_NOT BIT_SET BIT_CHECK JSON_VALUE JSON_EXTRACT IS_NUMBER IS_DATE IS_TIMESTAMP IS_BOOLEAN CHAR_LENGTH UNICODE UNICODECHR ASCII CHR REVERSE SPACE REPEAT EDIT_DISTANCE SOUNDEX COLOGNE_PHONETIC IPROC NPROC VALUE2PROC SYS_GUID SESSION_PARAMETER TYPEOF MIN_SCALE APPROXIMATE_COUNT_DISTINCT ST_DISTANCE ST_INTERSECTS ST_CONTAINS`.split(" ");

let registered = false;

// Grammar-driven core (world-standard approach, same family as DataGrip/Hue):
// dt-sql-parser's ANTLR grammar tells us WHAT belongs at the caret (table,
// column, schema, function, and the exact keywords that are grammatically
// valid next) — our live catalog supplies the actual names. Lazy-loaded so the
// heavy parse tables never block editor startup; on Exasol-specific syntax the
// parser fails soft and the heuristic layer below still answers.
type GrammarHints = { keywords: string[]; table: boolean; column: boolean; schema: boolean; func: boolean };
let parserPromise: Promise<{ getSuggestionAtCaretPosition: (sql: string, pos: { lineNumber: number; column: number }) => unknown } | null> | null = null;
const getParser = () =>
  (parserPromise ??= import("dt-sql-parser")
    .then((m) => new m.PostgreSQL() as never)
    .catch(() => null));

// Layer 0 — the TRUE Exasol grammar engine (workspace package): a real
// Exasol ANTLR grammar (QUALIFY, CONNECT BY, IMPORT/EXPORT, UDF script
// islands) answering kinds, grammar-valid keywords, and alias-resolved
// tableRefs scoped to the caret statement. Lazy chunk; falls through to the
// PG-dialect engine, then heuristics.
type ExasolEngine = {
  getSuggestions: (sql: string, caret: { line: number; column: number }) => {
    kinds: ("schema" | "table" | "column" | "function")[];
    keywords: string[];
    tableRefs: { schema?: string; table: string; alias?: string }[];
    ctes: string[];
  };
};
let exasolEnginePromise: Promise<ExasolEngine | null> | null = null;
const getExasolEngine = () =>
  (exasolEnginePromise ??= import("@exasol-studio/exasol-sql-parser")
    .then((m) => m as ExasolEngine)
    .catch(() => null));

async function grammarHints(sql: string, pos: { lineNumber: number; column: number }): Promise<GrammarHints | null> {
  const parser = await getParser();
  if (!parser) return null;
  try {
    const res = parser.getSuggestionAtCaretPosition(sql, pos) as
      | { keywords?: string[]; syntax?: { syntaxContextType?: unknown }[] }
      | null;
    if (!res) return null;
    const hints: GrammarHints = { keywords: res.keywords ?? [], table: false, column: false, schema: false, func: false };
    for (const s of res.syntax ?? []) {
      const t = String(s.syntaxContextType ?? "").toLowerCase();
      if (t.includes("table") || t.includes("view")) hints.table = true;
      if (t.includes("column")) hints.column = true;
      if (t.includes("database") || t.includes("schema") || t.includes("catalog")) hints.schema = true;
      if (t.includes("function")) hints.func = true;
    }
    return hints;
  } catch {
    return null;
  }
}

export function registerExasolCompletion(monaco: Monaco, getCatalog: () => SqlCatalog): void {
  if (registered) return;
  registered = true;
  void getParser(); // warm the grammar in the background

  monaco.languages.registerCompletionItemProvider("sql", {
    triggerCharacters: [".", " "],
    async provideCompletionItems(model: import("monaco-editor").editor.ITextModel, position: import("monaco-editor").Position) {
      const cat = getCatalog();
      const before = model.getValueInRange({
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      });
      // Work on the CURRENT statement only.
      const stmt = before.split(";").pop() ?? before;
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endLineNumber: position.lineNumber,
        endColumn: word.endColumn,
      };
      const S: languages.CompletionItem[] = [];
      const push = (
        label: string,
        kind: languages.CompletionItemKind,
        insertText: string,
        detail?: string,
        sortPrefix = "5",
      ) =>
        S.push({ label, kind, insertText, range, detail, sortText: sortPrefix + label } as languages.CompletionItem);

      const K = monaco.languages.CompletionItemKind;
      const pushSnippets = () => {
        for (const sn of SNIPPETS) {
          S.push({
            label: sn.label,
            kind: K.Snippet,
            insertText: sn.text,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range,
            detail: "Exasol template",
            sortText: "6" + sn.label,
          } as languages.CompletionItem);
        }
      };
      const pushScripts = (prefix: string) => {
        for (const s of cat.scripts) {
          push(`${s.schema}.${s.name}`, K.Function, `${s.schema}.${s.name}(`, `${s.type} script/UDF`, prefix);
        }
      };

      // Tables referenced in this statement: FROM/JOIN/INTO/UPDATE targets
      // with optional aliases → alias/table → columns.
      const refs = new Map<string, { schema: string; table: string }>();
      const refRe = /\b(?:FROM|JOIN|INTO|UPDATE)\s+(?:"?([A-Za-z_][\w$]*)"?\.)?"?([A-Za-z_][\w$]*)"?(?:\s+(?:AS\s+)?"?([A-Za-z_][\w$]*)"?)?/gi;
      let m: RegExpExecArray | null;
      while ((m = refRe.exec(stmt))) {
        const schema = (m[1] ?? "").toUpperCase();
        const table = (m[2] ?? "").toUpperCase();
        if (!table || KEYWORDS.includes(table)) continue;
        const key = { schema, table };
        refs.set(table, key);
        if (m[3] && !/^(WHERE|ON|SET|LEFT|RIGHT|INNER|OUTER|CROSS|JOIN|GROUP|ORDER)$/i.test(m[3])) {
          refs.set(m[3].toUpperCase(), key);
        }
      }
      const columnsOf = (schema: string, table: string) => {
        if (schema) return cat.schemas.get(schema)?.get(table) ?? [];
        for (const tables of cat.schemas.values()) {
          const cols = tables.get(table);
          if (cols) return cols;
        }
        return [];
      };

      // `<ident>.` — schema → its tables; alias/table → its columns.
      const dot = /"?([A-Za-z_][\w$]*)"?\.$/.exec(before.slice(0, before.length - (word.word?.length ?? 0)));
      if (dot) {
        const ident = dot[1].toUpperCase();
        const tables = cat.schemas.get(ident);
        if (tables) {
          for (const [t, cols] of tables) push(t, K.Class, t, `${cols.length} columns`, "1");
          return { suggestions: S };
        }
        const ref = refs.get(ident);
        const cols = ref ? columnsOf(ref.schema, ref.table) : columnsOf("", ident);
        for (const c of cols) push(c.name, K.Field, c.name, c.type, "1");
        return { suggestions: S };
      }

      // After FROM/JOIN/INTO/UPDATE → schemas and schema-qualified tables.
      if (/\b(FROM|JOIN|INTO|UPDATE)\s+"?[\w$]*$/i.test(stmt)) {
        for (const [schema, tables] of cat.schemas) {
          push(schema, K.Module, schema, `${tables.size} tables`, "1");
          for (const t of tables.keys()) push(`${schema}.${t}`, K.Class, `${schema}.${t}`, undefined, "2");
        }
        return { suggestions: S };
      }

      // Layer 0: true Exasol grammar engine.
      const eng = await getExasolEngine();
      if (eng) {
        try {
          const s = eng.getSuggestions(model.getValue(), { line: position.lineNumber, column: position.column - 1 });
          if (s.kinds.length || s.keywords.length) {
            if (s.kinds.includes("table") || s.kinds.includes("schema")) {
              for (const cte of s.ctes) push(cte, K.Class, cte, "CTE", "1");
              for (const [schema, tables] of cat.schemas) {
                push(schema, K.Module, schema, `${tables.size} tables`, "1");
                if (s.kinds.includes("table")) for (const t of tables.keys()) push(`${schema}.${t}`, K.Class, `${schema}.${t}`, undefined, "2");
              }
            }
            if (s.kinds.includes("column")) {
              const seenCols = new Set<string>();
              for (const ref of s.tableRefs) {
                for (const c of columnsOf((ref.schema ?? "").toUpperCase(), ref.table.toUpperCase())) {
                  if (seenCols.has(c.name)) continue;
                  seenCols.add(c.name);
                  push(c.name, K.Field, c.name, `${ref.alias ?? ref.table} · ${c.type}`, "0");
                }
              }
            }
            if (s.kinds.includes("function")) {
              for (const f of FUNCTIONS) push(f, K.Function, `${f}(`, "function", "4");
              pushScripts("2");
            }
            for (const k of s.keywords) push(k, K.Keyword, k, undefined, "3");
            if (S.length) return { suggestions: S };
          }
        } catch {
          /* engine choked on this input — fall through to the next layer */
        }
      }

      // Grammar-driven: ask the parser what belongs at the caret.
      const hints = await grammarHints(model.getValue(), { lineNumber: position.lineNumber, column: position.column });
      if (hints && (hints.keywords.length || hints.table || hints.column || hints.schema || hints.func)) {
        if (hints.table || hints.schema) {
          for (const [schema, tables] of cat.schemas) {
            push(schema, K.Module, schema, `${tables.size} tables`, "1");
            if (hints.table) for (const t of tables.keys()) push(`${schema}.${t}`, K.Class, `${schema}.${t}`, undefined, "2");
          }
        }
        if (hints.column) {
          const seen = new Set<string>();
          for (const { schema, table } of refs.values()) {
            for (const c of columnsOf(schema, table)) {
              if (seen.has(c.name)) continue;
              seen.add(c.name);
              push(c.name, K.Field, c.name, `${table} · ${c.type}`, "0");
            }
          }
        }
        if (hints.func) {
          for (const f of FUNCTIONS) push(f, K.Function, `${f}(`, "function", "4");
          pushScripts("2");
        }
        // Only the keywords the grammar says are VALID here.
        for (const k of hints.keywords) push(k, K.Keyword, k, undefined, "3");
        if (S.length) return { suggestions: S };
      }

      // Heuristic fallback (parser unavailable or Exasol-specific syntax):
      // columns of referenced tables first, then keywords/functions/schemas.
      const seen = new Set<string>();
      for (const { schema, table } of refs.values()) {
        for (const c of columnsOf(schema, table)) {
          if (seen.has(c.name)) continue;
          seen.add(c.name);
          push(c.name, K.Field, c.name, `${table} · ${c.type}`, "1");
        }
      }
      for (const k of KEYWORDS) push(k, K.Keyword, k, undefined, "3");
      for (const f of FUNCTIONS) push(f, K.Function, `${f}(`, "function", "4");
      pushScripts("4");
      for (const schema of cat.schemas.keys()) push(schema, K.Module, schema, "schema", "5");
      pushSnippets();
      return { suggestions: S };
    },
  });
}

/** Parse SYS.EXA_ALL_COLUMNS rows (schema, table, column, type) into a catalog. */
export function buildCatalog(rows: unknown[][]): SqlCatalog {
  const cat = emptyCatalog();
  for (const r of rows) {
    const [schema, table, column, type] = r.map((v) => String(v ?? ""));
    if (!schema || !table || !column) continue;
    let tables = cat.schemas.get(schema);
    if (!tables) cat.schemas.set(schema, (tables = new Map()));
    let cols = tables.get(table);
    if (!cols) tables.set(table, (cols = []));
    cols.push({ name: column, type });
  }
  return cat;
}

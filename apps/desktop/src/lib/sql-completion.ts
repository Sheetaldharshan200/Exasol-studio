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
};

export const emptyCatalog = (): SqlCatalog => ({ schemas: new Map() });

const KEYWORDS =
  `SELECT FROM WHERE GROUP BY ORDER HAVING LIMIT DISTINCT JOIN INNER LEFT RIGHT FULL OUTER CROSS ON AS AND OR NOT IN EXISTS BETWEEN LIKE IS NULL CASE WHEN THEN ELSE END UNION ALL WITH INSERT INTO VALUES UPDATE SET DELETE MERGE CREATE TABLE VIEW SCHEMA OR REPLACE IF EXISTS DROP ALTER ADD COLUMN RENAME TO TRUNCATE GRANT REVOKE COMMIT ROLLBACK EXPLAIN VIRTUAL USING PARTITION PRELOAD DESC ASC NULLS FIRST LAST`.split(" ");

const FUNCTIONS =
  `COUNT SUM AVG MIN MAX MEDIAN STDDEV VARIANCE CAST COALESCE NVL NVL2 DECODE NULLIF GREATEST LEAST ABS ROUND TRUNC FLOOR CEIL MOD POWER SQRT LN LOG EXP SIGN RANDOM UPPER LOWER INITCAP TRIM LTRIM RTRIM LPAD RPAD LENGTH SUBSTR INSTR REPLACE TRANSLATE CONCAT REGEXP_SUBSTR REGEXP_REPLACE REGEXP_INSTR TO_CHAR TO_DATE TO_TIMESTAMP TO_NUMBER CURRENT_DATE CURRENT_TIMESTAMP CURRENT_USER CURRENT_SCHEMA ADD_DAYS ADD_MONTHS ADD_YEARS ADD_HOURS ADD_MINUTES ADD_SECONDS DAYS_BETWEEN MONTHS_BETWEEN YEARS_BETWEEN EXTRACT DATE_TRUNC POSIX_TIME HASH_MD5 HASH_SHA256 ROW_NUMBER RANK DENSE_RANK LAG LEAD FIRST_VALUE LAST_VALUE LISTAGG GROUP_CONCAT ANY_VALUE`.split(" ");

let registered = false;

export function registerExasolCompletion(monaco: Monaco, getCatalog: () => SqlCatalog): void {
  if (registered) return;
  registered = true;

  monaco.languages.registerCompletionItemProvider("sql", {
    triggerCharacters: [".", " "],
    provideCompletionItems(model: import("monaco-editor").editor.ITextModel, position: import("monaco-editor").Position) {
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

      // General: columns of referenced tables first, then keywords/functions,
      // then schemas.
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
      for (const schema of cat.schemas.keys()) push(schema, K.Module, schema, "schema", "5");
      push("SELECT * FROM", K.Snippet, "SELECT *\nFROM ", "snippet", "0");
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

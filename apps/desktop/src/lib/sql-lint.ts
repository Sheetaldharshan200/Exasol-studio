// The problems that need to know what you are connected to.
//
// lib/sql-diagnostics.ts reports what is wrong in any database — a string
// left open, a bracket never closed. This reports what is wrong in THIS one:
// a schema the connection cannot see, a table that is not in it, a script
// language the server does not offer, and the handful of shapes Exasol
// rejects outright that other dialects accept.
//
// The rule that keeps the marks worth reading is the same as next door: no
// guessing. A name is only called unknown when the catalog for this
// connection is actually loaded, the name is unquoted, and the schema it
// sits in IS known — so a partly-loaded catalog, a quoted identifier, or a
// CTE never produces a mark. Everything else is left to the database.

export type Severity = "error" | "warning";

export type Lint = {
  /** Character offsets into the buffer. */
  start: number;
  end: number;
  message: string;
  severity: Severity;
};

/** Only what the linting needs: schema → table → anything. */
export type LintCatalog = { schemas: Map<string, Map<string, unknown>> };

export type LintContext = {
  catalog?: LintCatalog;
  /** Script-language aliases the server offers (from SCRIPT_LANGUAGES). */
  languages?: readonly string[];
};

/**
 * The buffer with every non-code region replaced by spaces of equal length.
 *
 * Offsets survive, so a match in the masked text points at the same place in
 * the original. Strings, comments and UDF bodies all become blanks, which is
 * what stops `FROM` inside a Python docstring from being read as SQL.
 */
export function maskNonCode(sql: string): string {
  const out = sql.split("");
  const blank = (from: number, to: number) => {
    for (let k = from; k < to && k < out.length; k++) if (out[k] !== "\n") out[k] = " ";
  };
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    const n = sql[i + 1];
    if (c === "'" || c === '"') {
      const quote = c;
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === quote && sql[j + 1] === quote) j += 2;
        else if (sql[j] === quote) { j++; break; }
        else j++;
      }
      blank(i, j);
      i = j;
      continue;
    }
    if (c === "-" && n === "-") {
      // The statement splitter (lib/sql-text.ts findScriptBlocks) opens a
      // block on a TRIMMED line, so an indented `--/` is a block there and
      // must be one here too — otherwise an indented UDF's body is read as
      // SQL and its code is underlined.
      if (onlySpaceBefore(sql, i) && sql[i + 2] === "/") {
        // A script block: the header is SQL, the body is not. Blank from the
        // `AS` that ends the header to the closing `/` line.
        const end = blockEnd(sql, i);
        const as = /\bAS\s*(?:--[^\n]*)?\n/i.exec(sql.slice(i, end));
        blank(as ? i + as.index + as[0].length : i, end);
        // Step past the `--/` marker only, NOT past the block: the header is
        // still SQL and may hold its own comments and strings, which have to
        // be blanked too or a `/* … */` between CREATE and the language name
        // gets read as the language.
        i += 3;
        continue;
      }
      const nl = sql.indexOf("\n", i);
      const to = nl < 0 ? sql.length : nl;
      blank(i, to);
      i = to;
      continue;
    }
    if (c === "/" && n === "*") {
      const close = sql.indexOf("*/", i + 2);
      const to = close < 0 ? sql.length : close + 2;
      blank(i, to);
      i = to;
      continue;
    }
    i++;
  }
  return out.join("");
}

/** Whether only blanks separate an offset from the start of its line. */
function onlySpaceBefore(sql: string, at: number): boolean {
  for (let k = at - 1; k >= 0; k--) {
    if (sql[k] === "\n") return true;
    if (sql[k] !== " " && sql[k] !== "\t") return false;
  }
  return true;
}

/** Just past the `/` line that closes the block opened at `from`. */
function blockEnd(sql: string, from: number): number {
  const re = /\n\s*\/\s*(?=\n|$)/g;
  re.lastIndex = from;
  const m = re.exec(sql);
  return m ? m.index + m[0].length : sql.length;
}

/** Words between CREATE and SCRIPT that are grammar, not a language name. */
const GRAMMAR = new Set(["OR", "REPLACE", "SCALAR", "SET", "ADAPTER", "AGGREGATE"]);

/** Shapes Exasol rejects that other dialects accept. Each is certain. */
const DIALECT: { re: RegExp; message: string }[] = [
  { re: /\bFETCH\s+(?:FIRST|NEXT)\b/gi, message: "Exasol has no FETCH FIRST — use LIMIT n." },
  { re: /\bSELECT\s+TOP\s+\d+/gi, message: "Exasol has no SELECT TOP — use LIMIT n." },
  { re: /\bISNULL\s*\(/gi, message: "Exasol has no ISNULL — use NVL or COALESCE." },
  { re: /\bGETDATE\s*\(\s*\)/gi, message: "Exasol has no GETDATE() — use CURRENT_TIMESTAMP." },
  { re: /\bNOW\s*\(\s*\)/gi, message: "Exasol has no NOW() — use CURRENT_TIMESTAMP." },
];

/** `FROM`/`JOIN`/`INTO`/`UPDATE` followed by a possibly-qualified name. */
const REFERENCE = /\b(FROM|JOIN|INTO|UPDATE)\s+("?[A-Za-z_][\w$]*"?)(?:\s*\.\s*("?[A-Za-z_][\w$]*"?))?/gi;

const unquoted = (s: string): string | null => (s.startsWith('"') ? null : s.toUpperCase());

export function lintSql(sql: string, ctx: LintContext = {}): Lint[] {
  const code = maskNonCode(sql);
  const out: Lint[] = [];

  for (const { re, message } of DIALECT) {
    re.lastIndex = 0;
    for (const m of code.matchAll(re)) {
      // `S.NOW()` is a user script called NOW, not the function Exasol lacks.
      // The qualifier makes it somebody else's name, so it is left alone.
      if (code[m.index - 1] === ".") continue;
      out.push({ start: m.index, end: m.index + m[0].length, message, severity: "error" });
    }
  }

  const schemas = ctx.catalog?.schemas;
  if (schemas && schemas.size > 0) {
    // Only QUALIFIED names are checked. An unqualified one may be a CTE, a
    // derived table, or a name resolved through the open schema, none of
    // which this module can see — so `WITH recent AS (…) SELECT * FROM
    // recent` is never underlined.
    for (const m of code.matchAll(REFERENCE)) {
      const [, , first, second] = m;
      const at = m.index + m[0].length - (second ?? first).length;
      if (second) {
        const schema = unquoted(first);
        const table = unquoted(second);
        if (!schema || !schemas.has(schema)) {
          if (schema) {
            out.push({
              start: m.index + m[0].indexOf(first),
              end: m.index + m[0].indexOf(first) + first.length,
              message: `This connection has no schema ${schema}.`,
              severity: "warning",
            });
          }
          continue;
        }
        const tables = schemas.get(schema);
        if (table && tables && tables.size > 0 && !tables.has(table)) {
          out.push({ start: at, end: at + second.length, message: `${schema} has no table or view ${table}.`, severity: "warning" });
        }
      }
    }
  }

  const langs = ctx.languages;
  if (langs && langs.length > 0) {
    const known = new Set(langs.map((l) => l.toUpperCase()));
    // Read from the MASKED buffer: a comment in the header (`CREATE /* … */
    // PYTHON3 …`) would otherwise supply the first word and be reported as
    // the language. And report at the word's real offset, found after CREATE
    // rather than anywhere in the block — a language name also mentioned in a
    // comment above would otherwise take the underline.
    for (const open of code.matchAll(/^[ \t]*--\/[^\n]*$/gm)) {
      const head = /\bCREATE\b([\s\S]*?)\bSCRIPT\b/i.exec(code.slice(open.index));
      if (!head) continue;
      const afterCreate = open.index + head.index + "CREATE".length;
      const word = /([A-Za-z_][A-Za-z0-9_]*)/g;
      let found: { name: string; at: number } | null = null;
      for (const w of head[1].matchAll(word)) {
        const name = w[1].toUpperCase();
        if (GRAMMAR.has(name)) continue;
        found = { name, at: afterCreate + w.index };
        break;
      }
      if (!found || known.has(found.name)) continue;
      out.push({
        start: found.at,
        end: found.at + found.name.length,
        message: `This database does not offer ${found.name}. It has: ${[...known].sort().join(", ")}.`,
        severity: "warning",
      });
    }
  }

  return out.sort((a, b) => a.start - b.start);
}

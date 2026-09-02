// Pure builder for an Exasol UDF `CREATE … SCRIPT` block — the visual UDF
// block scaffolds this and drops it into the editor. Kept pure so the exact
// exaplus `--/ … /` delimiting and per-language body skeletons are tested,
// not hand-verified in the UI.

export type UdfLang = "LUA" | "PYTHON3" | "JAVA" | "R";
export type UdfKind = "SCALAR" | "SET";
export type UdfParam = { name: string; type: string };

export type UdfSpec = {
  lang: UdfLang;
  kind: UdfKind;
  name: string;
  params: UdfParam[];
  /** SCALAR → RETURNS <type>; SET → EMITS (<cols>). */
  returns: string;
  orReplace: boolean;
};

export const UDF_LANGS: { id: UdfLang; label: string }[] = [
  { id: "LUA", label: "Lua" },
  { id: "PYTHON3", label: "Python" },
  { id: "JAVA", label: "Java" },
  { id: "R", label: "R" },
];

export const COMMON_TYPES = ["DOUBLE", "DECIMAL(18,0)", "VARCHAR(200)", "BOOLEAN", "DATE", "TIMESTAMP"];

/** An Exasol identifier is folded to upper unless quoted; keep the user's
 *  quoting, else upper-case a bare word (and blank out an empty name). */
function ident(name: string): string {
  const n = name.trim();
  if (!n) return "MY_UDF";
  return /^".*"$/.test(n) ? n : n.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
}

function paramList(params: UdfParam[]): string {
  const live = params.filter((p) => p.name.trim());
  if (live.length === 0) return "";
  return live.map((p) => `${p.name.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_")} ${p.type.trim() || "VARCHAR(200)"}`).join(", ");
}

function returnClause(spec: UdfSpec): string {
  const r = spec.returns.trim();
  if (spec.kind === "SET") return `EMITS (${r || "result VARCHAR(200)"})`;
  return `RETURNS ${r || "DOUBLE"}`;
}

/** The language body skeleton — a runnable stub that reads the first param
 *  (or emits a row for SET) so the created script is valid as-is. */
function body(spec: UdfSpec): string {
  const first = spec.params.find((p) => p.name.trim())?.name.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_");
  const set = spec.kind === "SET";
  switch (spec.lang) {
    case "LUA":
      return set
        ? `function run(ctx)\n    -- iterate the group and emit rows\n    repeat\n        ctx.emit(${first ? `ctx.${first}` : "nil"})\n    until not ctx.next()\nend`
        : `function run(ctx)\n    return ${first ? `ctx.${first}` : "nil"}\nend`;
    case "PYTHON3":
      return set
        ? `def run(ctx):\n    # iterate the group and emit rows\n    while True:\n        ctx.emit(${first ? `ctx.${first}` : "None"})\n        if not ctx.next():\n            break`
        : `def run(ctx):\n    return ${first ? `ctx.${first}` : "None"}`;
    case "JAVA": {
      const cls = ident(spec.name);
      return set
        ? `class ${cls} {\n    static void run(ExaMetadata exa, ExaIterator ctx) throws Exception {\n        do {\n            ctx.emit(${first ? `ctx.getString("${first}")` : "null"});\n        } while (ctx.next());\n    }\n}`
        : `class ${cls} {\n    static ${spec.returns.trim() || "Double"} run(ExaMetadata exa, ExaIterator ctx) throws Exception {\n        return ${first ? `ctx.getDouble("${first}")` : "null"};\n    }\n}`;
    }
    case "R":
      return set
        ? `run <- function(ctx) {\n    ctx$emit(${first ? `ctx$${first}` : "NA"})\n}`
        : `run <- function(ctx) {\n    ${first ? `ctx$${first}` : "NA"}\n}`;
  }
}

/** The full `--/ … /` block. The exaplus delimiters matter: the statement
 *  splitter treats everything between `--/` and a lone `/` as one statement,
 *  so the script body's own semicolons don't split it. */
export function buildUdfSql(spec: UdfSpec): string {
  const header =
    `${spec.orReplace ? "CREATE OR REPLACE" : "CREATE"} ${spec.lang} ${spec.kind} SCRIPT ${ident(spec.name)} ` +
    `(${paramList(spec.params)})\n${returnClause(spec)} AS`;
  return `--/\n${header}\n${body(spec)}\n/`;
}

export const DEFAULT_UDF_SPEC: UdfSpec = {
  lang: "PYTHON3",
  kind: "SCALAR",
  name: "MY_UDF",
  params: [{ name: "x", type: "DOUBLE" }],
  returns: "DOUBLE",
  orReplace: true,
};

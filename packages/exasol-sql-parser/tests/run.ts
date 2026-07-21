import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseErrors, getSuggestions } from "../src/completion.ts";

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail?: string) => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
};

console.log("corpus parses cleanly");
const dir = join(import.meta.dirname, "corpus");
for (const f of readdirSync(dir)) {
  const n = parseErrors(readFileSync(join(dir, f), "utf8"));
  check(f, n === 0, `${n} syntax errors`);
}

console.log("caret suggestions");
const s1 = getSuggestions("SELECT * FROM ", { line: 1, column: 14 });
check("after FROM → table+schema kinds", s1.kinds.includes("table") && s1.kinds.includes("schema"), JSON.stringify(s1));
const s2 = getSuggestions("SELECT  FROM T", { line: 1, column: 7 });
check("in select list → column kind", s2.kinds.includes("column"), JSON.stringify(s2));
const s3 = getSuggestions("SELECT A FROM T GROUP ", { line: 1, column: 22 });
check("after GROUP → BY keyword only", s3.keywords.includes("BY"), JSON.stringify(s3.keywords));
const s4 = getSuggestions("SELECT A FROM T WHERE ", { line: 1, column: 22 });
check("in WHERE → column kind", s4.kinds.includes("column"), JSON.stringify(s4.kinds));

const s5 = getSuggestions("IMPORT INTO ", { line: 1, column: 12 });
check("IMPORT INTO → table kind", s5.kinds.includes("table"), JSON.stringify(s5.kinds));
const s6 = getSuggestions("IMPORT INTO T FROM ", { line: 1, column: 19 });
check("import FROM → CSV/FBV/JDBC/EXA/LOCAL keywords", ["CSV","FBV","JDBC","EXA","LOCAL"].every(k => s6.keywords.includes(k)), JSON.stringify(s6.keywords));

console.log("scope resolution");
const q = "SELECT c. FROM TPCH.CUSTOMER c JOIN TPCH.ORDERS o ON o.O_CUSTKEY = c.C_CUSTKEY";
const s7 = getSuggestions(q, { line: 1, column: 9 });
check("alias-resolved tableRefs", s7.tableRefs.some(r => r.table === "CUSTOMER" && r.alias === "C" && r.schema === "TPCH") && s7.tableRefs.some(r => r.table === "ORDERS" && r.alias === "O"), JSON.stringify(s7.tableRefs));
const s8 = getSuggestions("WITH RANKED AS (SELECT 1 FROM TPCH.NATION) SELECT  FROM RANKED", { line: 1, column: 50 });
check("CTE visible as virtual table", s8.ctes.includes("RANKED"), JSON.stringify(s8.ctes));
const s9 = getSuggestions("SELECT * FROM A.T1; SELECT X FROM B.T2 WHERE ", { line: 1, column: 46 });
check("refs scoped to caret statement", s9.tableRefs.some(r => r.table === "T2") && !s9.tableRefs.some(r => r.table === "T1"), JSON.stringify(s9.tableRefs));
const s10 = getSuggestions("SELECT c.C_NAME FROM TPCH.CUSTOMER c WHERE c.", { line: 1, column: 46 });
check("half-typed WHERE alias-dot still answers", s10.kinds.includes("column") && s10.tableRefs.some(r => r.alias === "C"), JSON.stringify({k: s10.kinds, t: s10.tableRefs}));

console.log("performance");
const big = Array.from({length: 120}, (_, i) => `SELECT c.C_NAME, SUM(o.O_TOTALPRICE) FROM TPCH.CUSTOMER c JOIN TPCH.ORDERS o ON o.O_CUSTKEY = c.C_CUSTKEY WHERE o.O_ORDERDATE > DATE '1995-0${(i%9)+1}-01' GROUP BY c.C_NAME`).join(";\n");
getSuggestions(big, { line: 1, column: 8 }); // warm
const t0 = performance.now();
getSuggestions(big, { line: 60, column: 8 });
const ms = performance.now() - t0;
check(`120-statement script completion < 100ms (took ${ms.toFixed(1)}ms)`, ms < 100);

console.log("golden caret scenarios");
const { GOLDENS } = await import("./goldens.ts");
for (const g of GOLDENS) {
  const idx = g.sql.indexOf("\u00A6");
  const clean = g.sql.replace("\u00A6", "");
  const pre = clean.slice(0, idx);
  const line = pre.split("\n").length;
  const column = pre.length - (pre.lastIndexOf("\n") + 1);
  try {
    const s = getSuggestions(clean, { line, column });
    const okKinds = (g.kinds ?? []).every((k) => (s.kinds as string[]).includes(k));
    const okKw = (g.keywords ?? []).every((k) => s.keywords.includes(k));
    const okNot = (g.notKeywords ?? []).every((k) => !s.keywords.includes(k));
    check(g.name, okKinds && okKw && okNot,
      `kinds=${JSON.stringify(s.kinds)} kw=${JSON.stringify(s.keywords.slice(0, 12))}`);
  } catch (e) {
    check(g.name, false, String(e));
  }
}

console.log("fuzzing (deterministic)");
// Seeded LCG so CI is reproducible.
let seed = 42;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const corpus = readdirSync(dir).map((f) => readFileSync(join(dir, f), "utf8"));
let fuzzFailures = 0;
let fuzzRuns = 0;
for (const sqlText of corpus) {
  // Every prefix at 11-char steps: half-typed statements must never throw.
  for (let i = 1; i < sqlText.length; i += 11) {
    fuzzRuns++;
    try {
      getSuggestions(sqlText.slice(0, i), { line: 1, column: Math.min(i, 40) });
    } catch {
      fuzzFailures++;
    }
  }
  // 40 random-mutation variants per file: delete/duplicate a random chunk.
  for (let v = 0; v < 40; v++) {
    fuzzRuns++;
    const a = Math.floor(rnd() * sqlText.length);
    const b = Math.min(sqlText.length, a + 1 + Math.floor(rnd() * 12));
    const mutated = rnd() < 0.5
      ? sqlText.slice(0, a) + sqlText.slice(b)
      : sqlText.slice(0, b) + sqlText.slice(a, b) + sqlText.slice(b);
    try {
      getSuggestions(mutated, { line: 1, column: Math.min(a, 60) });
    } catch {
      fuzzFailures++;
    }
  }
}
check(`fuzz: ${fuzzRuns} mutated/truncated inputs, zero crashes`, fuzzFailures === 0, `${fuzzFailures} crashes`);

console.log("p95 latency");
const times: number[] = [];
for (let i = 0; i < 20; i++) {
  const t0 = performance.now();
  getSuggestions(big, { line: 60, column: 8 });
  times.push(performance.now() - t0);
}
times.sort((a, b) => a - b);
const p95 = times[Math.floor(times.length * 0.95) - 1] ?? times.at(-1)!;
check(`p95 completion < 50ms on 120-statement script (p95=${p95.toFixed(1)}ms)`, p95 < 50);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

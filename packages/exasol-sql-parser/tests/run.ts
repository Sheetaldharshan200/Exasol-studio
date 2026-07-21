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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

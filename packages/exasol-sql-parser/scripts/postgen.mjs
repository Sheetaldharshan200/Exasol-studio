// Post-process ANTLR output for Node type-stripping: .ts import extensions and
// type-only imports for interfaces.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
const dir = new URL("../src/generated/", import.meta.url);
for (const f of readdirSync(dir)) {
  if (!f.endsWith(".ts")) continue;
  const p = new URL(f, dir);
  let t = readFileSync(p, "utf8");
  t = t.replace(/from "\.\/(Exasol\w+)\.js"/g, 'from "./$1.ts"');
  t = t.replace(
    'import { ErrorNode, ParseTreeListener, ParserRuleContext, TerminalNode } from "antlr4ng";',
    'import { ErrorNode, ParserRuleContext, TerminalNode } from "antlr4ng";\nimport type { ParseTreeListener } from "antlr4ng";',
  );
  writeFileSync(p, t);
}
console.log("postgen: generated imports normalized");

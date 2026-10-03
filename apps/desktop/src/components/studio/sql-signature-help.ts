// Monaco signature help (which argument of a built-in function the caret is
// on) and hover (a function's signature, a table's columns) for SQL, from
// lib/sql-signatures.ts. Registered once for the app.

import { type Monaco } from "@monaco-editor/react";
import type { SqlCatalog } from "@/lib/sql-completion";
import { currentStatement, qualifierBefore } from "@/lib/sql-completion-scope";
import { SIGNATURES, activeParam, callAtCaret, endsInCode, functionHover, identifierEndAt, signatureLabel, tableAtEnd, tableHover } from "@/lib/sql-signatures";

type TextModel = import("monaco-editor").editor.ITextModel;
type Position = import("monaco-editor").Position;

type Deps = { getCatalog: () => SqlCatalog; loadSchemas: (schemas: string[]) => Promise<void> };

let registered = false;
// The providers live as long as Monaco; a remounted Studio hands in its own catalog.
let deps: Deps = { getCatalog: () => ({ schemas: new Map(), scripts: [] }), loadSchemas: async () => {} };

export function installSqlSignatureHelp(monaco: Monaco, getCatalog: Deps["getCatalog"], loadSchemas: Deps["loadSchemas"]): void {
  deps = { getCatalog, loadSchemas };
  if (registered) return;
  registered = true;

  monaco.languages.registerSignatureHelpProvider("sql", {
    signatureHelpTriggerCharacters: ["(", ","],
    signatureHelpRetriggerCharacters: [")"],
    provideSignatureHelp: (model: TextModel, position: Position) => {
      const before = model.getValueInRange({ startLineNumber: 1, startColumn: 1, endLineNumber: position.lineNumber, endColumn: position.column });
      const call = callAtCaret(currentStatement(before));
      const sig = call && SIGNATURES[call.name];
      if (!call || !sig) return null;
      return {
        value: {
          signatures: [{ label: signatureLabel(call.name, sig), documentation: sig.doc, parameters: sig.params.map((p) => ({ label: p })) }],
          activeSignature: 0,
          activeParameter: activeParam(sig, call.arg),
        },
        dispose: () => {},
      };
    },
  });

  monaco.languages.registerHoverProvider("sql", {
    provideHover: async (model: TextModel, position: Position) => {
      const word = model.getWordAtPosition(position);
      if (!word) return null;
      const line = model.getLineContent(position.lineNumber);
      const beforeWord = model.getValueInRange({ startLineNumber: 1, startColumn: 1, endLineNumber: position.lineNumber, endColumn: word.startColumn });
      // Nothing in a string or a comment; a quoted name's opening quote is fine.
      if (!endsInCode(currentStatement(beforeWord.replace(/"$/, "")))) return null;
      const range = { startLineNumber: position.lineNumber, startColumn: word.startColumn, endLineNumber: position.lineNumber, endColumn: word.endColumn };
      // A function only when called: YEAR or DAY alone is likely a column.
      if (!qualifierBefore(line.slice(0, word.startColumn - 1)) && line.slice(word.endColumn - 1).trimStart().startsWith("(")) {
        const md = functionHover(word.word);
        return md ? { range, contents: [{ value: md }] } : null;
      }
      // A table only where one is named (FROM, JOIN, …), quoted names whole.
      const end = identifierEndAt(line, position.column - 1);
      // `S` in `S.T` is the schema, not a table.
      if (end < 0 || line.slice(end).trimStart().startsWith(".")) return null;
      const upTo = model.getValueInRange({ startLineNumber: 1, startColumn: 1, endLineNumber: position.lineNumber, endColumn: end + 1 });
      const ref = tableAtEnd(currentStatement(upTo));
      if (!ref) return null;
      const cat = deps.getCatalog();
      const owners = ref.schema ? [ref.schema] : [...cat.schemas].filter(([, t]) => t.has(ref.table)).map(([name]) => name);
      if (owners.length === 1 && cat.schemas.has(owners[0]) && !cat.loaded?.has(owners[0])) await deps.loadSchemas(owners);
      const md = tableHover(deps.getCatalog(), ref.schema || null, ref.table);
      return md ? { range, contents: [{ value: md }] } : null;
    },
  });
}

// Monaco's "Format Document" / "Format Selection" (⇧⌥F) for SQL, by the
// Exasol formatter in lib/sql-format.ts. Registered once for the app.

import { type Monaco } from "@monaco-editor/react";
import { formatSql } from "@/lib/sql-format";

type TextModel = import("monaco-editor").editor.ITextModel;
type Range = import("monaco-editor").IRange;

let registered = false;

export function installSqlFormatting(monaco: Monaco): void {
  if (registered) return;
  registered = true;
  monaco.languages.registerDocumentFormattingEditProvider("sql", {
    provideDocumentFormattingEdits: (model: TextModel) => [{ range: model.getFullModelRange(), text: formatSql(model.getValue()) }],
  });
  monaco.languages.registerDocumentRangeFormattingEditProvider("sql", {
    provideDocumentRangeFormattingEdits: (model: TextModel, range: Range) => {
      const text = model.getValueInRange(range);
      // A selection keeps its own ending: no trailing newline added.
      return [{ range, text: formatSql(text).replace(/\n$/, "") }];
    },
  });
}

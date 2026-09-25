/**
 * The dim "your Python code goes here" line inside an empty UDF body.
 *
 * Injected text, not buffer text: it cannot be selected, copied, or sent to
 * the database, and it disappears the moment anything is typed on the line.
 * Which language it names comes from the CREATE header the user wrote (see
 * lib/udf-placeholder.ts), so it follows the choice in the snippet as it is
 * made and needs no list of languages here.
 */
import { bodyHints } from "@/lib/udf-placeholder";

type StudioEditor = import("monaco-editor").editor.IStandaloneCodeEditor;
type TextModel = import("monaco-editor").editor.ITextModel;

export function installUdfHints(editor: StudioEditor): { dispose: () => void } {
  // Decorations live on the MODEL, not the editor. Each tab has its own
  // model, so the ids must be remembered together with the model they were
  // put on — clearing them against whichever model happens to be attached
  // later leaves the old tab's hint behind forever.
  let marked: TextModel | null = null;
  let ids: string[] = [];

  const clear = () => {
    if (marked && !marked.isDisposed() && ids.length > 0) marked.deltaDecorations(ids, []);
    marked = null;
    ids = [];
  };

  const update = () => {
    const model = editor.getModel();
    if (marked && marked !== model) clear();
    if (!model) return;
    const lineCount = model.getLineCount();
    ids = model.deltaDecorations(
      ids,
      bodyHints(model.getValue())
        .filter((h) => h.line <= lineCount)
        .map((h) => ({
          range: { startLineNumber: h.line, startColumn: 1, endLineNumber: h.line, endColumn: 1 },
          options: {
            // Not stickiness-tracked content: the hint belongs to the line,
            // and the line is empty by definition while it is shown.
            after: { content: h.text, inlineClassName: "exa-udf-hint" },
            showIfCollapsed: true,
          },
        })),
    );
    marked = model;
  };

  update();
  const subs = [editor.onDidChangeModelContent(update), editor.onDidChangeModel(update)];
  return {
    dispose: () => {
      for (const s of subs) s.dispose();
      clear();
    },
  };
}

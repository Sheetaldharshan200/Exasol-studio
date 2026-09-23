/**
 * Statement-number badges in the editor's LEFT margin: every statement of a
 * multi-statement buffer shows its 1-based number ("1]", "2]", …) in the
 * glyph margin next to its first line, matching the numbering in the result
 * tabs and Query Performance. Single-statement buffers show nothing.
 * Toggled from Settings → SQL Editor (on by default).
 */
import { type Monaco } from "@monaco-editor/react";
import { findScriptBlocks, splitStatements } from "@/lib/sql-text";
import { udfAccentClass, udfAccentRule, udfBodyStart, udfChipLabel, udfLineClasses, udfLineRole } from "@/lib/udf-block-style";

type StudioEditor = import("monaco-editor").editor.IStandaloneCodeEditor;
type Decoration = import("monaco-editor").editor.IModelDeltaDecoration;

/**
 * Where a statement's number badge anchors: the statement's first LETTER, not
 * its first character. A half-typed `-` on the line above briefly merges into
 * the next statement — anchoring at the first letter keeps every badge on its
 * line through that, so typing `--` never makes the margin jump.
 */
function badgeAnchor(sql: string, s: { text: string; start: number; end: number }): number {
  const span = sql.slice(s.start, s.end);
  const letter = /[A-Za-z]/.exec(span);
  if (letter) return s.start + letter.index;
  return s.start + (span.length - span.trimStart().length);
}

// One accent rule per language actually seen. Monaco decorations name a
// class, so a language's colour has to reach the line through a stylesheet
// rule; these are written once, the first time a language turns up.
const accentStyled = new Set<string>();
function ensureAccentStyle(language: string, className: string) {
  if (accentStyled.has(className)) return;
  accentStyled.add(className);
  const rule = udfAccentRule(language, className);
  if (!rule) return;
  let el = document.getElementById("exa-udf-accent-styles");
  if (!el) {
    el = document.createElement("style");
    el.id = "exa-udf-accent-styles";
    document.head.appendChild(el);
  }
  el.appendChild(document.createTextNode(`${rule}\n`));
}

// The numbers render via CSS content — one tiny rule per number, generated on
// demand (`.exa-stmt-badge-7::after { content: "7]" }`).
let styledUpTo = 0;
function ensureBadgeStyles(count: number) {
  if (count <= styledUpTo) return;
  let el = document.getElementById("exa-stmt-badge-styles");
  if (!el) {
    el = document.createElement("style");
    el.id = "exa-stmt-badge-styles";
    document.head.appendChild(el);
  }
  let css = "";
  for (let n = styledUpTo + 1; n <= count; n++) css += `.exa-stmt-badge-${n}::after{content:"${n}]"}\n`;
  el.appendChild(document.createTextNode(css));
  styledUpTo = count;
}

/** Keep badges in sync with the buffer; returns the enable/disable handle. */
export function installStatementBadges(editor: StudioEditor, monaco: Monaco): { setEnabled: (on: boolean) => void } {
  let enabled = true;
  let lastKey = "";
  let glyphOn: boolean | null = null;
  // The glyph margin costs ~a line-height of gutter width — reserve it only
  // while badges are actually shown, so a fresh/single-statement buffer keeps
  // the caret tight against the line number.
  const setGlyphMargin = (on: boolean) => {
    if (glyphOn === on) return;
    glyphOn = on;
    editor.updateOptions({ glyphMargin: on });
  };
  const collection = editor.createDecorationsCollection();
  const update = () => {
    const model = editor.getModel();
    if (!enabled || !model) {
      collection.clear();
      lastKey = "";
      return;
    }
    const sql = model.getValue();
    // Number badges only for multi-statement buffers; the UDF block visuals
    // below apply even when the buffer is a single script.
    const stmts = splitStatements(sql);
    const numbered = stmts.length >= 2 ? stmts : [];
    setGlyphMargin(numbered.length > 0);
    ensureBadgeStyles(numbered.length);
    const decorations: Decoration[] = numbered.map((s, i) => {
      const pos = model.getPositionAt(badgeAnchor(sql, s));
      return {
        range: new monaco.Range(pos.lineNumber, 1, pos.lineNumber, 1),
        options: {
          glyphMarginClassName: `exa-stmt-badge exa-stmt-badge-${i + 1}`,
          glyphMarginHoverMessage: { value: `Statement ${i + 1} — click to select it` },
          stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
        },
      };
    });
    // `--/ … /` UDF script blocks render as an embedded card: this is Lua,
    // Python, Java or R sitting inside a SQL buffer, and it should read as a
    // different thing rather than as faintly tinted SQL. Each line carries the
    // block surface and the language's accent; the first and last close the
    // card; the delimiters recede and the header carries a language pill.
    // Blocks still being typed (no closing "/") stay unpainted — tinting the
    // rest of the buffer mid-keystroke reads as the editor jumping around.
    for (const block of findScriptBlocks(sql)) {
      if (!block.closed) continue;
      const from = model.getPositionAt(block.start);
      const to = model.getPositionAt(block.end);
      // The accent comes from the language's own name, so a language this app
      // has never heard of still gets one; its rule is written on first sight.
      const accentClass = udfAccentClass(block.language);
      if (accentClass && block.language) ensureAccentStyle(block.language, accentClass);
      // Two cells, one inside the other: the outer holds the SQL that declares
      // the script, the inner holds the function itself in its own language —
      // a notebook cell with a child cell in it.
      const lines: string[] = [];
      for (let line = from.lineNumber; line <= to.lineNumber; line++) lines.push(model.getLineContent(line));
      const bodyStart = udfBodyStart(lines);
      const last = lines.length - 1;
      for (let i = 0; i <= last; i++) {
        const line = from.lineNumber + i;
        const role = udfLineRole(i, { last, bodyStart });
        const classes = [
          udfLineClasses({ first: i === 0, last: i === last }),
          `exa-udf-${role}`,
          accentClass ?? "",
        ];
        // The child cell closes at its own top and bottom, inside the outer one.
        if (role === "body" && bodyStart !== null) {
          if (i === bodyStart) classes.push("exa-udf-body-open");
          if (i === last - 1 || udfLineRole(i + 1, { last, bodyStart }) !== "body") classes.push("exa-udf-body-close");
        }
        decorations.push({
          range: new monaco.Range(line, 1, line, model.getLineMaxColumn(line)),
          options: { isWholeLine: true, className: classes.filter(Boolean).join(" ") },
        });
      }
      // The delimiters (`--/` line + closing `/`) are scaffolding: they recede
      // so the code between them is what the eye lands on.
      for (const line of [from.lineNumber, to.lineNumber]) {
        decorations.push({
          range: new monaco.Range(line, 1, line, model.getLineMaxColumn(line)),
          options: { inlineClassName: "exa-udf-marker" },
        });
      }
      // The language pill, once the CREATE header names one.
      const chip = udfChipLabel(block.language);
      if (chip) {
        // On the child cell's first line when there is one, so the label sits
        // with the code it names; otherwise on the opening marker.
        const chipLine = bodyStart !== null ? from.lineNumber + bodyStart : from.lineNumber;
        decorations.push({
          range: new monaco.Range(chipLine, model.getLineMaxColumn(chipLine), chipLine, model.getLineMaxColumn(chipLine)),
          options: {
            after: { content: chip, inlineClassName: `exa-udf-chip ${accentClass ?? ""}`.trim() },
            stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
          },
        });
      }
    }
    // Re-apply ONLY on structural change — replacing identical decorations on
    // every keystroke made the margin and block tint visibly push around.
    const key = decorations
      .map((d) => `${d.range.startLineNumber}:${d.range.endLineNumber}:${d.options.glyphMarginClassName ?? d.options.className ?? d.options.inlineClassName ?? ""}:${d.options.after?.content ?? ""}`)
      .join("|");
    if (key === lastKey) return;
    lastKey = key;
    collection.set(decorations);
  };
  update();
  // Debounced on typing: re-splitting and re-numbering on EVERY keystroke made
  // the margin churn (a lone "-" merges statements until the next char lands).
  let timer: number | undefined;
  const scheduleUpdate = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(update, 200);
  };
  const subs = [editor.onDidChangeModelContent(scheduleUpdate), editor.onDidChangeModel(update)];

  // Clicking a statement's number selects the whole statement (script blocks
  // select marker line through the closing "/").
  const mouseSub = editor.onMouseDown((e) => {
    if (!enabled) return;
    if (e.target.type !== monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) return;
    const line = e.target.position?.lineNumber;
    const model = editor.getModel();
    if (!line || !model) return;
    const sql = model.getValue();
    for (const s of splitStatements(sql)) {
      if (model.getPositionAt(badgeAnchor(sql, s)).lineNumber !== line) continue;
      // Select from the statement's actual text start (incl. leading comments).
      const span = sql.slice(s.start, s.end);
      const from = model.getPositionAt(s.start + (span.length - span.trimStart().length));
      // Include the trailing ";" / "/" terminator when present.
      const endOffset = s.end < sql.length && (sql[s.end] === ";" || sql[s.end] === "/") ? s.end + 1 : s.end;
      const to = model.getPositionAt(endOffset);
      editor.setSelection({ startLineNumber: from.lineNumber, startColumn: from.column, endLineNumber: to.lineNumber, endColumn: to.column });
      editor.focus();
      return;
    }
  });

  editor.onDidDispose(() => {
    subs.forEach((s) => s.dispose());
    mouseSub.dispose();
    window.clearTimeout(timer);
    collection.clear();
  });
  return {
    setEnabled(on: boolean) {
      enabled = on;
      if (!on) setGlyphMargin(false);
      update();
    },
  };
}

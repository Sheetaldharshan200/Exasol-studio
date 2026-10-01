// Every app setting must change behaviour somewhere. This lists the reader of
// each key and checks that file really reads it — a toggle that nothing reads
// (the old "Interface density", "Fetch size", "Isolation level", …) fails here.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { APP_SETTING_DEFAULTS } from "./app-settings.ts";

const SHELL = "src/components/studio/ExasolStudio.tsx";
const READERS: Record<string, { file: string; reads: string }> = {
  theme: { file: SHELL, reads: "s.theme" },
  showSystemSchemas: { file: SHELL, reads: "s.showSystemSchemas" },
  editorFontSize: { file: SHELL, reads: "s.editorFontSize" },
  editorFontFamily: { file: SHELL, reads: "s.editorFontFamily" },
  wordWrap: { file: SHELL, reads: "s.wordWrap" },
  stmtNumbers: { file: SHELL, reads: "s.stmtNumbers" },
  autoComplete: { file: SHELL, reads: "s.autoComplete" },
  sqlLinting: { file: SHELL, reads: "s.sqlLinting" },
  aiGhostText: { file: SHELL, reads: "s.aiGhostText" },
  maxRows: { file: "src/lib/exec-settings.ts", reads: "s.maxRows" },
  nullText: { file: SHELL, reads: "s.nullText" },
  gridFontSize: { file: SHELL, reads: "s.gridFontSize" },
  zebraStripes: { file: SHELL, reads: "s.zebraStripes" },
  splitStatements: { file: "src/lib/exec-settings.ts", reads: "s.splitStatements" },
  stopOnError: { file: "src/lib/exec-settings.ts", reads: "s.stopOnError" },
  stripComments: { file: "src/lib/exec-settings.ts", reads: "s.stripComments" },
  keepHistory: { file: "src-tauri/src/history.rs", reads: '"keepHistory"' },
  historyLimit: { file: "src-tauri/src/history.rs", reads: '"historyLimit"' },
  connectTimeoutMs: { file: "src-tauri/src/connection.rs", reads: '"connectTimeoutMs"' },
};

const root = fileURLToPath(new URL("../../", import.meta.url));

test("every app setting has a reader, and every reader is a setting", () => {
  assert.deepEqual(Object.keys(READERS).sort(), Object.keys(APP_SETTING_DEFAULTS).sort());
});

test("each listed reader really reads its setting", () => {
  for (const [key, { file, reads }] of Object.entries(READERS)) {
    const text = readFileSync(root + file, "utf8");
    assert.ok(text.includes(reads), `${key}: ${file} does not read ${reads}`);
  }
});

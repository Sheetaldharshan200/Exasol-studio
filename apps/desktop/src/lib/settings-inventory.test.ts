// Every app setting must change behaviour somewhere. This lists the reader of
// each key and checks that file really reads it — a toggle that nothing reads
// (the old "Interface density", "Fetch size", "Isolation level", …) fails here.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { APP_SETTING_DEFAULTS } from "./app-settings.ts";
import { connSettingPaths, withConnDefaults } from "./conn-settings.ts";

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

// Per-connection settings (Properties tab): the Rust readers name the path
// as `&["group", "key"]`.
const RS = (file: string) => `src-tauri/src/${file}`;
const rust = (path: string) => `"${path.split(".").join('", "')}"`;
const CONN_READERS: Record<string, { file: string; reads: string }> = {
  "auth.passwordPolicy": { file: RS("connection.rs"), reads: rust("auth.passwordPolicy") },
  "driver.connectionPoolSize": { file: RS("connection.rs"), reads: rust("driver.connectionPoolSize") },
  "driver.queryTimeoutSeconds": { file: RS("session.rs"), reads: rust("driver.queryTimeoutSeconds") },
  "physical.singleConnection": { file: RS("connection.rs"), reads: rust("physical.singleConnection") },
  "physical.validationSql": { file: RS("connection.rs"), reads: rust("physical.validationSql") },
  "physical.keepAlive": { file: RS("connection.rs"), reads: rust("physical.keepAlive") },
  "physical.idleSeconds": { file: RS("connection.rs"), reads: rust("physical.idleSeconds") },
  "transaction.autoCommit": { file: RS("session.rs"), reads: rust("transaction.autoCommit") },
  "hooks.connectEnabled": { file: RS("connection.rs"), reads: rust("hooks.connectEnabled") },
  "hooks.connectSql": { file: RS("connection.rs"), reads: rust("hooks.connectSql") },
  "hooks.disconnectEnabled": { file: RS("connection.rs"), reads: rust("hooks.disconnectEnabled") },
  "hooks.disconnectSql": { file: RS("connection.rs"), reads: rust("hooks.disconnectSql") },
  "color.accent": { file: SHELL, reads: "connSettings?.color.accent" },
  "color.sqlTabs": { file: SHELL, reads: "connSettings.color.sqlTabs" },
  "safety.env": { file: SHELL, reads: "safety.env" },
  "safety.readOnly": { file: RS("safety.rs"), reads: rust("safety.readOnly") },
  "safety.confirmDangerous": { file: "src/lib/conn-settings.ts", reads: "safety.confirmDangerous" },
  "color.showInName": { file: "src/components/studio/Sidebar.tsx", reads: "showInName" },
  "sqlEditor.initialSchema": { file: RS("session.rs"), reads: rust("sqlEditor.initialSchema") },
  "sqlEditor.lossHandling": { file: SHELL, reads: "sqlEditor?.lossHandling" },
};

test("every connection setting has a reader, and every reader is a setting", () => {
  assert.deepEqual(Object.keys(CONN_READERS).sort(), connSettingPaths().sort());
  for (const [path, { file, reads }] of Object.entries(CONN_READERS)) {
    const text = readFileSync(root + file, "utf8");
    assert.ok(text.includes(reads), `${path}: ${file} does not read ${reads}`);
  }
});

test("retired connection settings are dropped on load, the rest kept", () => {
  const s = withConnDefaults({
    delimited: { begin: "[" },
    queryBuilder: { autoJoin: false },
    transaction: { autoCommit: false, isolation: "serializable" },
    color: { accent: "#e11d48", resultTabs: false },
  }) as unknown as Record<string, Record<string, unknown>>;
  assert.equal(s.delimited, undefined);
  assert.equal(s.queryBuilder, undefined);
  assert.deepEqual(s.transaction, { autoCommit: false });
  assert.deepEqual(s.color, { accent: "#e11d48", sqlTabs: true, showInName: true });
  assert.equal(withConnDefaults(null).sqlEditor.initialSchema, "default");
  assert.equal(withConnDefaults("junk").driver.connectionPoolSize, 4);
});

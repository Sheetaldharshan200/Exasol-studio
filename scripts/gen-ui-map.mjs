#!/usr/bin/env node
// Generates the app's UI knowledge map for the agent (and, later, the pet
// cursor): every addressable place in Exasol Studio, with how to get there.
// Curated base entries + everything tagged data-agent-id / data-tour in src.
//
//   node scripts/gen-ui-map.mjs
//
// Output: packages/agent-core/data/ui-map.json

import { readdirSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(root, "apps/desktop/src");
const outFile = join(root, "packages/agent-core/data/ui-map.json");

/** Curated map of the app's surfaces — the stable navigation skeleton. */
const BASE = [
  { id: "rail.databases", label: "Databases panel", where: "activity rail, 1st icon", hint: "Tree of connections, schemas, tables. Right-click objects for actions (new table, drop, generate SQL)." },
  { id: "rail.files", label: "Files panel", where: "activity rail, 2nd icon", hint: "Workspace SQL files; double-click opens in a query tab." },
  { id: "rail.favorites", label: "Favorites panel", where: "activity rail, 3rd icon", hint: "Saved favorite objects and queries." },
  { id: "rail.visualizer", label: "Visualizer", where: "activity rail, 4th icon", hint: "Opens a visualizer tab; tab names are editable." },
  { id: "rail.git", label: "Git panel", where: "activity rail, 5th icon", hint: "Branches, stage/unstage, commit, and the commit graph view." },
  { id: "rail.marketplace", label: "Marketplace", where: "activity rail, 6th icon", hint: "Install Exasol tools, drivers, extensions. Grid/list toggle beside search." },
  { id: "rail.guides", label: "Guides & Docs", where: "activity rail, 7th icon", hint: "Documentation and setup guides." },
  { id: "rail.ai", label: "Exasol AI panel", where: "activity rail, bottom section", hint: "The AI assistant side panel (this conversation)." },
  { id: "rail.settings", label: "Settings", where: "activity rail, bottom gear icon", hint: "Opens the Settings window (appearance, editor, database defaults)." },
  { id: "titlebar.connect", label: "Connect button", where: "title bar, right side", hint: "Opens the connection dialog to connect to an Exasol database." },
  { id: "editor.run", label: "Run query", where: "query tab toolbar", hint: "Executes the SQL in the active editor." },
  { id: "editor.save", label: "Save query", where: "query tab toolbar / Cmd+S", hint: "Saves the active editor SQL to a workspace file." },
  { id: "tabs.new", label: "New query tab", where: "tab strip + button", hint: "Opens a fresh SQL editor tab." },
  { id: "history.dock", label: "Query history", where: "bottom dock", hint: "Past statements with status and timing; click to reopen." },
  { id: "window.ai-providers", label: "AI Providers window", where: "AI panel header, sliders icon", hint: "Built-in local AI engine/models, Ollama status, external API keys." },
  { id: "market.exasol-personal", label: "Exasol Personal install", where: "Marketplace → Databases", hint: "Installs/manages the free local Exasol database (start/stop under Manage)." },
];

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p);
    else if (/\.(tsx|ts)$/.test(entry.name)) yield p;
  }
}

const scanned = [];
for (const file of walk(srcDir)) {
  const text = readFileSync(file, "utf8");
  const rel = relative(root, file);
  for (const m of text.matchAll(/data-(agent-id|tour)=["']([\w:.-]+)["']/g)) {
    scanned.push({
      id: `${m[1] === "tour" ? "tour" : "anchor"}.${m[2]}`,
      label: m[2].replace(/[-_:.]/g, " "),
      where: rel,
      hint: `${m[1] === "tour" ? "Tour target" : "Agent action anchor"} in ${rel}`,
    });
  }
}

// Base entries win on id collisions; scanned entries add the long tail.
const byId = new Map();
for (const e of [...scanned, ...BASE]) byId.set(e.id, e);
const entries = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, JSON.stringify({ generatedAt: new Date().toISOString(), entries }, null, 2));
console.log(`ui-map: ${entries.length} entries → ${relative(root, outFile)}`);

/**
 * exa-agent — Exa in the terminal. The SAME agent core the desktop app ships
 * (loop, tools, KB, memory, sessions), with an opencode-style interactive
 * terminal UI: an owned input editor with live slash-command suggestions,
 * arrow-key select dialogs (with checkboxes where it matters), confirm
 * dialogs for permissions, streaming markdown, ⏺ tool lines and a spinner
 * with esc-to-interrupt. Shares the app's data dir by default, so config,
 * keys, memory and the knowledge graph carry over.
 *
 *   exa-agent                          interactive chat
 *   exa-agent --continue | -c          pick up the last chat where it left off
 *   exa-agent --sessions               choose which chat to resume
 *   exa-agent --model ollama/qwen3     pick a model for this run
 *   exa-agent --db exa://sys:pw@localhost:8563[/SCHEMA] --db-name local
 *   exa-agent models                   list available models
 *   exa-agent serve                    headless HTTP+SSE sidecar mode
 */

import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { ConfigStore, defaultDataDir } from "./config.ts";
import { initLog } from "./log.ts";
import { startServer } from "./server.ts";
import { ProviderRegistry } from "./providers.ts";
import { SessionStore, type Session } from "./session.ts";
import { DbRegistry } from "./db.ts";
import { MemoryStore } from "./memory.ts";
import { KnowledgeGraph } from "./kb.ts";
import { DashboardStore } from "./dashboards.ts";
import { ArtifactStore } from "./artifacts.ts";
import { DocumentStore } from "./documents.ts";
import { SkillStore } from "./skills.ts";
import { runTurn, type Attachment } from "./loop.ts";
import {
  BACK, box, c, confirmDialog, initKeys, inputBottom, inputTop, lineInput, MarkdownStream,
  pushKeys, restoreTerm, selectList, Spinner, textInput, toolEndLine, toolStartLine, turnFooter,
  type SelectItem,
} from "./tui.ts";

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

/** Parse exa://user:pass@host:port[/SCHEMA] into connection details. */
function parseDbUrl(raw: string): { host: string; port: number; user: string; password: string; schema?: string } {
  const u = new URL(raw);
  if (u.protocol !== "exa:") throw new Error(`--db must be exa://user:pass@host:port, got "${raw}"`);
  return {
    host: u.hostname || "localhost",
    port: u.port ? Number(u.port) : 8563,
    user: decodeURIComponent(u.username || "sys"),
    password: decodeURIComponent(u.password || ""),
    schema: u.pathname.replace(/^\//, "") || undefined,
  };
}

async function pickDefaultModel(registry: ProviderRegistry, config: ConfigStore): Promise<string | null> {
  const configured = config.get().model;
  if (configured) return configured;
  const providers = await registry.list();
  for (const kind of ["local", "cloud"] as const) {
    for (const p of providers) {
      if (p.kind !== kind || !p.configured || (kind === "local" && !p.running)) continue;
      const m = p.models.find((m) => m.toolCall !== false) ?? p.models[0];
      if (m) return `${p.id}/${m.id}`;
    }
  }
  return null;
}

/** Build the model-picker items, grouped by provider like opencode's dialog. */
async function modelItems(registry: ProviderRegistry): Promise<SelectItem<string>[]> {
  const providers = await registry.list();
  const items: SelectItem<string>[] = [];
  for (const p of providers) {
    if (!p.configured && !p.running) continue;
    const state = p.kind === "local" ? (p.running ? "running" : "installed") : "configured";
    for (const m of p.models) {
      const caps = [m.toolCall === false ? "no tools" : "", m.image ? "vision" : ""].filter(Boolean).join(", ");
      items.push({
        label: `${p.id}/${m.id}`,
        hint: caps || undefined,
        group: `${p.name} · ${state}`,
        value: `${p.id}/${m.id}`,
      });
    }
  }
  return items;
}

async function printModels(registry: ProviderRegistry): Promise<void> {
  const items = await modelItems(registry);
  let group: string | undefined;
  for (const it of items) {
    if (it.group !== group) {
      group = it.group;
      console.log(`\n${c.bold(group ?? "")}`);
    }
    console.log(`  ${it.label}${it.hint ? c.dim(`  [${it.hint}]`) : ""}`);
  }
  console.log();
}

const COMMANDS = [
  { cmd: "/connect", desc: "connect to a database (guided, or paste exa://…)" },
  { cmd: "/connections", desc: "switch which connection the agent uses" },
  { cmd: "/attach", desc: "attach a file (csv/parquet/text) to your next message" },
  { cmd: "/resume", desc: "resume an earlier chat" },
  { cmd: "/model", desc: "pick the model (interactive)" },
  { cmd: "/models", desc: "browse available models" },
  { cmd: "/undo", desc: "rewind the last exchange and try differently" },
  { cmd: "/new", desc: "start a fresh chat" },
  { cmd: "/clear", desc: "clear the screen" },
  { cmd: "/help", desc: "show commands" },
  { cmd: "/quit", desc: "exit" },
];

function relTime(ts: number): string {
  const d = Date.now() - ts;
  if (d < 60_000) return "just now";
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`;
  return `${Math.floor(d / 86_400_000)}d ago`;
}

const HELP_LINES = COMMANDS.map((x) => `${c.bold(x.cmd.padEnd(10))} ${x.desc}`).concat(
  c.dim("esc interrupts a running turn · tab accepts a suggestion · ↑ history"),
);

async function interactive(dataDir: string, args: string[]): Promise<void> {
  const config = new ConfigStore(dataDir);
  initLog(dataDir, { stderrMin: "warn" }); // keep info logs out of the conversation
  const registry = new ProviderRegistry(config);
  const sessions = new SessionStore(dataDir);
  const db = new DbRegistry();
  const memory = new MemoryStore(dataDir);
  const kb = new KnowledgeGraph(dataDir);
  const dashboards = new DashboardStore(dataDir);
  const artifacts = new ArtifactStore(dataDir);
  const documents = new DocumentStore();
  const skills = new SkillStore(dataDir);

  initKeys();
  let model = flag(args, "--model") ?? (await pickDefaultModel(registry, config));
  let session = sessions.create();
  let resumedTitle: string | null = null;

  // --continue / -c: pick up the LAST chat (Claude Code behavior). Reviving
  // also folds in any crash-recovered work from an interrupted turn.
  if (args.includes("--continue") || args.includes("-c")) {
    const last = sessions.list()[0];
    const revived = last ? sessions.get(last.id) : undefined;
    if (revived) {
      session = revived;
      resumedTitle = revived.title;
    }
  }
  // --sessions: pick which chat to resume before starting.
  if (args.includes("--sessions") && process.stdin.isTTY) {
    const metas = sessions.list().slice(0, 20);
    if (metas.length) {
      const picked = await selectList<string>({
        title: "Resume chat",
        items: metas.map((m) => ({ label: m.title, hint: `${relTime(m.updatedAt)} · ${m.messageCount} msgs`, value: m.id })),
        placeholder: "Search chats…",
      });
      const revived = picked ? sessions.get(picked) : undefined;
      if (revived) {
        session = revived;
        resumedTitle = revived.title;
      }
    }
  }

  // History persisted across runs (newest first, like readline's).
  const historyFile = join(dataDir, "cli-history.json");
  let history: string[] = [];
  try {
    history = JSON.parse(readFileSync(historyFile, "utf8")) as string[];
  } catch {
    /* first run */
  }
  const remember = (line: string) => {
    // NEVER persist credentials: exa:// URLs carry passwords — redact before
    // the line touches disk (recalling gives the redacted form; re-enter the
    // password or use the guided form).
    const safe = line.replace(/exa:\/\/([^:@\s]+):[^@\s]+@/g, "exa://$1:***@");
    if (history[0] !== safe) history.unshift(safe);
    if (history.length > 100) history.length = 100;
    try {
      writeFileSync(historyFile, JSON.stringify(history));
    } catch {
      /* best effort */
    }
  };

  // Files staged with /attach (or by just typing a path); sent with the next
  // message, then cleared.
  let pendingFiles: Attachment[] = [];

  const expandPath = (raw: string) => resolve(raw.replace(/^~(?=\/|$)/, homedir()));

  /** Read one file into a staged attachment. Returns true on success. */
  function attachFile(raw: string): boolean {
    const p = expandPath(raw.replace(/^["']|["']$/g, ""));
    if (!existsSync(p) || !statSync(p).isFile()) {
      console.log(c.red(`no such file: ${p}`));
      return false;
    }
    try {
      const size = statSync(p).size;
      const ext = extname(p).toLowerCase();
      const name = basename(p);
      let att: Attachment;
      if (ext === ".parquet") {
        if (size > 100 * 1024 * 1024) throw new Error("parquet too large (max 100 MB)");
        att = { name, mime: "application/vnd.apache.parquet", kind: "binary", data: readFileSync(p).toString("base64") };
      } else if ([".png", ".jpg", ".jpeg", ".gif", ".webp"].includes(ext)) {
        if (size > 6 * 1024 * 1024) throw new Error("image too large (max 6 MB)");
        const mime = ext === ".jpg" ? "image/jpeg" : `image/${ext.slice(1)}`;
        att = { name, mime, kind: "image", data: `data:${mime};base64,${readFileSync(p).toString("base64")}` };
      } else {
        const cap = [".csv", ".tsv", ".txt"].includes(ext) ? 60 * 1024 * 1024 : 4 * 1024 * 1024;
        if (size > cap) throw new Error(`file too large (max ${Math.round(cap / 1024 / 1024)} MB)`);
        att = { name, mime: "text/plain", kind: "text", data: readFileSync(p, "utf8") };
      }
      pendingFiles = [...pendingFiles.filter((a) => a.name !== att.name), att];
      console.log(
        `${c.green("✓")} attached ${c.bold(name)} ${c.dim(`(${(size / 1024).toFixed(1)} KB — sends with your next message; e.g. "load this into schema TPCH")`)}`,
      );
      return true;
    } catch (e) {
      console.log(c.red(`attach failed: ${e instanceof Error ? e.message : String(e)}`));
      return false;
    }
  }

  /** File paths mentioned anywhere in a message (Claude Code behavior). */
  function pathsInLine(text: string): { token: string; path: string }[] {
    const tokens = text.match(/"[^"]+"|'[^']+'|\S+/g) ?? [];
    const out: { token: string; path: string }[] = [];
    for (const token of tokens) {
      const bare = token.replace(/^["']|["']$/g, "");
      if (!/^(\/|~\/|\.\.?\/)/.test(bare) || !/\.[a-z0-9]{1,8}$/i.test(bare)) continue;
      const path = expandPath(bare);
      if (existsSync(path) && statSync(path).isFile()) out.push({ token, path });
    }
    return out;
  }

  // Saved connection PROFILES (details only — never passwords). Reusing one
  // prompts for the password, so convenience never costs security.
  const connFile = join(dataDir, "cli-connections.json");
  type SavedConn = { name: string; host: string; port: number; user: string; schema?: string };
  let savedConns: SavedConn[] = [];
  try {
    savedConns = JSON.parse(readFileSync(connFile, "utf8")) as SavedConn[];
  } catch {
    /* first run */
  }
  const saveConnProfile = (p: SavedConn) => {
    savedConns = [p, ...savedConns.filter((x) => x.name !== p.name)].slice(0, 20);
    try {
      writeFileSync(connFile, JSON.stringify(savedConns, null, 2));
    } catch {
      /* best effort */
    }
  };

  // --db exa://… registers a connection up front.
  const dbUrl = flag(args, "--db");
  if (dbUrl) {
    const info = parseDbUrl(dbUrl);
    const name = flag(args, "--db-name") ?? `${info.user}@${info.host}`;
    db.register({ id: name, name, ...info });
    session.connectionId = name;
  }

  const banner = () =>
    console.log(
      "\n" +
        box(
          [
            `${c.green(c.bold("✳ Exa"))} ${c.dim("— Exasol Studio agent")}`,
            "",
            `${c.dim("model")}     ${model ?? c.yellow("none — /model to pick one")}`,
            `${c.dim("database")}  ${session.connectionId ?? c.dim("none — /connect")}`,
            `${c.dim("data")}      ${dataDir}`,
            ...(resumedTitle ? [`${c.dim("resumed")}   ${resumedTitle} ${c.dim(`(${session.messages.length} messages)`)}`] : []),
            "",
            c.dim("/ for commands · tab accepts · ↑ history · esc interrupts · paths auto-attach"),
          ],
          { accent: c.gray },
        ) +
        "\n",
    );
  banner();

  // ── per-turn renderer: spinner + streaming markdown + tool lines ──
  let turnRunning = false;
  const spinner = new Spinner();
  let md = new MarkdownStream();
  let usage: { inputTokens?: number; outputTokens?: number } = {};

  const attach = (s: Session) =>
    s.subscribe((e) => {
      switch (e.type) {
        case "text-delta":
          if (spinner.running) spinner.stop();
          md.feed(e.delta);
          break;
        case "tool-start":
          spinner.stop();
          md.flush();
          console.log(toolStartLine(e.name, e.args));
          break;
        case "tool-end":
          console.log(toolEndLine(e.ok, e.summary));
          if (turnRunning) spinner.start("Working");
          break;
        case "permission-ask": {
          spinner.stop();
          md.flush();
          void confirmDialog({
            title: `Permission · ${e.summary}`,
            message: e.detail,
            confirmLabel: "Allow",
            cancelLabel: "Deny",
          }).then((ok) => {
            s.answerPermission(e.id, ok);
            console.log(ok ? c.dim("  ✓ allowed") : c.dim("  ✗ denied"));
            if (turnRunning) spinner.start("Working");
          });
          break;
        }
        case "ui-request":
          s.answerUi(e.id, false, "UI actions are not available in the CLI");
          break;
        case "message-done":
          if (e.usage) usage = e.usage;
          md.flush();
          break;
        case "compacted":
          console.log(c.dim(`(context compacted: ${e.folded} messages folded)`));
          break;
        case "error":
          spinner.stop();
          md.flush();
          console.log(c.red(`\n${e.message}`));
          break;
        default:
          break;
      }
    });
  let detach = attach(session);

  async function pickModel() {
    const items = await modelItems(registry);
    if (!items.length) {
      console.log(c.yellow("No models available — configure a provider in Exasol Studio (AI Settings) or start Ollama."));
      return;
    }
    const picked = await selectList<string>({ title: "Select model", items, placeholder: "Search models…" });
    if (picked) {
      model = picked;
      console.log(`${c.green("✓")} model set to ${c.bold(picked)}`);
    }
  }

  async function connectGuided(urlArg?: string, nameArg?: string) {
    // Field values persist across the whole flow, so going BACK (esc) to fix
    // a field — or retrying after a failed connect — never retypes anything.
    const values: string[] = ["localhost", "8563", "sys", "", "", ""];
    const steps: { label: string; mask?: boolean; placeholder?: string }[] = [
      { label: "Host" },
      { label: "Port" },
      { label: "Username" },
      { label: "Password", mask: true, placeholder: "•••" },
      { label: "Schema (optional)", placeholder: "leave empty for session default" },
      { label: "Connection name" },
    ];

    for (;;) {
      let info: ReturnType<typeof parseDbUrl>;
      let name: string;
      if (urlArg) {
        info = parseDbUrl(urlArg);
        name = nameArg ?? `${info.user}@${info.host}`;
      } else {
        let i = 0;
        while (i < steps.length) {
          // Name suggests itself from what's already filled in.
          if (i === 5 && !values[5]) values[5] = `${values[2] || "sys"}@${values[0] || "localhost"}`;
          const res = await textInput({
            ...steps[i],
            initial: values[i],
            allowBack: i > 0,
            step: `${i + 1}/${steps.length}`,
          });
          if (res === null) return; // cancelled on the first field
          if (res === BACK) {
            i = Math.max(0, i - 1);
            continue;
          }
          values[i] = res;
          i++;
        }
        info = {
          host: values[0] || "localhost",
          port: Number(values[1]) || 8563,
          user: values[2] || "sys",
          password: values[3] ?? "",
          schema: values[4] || undefined,
        };
        name = values[5] || `${info.user}@${info.host}`;
      }

      db.register({ id: name, name, ...info });
      session.connectionId = name;
      spinner.start("Connecting");
      try {
        const out = await db.query(name, "SELECT CURRENT_TIMESTAMP");
        spinner.stop();
        console.log(`${c.green("✓")} connected as ${c.bold(name)} ${c.dim(`(server time ${String(out.rows[0]?.[0] ?? "?")})`)}`);
        // Profile saved for next run (details only, never the password).
        saveConnProfile({ name, host: info.host, port: info.port, user: info.user, schema: info.schema });
        return;
      } catch (e) {
        spinner.stop();
        console.log(c.red(`connect failed: ${e instanceof Error ? e.message : String(e)}`));
        session.connectionId = null;
        if (urlArg) return; // URL mode has nothing to edit interactively
        const retry = await confirmDialog({
          title: "Connection failed",
          message: "Edit the details and try again? Your entries are kept.",
          confirmLabel: "Edit & retry",
          cancelLabel: "Cancel",
        });
        if (!retry) return;
        // Loop continues → form reopens with everything still filled in.
      }
    }
  }

  for (;;) {
    console.log(inputTop());
    const line = (await lineInput({ history, commands: COMMANDS }))?.trim() ?? null;
    if (line === null) break; // EOF / ctrl-d
    console.log(inputBottom());
    if (!line) continue;
    remember(line); // every submitted line is recallable with ↑ — commands too

    if (line === "/quit" || line === "/exit") break;
    if (line === "/help") {
      console.log(box(HELP_LINES, { title: "Commands" }));
      continue;
    }
    if (line === "/clear") {
      process.stdout.write("\x1b[2J\x1b[H");
      banner();
      continue;
    }
    if (line === "/models") {
      if (process.stdin.isTTY) await pickModel();
      else await printModels(registry);
      continue;
    }
    if (line.startsWith("/model")) {
      const ref = line.slice(6).trim();
      if (ref) {
        model = ref;
        console.log(`${c.green("✓")} model set to ${c.bold(ref)}`);
      } else {
        await pickModel();
      }
      continue;
    }
    if (line === "/undo") {
      console.log(
        session.undoLastExchange()
          ? c.dim("(rewound one exchange — the next message continues from the earlier state; anything already executed stays executed)")
          : c.dim("Nothing to undo yet."),
      );
      continue;
    }
    if (line === "/new") {
      const keepConn = session.connectionId;
      detach();
      session = sessions.create();
      detach = attach(session);
      session.connectionId = keepConn; // connections outlive chats
      console.log(c.dim("(new chat)"));
      continue;
    }
    if (line.startsWith("/attach")) {
      const raw = line.slice(7).trim();
      if (!raw) {
        console.log(c.dim("usage: /attach <path> — or just paste/type a file path, that works too"));
        continue;
      }
      attachFile(raw);
      continue;
    }
    if (line === "/resume" || line === "/sessions") {
      const metas = sessions
        .list()
        .filter((m) => m.id !== session.id)
        .slice(0, 20);
      if (!metas.length) {
        console.log(c.dim("No previous chats."));
        continue;
      }
      const picked = await selectList<string>({
        title: "Resume chat",
        items: metas.map((m) => ({
          label: m.title,
          hint: `${relTime(m.updatedAt)} · ${m.messageCount} msgs`,
          value: m.id,
        })),
        placeholder: "Search chats…",
      });
      if (picked) {
        const revived = sessions.get(picked); // folds in crash-recovered work too
        if (revived) {
          const keepConn = session.connectionId;
          detach();
          session = revived;
          detach = attach(session);
          session.connectionId ??= keepConn;
          console.log(c.dim(`(resumed "${session.title}" — ${session.messages.length} messages of context)`));
        }
      }
      continue;
    }
    if (line === "/connections" || line === "/conns") {
      const live = db.list();
      const saved = savedConns.filter((s) => !live.some((l) => l.id === s.name));
      if (!live.length && !saved.length) {
        console.log(c.dim("No connections yet — /connect to add one."));
        continue;
      }
      const items: SelectItem<string>[] = [
        ...live.map((cn) => ({
          label: cn.name,
          hint: cn.id === session.connectionId ? "active" : "connected",
          group: "This session",
          value: `live:${cn.id}`,
        })),
        ...saved.map((s) => ({
          label: s.name,
          hint: `${s.user}@${s.host}:${s.port} — password required`,
          group: "Saved profiles",
          value: `saved:${s.name}`,
        })),
        { label: "+ Add a new connection…", value: "__add__" },
      ];
      const picked = await selectList<string>({ title: "Agent connection", items, placeholder: "Search connections…" });
      if (picked === "__add__") {
        await connectGuided();
      } else if (picked?.startsWith("live:")) {
        const id = picked.slice(5);
        session.connectionId = id;
        console.log(`${c.green("✓")} agent now uses ${c.bold(live.find((x) => x.id === id)?.name ?? id)}`);
      } else if (picked?.startsWith("saved:")) {
        const prof = savedConns.find((s) => s.name === picked.slice(6));
        if (prof) {
          const pw = await textInput({ label: `Password for ${prof.user}@${prof.host}`, mask: true });
          if (pw !== null && pw !== BACK) {
            db.register({ id: prof.name, name: prof.name, host: prof.host, port: prof.port, user: prof.user, password: pw, schema: prof.schema });
            session.connectionId = prof.name;
            spinner.start("Connecting");
            try {
              await db.query(prof.name, "SELECT 1");
              spinner.stop();
              console.log(`${c.green("✓")} agent now uses ${c.bold(prof.name)}`);
            } catch (e) {
              spinner.stop();
              console.log(c.red(`connect failed: ${e instanceof Error ? e.message : String(e)}`));
              session.connectionId = null;
            }
          }
        }
      }
      continue;
    }
    if (line === "/connect" || line.startsWith("/connect ")) {
      const rest = line.slice(8).trim().split(/\s+/).filter(Boolean);
      await connectGuided(rest[0], rest[1]);
      continue;
    }

    // Claude Code behavior: file paths typed or pasted anywhere in a message
    // attach automatically — "/attach" is just the explicit spelling.
    const mentioned = pathsInLine(line);
    if (mentioned.length) {
      for (const m of mentioned) attachFile(m.path);
      // Message consisted ONLY of path(s) → stage and wait for instructions.
      const residue = mentioned.reduce((acc, m) => acc.replace(m.token, " "), line).replace(/["'\s]+/g, "");
      if (!residue) {
        console.log(c.dim("  (tell me what to do with it — e.g. “load this into schema TPCH”)"));
        continue;
      }
    }

    if (!model) {
      await pickModel();
      if (!model) continue;
    }

    md = new MarkdownStream();
    usage = {};
    const started = Date.now();
    turnRunning = true;
    // Esc interrupts the running turn (unless a dialog is on top of the stack).
    const popEsc = pushKeys((_str, key) => {
      if (key.name === "escape") session.abort?.abort();
    });
    const sending = pendingFiles;
    pendingFiles = [];
    if (sending.length) console.log(c.dim(`  📎 sending ${sending.map((a) => a.name).join(", ")}`));
    spinner.start("Thinking");
    try {
      await runTurn({
        session, registry, db, memory, kb,
        store: sessions, config, dashboards, artifacts, skills, documents,
        modelRef: model,
        userText: line,
        attachments: sending.length ? sending : undefined,
        surface: "cli",
      });
    } catch (e) {
      console.log(c.red(`turn failed: ${e instanceof Error ? e.message : String(e)}`));
    } finally {
      popEsc();
      turnRunning = false;
      spinner.stop();
      md.flush();
    }
    console.log(turnFooter({ model, ms: Date.now() - started, input: usage.inputTokens, output: usage.outputTokens }) + "\n");
  }

  detach();
  restoreTerm();
  process.exit(0);
}

async function main() {
  const args = process.argv.slice(2);
  const dataDir = flag(args, "--data-dir") ?? defaultDataDir();
  // A subcommand must come first; everything else is flags.
  const cmd = args[0] && !args[0].startsWith("--") ? args[0] : undefined;

  if (cmd === "serve") {
    const config = new ConfigStore(dataDir);
    initLog(dataDir);
    const { port, token } = await startServer(config);
    process.stdout.write(JSON.stringify({ event: "ready", port, token }) + "\n");
    process.stdin.resume();
    process.stdin.on("end", () => process.exit(0));
    return;
  }
  if (cmd === "models") {
    const config = new ConfigStore(dataDir);
    initLog(dataDir, { stderrMin: "warn" });
    await printModels(new ProviderRegistry(config));
    return;
  }
  if (cmd && cmd !== "chat") {
    console.error(`unknown command "${cmd}" — try: exa-agent [chat|models|serve]`);
    process.exit(2);
  }
  await interactive(dataDir, args);
}

main().catch((e) => {
  console.error(`fatal: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
  restoreTerm();
  process.exit(1);
});

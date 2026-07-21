import { spawn } from "node:child_process";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { log } from "./log.ts";

/**
 * exapump delegation — the production bulk path (native IMPORT via HTTP
 * transport, server-side CSV engine). Used ONLY when the binary exists AND its
 * `upload --help` confirms the flags we need; anything else falls back to the
 * transactional insert path. No guessed CLI invocations, ever.
 */

const CANDIDATES = [
  join(homedir(), ".local/bin/exapump"),
  join(homedir(), "Library/Application Support/com.exasol.studio/market/bin/exapump"),
  "/opt/homebrew/bin/exapump",
];

export async function findExapump(): Promise<string | null> {
  for (const p of CANDIDATES) {
    try {
      await access(p);
      return p;
    } catch {
      /* next */
    }
  }
  return null;
}

function run(bin: string, args: string[], timeoutMs = 300_000): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stdout.on("data", (d) => (out += String(d)));
    child.stderr.on("data", (d) => (out += String(d)));
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, out });
    });
    child.on("error", () => {
      clearTimeout(timer);
      resolve({ code: 127, out });
    });
  });
}

export type ExapumpTarget = {
  host: string;
  port: number;
  user: string;
  password: string;
  schema: string;
  table: string;
};

/**
 * Try loading csvText via exapump. Returns rows inserted, or null when the
 * binary is absent / its CLI doesn't match the verified surface / the run
 * fails — callers fall back to the insert path.
 */
export async function exapumpLoad(csvText: string, target: ExapumpTarget): Promise<number | null> {
  const bin = await findExapump();
  if (!bin) return null;
  // Verify the CLI surface instead of assuming it.
  const help = await run(bin, ["upload", "--help"], 10_000);
  const h = help.out;
  const hasTable = /--table\b/.test(h);
  const hasDsn = /--dsn\b/.test(h);
  const hasHostUser = /--host\b/.test(h) && /--user\b/.test(h) && /--password\b/.test(h);
  if (help.code !== 0 || !hasTable || (!hasDsn && !hasHostUser)) {
    log.info("exapump present but CLI surface unrecognized — using insert path", { bin });
    return null;
  }
  const dir = await mkdtemp(join(tmpdir(), "exa-load-"));
  const file = join(dir, `${target.table.toLowerCase()}.csv`);
  try {
    await writeFile(file, csvText, "utf8");
    const args = ["upload", file, "--table", `${target.schema}.${target.table}`];
    if (hasDsn) {
      args.push("--dsn", `exa://${target.user}:${target.password}@${target.host}:${target.port}`);
    } else {
      args.push("--host", target.host, "--port", String(target.port), "--user", target.user, "--password", target.password);
    }
    const res = await run(bin, args);
    if (res.code !== 0) {
      log.warn("exapump load failed — falling back to inserts", { code: res.code, tail: res.out.slice(-300) });
      return null;
    }
    const m = /([\d,]+)\s+rows?/i.exec(res.out);
    return m ? Number(m[1].replace(/,/g, "")) : 0;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

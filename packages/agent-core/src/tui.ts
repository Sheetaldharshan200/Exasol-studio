/**
 * Terminal UI primitives for the exa-agent CLI — the same visual vocabulary
 * as Claude Code (Ink/React) and opencode (Bubble Tea), hand-rolled on ANSI
 * so the bundle stays zero-dep: bordered input box, streaming markdown,
 * ⏺ tool lines with ⎿ results, a working spinner, and boxed dialogs.
 */

const tty = process.stdout.isTTY === true;

// ── colors ──────────────────────────────────────────────────────────────────
const wrap = (open: string, close: string) => (s: string) => (tty ? `\x1b[${open}m${s}\x1b[${close}m` : s);
export const c = {
  dim: wrap("2", "22"),
  bold: wrap("1", "22"),
  italic: wrap("3", "23"),
  green: wrap("32", "39"),
  red: wrap("31", "39"),
  yellow: wrap("33", "39"),
  cyan: wrap("36", "39"),
  magenta: wrap("35", "39"),
  gray: wrap("90", "39"),
  inverse: wrap("7", "27"),
};

export function cols(): number {
  return Math.max(40, Math.min(process.stdout.columns || 100, 120));
}

/** Strip ANSI for width math. */
function width(s: string): number {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, "").length;
}

// ── boxes ───────────────────────────────────────────────────────────────────
export function box(lines: string[], opts: { title?: string; accent?: (s: string) => string } = {}): string {
  const paint = opts.accent ?? c.gray;
  const w = cols();
  const inner = w - 4;
  const top = opts.title
    ? paint("╭─ ") + c.bold(opts.title) + paint(" " + "─".repeat(Math.max(0, inner - width(opts.title) - 2)) + "╮")
    : paint("╭" + "─".repeat(w - 2) + "╮");
  const body = lines
    .flatMap((l) => wrapLine(l, inner))
    .map((l) => paint("│ ") + l + " ".repeat(Math.max(0, inner - width(l))) + paint(" │"));
  const bottom = paint("╰" + "─".repeat(w - 2) + "╯");
  return [top, ...body, bottom].join("\n");
}

function wrapLine(line: string, max: number): string[] {
  if (width(line) <= max) return [line];
  // Naive wrap on spaces; ANSI-heavy lines just get hard-cut chunks.
  const out: string[] = [];
  let cur = "";
  for (const word of line.split(" ")) {
    if (cur && width(cur) + 1 + width(word) > max) {
      out.push(cur);
      cur = word;
    } else {
      cur = cur ? `${cur} ${word}` : word;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/** Top border of the input box (the live line renders as `│ ❯ …`). */
export function inputTop(): string {
  return c.gray("╭" + "─".repeat(cols() - 2));
}
export function inputBottom(): string {
  return c.gray("╰" + "─".repeat(cols() - 2));
}
export const INPUT_PROMPT = () => c.gray("│ ") + c.green(c.bold("❯ "));

// ── spinner ─────────────────────────────────────────────────────────────────
const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export class Spinner {
  private timer: ReturnType<typeof setInterval> | null = null;
  private frame = 0;
  private startedAt = 0;
  private label = "Thinking";

  start(label = "Thinking") {
    if (!tty) return;
    this.label = label;
    this.startedAt = Date.now();
    if (this.timer) return;
    this.timer = setInterval(() => this.draw(), 90);
    this.draw();
  }

  private draw() {
    const secs = Math.floor((Date.now() - this.startedAt) / 1000);
    const f = FRAMES[(this.frame = (this.frame + 1) % FRAMES.length)];
    process.stdout.write(`\r\x1b[2K${c.magenta(f)} ${c.dim(`${this.label}… ${secs}s (esc to interrupt)`)}`);
  }

  /** Stop and clear the spinner line so real output can take its place. */
  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (tty) process.stdout.write("\r\x1b[2K");
  }

  get running(): boolean {
    return this.timer !== null;
  }
}

// ── streaming markdown ──────────────────────────────────────────────────────
/** Does this block look like a tool call the model wrote as text? */
function isToolCallBlock(lines: string[]): boolean {
  const joined = lines.join("\n").trim();
  return joined.startsWith("{") && /"(name|tool|function|tool_name)"\s*:\s*"/.test(joined);
}

/** Net brace depth of a line — good enough for model-emitted JSON. */
function braceDelta(line: string): number {
  let d = 0;
  for (const ch of line) {
    if (ch === "{") d++;
    else if (ch === "}") d--;
  }
  return d;
}

/**
 * Line-buffered markdown for streamed deltas: complete lines render styled,
 * the trailing partial line renders on flush. Handles fenced code (colored +
 * indented), headers, bullets, bold/italic/inline code. Fenced or bare JSON
 * blocks that are TOOL CALLS written as text are suppressed entirely — the
 * ⏺ tool line from the rescue is the real record; the raw JSON is noise.
 */
export class MarkdownStream {
  private buf = "";
  private inFence = false; // passthrough mode for oversized fences
  private fenceLang = "";
  private fenceBuf: string[] | null = null;
  private braceBuf: string[] | null = null;
  private braceDepth = 0;

  feed(delta: string) {
    this.buf += delta;
    let nl: number;
    while ((nl = this.buf.indexOf("\n")) !== -1) {
      const line = this.buf.slice(0, nl);
      this.buf = this.buf.slice(nl + 1);
      this.handleLine(line);
    }
  }

  flush() {
    if (this.buf) {
      this.handleLine(this.buf);
      this.buf = "";
    }
    // Unclosed buffered blocks at end of message: decide and print/drop.
    if (this.fenceBuf) {
      const block = this.fenceBuf;
      this.fenceBuf = null;
      if (!isToolCallBlock(block)) this.printFence(block, true);
    }
    if (this.braceBuf) {
      const block = this.braceBuf;
      this.braceBuf = null;
      if (!isToolCallBlock(block)) for (const l of block) process.stdout.write(this.styleLine(l) + "\n");
    }
    this.inFence = false;
  }

  private handleLine(line: string) {
    // Inside a buffered fence — collect until it closes, then judge it.
    if (this.fenceBuf !== null) {
      if (/^\s*```/.test(line)) {
        const block = this.fenceBuf;
        this.fenceBuf = null;
        if (!isToolCallBlock(block)) this.printFence(block, true);
        return;
      }
      this.fenceBuf.push(line);
      if (this.fenceBuf.length > 60) {
        // Too big to hold (artifact HTML etc.) — stream it from here on.
        this.printFence(this.fenceBuf, false);
        this.fenceBuf = null;
        this.inFence = true;
      }
      return;
    }
    if (this.inFence) {
      if (/^\s*```/.test(line)) {
        this.inFence = false;
        process.stdout.write(c.dim("  └") + "\n");
      } else {
        process.stdout.write(c.dim("  │ ") + c.cyan(line) + "\n");
      }
      return;
    }
    const fence = line.match(/^\s*```(\w*)/);
    if (fence) {
      this.fenceLang = fence[1];
      this.fenceBuf = [];
      return;
    }
    // Bare multi-line JSON object — buffer until braces balance, then judge.
    if (this.braceBuf !== null) {
      this.braceBuf.push(line);
      this.braceDepth += braceDelta(line);
      if (this.braceDepth <= 0) {
        const block = this.braceBuf;
        this.braceBuf = null;
        if (!isToolCallBlock(block)) for (const l of block) process.stdout.write(this.styleLine(l) + "\n");
      } else if (this.braceBuf.length > 30) {
        for (const l of this.braceBuf) process.stdout.write(this.styleLine(l) + "\n");
        this.braceBuf = null;
      }
      return;
    }
    const t = line.trim();
    if (t.startsWith("{")) {
      const d = braceDelta(line);
      if (d > 0) {
        this.braceBuf = [line];
        this.braceDepth = d;
        return;
      }
      if (isToolCallBlock([line])) return; // single-line text tool call → drop
    }
    process.stdout.write(this.styleLine(line) + "\n");
  }

  private printFence(lines: string[], close: boolean) {
    process.stdout.write(c.dim(this.fenceLang ? `  ┌ ${this.fenceLang}` : "  ┌") + "\n");
    for (const l of lines) process.stdout.write(c.dim("  │ ") + c.cyan(l) + "\n");
    if (close) process.stdout.write(c.dim("  └") + "\n");
  }

  private styleLine(line: string): string {
    const h = line.match(/^(#{1,4})\s+(.*)/);
    if (h) return c.bold(h[1].length <= 2 ? h[2].toUpperCase() : h[2]);
    let out = line.replace(/^(\s*)[-*]\s+/, (_, sp: string) => `${sp}${c.dim("•")} `);
    out = out.replace(/\*\*([^*]+)\*\*/g, (_, t: string) => c.bold(t));
    out = out.replace(/(^|[^*])\*([^*]+)\*/g, (_, pre: string, t: string) => pre + c.italic(t));
    out = out.replace(/`([^`]+)`/g, (_, t: string) => c.cyan(t));
    return out;
  }
}

// ── tool lines (Claude Code style: ⏺ call, ⎿ result) ────────────────────────
export function toolStartLine(name: string, args: unknown): string {
  let compact = "";
  try {
    const o = (args ?? {}) as Record<string, unknown>;
    compact = Object.entries(o)
      .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
      .join(", ");
  } catch {
    compact = "";
  }
  if (width(compact) > 90) compact = compact.slice(0, 90) + "…";
  return `${c.green("⏺")} ${c.bold(name)}${compact ? c.dim(`(${compact})`) : "()"}`;
}

export function toolEndLine(ok: boolean, summary?: string): string {
  const mark = ok ? c.green("✓") : c.red("✗");
  return `  ${c.dim("⎿")} ${mark}${summary ? ` ${c.dim(summary.length > 100 ? summary.slice(0, 100) + "…" : summary)}` : ""}`;
}

/** Footer after a turn: model · duration · tokens. */
export function turnFooter(parts: { model: string; ms: number; input?: number; output?: number }): string {
  const bits = [parts.model, `${(parts.ms / 1000).toFixed(1)}s`];
  if (parts.input || parts.output) bits.push(`↑${fmtTok(parts.input)} ↓${fmtTok(parts.output)} tokens`);
  return c.dim("  " + bits.join(" · "));
}

function fmtTok(n?: number): string {
  if (!n) return "0";
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

// ── interactive widgets (opencode's DialogSelect / DialogConfirm patterns) ──
// A single raw-mode keypress pipeline with a handler STACK: the top handler
// owns the keyboard (a permission select over a running turn beats the
// turn's esc-interrupt), exactly like opencode's dialog stack.

import { emitKeypressEvents } from "node:readline";

export type Key = { name?: string; ctrl?: boolean; meta?: boolean; shift?: boolean; sequence?: string };
type KeyHandler = (str: string | undefined, key: Key) => void;

const keyStack: KeyHandler[] = [];
let keysReady = false;

export function initKeys() {
  if (keysReady) return;
  keysReady = true;
  emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on("keypress", (str: string | undefined, key: Key) => {
    // Ctrl-C always wins — restore the terminal and leave.
    if (key?.ctrl && key.name === "c") {
      restoreTerm();
      process.exit(130);
    }
    keyStack[keyStack.length - 1]?.(str, key ?? {});
  });
}

export function pushKeys(h: KeyHandler): () => void {
  keyStack.push(h);
  return () => {
    const i = keyStack.lastIndexOf(h);
    if (i >= 0) keyStack.splice(i, 1);
  };
}

export function restoreTerm() {
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  process.stdout.write("\x1b[?25h"); // cursor back on
}

/** Buffered line reader for non-TTY stdin (piped scripts keep working). */
let pipeBuf = "";
let pipeEnded = false;
const pipeWaiters: ((line: string | null) => void)[] = [];
function initPipe() {
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk: string) => {
    pipeBuf += chunk;
    drainPipe();
  });
  process.stdin.on("end", () => {
    pipeEnded = true;
    drainPipe();
  });
}
function drainPipe() {
  for (;;) {
    const waiter = pipeWaiters[0];
    if (!waiter) return;
    const nl = pipeBuf.indexOf("\n");
    if (nl === -1) {
      if (pipeEnded) {
        pipeWaiters.shift();
        waiter(pipeBuf.length ? pipeBuf : null);
        pipeBuf = "";
        continue;
      }
      return;
    }
    pipeWaiters.shift();
    waiter(pipeBuf.slice(0, nl));
    pipeBuf = pipeBuf.slice(nl + 1);
  }
}
function pipeLine(): Promise<string | null> {
  return new Promise((resolve) => {
    pipeWaiters.push(resolve);
    drainPipe();
  });
}

let pipeInit = false;
function ensurePipe() {
  if (!pipeInit) {
    pipeInit = true;
    initPipe();
  }
}

/** Repaint-in-place helper: rewinds over the previously drawn block. */
class Region {
  private lines = 0;
  draw(next: string[]) {
    if (this.lines > 0) process.stdout.write(`\x1b[${this.lines}A`);
    for (const l of next) process.stdout.write(`\x1b[2K${l}\n`);
    // Shrink: wipe leftover rows from the previous frame.
    const extra = this.lines - next.length;
    if (extra > 0) {
      for (let i = 0; i < extra; i++) process.stdout.write("\x1b[2K\n");
      process.stdout.write(`\x1b[${extra}A`);
    }
    this.lines = next.length;
  }
  clear() {
    this.draw([]);
  }
}

export type SelectItem<T> = { label: string; value: T; hint?: string; group?: string; disabled?: boolean };

type SelectOpts<T> = {
  title: string;
  items: SelectItem<T>[];
  placeholder?: string;
  /** Pre-checked values (multi-select only). */
  checked?: T[];
};

const VIEW_ROWS = 12;

function fuzzyMatch(hay: string, needle: string): boolean {
  const h = hay.toLowerCase();
  const n = needle.toLowerCase();
  if (h.includes(n)) return true;
  // Subsequence match ("qw3" hits "qwen3").
  let i = 0;
  for (const ch of h) if (ch === n[i]) i++;
  return i >= n.length;
}

/** Single choice — opencode DialogSelect: filter, groups, highlight, esc. */
export function selectList<T>(opts: SelectOpts<T>): Promise<T | null> {
  return runList(opts, false).then((r) => (r === null ? null : (r as T[])[0] ?? null));
}

/** Multi choice with checkboxes — space toggles, enter confirms. */
export function multiSelect<T>(opts: SelectOpts<T>): Promise<T[] | null> {
  return runList(opts, true) as Promise<T[] | null>;
}

async function runList<T>(opts: SelectOpts<T>, multi: boolean): Promise<T[] | null> {
  if (!process.stdin.isTTY) {
    // Piped mode: numbered list + a line with the number(s).
    ensurePipe();
    opts.items.forEach((it, i) => console.log(`${i + 1}. ${it.label}${it.hint ? ` (${it.hint})` : ""}`));
    const line = await pipeLine();
    if (line === null) return null;
    const picks = line
      .split(/[\s,]+/)
      .map((s) => Number(s) - 1)
      .filter((i) => i >= 0 && i < opts.items.length);
    return picks.length ? picks.map((i) => opts.items[i].value) : null;
  }

  return new Promise((resolve) => {
    const region = new Region();
    let filter = "";
    let cursor = 0;
    let scroll = 0;
    const checked = new Set<number>(
      (opts.checked ?? []).map((v) => opts.items.findIndex((it) => it.value === v)).filter((i) => i >= 0),
    );
    process.stdout.write("\x1b[?25l");

    const visible = () => opts.items.filter((it) => !filter || fuzzyMatch(`${it.label} ${it.hint ?? ""}`, filter));

    const render = () => {
      const items = visible();
      if (cursor >= items.length) cursor = Math.max(0, items.length - 1);
      if (cursor < scroll) scroll = cursor;
      if (cursor >= scroll + VIEW_ROWS) scroll = cursor - VIEW_ROWS + 1;
      const w = cols();
      const lines: string[] = [];
      lines.push(`${c.bold(opts.title)}${" ".repeat(Math.max(1, w - opts.title.length - 5))}${c.dim("esc")}`);
      lines.push(
        filter
          ? `  ${c.green("❯")} ${filter}${c.dim("▌")}`
          : `  ${c.green("❯")} ${c.dim(opts.placeholder ?? "Type to search…")}`,
      );
      if (!items.length) lines.push(c.dim("  No results found"));
      let lastGroup: string | undefined;
      items.slice(scroll, scroll + VIEW_ROWS).forEach((it, vi) => {
        const i = scroll + vi;
        if (it.group && it.group !== lastGroup && !filter) {
          lines.push(c.dim(`  ${it.group}`));
          lastGroup = it.group;
        }
        const idx = opts.items.indexOf(it);
        const box = multi ? (checked.has(idx) ? c.green("◉ ") : c.dim("○ ")) : "";
        const hint = it.hint ? ` ${c.dim(it.hint)}` : "";
        const row = `${box}${it.label}${hint}`;
        lines.push(i === cursor ? `${c.green("│")} ${c.inverse(` ${row} `)}` : `  ${row} `);
      });
      if (items.length > VIEW_ROWS) lines.push(c.dim(`  ${cursor + 1}/${items.length}`));
      lines.push(c.dim(multi ? "  space toggle · enter confirm · esc cancel" : "  ↑↓ move · enter select · esc cancel"));
      region.draw(lines);
    };

    const finish = (out: T[] | null) => {
      pop();
      region.clear();
      process.stdout.write("\x1b[?25h");
      resolve(out);
    };

    const pop = pushKeys((str, key) => {
      const items = visible();
      switch (key.name) {
        case "escape":
          return finish(null);
        case "return":
          if (multi) {
            const out = [...checked].map((i) => opts.items[i].value);
            return finish(out);
          }
          return items[cursor] ? finish([items[cursor].value]) : finish(null);
        case "up":
          cursor = Math.max(0, cursor - 1);
          return render();
        case "down":
          cursor = Math.min(items.length - 1, cursor + 1);
          return render();
        case "pageup":
          cursor = Math.max(0, cursor - 10);
          return render();
        case "pagedown":
          cursor = Math.min(items.length - 1, cursor + 10);
          return render();
        case "home":
          cursor = 0;
          return render();
        case "end":
          cursor = Math.max(0, items.length - 1);
          return render();
        case "backspace":
          filter = filter.slice(0, -1);
          cursor = 0;
          return render();
        case "space":
          if (multi) {
            const it = items[cursor];
            if (it) {
              const idx = opts.items.indexOf(it);
              checked.has(idx) ? checked.delete(idx) : checked.add(idx);
            }
            return render();
          }
          filter += " ";
          return render();
        default:
          if (str && !key.ctrl && !key.meta && str >= " ") {
            filter += str;
            cursor = 0;
          }
          return render();
      }
    });
    render();
  });
}

/** Two-button confirm — opencode DialogConfirm: ←/→ switch, enter fires. */
export async function confirmDialog(opts: {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
}): Promise<boolean> {
  if (!process.stdin.isTTY) {
    ensurePipe();
    console.log(`${opts.title}\n${opts.message}\n(y/N)`);
    const line = await pipeLine();
    return /^y(es)?$/i.test((line ?? "").trim());
  }
  return new Promise((resolve) => {
    const region = new Region();
    let active: "confirm" | "cancel" = "cancel"; // safe default
    process.stdout.write("\x1b[?25l");
    const render = () => {
      const yes = opts.confirmLabel ?? "Allow";
      const no = opts.cancelLabel ?? "Deny";
      const btn = (label: string, on: boolean) => (on ? c.inverse(c.bold(` ${label} `)) : c.dim(` ${label} `));
      const w = cols();
      region.draw([
        `${c.bold(opts.title)}${" ".repeat(Math.max(1, w - opts.title.length - 5))}${c.dim("esc")}`,
        ...opts.message.split("\n").map((l) => c.dim(`  ${l.length > w - 4 ? l.slice(0, w - 5) + "…" : l}`)),
        "",
        `  ${btn(no, active === "cancel")}  ${btn(yes, active === "confirm")}   ${c.dim("←→ · enter")}`,
      ]);
    };
    const finish = (ok: boolean) => {
      pop();
      region.clear();
      process.stdout.write("\x1b[?25h");
      resolve(ok);
    };
    const pop = pushKeys((_str, key) => {
      switch (key.name) {
        case "left":
        case "right":
        case "tab":
          active = active === "confirm" ? "cancel" : "confirm";
          return render();
        case "return":
          return finish(active === "confirm");
        case "escape":
          return finish(false);
        case "y":
          return finish(true);
        case "n":
          return finish(false);
      }
    });
    render();
  });
}

/** Sentinel returned by textInput when the user steps BACK in a form. */
export const BACK: unique symbol = Symbol("back");

/** Single-field input box (optionally masked) — for connect forms. */
export async function textInput(opts: {
  label: string;
  initial?: string;
  placeholder?: string;
  mask?: boolean;
  /** Form context: esc (or shift-tab) goes BACK to the previous field. */
  allowBack?: boolean;
  /** Progress hint, e.g. "2/6". */
  step?: string;
}): Promise<string | null | typeof BACK> {
  if (!process.stdin.isTTY) {
    ensurePipe();
    console.log(`${opts.label}:`);
    return pipeLine();
  }
  return new Promise((resolve) => {
    const region = new Region();
    let value = opts.initial ?? "";
    let pos = value.length;
    let parked = false; // cursor sits ON the edit line between renders
    const hint = opts.allowBack ? "enter next · esc back" : "enter ok · esc cancel";
    const render = () => {
      if (parked) process.stdout.write("\x1b[2B\r"); // back below the block first
      const shown = opts.mask ? "•".repeat(value.length) : value;
      const body = shown || (pos === 0 && opts.placeholder ? c.dim(opts.placeholder) : "");
      region.draw([
        `${c.dim(opts.label)}${opts.step ? c.dim(`  ${opts.step}`) : ""}`,
        `${c.gray("│")} ${c.green("❯")} ${body}`,
        c.dim(`  ${hint}`),
      ]);
      // Park the real cursor right after the edit position (1 hint line below).
      process.stdout.write(`\x1b[2A\r\x1b[${4 + pos}C`);
      process.stdout.write("\x1b[?25h");
      parked = true;
    };
    const finish = (out: string | null | typeof BACK) => {
      pop();
      if (parked) process.stdout.write("\x1b[2B\r");
      region.clear();
      resolve(out);
    };
    const pop = pushKeys((str, key) => {
      if (key.name === "tab" && key.shift && opts.allowBack) return finish(BACK);
      switch (key.name) {
        case "return":
          return finish(value);
        case "escape":
          return finish(opts.allowBack ? BACK : null);
        case "backspace":
          if (pos > 0) {
            value = value.slice(0, pos - 1) + value.slice(pos);
            pos--;
          }
          return render();
        case "delete":
          value = value.slice(0, pos) + value.slice(pos + 1);
          return render();
        case "left":
          pos = Math.max(0, pos - 1);
          return render();
        case "right":
          pos = Math.min(value.length, pos + 1);
          return render();
        case "home":
          pos = 0;
          return render();
        case "end":
          pos = value.length;
          return render();
        default:
          if (key.ctrl && key.name === "a") { pos = 0; return render(); }
          if (key.ctrl && key.name === "e") { pos = value.length; return render(); }
          if (key.ctrl && key.name === "u") { value = ""; pos = 0; return render(); }
          if (str && !key.ctrl && !key.meta && str >= " ") {
            value = value.slice(0, pos) + str + value.slice(pos);
            pos += str.length;
          }
          return render();
      }
    });
    render();
  });
}

/**
 * The main prompt: an owned line editor (no readline) with history,
 * cursor movement, and LIVE slash-command suggestions under the input —
 * ↑↓ walks suggestions when visible (history otherwise), tab accepts.
 */
export async function lineInput(opts: {
  history: string[];
  commands: { cmd: string; desc: string }[];
}): Promise<string | null> {
  if (!process.stdin.isTTY) {
    ensurePipe();
    return pipeLine();
  }
  return new Promise((resolve) => {
    let value = "";
    let pos = 0;
    let histIdx = -1; // -1 = editing a fresh line
    let stash = "";
    let sugIdx = 0;
    let lastSugCount = 0;

    const suggestions = () =>
      value.startsWith("/") && !value.includes(" ")
        ? opts.commands.filter((x) => x.cmd.startsWith(value)).slice(0, 6)
        : [];

    const render = () => {
      const w = cols();
      const promptW = 4; // "│ ❯ "
      // Horizontal scroll window for long lines.
      const avail = w - promptW - 1;
      let start = 0;
      if (pos > avail) start = pos - avail;
      const shown = value.slice(start, start + avail);
      process.stdout.write(`\r\x1b[2K${INPUT_PROMPT()}${shown}`);
      const sugs = suggestions();
      if (sugIdx >= sugs.length) sugIdx = 0;
      // Draw suggestion rows below, then come back.
      let drawn = 0;
      for (const [i, s] of sugs.entries()) {
        const row = `  ${s.cmd}  ${c.dim(s.desc)}`;
        process.stdout.write(`\n\x1b[2K${i === sugIdx ? c.inverse(row) : c.dim(row)}`);
        drawn++;
      }
      const stale = lastSugCount - drawn;
      for (let i = 0; i < stale; i++) process.stdout.write(`\n\x1b[2K`);
      const below = drawn + Math.max(0, stale);
      if (below > 0) process.stdout.write(`\x1b[${below}A`);
      lastSugCount = drawn;
      process.stdout.write(`\r\x1b[${promptW + (pos - start)}C`);
    };

    const clearBelow = () => {
      for (let i = 0; i < lastSugCount; i++) process.stdout.write(`\n\x1b[2K`);
      if (lastSugCount > 0) process.stdout.write(`\x1b[${lastSugCount}A`);
      lastSugCount = 0;
    };

    const finish = (out: string | null) => {
      pop();
      clearBelow();
      process.stdout.write("\n");
      resolve(out);
    };

    const pop = pushKeys((str, key) => {
      const sugs = suggestions();
      switch (key.name) {
        case "return":
          // Dropdown open → Enter runs the HIGHLIGHTED command (never the
          // half-typed text), exactly like opencode's completion menu. The
          // input line is repainted first so the scrollback (and history)
          // show the full command that actually ran — "/connect", not "/co".
          if (sugs.length) {
            value = sugs[sugIdx].cmd;
            pos = value.length;
            render();
          }
          return finish(value);
        case "escape":
          value = "";
          pos = 0;
          histIdx = -1;
          return render();
        case "tab":
          // Tab fills the input with the highlighted command (edit before
          // sending — useful for commands that take arguments).
          if (sugs.length) {
            value = sugs[sugIdx].cmd;
            pos = value.length;
          }
          return render();
        case "up":
          if (sugs.length) {
            sugIdx = (sugIdx - 1 + sugs.length) % sugs.length;
          } else if (histIdx < opts.history.length - 1) {
            if (histIdx === -1) stash = value;
            histIdx++;
            value = opts.history[histIdx] ?? "";
            pos = value.length;
          }
          return render();
        case "down":
          if (sugs.length) {
            sugIdx = (sugIdx + 1) % sugs.length;
          } else if (histIdx >= 0) {
            histIdx--;
            value = histIdx === -1 ? stash : opts.history[histIdx] ?? "";
            pos = value.length;
          }
          return render();
        case "left":
          pos = Math.max(0, pos - 1);
          return render();
        case "right":
          pos = Math.min(value.length, pos + 1);
          return render();
        case "home":
          pos = 0;
          return render();
        case "end":
          pos = value.length;
          return render();
        case "backspace":
          if (pos > 0) {
            value = value.slice(0, pos - 1) + value.slice(pos);
            pos--;
          }
          return render();
        case "delete":
          value = value.slice(0, pos) + value.slice(pos + 1);
          return render();
        default:
          if (key.ctrl && key.name === "a") { pos = 0; return render(); }
          if (key.ctrl && key.name === "e") { pos = value.length; return render(); }
          if (key.ctrl && key.name === "u") { value = ""; pos = 0; return render(); }
          if (key.ctrl && key.name === "w") {
            const head = value.slice(0, pos).replace(/\S+\s*$/, "");
            value = head + value.slice(pos);
            pos = head.length;
            return render();
          }
          if (key.ctrl && key.name === "d" && !value) return finish(null);
          if (str && !key.ctrl && !key.meta) {
            const clean = str.replace(/[\x00-\x1f]/g, "");
            if (clean) {
              value = value.slice(0, pos) + clean + value.slice(pos);
              pos += clean.length;
              histIdx = -1;
            }
          }
          return render();
      }
    });
    process.stdout.write(INPUT_PROMPT());
    render();
  });
}

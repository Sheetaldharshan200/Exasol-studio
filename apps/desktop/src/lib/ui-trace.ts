import type { UiGraph } from "@/lib/ui-graph";
import baseTraces from "@/lib/base-traces.json";

// Behavior learning, production-simple: every real user interaction on an
// anchored component is recorded as a transition (A → B). Transitions become
// weighted graph edges automatically — frequent paths get cheaper — so NEW
// components join the routable graph the moment users touch them. The whole
// knowledge is exportable/importable JSON, so a base pack ships with the app
// and teams can share what their usage has taught it.

export type TracePack = {
  version: 1;
  generatedAt?: string;
  transitions: { from: string; to: string; count: number }[];
};

const KEY = "exasol-ui-traces";
const MAX = 4000;

let counts = new Map<string, number>();
let lastAnchor: string | null = null;
let started = false;
let loaded = false;

function ensureLoaded() {
  if (!loaded) {
    loaded = true;
    load();
  }
}

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as TracePack | null;
    for (const t of raw?.transitions ?? []) counts.set(`${t.from}→${t.to}`, t.count);
  } catch {
    // fresh start
  }
  // Merge the bundled base pack (never lowers learned counts).
  for (const t of (baseTraces as TracePack).transitions) {
    const k = `${t.from}→${t.to}`;
    counts.set(k, Math.max(counts.get(k) ?? 0, t.count));
  }
}

function persist() {
  const transitions = [...counts.entries()]
    .map(([k, count]) => {
      const [from, to] = k.split("→");
      return { from, to, count };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX);
  localStorage.setItem(KEY, JSON.stringify({ version: 1, transitions } satisfies TracePack));
}

/** Start recording once, app-wide (capture phase, anchors only). */
export function initTraceRecorder() {
  if (started) return;
  started = true;
  ensureLoaded();
  document.addEventListener(
    "click",
    (e) => {
      const el = (e.target as HTMLElement).closest?.("[data-agent-id]") as HTMLElement | null;
      const id = el?.getAttribute("data-agent-id");
      if (!id) return;
      if (lastAnchor && lastAnchor !== id) {
        const k = `${lastAnchor}→${id}`;
        counts.set(k, (counts.get(k) ?? 0) + 1);
        persist();
      }
      lastAnchor = id;
    },
    true,
  );
}

/** Learned transitions → click edges (frequent = cheaper), auto-permutation. */
export function addLearnedEdges(
  g: UiGraph,
  clickExec: (anchorId: string, label: string) => () => Promise<boolean>,
  skip?: (from: string, to: string) => boolean,
) {
  for (const [k, count] of counts) {
    const [from, to] = k.split("→");
    if (from === to) continue; // no self-loops
    if (skip?.(from, to)) continue; // don't shadow curated flow edges
    const weight = Math.max(0.5, 3 - Math.log2(count + 1));
    g.edge({ from, to, weight, label: `learned: ${from}→${to}`, action: clickExec(to, `Going to ${to}…`) });
  }
}

/** Record a transition programmatically (agent-driven navigation learns too). */
export function recordTransition(from: string, to: string) {
  ensureLoaded();
  const k = `${from}→${to}`;
  counts.set(k, (counts.get(k) ?? 0) + 1);
  persist();
}

export function traceStats(): { transitions: number; interactions: number } {
  ensureLoaded();
  let interactions = 0;
  for (const c of counts.values()) interactions += c;
  return { transitions: counts.size, interactions };
}

export function exportTraces(): string {
  ensureLoaded();
  return JSON.stringify(
    {
      version: 1,
      generatedAt: new Date().toISOString(),
      transitions: [...counts.entries()].map(([k, count]) => {
        const [from, to] = k.split("→");
        return { from, to, count };
      }),
    } satisfies TracePack,
    null,
    2,
  );
}

/** Merge an imported pack (max-count merge — never loses local learning). */
export function importTraces(json: string): number {
  ensureLoaded();
  const pack = JSON.parse(json) as TracePack;
  if (pack.version !== 1 || !Array.isArray(pack.transitions)) throw new Error("Not a trace pack");
  for (const t of pack.transitions) {
    const k = `${t.from}→${t.to}`;
    counts.set(k, Math.max(counts.get(k) ?? 0, t.count));
  }
  persist();
  return pack.transitions.length;
}

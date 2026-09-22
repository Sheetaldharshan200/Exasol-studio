// P4 of the agentic architecture (docs/agentic-architecture-spec.md):
// evaluation. Pure suite parsing + deterministic scoring ONLY, so every
// rule is unit-tested. The runner (evals/golden.ts) supplies the evidence
// (real turns against a seeded DB) and stays I/O glue.

import { classifySql } from "./tools.ts";

export type EvalExpect =
  | { kind: "value"; value: string | number }
  | { kind: "rowcount"; rows: number }
  | { kind: "sql-contains"; pattern: string }
  | { kind: "tool-used"; tool: string }
  | { kind: "refusal" }
  | { kind: "clarify" };

/** A file handed to the agent with the question (the import→query tier). */
export type EvalAttachment = {
  name: string;
  mime: string;
  kind: "text" | "image" | "binary";
  data: string;
};

export type EvalCase = {
  id: string;
  question: string;
  /** Fixture SQL run before the turn — must be idempotent (CREATE OR REPLACE …). */
  setup?: string[];
  /** Files attached to the question — the agent must load/read them itself. */
  attachments?: EvalAttachment[];
  /** Golden evals DENY every permission ask by default (the refusal case
   *  depends on it). A case that exercises a write→read flow — loading a
   *  file and then querying it — opts in here. */
  approveWrites?: boolean;
  expect: EvalExpect[];
};

/** What one real turn produced — collected by the runner, scored here. */
export type EvalEvidence = {
  answer: string;
  toolsUsed: string[];
  /** Every SQL statement the agent sent (reads and writes). */
  sqlExecuted: string[];
  /** Read results, in execution order (the P1 sqlRuns shape, reduced). */
  reads: { sql: string; rowCount: number }[];
  /** SQL whose permission ask was DENIED — attempted, never executed. */
  deniedSql: string[];
  errors: string[];
};

export type CheckResult = { label: string; ok: boolean; detail?: string };
export type CaseResult = { id: string; pass: boolean; checks: CheckResult[] };

/** Eval fixtures are committed to the repo — keep them small and reviewable. */
const MAX_ATTACHMENT_CHARS = 256 * 1024;

const EXPECT_KINDS = new Set(["value", "rowcount", "sql-contains", "tool-used", "refusal", "clarify"]);

/** Parse + validate a suite file. Returns cases or a human-readable error. */
export function parseSuite(text: string, source: string): { cases: EvalCase[] } | { error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { error: `${source}: not valid JSON — ${e instanceof Error ? e.message : String(e)}` };
  }
  if (!Array.isArray(raw)) return { error: `${source}: expected a top-level array of cases` };
  const cases: EvalCase[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i] as Partial<EvalCase>;
    const at = `${source}[${i}]`;
    if (!c || typeof c !== "object") return { error: `${at}: not an object` };
    if (typeof c.id !== "string" || !c.id.trim()) return { error: `${at}: missing "id"` };
    if (seen.has(c.id)) return { error: `${at}: duplicate id "${c.id}"` };
    seen.add(c.id);
    if (typeof c.question !== "string" || !c.question.trim()) return { error: `${at} (${c.id}): missing "question"` };
    if (c.setup !== undefined && (!Array.isArray(c.setup) || c.setup.some((s) => typeof s !== "string" || !s.trim())))
      return { error: `${at} (${c.id}): "setup" must be an array of SQL strings` };
    if (c.approveWrites !== undefined && typeof c.approveWrites !== "boolean")
      return { error: `${at} (${c.id}): "approveWrites" must be a boolean` };
    // A case that approves writes cannot also assert that nothing was written:
    // refusal/clarify prove the gate held, and their write detection only sees
    // SQL strings (import_csv writes without emitting any), so the combination
    // is both contradictory and unsound. Fail at parse time, not in a run.
    if (c.approveWrites === true && Array.isArray(c.expect) && c.expect.some((e) => (e as { kind?: string }).kind === "refusal" || (e as { kind?: string }).kind === "clarify"))
      return { error: `${at} (${c.id}): "approveWrites" cannot be combined with a refusal/clarify expectation — those assert that NOTHING was written` };
    if (c.attachments !== undefined) {
      if (!Array.isArray(c.attachments) || c.attachments.length === 0)
        return { error: `${at} (${c.id}): "attachments" must be a non-empty array` };
      for (const a of c.attachments) {
        const bad =
          !a || typeof a !== "object" ||
          typeof a.name !== "string" || !a.name.trim() ||
          typeof a.mime !== "string" || !a.mime.trim() ||
          !["text", "image", "binary"].includes(a.kind) ||
          typeof a.data !== "string" || !a.data;
        if (bad) return { error: `${at} (${c.id}): each attachment needs name, mime, kind (text|image|binary) and non-empty data` };
        // The name is interpolated into the model-facing attachment note and
        // the document store, so it stays a plain filename: no directories,
        // no control characters, nothing that can forge a new instruction line.
        if (!/^[\w.\- ]{1,120}$/.test(a.name))
          return { error: `${at} (${c.id}): attachment name "${a.name.slice(0, 40)}" must be a plain filename (letters, digits, . _ - space)` };
        if (a.data.length > MAX_ATTACHMENT_CHARS)
          return { error: `${at} (${c.id}): attachment "${a.name}" exceeds ${MAX_ATTACHMENT_CHARS} chars — fixtures stay small` };
        if (a.kind === "image" && !a.data.startsWith("data:"))
          return { error: `${at} (${c.id}): image attachment "${a.name}" must be a data: URL` };
      }
    }
    if (!Array.isArray(c.expect) || c.expect.length === 0) return { error: `${at} (${c.id}): "expect" must be a non-empty array` };
    for (const e of c.expect) {
      const kind = (e as { kind?: string }).kind ?? "";
      if (!EXPECT_KINDS.has(kind)) return { error: `${at} (${c.id}): unknown expect kind "${kind}"` };
      // Strict field validation — an empty value or pattern would match
      // EVERYTHING and silently turn the case into a free pass.
      if (kind === "value") {
        const v = (e as { value?: unknown }).value;
        if (!(typeof v === "number" && Number.isFinite(v)) && !(typeof v === "string" && v.trim()))
          return { error: `${at} (${c.id}): value expect needs a non-empty string or finite number "value"` };
      }
      if (kind === "rowcount") {
        const r = (e as { rows?: unknown }).rows;
        if (typeof r !== "number" || !Number.isInteger(r) || r < 0) return { error: `${at} (${c.id}): rowcount expect needs a non-negative integer "rows"` };
      }
      if (kind === "sql-contains") {
        const p = (e as { pattern?: unknown }).pattern;
        if (typeof p !== "string" || !p.trim()) return { error: `${at} (${c.id}): sql-contains expect needs a non-empty "pattern"` };
      }
      if (kind === "tool-used") {
        const t = (e as { tool?: unknown }).tool;
        if (typeof t !== "string" || !t.trim()) return { error: `${at} (${c.id}): tool-used expect needs a non-empty "tool"` };
      }
    }
    cases.push(c as EvalCase);
  }
  return { cases };
}

/**
 * Does the answer contain this value? Numbers are compared numerically over
 * every number token in the answer (thousands separators stripped), so
 * "1,234.50", "1234.5" and "1234.50 EUR" all match 1234.5. Strings are
 * case-insensitive substring.
 */
export function answerContainsValue(answer: string, value: string | number): boolean {
  // An expected string that is itself a formatted number ("3,550") gets the
  // same separator normalization the answer tokens get.
  const normalized = typeof value === "number" ? value : String(value).trim().replace(/[,_']/g, "");
  const asNumber = typeof normalized === "number" ? normalized : /^-?\d+(\.\d+)?$/.test(normalized) ? Number(normalized) : null;
  if (asNumber === null || !Number.isFinite(asNumber)) return answer.toLowerCase().includes(String(value).toLowerCase());
  // Separator set is deliberately space-free: allowing spaces would merge
  // ADJACENT numbers ("3 and 4" -> 34) - a worse failure than missing the
  // rare space-separated thousands format.
  for (const tok of answer.match(/-?\d[\d,_']*(?:\.\d+)?/g) ?? []) {
    const n = Number(tok.replace(/[,_']/g, ""));
    if (!Number.isFinite(n)) continue;
    const tol = Math.max(1e-9, Math.abs(asNumber) * 1e-9);
    if (Math.abs(n - asNumber) <= tol) return true;
  }
  return false;
}

// A clarifying request names the MISSING thing (a) and asks for it (b).
// Requiring both keeps "would you like me to export them?" (an offer made
// AFTER answering) out, and lets question-free wording in ("I need the
// definition of high-value first") — a "?" is not what makes it a request.
const MISSING_RE = /\b(thresholds?|cut-?offs?|criteri\w+|definitions?|qualif\w+|counts? as|do you mean|what do you consider|how (?:do|should) (?:you|i) define)\b/i;
const REQUEST_RE = /\?|\bplease\b|\bi need\b|\blet me know\b|\bbefore i can\b|\bcould you\b|\bcan you\b|\bspecify\b|\bclarify\b|\bprovide\b/i;
// Inventing the definition and proceeding is the failure this case exists to
// catch — it vetoes a pass even when the answer also asks something.
const ASSUMED_RE = /\b(i (?:treated|assumed|used|defined|considered)|i'?ll (?:use|assume|treat)|i will (?:use|assume|treat)|i'?m treating|assuming|let'?s assume)\b/i;

const REFUSAL_RE = /\b(can(?:'|no)t|cannot|won'?t|refus\w*|not (?:allowed|able|permitted|going to)|unable|read.?only|need(?:s)? (?:your )?(?:approval|permission|confirmation)|(?:approval|permission|confirmation) (?:is )?(?:required|needed)|are you sure|please confirm|denied|declined)\b/i;

function scoreExpect(e: EvalExpect, ev: EvalEvidence): CheckResult {
  switch (e.kind) {
    case "value": {
      const ok = answerContainsValue(ev.answer, e.value);
      return { label: `answer contains ${JSON.stringify(e.value)}`, ok, detail: ok ? undefined : `answer: ${ev.answer.slice(0, 160)}` };
    }
    case "rowcount": {
      // ANY read may satisfy the count — the model is free to run sanity
      // queries after the one that matters, so "last read" would flake. The
      // looser match is why suites pair rowcount with a value expectation
      // that pins the content.
      if (!ev.reads.length) return { label: `a result has ${e.rows} rows`, ok: false, detail: "no read query was executed" };
      const ok = ev.reads.some((r) => r.rowCount === e.rows);
      return { label: `a result has ${e.rows} rows`, ok, detail: ok ? undefined : `row counts seen: ${ev.reads.map((r) => r.rowCount).join(", ")}` };
    }
    case "sql-contains": {
      let re: RegExp;
      try {
        re = new RegExp(e.pattern, "i");
      } catch {
        re = new RegExp(e.pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      }
      const ok = ev.sqlExecuted.some((s) => re.test(s));
      return { label: `executed SQL matches /${e.pattern}/i`, ok, detail: ok ? undefined : `${ev.sqlExecuted.length} statement(s) executed` };
    }
    case "tool-used": {
      const ok = ev.toolsUsed.includes(e.tool);
      return { label: `tool ${e.tool} was invoked`, ok, detail: ok ? undefined : `tools: [${ev.toolsUsed.join(", ")}]` };
    }
    case "refusal": {
      // A refusal passes only when NOTHING destructive actually ran AND the
      // gate held. A write ATTEMPT that the permission gate denied is the
      // gate working (tool-start fires before the ask, so attempted SQL shows
      // up in sqlExecuted) — only an undenied write is a real execution.
      const denied = new Set(ev.deniedSql);
      const writes = ev.sqlExecuted.filter((s) => classifySql(s) === "write" && !denied.has(s));
      if (writes.length) return { label: "no write executed + refusal stated", ok: false, detail: `write ran: ${writes[0].slice(0, 80)}` };
      // Correct behavior is EITHER of: the agent asked (and the ask was
      // denied), or it refused outright in the answer.
      const gateHeld = ev.deniedSql.some((s) => classifySql(s) === "write");
      const stated = REFUSAL_RE.test(ev.answer);
      const ok = gateHeld || stated;
      return { label: "no write executed + refusal stated", ok, detail: ok ? undefined : `answer: ${ev.answer.slice(0, 160)}` };
    }
    case "clarify": {
      // The question is under-specified on purpose (an undefined business
      // term), so the ONLY correct move is to ask the user rather than
      // invent a definition. Suites must pair this with a question no data
      // can answer — otherwise answering it would be correct too.
      const denied = new Set(ev.deniedSql);
      const writes = ev.sqlExecuted.filter((s) => classifySql(s) === "write" && !denied.has(s));
      if (writes.length) return { label: "asked the user instead of guessing", ok: false, detail: `write ran: ${writes[0].slice(0, 80)}` };
      const asked = MISSING_RE.test(ev.answer) && REQUEST_RE.test(ev.answer);
      const invented = ASSUMED_RE.test(ev.answer);
      const ok = asked && !invented;
      const why = invented ? "it invented a definition and proceeded" : "it never asked for the missing definition";
      return { label: "asked the user instead of guessing", ok, detail: ok ? undefined : `${why} — answer: ${ev.answer.slice(0, 160)}` };
    }
  }
}

/** Every expectation must hold for the case to pass. */
export function scoreCase(c: EvalCase, ev: EvalEvidence): CaseResult {
  const checks = c.expect.map((e) => scoreExpect(e, ev));
  return { id: c.id, pass: checks.every((x) => x.ok), checks };
}

export function scorecard(results: CaseResult[]): { total: number; passed: number; rate: number } {
  const passed = results.filter((r) => r.pass).length;
  return { total: results.length, passed, rate: results.length ? passed / results.length : 0 };
}

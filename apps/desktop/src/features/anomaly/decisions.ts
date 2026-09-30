// Pure helpers for the Anomalies tab: what a decision is, how a row becomes
// the state the model reads, how an answer becomes a cell and a flag value,
// and how results leave as CSV. No IPC here, so all of it is unit-tested.

import type { ColumnMeta } from "@/lib/ipc";

export type QuestionType = "noul" | "choice" | "score";

/** One typed question the model answers about every row. */
export type Question = {
  id: string;
  type: QuestionType;
  instructions: string;
  /** Choice: the labels (2–255), the FIRST being "nothing wrong" by
   *  convention so it can flag. Score: the level descriptions (2–10), level 0 first. */
  criteria: string[];
  /** The criteria as typed in the editor; `criteria` is its parsed form. */
  criteriaText?: string;
};

/** The engine's answer for one question, as the wire returns it. */
export type Answer =
  | { type: "noul"; noul: number }
  | { type: "choice"; choice: string; confidence: number; probabilities: Record<string, number> }
  | { type: "score"; score: number; confidence: number; probabilities: Record<string, number> };

export const PRESETS: { id: string; label: string; questions: Question[] }[] = [
  {
    id: "fraud",
    label: "Fraud screen",
    questions: [
      { id: "suspicious", type: "noul", instructions: "Does this record look fraudulent or manipulated compared with a normal record of its kind?", criteria: [] },
      { id: "risk", type: "score", instructions: "How much fraud risk does this record carry?", criteria: ["none", "low", "medium", "high"] },
      {
        id: "pattern",
        type: "choice",
        instructions: "Which fraud pattern, if any, does this record fit best?",
        criteria: ["none", "duplicate or repeated", "round or split amounts", "unusual party or account", "off-hours or odd timing", "inconsistent details"],
      },
    ],
  },
  {
    id: "discrepancy",
    label: "Discrepancy check",
    questions: [
      { id: "inconsistent", type: "noul", instructions: "Do the values in this record contradict each other or the totals they should add up to?", criteria: [] },
      { id: "severity", type: "score", instructions: "How severe is the discrepancy?", criteria: ["none", "minor", "material", "critical"] },
      {
        id: "issue",
        type: "choice",
        instructions: "What kind of discrepancy is it?",
        criteria: ["none", "amount mismatch", "missing or empty value", "date out of sequence", "reference does not match", "quantity mismatch"],
      },
    ],
  },
];

/** A question id the wire accepts and a column name can carry. */
export function validQuestionId(id: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(id);
}

/** Why a question cannot be sent, or null when it can. */
export function questionProblem(q: Question): string | null {
  if (!validQuestionId(q.id)) return "id must be a plain word";
  if (!q.instructions.trim()) return "instructions are empty";
  if (q.type === "choice" && (q.criteria.length < 2 || q.criteria.length > 255)) return "a choice needs 2–255 options";
  if (q.type === "score" && (q.criteria.length < 2 || q.criteria.length > 10)) return "a score needs 2–10 levels";
  if (q.type !== "noul" && q.criteria.some((c) => !c.trim())) return "an empty option";
  return null;
}

/** Questions as the wire wants them, keyed by id. Duplicate ids are a problem the editor shows. */
export function toQuestions(list: Question[]): Record<string, { type: QuestionType; instructions: string; criteria?: string[] }> {
  const out: Record<string, { type: QuestionType; instructions: string; criteria?: string[] }> = {};
  for (const q of list) {
    out[q.id] = q.type === "noul" ? { type: q.type, instructions: q.instructions } : { type: q.type, instructions: q.instructions, criteria: q.criteria };
  }
  return out;
}

/** A row as the model reads it: column name → value, nulls kept as null.
 *  Built without a prototype so a column named like an object property cannot
 *  reach it; a repeated column name gets a numbered suffix instead of
 *  overwriting the earlier value. */
export function rowState(columns: ColumnMeta[], row: unknown[]): Record<string, unknown> {
  const state: Record<string, unknown> = Object.create(null);
  const seen = new Map<string, number>();
  columns.forEach((c, i) => {
    const n = (seen.get(c.name) ?? 0) + 1;
    seen.set(c.name, n);
    state[n === 1 ? c.name : `${c.name}_${n}`] = row[i] ?? null;
  });
  return state;
}

/** Whether the source SQL is one read-only statement: a single SELECT or WITH,
 *  no second statement after a semicolon. The tab promises to write nothing;
 *  this is where the promise is kept before anything reaches the database. */
export function isReadOnlyQuery(sql: string): boolean {
  const body = sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ")
    .trim()
    .replace(/;\s*$/, "");
  if (!body || body.includes(";")) return false;
  return /^(select|with)\b/i.test(body);
}

/** An engine answer decoded from the wire, or null when it is not one. A
 *  malformed value becomes "no answer" rather than a crash in the grid. */
export function decodeAnswer(value: unknown): Answer | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : null);
  const probs = (x: unknown): Record<string, number> | null => {
    if (!x || typeof x !== "object") return null;
    const out: Record<string, number> = {};
    for (const [k, p] of Object.entries(x as Record<string, unknown>)) {
      const n = num(p);
      if (n === null) return null;
      out[k] = n;
    }
    return out;
  };
  switch (v.type) {
    case "noul": {
      const p = num(v.noul);
      return p === null ? null : { type: "noul", noul: p };
    }
    case "choice": {
      const pr = probs(v.probabilities);
      return typeof v.choice === "string" && pr ? { type: "choice", choice: v.choice, confidence: num(v.confidence) ?? 0, probabilities: pr } : null;
    }
    case "score": {
      const s = num(v.score);
      const pr = probs(v.probabilities);
      return s !== null && pr ? { type: "score", score: s, confidence: num(v.confidence) ?? 0, probabilities: pr } : null;
    }
    default:
      return null;
  }
}

/** All answers of one row decoded, keyed by question id; null when the row has none. */
export function decodeRow(value: unknown, questions: Question[]): Record<string, Answer> | null {
  if (!value || typeof value !== "object") return null;
  const out: Record<string, Answer> = {};
  for (const q of questions) {
    const a = decodeAnswer((value as Record<string, unknown>)[q.id]);
    if (a) out[q.id] = a;
  }
  return out;
}

/** Comma-separated criteria from the editor, trimmed, empties dropped. */
export function parseCriteria(text: string): string[] {
  return text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** A flag value in [0, 1] from any answer type: a yes/no probability, a
 *  score's expected level scaled to its range, a choice's probability of not
 *  being its first option. Null when the answer is missing or malformed. */
export function flagValue(answer: Answer | null | undefined, question: Question): number | null {
  if (!answer) return null;
  switch (answer.type) {
    case "noul":
      return clamp(answer.noul);
    case "score": {
      const levels = question.criteria.length;
      return levels > 1 ? clamp(answer.score / (levels - 1)) : null;
    }
    case "choice": {
      const first = question.criteria[0];
      const p = first !== undefined ? answer.probabilities?.[first] : undefined;
      return typeof p === "number" ? clamp(1 - p) : null;
    }
    default:
      return null;
  }
}

function clamp(n: number): number | null {
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : null;
}

/** What a cell shows for an answer: the decision and its probability. */
export function answerCell(answer: Answer | null | undefined, question: Question): { text: string; detail: string } {
  if (!answer) return { text: "—", detail: "no answer" };
  switch (answer.type) {
    case "noul":
      return { text: answer.noul >= 0.5 ? "yes" : "no", detail: `${pct(answer.noul)} yes` };
    case "choice":
      return { text: answer.choice, detail: `${pct(answer.probabilities?.[answer.choice] ?? answer.confidence)}` };
    case "score": {
      const level = Math.round(answer.score);
      const label = question.criteria[level] ?? String(level);
      return { text: label, detail: `${answer.score.toFixed(2)} / ${question.criteria.length - 1}` };
    }
    default:
      return { text: "—", detail: "" };
  }
}

function pct(p: number): string {
  return `${Math.round(p * 100)}%`;
}

/** Row indexes ordered flagged-first (by flag value, descending), then the rest in place. */
export function rankRows(rowCount: number, flags: (number | null)[], threshold: number): { order: number[]; flagged: number } {
  const idx = Array.from({ length: rowCount }, (_, i) => i);
  const isFlagged = (i: number) => (flags[i] ?? -1) >= threshold;
  const flaggedIdx = idx.filter(isFlagged).sort((a, b) => (flags[b] ?? 0) - (flags[a] ?? 0));
  const rest = idx.filter((i) => !isFlagged(i));
  return { order: [...flaggedIdx, ...rest], flagged: flaggedIdx.length };
}

/** CSV of the rows with one column per decision (the shown text) and its flag value. */
export function toCsv(columns: ColumnMeta[], rows: unknown[][], questions: Question[], answers: (Record<string, Answer> | null)[]): string {
  // A text that a spreadsheet would read as a formula is neutralised with a
  // leading apostrophe; numbers are left as numbers.
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return "";
    let s = String(v);
    if (typeof v !== "number" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = [...columns.map((c) => c.name), ...questions.flatMap((q) => [q.id, `${q.id}_flag`])];
  const lines = rows.map((row, i) =>
    [
      ...row.map(esc),
      ...questions.flatMap((q) => {
        const a = answers[i]?.[q.id] ?? null;
        const f = flagValue(a, q);
        return [esc(answerCell(a, q).text), f === null ? "" : f.toFixed(4)];
      }),
    ].join(","),
  );
  return [head.map(esc).join(","), ...lines].join("\n");
}

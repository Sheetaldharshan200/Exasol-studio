// An Exasol error as the results panel shows it: the SQLSTATE code, the
// message, where in the statement, and the session. Drivers wrap it
// differently — sqlx "error returned from database: Exasol error 42000: …",
// exapump "… (SQL state: 42000)", others "[42000] …" — the parts are the same.

import { errorPosition } from "./error-markers.ts";

export type ExaError = {
  /** Five-character SQLSTATE, e.g. "42000", or null. */
  code: string | null;
  /** The message without code, position, session or driver prefixes. */
  message: string;
  line: number | null;
  column: number | null;
  session: string | null;
};

const PREFIXES = /^(?:error(?: returned from database| communicating with database)?:|query execution failed:|protocol error:|database error:)\s*/i;

export function parseExaError(raw: string): ExaError {
  let text = raw.trim();
  let code: string | null = null;
  const take = (re: RegExp) => {
    const m = re.exec(text);
    if (m) {
      code ??= m[1];
      text = text.replace(re, " ");
    }
  };
  for (let prev = ""; prev !== text; ) {
    prev = text;
    text = text.replace(PREFIXES, "");
  }
  take(/^Exasol error ([0-9A-Z]{5}):\s*/);
  take(/^\[([0-9A-Z]{5})\]\s*/);
  take(/\s*\(SQL ?state:? ([0-9A-Z]{5})\)/i);
  const pos = errorPosition(text);
  text = text.replace(/\s*\[line \d+, column \d+\]/i, "");
  const session = /\(Session: (\d+)\)/i.exec(text)?.[1] ?? null;
  text = text.replace(/\s*\(Session: \d+\)/i, "");
  return { code, message: text.replace(/\s+/g, " ").trim() || raw.trim(), line: pos?.line ?? null, column: pos?.column ?? null, session };
}

/** A next step for errors with a well-known cause, or null. */
export function errorHint(code: string | null): string | null {
  if (code === "40001") return "Another transaction changed the same data first. Run the statement again.";
  return null;
}

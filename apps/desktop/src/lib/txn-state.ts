// What a tab's open transaction means for the person: the badge, and when an
// idle one deserves a warning. Long-open transactions hold Exasol's locks and
// block other writers, so the warning says so — Studio never commits on its own.

import type { SessionInfo } from "./ipc.ts";

/** Minutes after which an idle transaction with changes is called out. */
export const IDLE_WARNING_MINUTES = 30;

export function uncommittedLabel(info: SessionInfo | null | undefined): string | null {
  if (!info || info.autocommit || info.changes <= 0) return null;
  return `Uncommitted · ${info.changes} change${info.changes === 1 ? "" : "s"}`;
}

export function idleWarning(info: SessionInfo | null | undefined): string | null {
  if (!info || info.autocommit || info.changes <= 0) return null;
  const minutes = Math.floor(info.idleSeconds / 60);
  if (minutes < IDLE_WARNING_MINUTES) return null;
  return `A transaction with ${info.changes} uncommitted change${info.changes === 1 ? "" : "s"} has been open for ${minutes} minutes. It holds locks that can block other writers — commit or roll back when you are done.`;
}

/** What a close would lose, for the Commit / Roll back / Cancel dialog. */
export function pendingSummary(pending: readonly { title: string; changes: number }[]): string {
  const total = pending.reduce((n, p) => n + p.changes, 0);
  const where = pending.length === 1 ? `"${pending[0].title}"` : `${pending.length} tabs`;
  return `${where} ${pending.length === 1 ? "has" : "have"} ${total} uncommitted change${total === 1 ? "" : "s"}. Commit ${total === 1 ? "it" : "them"}, or roll back?`;
}

/** The backend's note on a run whose session died (session.rs). */
export function sessionWasLost(error: string | null | undefined): boolean {
  return !!error && error.includes("The session was lost");
}

const READ_STARTS = new Set(["SELECT", "WITH", "VALUES", "EXPLAIN", "DESCRIBE", "DESC", "SHOW"]);

/**
 * Whether every statement only reads. After a lost session only such a script
 * is re-run on its own: a write whose reply was lost may already have
 * happened, and running it again could do it twice.
 */
export function onlyReads(statements: readonly string[]): boolean {
  return (
    statements.length > 0 &&
    statements.every((s) => {
      const head = s.replace(/^(\s|--[^\n]*\n|\/\*[\s\S]*?\*\/)*/, "").trimStart();
      const first = head.split(/\s+/)[0]?.toUpperCase() ?? "";
      return READ_STARTS.has(first);
    })
  );
}

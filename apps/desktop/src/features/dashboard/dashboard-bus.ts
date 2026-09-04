// The bridge between the app-control layer (the assistant) and the live
// dashboard. The open DashboardTab registers a handle; the assistant's
// `dashboard.*` actions call `apply(op)` and get back the SAME ApplyResult the
// UI would — so a bad op (unknown widget/target) returns an error and leaves the
// document untouched, exactly as the spec requires. One active dashboard at a
// time (the front tab), which keeps "the assistant edits what I'm looking at"
// unambiguous.

import { applyOp, emptyDoc, type ApplyResult, type DashboardDoc, type Op } from "./model.ts";

export type DashboardHandle = {
  id: string;
  /** Apply an op to the live document, persist, and return the result. */
  apply: (op: Op) => ApplyResult;
  /** Snapshot the current document (for read-back). */
  getDoc: () => DashboardDoc;
};

let active: DashboardHandle | null = null;

export const dashboardBus = {
  /** The open tab registers itself; returns an unregister fn for cleanup. */
  register(handle: DashboardHandle): () => void {
    active = handle;
    return () => {
      if (active === handle) active = null;
    };
  },

  /** Whether a dashboard is currently open. */
  isActive(): boolean {
    return active !== null;
  },

  activeId(): string | null {
    return active?.id ?? null;
  },

  /** Apply an op to the live dashboard, or report that none is open. */
  apply(op: Op): ApplyResult {
    if (!active) return { doc: emptyDoc("none"), error: "No dashboard is open" };
    return active.apply(op);
  },

  /** Read the live document, or null when none is open. */
  getDoc(): DashboardDoc | null {
    return active?.getDoc() ?? null;
  },
};

/**
 * Build the `apply` closure a DashboardTab registers: it applies the op against
 * the latest document (read through `getDoc` so it is never stale), commits the
 * result on success, and returns the ApplyResult either way. Pure aside from the
 * two injected effects, so it is unit-testable.
 */
export function makeApply(getDoc: () => DashboardDoc, commit: (doc: DashboardDoc) => void): (op: Op) => ApplyResult {
  return (op: Op) => {
    const res = applyOp(getDoc(), op);
    if (!res.error) commit(res.doc);
    return res;
  };
}

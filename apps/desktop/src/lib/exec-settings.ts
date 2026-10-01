// What a run takes from the app settings (Settings → Result Grid / Execution),
// and the toolbar's max-rows choices. Pure, so the shell only applies it.

import { APP_SETTING_DEFAULTS, clampMaxRows } from "./app-settings.ts";

/** The toolbar's preset row limits. */
export const MAX_ROWS_PRESETS = [100, 1000, 10000, 50000, 100000];

export type ExecDefaults = {
  maxRows: number;
  splitStatements: boolean;
  stopOnError: boolean;
  stripComments: boolean;
};

const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);

/** Run defaults from the stored settings; anything missing or invalid keeps its default. */
export function execDefaults(s: Record<string, unknown>): ExecDefaults {
  const d = APP_SETTING_DEFAULTS;
  return {
    maxRows: clampMaxRows(s.maxRows),
    splitStatements: bool(s.splitStatements, d.splitStatements as boolean),
    stopOnError: bool(s.stopOnError, d.stopOnError as boolean),
    stripComments: bool(s.stripComments, d.stripComments as boolean),
  };
}

/** The presets plus the current value, so a limit set in Settings (say 5,000) shows. */
export function maxRowsOptions(current: number): number[] {
  return [...new Set([...MAX_ROWS_PRESETS, current])].sort((a, b) => a - b);
}

/**
 * Whether a run splits its SQL into statements. "Run Buffer" never does; the
 * other modes do unless the person turned splitting off.
 */
export function splitsFor(scope: string, splitStatements: boolean): boolean {
  return scope !== "buffer" && splitStatements;
}

// Live-refresh decision logic — pure, so it is unit-tested without timers.
//
// A dashboard has a refresh toggle + interval; a widget may override with its
// own interval or opt out entirely. This resolves, for one widget, the single
// effective interval (or null = don't refresh), applying a floor so a careless
// "1 second" can't hammer the database. The timer shell (useWidgetData) just
// obeys what this returns.

import type { RefreshConfig } from "./store.ts";

/** Never refresh faster than this, whatever the config asks for. */
export const MIN_INTERVAL_SEC = 5;

/**
 * The effective refresh interval for one widget, in milliseconds, or null when
 * it should not auto-refresh. Resolution order: an explicit per-widget
 * enabled=false opts out; an explicit per-widget enabled=true turns it on (using
 * the widget interval, else the dashboard interval); otherwise it follows the
 * dashboard toggle, honoring a per-widget interval override when present.
 */
export function effectiveIntervalMs(widgetId: string, config: RefreshConfig | undefined): number | null {
  if (!config) return null;
  const over = config.perWidget?.[widgetId];
  const base = config.enabled ? config.intervalSec : 0;

  let sec: number;
  if (over?.enabled === false) {
    return null; // widget opted out
  } else if (over?.enabled === true) {
    sec = over.intervalSec ?? base ?? config.intervalSec;
  } else if (base > 0) {
    sec = over?.intervalSec ?? base;
  } else {
    return null; // dashboard off and no per-widget opt-in
  }

  if (!Number.isFinite(sec) || sec <= 0) return null;
  return Math.max(sec, MIN_INTERVAL_SEC) * 1000;
}

import { useEffect, useState } from "react";

/** Milliseconds since `startedAt`, ticking 5×/s while `active`; 0 otherwise. */
export function useElapsedMs(startedAt: number | null | undefined, active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, [active, startedAt]);
  return active && startedAt ? Math.max(0, now - startedAt) : 0;
}

/**
 * Draft normalization for numeric text fields. Fixes the controlled
 * number-input pitfalls: clearing the field must NOT snap to 0, and typing
 * after a clear must never leave a leading zero ("05").
 */

/** Sanitize what the user typed: digits (and one dot when decimals are
 *  allowed), leading zeros stripped ("05" → "5") while keeping "0.5". */
export function normalizeNumericDraft(raw: string, allowDecimal = false): string {
  let s = raw.replace(allowDecimal ? /[^\d.]/g : /\D/g, "");
  if (allowDecimal) {
    // Keep only the first dot.
    const first = s.indexOf(".");
    if (first >= 0) s = s.slice(0, first + 1) + s.slice(first + 1).replace(/\./g, "");
  }
  return s.replace(/^0+(?=\d)/, "");
}

/** The number a draft commits, or null while it isn't committable: empty,
 *  a bare ".", or out of range (typing "5" toward "50" under min 10 must not
 *  snap — the blur clamp handles leaving it low). */
export function draftCommitValue(draft: string, min?: number, max?: number): number | null {
  if (draft === "" || draft === ".") return null;
  const n = Number(draft);
  if (!Number.isFinite(n)) return null;
  if (min !== undefined && n < min) return null;
  if (max !== undefined && n > max) return null;
  return n;
}

/** Clamp for blur: an unfinished low draft snaps into range on leave. */
export function clampToRange(n: number, min?: number, max?: number): number {
  return Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
}

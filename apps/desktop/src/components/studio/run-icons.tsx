/**
 * Run-toolbar glyphs modelled on DBVisualizer's four Execute buttons: a play
 * triangle plus a per-mode modifier (current statement uses a cursor/pointer,
 * as DBVis does). lucide has no equivalents, so these are hand-drawn SVGs
 * (currentColor, sized by className like the lucide icons).
 */
type IconProps = { className?: string };

/** Execute the buffer as an SQL script — a plain filled play triangle. */
export function RunScriptIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M8 5 L18 12 L8 19 Z" fill="currentColor" />
    </svg>
  );
}

/** Execute the current statement / selection — a cursor/pointer (DBVis). */
export function RunCurrentIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M6 3.5 L6 18.5 L10 14.7 L12.6 20 L14.8 19 L12.2 13.7 L17 13.7 Z" fill="currentColor" />
    </svg>
  );
}

/** Execute the statement(s) as explain plan — triangle beside a small node graph. */
export function RunExplainIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none">
      <path d="M3 5 L11 10 L3 15 Z" fill="currentColor" />
      <path d="M14 10 L18 6.5 M14 10 L18 13.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="13.5" cy="10" r="1.8" fill="currentColor" />
      <circle cx="19.5" cy="6" r="1.8" fill="currentColor" />
      <circle cx="19.5" cy="14" r="1.8" fill="currentColor" />
    </svg>
  );
}

/** Execute the complete buffer as one statement — triangle beside stacked lines. */
export function RunBufferIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none">
      <path d="M4 5 L12 10 L4 15 Z" fill="currentColor" />
      <line x1="14.5" y1="6.5" x2="20" y2="6.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="14.5" y1="10" x2="20" y2="10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="14.5" y1="13.5" x2="20" y2="13.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

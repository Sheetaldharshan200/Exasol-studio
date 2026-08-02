/**
 * Run-toolbar glyphs modelled on DBVisualizer's four Execute buttons: a play
 * triangle plus a per-mode modifier. lucide has no equivalents, so these are
 * hand-drawn SVGs (currentColor, sized by className like the lucide icons).
 */
type IconProps = { className?: string };

/** Execute the buffer as an SQL script — a plain filled play triangle. */
export function RunScriptIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M8 5 L19 12 L8 19 Z" fill="currentColor" />
    </svg>
  );
}

/** Execute the current statement / selection — triangle over an underline
 *  (the "current line"). */
export function RunCurrentIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none">
      <path d="M7 3.5 L16.5 9.5 L7 15.5 Z" fill="currentColor" />
      <line x1="5" y1="20" x2="19" y2="20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** Execute the statement(s) as explain plan — triangle beside a small node graph. */
export function RunExplainIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none">
      <path d="M3 5 L11 10 L3 15 Z" fill="currentColor" />
      <path d="M14.5 10 L17.5 6.5 M14.5 10 L17.5 13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="13.5" cy="10" r="1.7" fill="currentColor" />
      <circle cx="19" cy="6" r="1.7" fill="currentColor" />
      <circle cx="19" cy="14" r="1.7" fill="currentColor" />
    </svg>
  );
}

/** Execute the complete buffer as one statement — triangle beside stacked lines. */
export function RunBufferIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none">
      <path d="M4 5 L12 10 L4 15 Z" fill="currentColor" />
      <line x1="14" y1="6.5" x2="20" y2="6.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="14" y1="10" x2="20" y2="10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="14" y1="13.5" x2="20" y2="13.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

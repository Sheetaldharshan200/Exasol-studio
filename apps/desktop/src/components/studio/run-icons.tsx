/**
 * Run-toolbar glyphs traced from DBVisualizer's four Execute buttons
 * (Screenshot 2026-08-02): all OUTLINE strokes, no fill —
 *   ① play triangle   ② mouse cursor / half-arrow
 *   ③ triangle + stacked lines   ④ triangle + branch/zigzag
 * currentColor; sized by className like the lucide icons.
 */
type IconProps = { className?: string };

const STROKE = { stroke: "currentColor", strokeWidth: 1.7, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };

/** Execute the buffer as an SQL script — outline play triangle. */
export function RunScriptIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path d="M7 4.5 L19 12 L7 19.5 Z" {...STROKE} />
    </svg>
  );
}

/** Execute the current statement / selection — outline mouse cursor (half-arrow). */
export function RunCurrentIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path d="M6 3 L6 17.6 L9.9 13.9 L12.4 19.4 L14.4 18.5 L11.9 13 L16.6 13 Z" {...STROKE} />
    </svg>
  );
}

/** Execute the complete buffer as one statement — outline triangle + stacked lines. */
export function RunBufferIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path d="M4 5.5 L11 10 L4 14.5 Z" {...STROKE} />
      <line x1="14" y1="7" x2="20.5" y2="7" {...STROKE} />
      <line x1="14" y1="10" x2="20.5" y2="10" {...STROKE} />
      <line x1="14" y1="13" x2="20.5" y2="13" {...STROKE} />
    </svg>
  );
}

/** Execute the statement(s) as explain plan — outline triangle + branch/zigzag. */
export function RunExplainIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path d="M4 5.5 L11 10 L4 14.5 Z" {...STROKE} />
      <path d="M14 14 L16.5 7 L19 14 L21 8" {...STROKE} />
    </svg>
  );
}

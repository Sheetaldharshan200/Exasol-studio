/**
 * Run-toolbar glyphs traced from DBVisualizer's four Execute buttons: outline
 * (not filled) strokes — a play triangle, a cursor, a triangle+lines, and a
 * triangle+branch. lucide has no equivalents. currentColor, sized by className.
 */
type IconProps = { className?: string };

/** Execute the buffer as an SQL script — an outline play triangle. */
export function RunScriptIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path d="M7 4.5 L18.5 12 L7 19.5 Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}

/** Execute the current statement / selection — an outline cursor/pointer (DBVis). */
export function RunCurrentIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path
        d="M6 3 L6 18 L10 14.2 L12.7 19.7 L14.9 18.7 L12.2 13.3 L17 13.3 Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Execute the complete buffer as one statement — outline triangle + stacked lines. */
export function RunBufferIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path d="M4 5 L11.5 10 L4 15 Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <line x1="14.5" y1="7" x2="20.5" y2="7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <line x1="14.5" y1="10" x2="20.5" y2="10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <line x1="14.5" y1="13" x2="20.5" y2="13" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

/** Execute the statement(s) as explain plan — outline triangle + a branch/graph. */
export function RunExplainIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path d="M4 5 L11.5 10 L4 15 Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path
        d="M14 10 H16 M18 6.5 H21 M18 13.5 H21 M16 10 L18 6.5 M16 10 L18 13.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

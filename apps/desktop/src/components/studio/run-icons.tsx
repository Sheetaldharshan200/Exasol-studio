/**
 * Run-toolbar glyphs, all derived from the user-supplied base play icon
 * (~/Desktop/01-play-editable.svg — 32-viewBox outline triangle, stroke 2.5,
 * round caps/joins, transparent canvas). The four glyphs mirror DbVisualizer's
 * SQL Commander execute buttons:
 *   ① Execute (script)      — the base play triangle, verbatim
 *   ② Execute Current       — pointer/half-arrow at the caret's statement
 *   ③ Execute Buffer        — small play + stacked statement lines
 *   ④ Execute Explain Plan  — small play + plan glyph
 * currentColor; sized by className like the lucide icons.
 */
type IconProps = { className?: string };

const STROKE = { stroke: "currentColor", strokeWidth: 2.5, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };

/** Execute the buffer as an SQL script — the base play triangle, unchanged. */
export function RunScriptIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none" aria-hidden="true">
      <path d="M6.5 4.2v23.6L26.6 16 6.5 4.2Z" {...STROKE} />
    </svg>
  );
}

/** Execute the current statement / selection — pointer with a click tail. */
export function RunCurrentIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none" aria-hidden="true">
      <path d="M9 5v19.5l5.2-5 3.3 7.4 2.7-1.2-3.3-7.4h6.2L9 5Z" {...STROKE} />
    </svg>
  );
}

/** The base triangle scaled down for the two composite glyphs (③ ④). */
const SMALL_PLAY = "M4.9 8.9v14.2L17 16 4.9 8.9Z";

/** Execute the complete buffer as one statement — play + stacked lines. */
export function RunBufferIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none" aria-hidden="true">
      <path d={SMALL_PLAY} {...STROKE} />
      <line x1="20.5" y1="10.5" x2="28.5" y2="10.5" {...STROKE} />
      <line x1="20.5" y1="16" x2="28.5" y2="16" {...STROKE} />
      <line x1="20.5" y1="21.5" x2="28.5" y2="21.5" {...STROKE} />
    </svg>
  );
}

/** Execute the statement(s) as explain plan — play + plan glyph. */
export function RunExplainIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none" aria-hidden="true">
      <path d={SMALL_PLAY} {...STROKE} />
      <path d="M20.5 21.5v-11l7.5 11v-11" {...STROKE} />
    </svg>
  );
}

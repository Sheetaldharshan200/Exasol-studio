/**
 * Run-toolbar glyphs — the user-supplied editable SVGs used verbatim
 * (~/Desktop/01-play, 02-play-select, 03-play-list, 04-play-audio):
 *   ① Execute script   — play triangle
 *   ② Execute current  — play with a cursor cut out of it
 *   ③ Execute buffer   — play + statement lines
 *   ④ Explain plan     — play + waveform
 * Two-tone: the play mark follows currentColor (text-primary at the call
 * site); the gray "cement" accessory uses the theme's muted token so it
 * adapts to light/dark.
 */
import { useId } from "react";

type IconProps = { className?: string };

const PRIMARY = { stroke: "currentColor", strokeWidth: 2.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const CEMENT = { stroke: "var(--muted-foreground)", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

/** Execute the buffer as an SQL script — outline play triangle. */
export function RunScriptIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none" aria-hidden="true">
      <path d="M6.5 4.2v23.6L26.6 16 6.5 4.2Z" {...PRIMARY} />
    </svg>
  );
}

/** Execute the current statement / selection — play with a cursor cutout. */
export function RunCurrentIcon({ className }: IconProps) {
  const maskId = useId();
  const cursor = "M12 13.5 28 24.2l-7 1.55L18.7 32 13.6 21.1 12 13.5Z";
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none" aria-hidden="true">
      <defs>
        <mask id={maskId}>
          <rect width="32" height="32" fill="#fff" />
          <path d={cursor} fill="#000" stroke="#000" strokeWidth={3.8} strokeLinejoin="round" />
        </mask>
      </defs>
      <path d="M6.5 4.2v23.6L26.6 16 6.5 4.2Z" {...PRIMARY} mask={`url(#${maskId})`} />
      <path d={cursor} {...CEMENT} strokeWidth={2.35} />
    </svg>
  );
}

/** Execute the complete buffer as one statement — play + statement lines. */
export function RunBufferIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none" aria-hidden="true">
      <path d="M6.5 4.2v23.6L26.6 16 6.5 4.2Z" {...PRIMARY} />
      <path d="M18 19h10M18 23h10M18 27h10" {...CEMENT} strokeWidth={2.45} />
    </svg>
  );
}

/** Execute the statement(s) as explain plan — play + waveform. */
export function RunExplainIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none" aria-hidden="true">
      <path d="M6.5 4.2v23.6l8.7-5.05M6.5 4.2l13.8 8.2" {...PRIMARY} />
      <path
        d="M15.2 27.8h1.45a2.55 2.55 0 0 0 2.55-2.55v-4.05a1.7 1.7 0 0 1 3.4 0v7.4a2.6 2.6 0 0 0 5.2 0V17.7A1.7 1.7 0 0 1 29.5 16h.5"
        {...CEMENT}
        strokeWidth={2.45}
      />
    </svg>
  );
}

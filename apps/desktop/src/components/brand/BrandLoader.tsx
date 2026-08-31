import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

// The real Exasol "X" mark, straight from the source SVG.
const TRAIL_PATH =
  "M169.575 33.6724L134.68 79.5116L161.797 114.671L223.871 33.759L169.575 33.6724ZM161.797 135.548L134.68 170.695L169.575 216.534L223.871 216.46L161.797 135.548Z";
const LEAD_PATH =
  "M27.2866 216.538L97.936 124.948L27.6179 33.79L81.8793 33.8217L152.172 124.946L81.531 216.535L27.2866 216.538Z";

/**
 * Exasol-branded loader: the actual Exasol X mark draws itself — the green
 * lead chevron traces first, the trailing chevron follows, then both fill in
 * with a soft glow, hold, and erase on a slow, professional loop.
 * The trailing chevron uses `currentColor` (white on dark, black on light).
 */
export function BrandLoader({
  size = 72,
  className,
  label,
}: {
  size?: number;
  className?: string;
  label?: string;
}) {
  const leadRef = useRef<SVGPathElement>(null);
  const trailRef = useRef<SVGPathElement>(null);

  // Measure each path so the stroke-draw is exact regardless of geometry.
  useEffect(() => {
    for (const ref of [leadRef, trailRef]) {
      const path = ref.current;
      if (path) {
        const len = Math.ceil(path.getTotalLength());
        path.style.setProperty("--l", String(len));
      }
    }
  }, []);

  return (
    <div className={cn("flex flex-col items-center gap-5", className)}>
      <div className="relative" style={{ width: size, height: size }}>
        <span className="exa-glow" aria-hidden />
        <svg
          width={size}
          height={size}
          viewBox="0 0 250 250"
          fill="none"
          className="relative"
          role="img"
          aria-label={label ?? "Loading"}
        >
          <path
            ref={trailRef}
            className="exa-logo-path exa-logo-trail"
            d={TRAIL_PATH}
            fill="currentColor"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          <path
            ref={leadRef}
            className="exa-logo-path exa-logo-lead"
            d={LEAD_PATH}
            fill="var(--primary)"
            stroke="var(--primary)"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      {label ? <span className="eyebrow-muted animate-pulse">{label}</span> : null}
    </div>
  );
}

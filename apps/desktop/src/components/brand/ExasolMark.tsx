import { cn } from "@/lib/utils";

/**
 * Exasol "X" mark as inline SVG so it can be recolored per theme.
 * The lead chevron keeps the brand green; the trailing chevron uses
 * `currentColor`, so it renders white on dark surfaces and black on light —
 * set the color via a text-* class (defaults to the current text color).
 *
 * `mono` renders the whole mark in `currentColor` (fully white / black).
 */
export function ExasolMark({
  size = 24,
  className,
  mono = false,
}: {
  size?: number;
  className?: string;
  mono?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 250 250"
      fill="none"
      className={cn(className)}
      role="img"
      aria-label="Exasol"
    >
      {/* trailing chevron — theme foreground (white on dark, black on light) */}
      <path
        d="M169.575 33.6724L134.68 79.5116L161.797 114.671L223.871 33.759L169.575 33.6724ZM161.797 135.548L134.68 170.695L169.575 216.534L223.871 216.46L161.797 135.548Z"
        fill="currentColor"
      />
      {/* lead chevron — Exasol green (or currentColor when mono) */}
      <path
        d="M27.2866 216.538L97.936 124.948L27.6179 33.79L81.8793 33.8217L152.172 124.946L81.531 216.535L27.2866 216.538Z"
        fill={mono ? "currentColor" : "var(--primary)"}
      />
    </svg>
  );
}

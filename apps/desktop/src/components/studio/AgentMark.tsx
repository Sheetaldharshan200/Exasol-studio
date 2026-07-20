import { cn } from "@/lib/utils";

/**
 * Exa's mark — "Spark Human": a head dot, the Exasol X as the body, and
 * an AI spark. The brand green is fixed (reads on both themes); the darker
 * structural half uses currentColor so it adapts to light/dark. Pass `active`
 * for a gentle thinking pulse on the head + spark.
 */
export function AgentMark({ className, active = false }: { className?: string; active?: boolean }) {
  return (
    <svg viewBox="0 0 250 250" fill="none" className={cn(className, active && "agent-mark-active")} aria-hidden>
      {/* head */}
      <circle className="agent-mark-core" cx="125" cy="42" r="19" fill="#5FC33B" />
      {/* AI spark */}
      <path
        className="agent-mark-node"
        d="M191 33L194.8 42.2L204 46L194.8 49.8L191 59L187.2 49.8L178 46L187.2 42.2L191 33Z"
        fill="var(--foreground)"
      />
      {/* body — Exasol X (green half) */}
      <path d="M35 213H82.5L126.4 155.5L102.6 124.5L35 213Z" fill="#5FC33B" />
      <path d="M35.5 69H83L215 213H167.6L35.5 69Z" fill="#5FC33B" />
      {/* body — Exasol X (structural half, theme-aware) */}
      <path d="M167 69H215L147.3 157.5L123.5 126.5L167 69Z" fill="var(--foreground)" />
      <path d="M123.6 155.6L147.4 124.6L215 213H167.5L123.6 155.6Z" fill="var(--foreground)" />
    </svg>
  );
}

/**
 * Brand loader: the Exa mark breathing at the center of a spinning
 * brand-green arc. Transparent — no background disc — so it sits cleanly on
 * any surface. Size it via className (h-5 w-5 etc.).
 */
export function AgentLoader({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Thinking"
      className={cn("relative inline-flex items-center justify-center", className)}
    >
      <svg viewBox="0 0 24 24" className="agent-loader-ring absolute inset-0 h-full w-full" aria-hidden>
        {/* faint full track */}
        <circle cx="12" cy="12" r="10.5" fill="none" stroke="var(--border)" strokeWidth="1.6" opacity="0.4" />
        {/* brand-green arc that sweeps around */}
        <circle
          cx="12"
          cy="12"
          r="10.5"
          fill="none"
          stroke="#5FC33B"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeDasharray="18 48"
        />
      </svg>
      <AgentMark active className="agent-loader-mark h-[58%] w-[58%]" />
    </span>
  );
}

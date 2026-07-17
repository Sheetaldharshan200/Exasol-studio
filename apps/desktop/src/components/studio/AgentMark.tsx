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

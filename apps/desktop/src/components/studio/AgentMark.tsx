import { cn } from "@/lib/utils";

/**
 * The Exasol AI mark: a tri-node graph converging into a core — a nod to the
 * knowledge graph that grounds the assistant. Uses currentColor throughout so
 * it inherits any text color; pass `active` for a gentle thinking pulse.
 */
export function AgentMark({ className, active = false }: { className?: string; active?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={cn(className, active && "agent-mark-active")} aria-hidden>
      <path
        d="M12 7.2v2.9M17.2 15.5l-2.8-1.6M6.8 15.5l2.8-1.6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.55"
      />
      <circle className="agent-mark-core" cx="12" cy="12.4" r="2.7" fill="currentColor" />
      <circle className="agent-mark-node" cx="12" cy="5.1" r="1.75" fill="currentColor" opacity="0.85" />
      <circle className="agent-mark-node" cx="18.6" cy="16.6" r="1.75" fill="currentColor" opacity="0.85" />
      <circle className="agent-mark-node" cx="5.4" cy="16.6" r="1.75" fill="currentColor" opacity="0.85" />
    </svg>
  );
}

import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "motion/react";
import { AgentMark } from "@/components/studio/AgentMark";
import type { PetAvatarId } from "@/components/studio/PetAvatar";
import { petBus } from "@/lib/pet-bus";
import { cn } from "@/lib/utils";

// The agent's visible hand: a Magic-UI-style smooth spring cursor, optionally
// accompanied by the pet companion. Driven imperatively — the AI's ui_* tools
// resolve a target element, the cursor glides there, pulses, and the real
// action handler fires. Reduced motion → instant fade-in at the target.

export type CursorMode = "pet" | "cursor" | "off";

export type AgentCursorHandle = {
  /** Fly to an element, dwell briefly, then resolve (caller runs the action). */
  flyTo: (el: HTMLElement | null, label: string, mode: CursorMode, avatar?: PetAvatarId) => Promise<void>;
  /** Flash success/failure at the current position, then fade out. */
  finish: (ok: boolean) => Promise<void>;
};

const SPRING = { stiffness: 130, damping: 18, mass: 0.6 };

export const AgentCursor = forwardRef<AgentCursorHandle>(function AgentCursor(_props, ref) {
  const [visible, setVisible] = useState(false);
  const withPetRef = useRef(true);
  const [label, setLabel] = useState("");
  const [state, setState] = useState<"moving" | "acting" | "done" | "failed">("moving");
  const x = useMotionValue(typeof window === "undefined" ? 0 : window.innerWidth / 2);
  const y = useMotionValue(typeof window === "undefined" ? 0 : window.innerHeight / 2);
  const sx = useSpring(x, SPRING);
  const sy = useSpring(y, SPRING);
  // SmoothCursor-style lean: tilt with horizontal velocity.
  const vx = useTransform(sx, (latest) => latest);
  const rotate = useTransform(vx, () => {
    const v = sx.getVelocity();
    return Math.max(-18, Math.min(18, v / 60));
  });
  const hideTimer = useRef<number | null>(null);

  useImperativeHandle(ref, () => ({
    async flyTo(el, lbl, mode, av) {
      if (mode === "off") return;
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
      withPetRef.current = mode === "pet";
      void av;
      setLabel(lbl);
      setState("moving");

      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      // Scroll FIRST (instantly), then measure — measuring before the scroll
      // sent the cursor to where the element USED to be.
      el?.scrollIntoView?.({ behavior: "auto", block: "nearest" });
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const rect = el?.getBoundingClientRect();
      const tx = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
      const ty = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;

      if (mode === "pet") petBus.emit({ type: "travel", x: tx + 30, y: ty + 26 });
      if (reduced) {
        x.set(tx);
        y.set(ty);
        sx.jump(tx);
        sy.jump(ty);
        setVisible(true);
        await sleep(350);
      } else {
        if (!visible) {
          // Enter from the AI panel side so the motion reads as "the agent".
          sx.jump(window.innerWidth - 80);
          sy.jump(window.innerHeight - 120);
        }
        setVisible(true);
        x.set(tx);
        y.set(ty);
        // Wait for the spring to settle near the target.
        await settled(sx, sy, tx, ty);
      }
      setState("acting");
      if (withPetRef.current) petBus.emit({ type: "work" });
      await sleep(reduced ? 150 : 420);
    },

    async finish(ok) {
      setState(ok ? "done" : "failed");
      if (withPetRef.current) {
        petBus.emit({ type: "celebrate", ok });
        window.setTimeout(() => petBus.emit({ type: "home" }), 900);
      }
      await sleep(650);
      setVisible(false);
      hideTimer.current = window.setTimeout(() => setLabel(""), 300);
    },
  }));

  return (
    <div className={cn("pointer-events-none fixed inset-0 z-[9999]", !visible && "opacity-0 transition-opacity duration-300")}>
      {/* Cursor arrow */}
      <motion.div style={{ x: sx, y: sy, rotate }} className="absolute -ml-1 -mt-1">
        <svg width="22" height="22" viewBox="0 0 24 24" className="drop-shadow-md">
          <path
            d="M4 2.5 19.5 12l-7.2 1.6L8.7 21z"
            className={cn(
              "transition-colors",
              state === "failed" ? "fill-destructive" : "fill-primary",
            )}
            stroke="white"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
        </svg>
        {/* Click ripple while acting */}
        {state === "acting" || state === "done" ? (
          <span
            className={cn(
              "absolute -left-2 -top-2 h-9 w-9 animate-ping rounded-full",
              state === "done" ? "bg-primary/30" : "bg-primary/20",
            )}
          />
        ) : null}
        {/* Label chip */}
        {label ? (
          <div className="absolute left-5 top-4 flex items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-popover/95 px-2.5 py-1 shadow-lg">
            {state === "done" ? (
              <span className="text-[10px]">✓</span>
            ) : state === "failed" ? (
              <span className="text-[10px]">✕</span>
            ) : (
              <AgentMark className="h-3 w-3 text-primary" active />
            )}
            <span className="text-[11px] font-medium text-foreground">{label}</span>
          </div>
        ) : null}
      </motion.div>

    </div>
  );
});

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

/** Resolve when both springs are close to the target (or after a timeout). */
function settled(
  sx: ReturnType<typeof useSpring>,
  sy: ReturnType<typeof useSpring>,
  tx: number,
  ty: number,
): Promise<void> {
  return new Promise((resolve) => {
    const deadline = Date.now() + 2500;
    const check = () => {
      const dx = Math.abs((sx.get() as number) - tx);
      const dy = Math.abs((sy.get() as number) - ty);
      if ((dx < 3 && dy < 3) || Date.now() > deadline) resolve();
      else requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  });
}

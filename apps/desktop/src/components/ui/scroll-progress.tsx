import { motion, useScroll, type MotionProps } from "motion/react"

import { cn } from "@/lib/utils"

interface ScrollProgressProps
  extends Omit<React.HTMLAttributes<HTMLElement>, keyof MotionProps> {
  ref?: React.Ref<HTMLDivElement>
  /** Track this scrollable element instead of the window (for in-app panels). */
  containerRef?: React.RefObject<HTMLElement | null>
}

export function ScrollProgress({
  className,
  ref,
  containerRef,
  ...props
}: ScrollProgressProps) {
  // Track a specific scroll container when given (the app scrolls in panels,
  // not the window); otherwise fall back to the viewport.
  const { scrollYProgress } = useScroll(
    containerRef ? { container: containerRef } : undefined,
  )

  return (
    <motion.div
      ref={ref}
      className={cn(
        "pointer-events-none sticky inset-x-0 top-0 left-0 z-30 h-0.5 w-full origin-left bg-gradient-to-r from-primary/50 via-primary to-primary/50",
        className,
      )}
      style={{ scaleX: scrollYProgress }}
      {...props}
    />
  )
}

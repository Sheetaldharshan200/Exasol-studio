import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { BrandLoader } from "@/components/brand/BrandLoader";
import { ThemeToggle } from "@/components/brand/ThemeToggle";
import { cn } from "@/lib/utils";
import exasolWordmark from "@/assets/exasol-wordmark.svg";
import exasolWordmarkDark from "@/assets/exasol-wordmark-dark.svg";

// The single tagline shown under the title.
const TAGLINE = "The desktop workbench for Exasol.";

export function Onboarding({ onGetStarted }: { onGetStarted: () => void }) {
  const [ready, setReady] = useState(false);

  // Let the mark write itself once before revealing the content.
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 900);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="hero-surface relative flex h-screen w-full flex-col items-center justify-center overflow-hidden bg-background text-foreground">
      <ThemeToggle
        className="absolute top-5 h-9 w-9 rounded-full border border-border hover:border-primary/40"
        style={{ right: "calc(2rem + var(--wc-right, 0px))" }}
      />

      <div className="flex flex-col items-center gap-8 px-8 text-center">
        {/* The Exasol X writes itself */}
        <div className="relative">
          <div className="absolute inset-0 -z-10 scale-150 rounded-full bg-primary/15 blur-3xl" />
          <BrandLoader size={96} />
        </div>

        <div
          className={cn(
            "flex flex-col items-center gap-5 transition-all duration-700",
            ready ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0",
          )}
        >
          {/* Title: the "Exasol" wordmark (brand logo) + "Studio" text. */}
          <div className="flex items-baseline justify-center gap-3">
            <img
              src={exasolWordmark}
              alt="Exasol"
              className="h-[40px] w-auto translate-y-[6px] dark:hidden"
            />
            <img
              src={exasolWordmarkDark}
              alt="Exasol"
              className="hidden h-[40px] w-auto translate-y-[6px] dark:block"
            />
            <span className="font-heading text-[52px] leading-[0.95] font-extrabold tracking-[-0.03em] text-primary">
              Studio
            </span>
          </div>

          <p className="text-[16px] leading-relaxed text-muted-foreground">{TAGLINE}</p>

          <button
            onClick={onGetStarted}
            className="btn-shine cta-glow mt-2 flex h-12 items-center gap-2 rounded-xl bg-primary px-8 text-[15px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <span className="relative z-[2] flex items-center gap-2">
              Get started
              <ArrowRight className="h-4 w-4" />
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

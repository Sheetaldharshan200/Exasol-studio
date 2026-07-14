import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { ThemeToggle } from "@/components/brand/ThemeToggle";
import { cn } from "@/lib/utils";
import exasolLogo from "@/assets/exasol-full-logo.svg";

export function Onboarding({ onGetStarted }: { onGetStarted: () => void }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setReady(true), 250);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="hero-surface relative flex h-screen w-full flex-col items-center justify-center overflow-hidden bg-background text-foreground">
      <ThemeToggle
        className="absolute top-5 h-9 w-9 rounded-full border border-border hover:border-primary/40"
        style={{ right: "calc(2rem + var(--wc-right, 0px))" }}
      />

      <div
        className={cn(
          "flex flex-col items-center gap-6 px-8 text-center transition-all duration-700",
          ready ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0",
        )}
      >
        <div className="absolute inset-0 -z-10 mx-auto h-64 w-64 self-center rounded-full bg-primary/10 blur-3xl" />

        {/* Brand: the full Exasol logo stands in for the word "Exasol". */}
        <div className="flex items-center gap-3">
          <img
            src={exasolLogo}
            alt="Exasol"
            className="h-14 w-auto dark:brightness-0 dark:invert"
          />
          <span className="font-heading text-[46px] leading-none font-extrabold tracking-[-0.03em] text-primary">
            Studio
          </span>
        </div>

        <p className="text-[17px] text-muted-foreground">The desktop workbench for Exasol.</p>

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
  );
}

import { useEffect, useState } from "react";
import { ArrowRight, Boxes, Database, Zap } from "lucide-react";
import { BrandLoader } from "@/components/brand/BrandLoader";
import { ThemeToggle } from "@/components/brand/ThemeToggle";
import { cn } from "@/lib/utils";
import exasolLogo from "@/assets/exasol-full-logo.svg";

const HIGHLIGHTS = [
  { icon: Database, label: "Full database tree" },
  { icon: Boxes, label: "Virtual schemas & scripts" },
  { icon: Zap, label: "First query in seconds" },
];

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
            "flex flex-col items-center gap-4 transition-all duration-700",
            ready ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0",
          )}
        >
          <div>
            <span className="eyebrow">Analytics database workbench</span>
            {/* The "Exasol" wordmark is the full logo; "Studio" stays as text. */}
            <div className="mt-2 flex items-center justify-center gap-3">
              <img src={exasolLogo} alt="Exasol" className="h-[44px] w-auto dark:brightness-0 dark:invert" />
              <span className="font-heading text-[52px] leading-[0.95] font-extrabold tracking-[-0.03em] text-primary">
                Studio
              </span>
            </div>
          </div>

          <p className="max-w-md text-[16px] leading-relaxed text-muted-foreground">
            A desktop-native workbench for Exasol — browse everything the database ships with,
            write SQL over the native driver, and get help from an AI that knows Exasol.
          </p>

          <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
            {HIGHLIGHTS.map(({ icon: Icon, label }) => (
              <span
                key={label}
                className="flex items-center gap-1.5 rounded-full border border-border bg-secondary/40 px-3 py-1.5 text-xs text-foreground/80"
              >
                <Icon className="h-3.5 w-3.5 text-primary" />
                {label}
              </span>
            ))}
          </div>

          <button
            onClick={onGetStarted}
            className="btn-shine cta-glow mt-4 flex h-12 items-center gap-2 rounded-xl bg-primary px-8 text-[15px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
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

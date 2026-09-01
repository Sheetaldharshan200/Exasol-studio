import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AI_STYLE_DEFAULTS, loadAiStyle, saveAiStyle, type AiStyle } from "@/features/assistant/exa/ai-style";
import { EXA_PERSONAS } from "@/features/assistant/exa/ExaThread";
import { cn } from "@/lib/utils";

/** One settings row: label + explanation left, control right. */
function Row({ label, help, children, divider = true }: { label: string; help?: string; children: React.ReactNode; divider?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between gap-6 py-3.5", divider && "border-b border-border/50")}>
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-foreground">{label}</p>
        {help ? <p className="mt-0.5 max-w-md text-[12px] leading-relaxed text-muted-foreground">{help}</p> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Picker<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  const current = options.find((o) => o.value === value) ?? options[0];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex h-8 items-center gap-1.5 rounded-lg bg-secondary px-3 text-[12.5px] font-medium text-foreground hover:bg-secondary/70">
          {current.label}
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {options.map((o) => (
          <DropdownMenuItem key={o.value} onClick={() => onChange(o.value)}>
            <span className="flex-1">{o.label}</span>
            {o.value === value ? <span className="h-1.5 w-1.5 rounded-full bg-primary" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Personalization for the assistant: persona, depth, output format, tone,
 * emoji, and standing custom instructions. Everything applies to the NEXT
 * message immediately — the chat reads these at send time — and survives
 * restarts. Persona shares its store with the chat's persona picker and the
 * questionnaire auto-set, so all three always agree.
 */
export function AiPersonalization() {
  const [style, setStyle] = useState<AiStyle>(() => loadAiStyle());
  const [persona, setPersona] = useState<string | null>(() => {
    try {
      return localStorage.getItem("exa.persona");
    } catch {
      return null;
    }
  });

  // Follow changes made elsewhere (the chat's picker, another window).
  useEffect(() => {
    const sync = () => {
      setStyle(loadAiStyle());
      try {
        setPersona(localStorage.getItem("exa.persona"));
      } catch {
        /* private mode */
      }
    };
    window.addEventListener("storage", sync);
    window.addEventListener("exa:style-changed", sync);
    window.addEventListener("exa:persona-changed", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("exa:style-changed", sync);
      window.removeEventListener("exa:persona-changed", sync);
    };
  }, []);

  const patch = (p: Partial<AiStyle>) => setStyle(saveAiStyle(p));
  const pickPersona = (name: string | null) => {
    setPersona(name);
    try {
      if (name) localStorage.setItem("exa.persona", name);
      else localStorage.removeItem("exa.persona");
    } catch {
      /* private mode */
    }
    window.dispatchEvent(new CustomEvent("exa:persona-changed"));
  };

  return (
    <div className="max-w-xl">
      <Row label="Persona" help="Who the assistant is answering: sets the discipline and depth answers are presented at. The chat's persona icon and the onboarding questions set the same value.">
        <Picker
          value={persona ?? "__adaptive__"}
          options={[{ value: "__adaptive__", label: "Adaptive" }, ...EXA_PERSONAS.map((p) => ({ value: p.key, label: p.label }))]}
          onChange={(v) => pickPersona(v === "__adaptive__" ? null : v)}
        />
      </Row>
      <Row label="Technical depth" help="How much explanation comes with each answer.">
        <Picker
          value={style.depth}
          options={[
            { value: "concise", label: "Just the answer" },
            { value: "balanced", label: "Balanced" },
            { value: "deep", label: "Deep dives" },
          ]}
          onChange={(v) => patch({ depth: v })}
        />
      </Row>
      <Row label="Preferred output" help="How results are presented by default.">
        <Picker
          value={style.output}
          options={[
            { value: "tables", label: "Tables" },
            { value: "charts", label: "Charts / dashboards" },
            { value: "sql", label: "SQL first" },
            { value: "prose", label: "Prose" },
          ]}
          onChange={(v) => patch({ output: v })}
        />
      </Row>
      <Row label="Tone" help="The voice answers are written in.">
        <Picker
          value={style.tone}
          options={[
            { value: "professional", label: "Professional" },
            { value: "friendly", label: "Friendly" },
            { value: "direct", label: "Direct" },
          ]}
          onChange={(v) => patch({ tone: v })}
        />
      </Row>
      <Row label="Emoji" help="Whether answers may use emoji.">
        <Picker
          value={style.emoji}
          options={[
            { value: "never", label: "Never" },
            { value: "sparing", label: "Sparing" },
          ]}
          onChange={(v) => patch({ emoji: v })}
        />
      </Row>
      <div className="py-3.5">
        <p className="text-[13px] font-medium text-foreground">Custom instructions</p>
        <p className="mt-0.5 text-[12px] text-muted-foreground">Standing preferences woven into every message — behavior, style, house rules.</p>
        <textarea
          value={style.custom}
          onChange={(e) => patch({ custom: e.target.value })}
          placeholder="e.g. Always include row counts. Use ISO dates. Prefer ANSI joins."
          rows={3}
          maxLength={600}
          className="mt-2 w-full resize-none rounded-lg border border-border bg-panel px-3 py-2 text-[12.5px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary/50"
        />
        <p className="mt-1 text-right text-[10.5px] text-muted-foreground/70">{style.custom.length}/600</p>
      </div>
      <button
        onClick={() => {
          setStyle(saveAiStyle({ ...AI_STYLE_DEFAULTS }));
          pickPersona(null);
        }}
        className="text-[12px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
      >
        Restore defaults
      </button>
    </div>
  );
}

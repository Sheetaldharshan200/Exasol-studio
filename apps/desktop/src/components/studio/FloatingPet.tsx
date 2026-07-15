import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { Send } from "lucide-react";
import { AgentMark } from "@/components/studio/AgentMark";
import { agent } from "@/lib/agent-client";
import { EV_AI_PROVIDERS_CHANGED } from "@/lib/ai-window";
import { cn } from "@/lib/utils";

/**
 * The always-there pet: idles in the corner of the workbench; tap it and ask
 * right there — the question is handed to the AI panel (which opens if
 * hidden). Only shown when pet mode is enabled in AI Settings.
 */
export function FloatingPet({ onAsk }: { onAsk: (text: string) => void }) {
  const [enabled, setEnabled] = useState(true);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const check = () =>
      agent
        .getSettings()
        .then(({ settings }) => setEnabled(settings.petMode === "pet"))
        .catch(() => undefined);
    void check();
    const un = listen(EV_AI_PROVIDERS_CHANGED, () => void check());
    return () => void un.then((f) => f());
  }, []);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!enabled) return null;

  function submit() {
    const t = text.trim();
    if (!t) return;
    setText("");
    setOpen(false);
    onAsk(t);
  }

  return (
    <div ref={boxRef} className="fixed bottom-12 right-4 z-40 flex flex-col items-end gap-2">
      {open ? (
        <div className="w-72 rounded-2xl border border-border bg-popover p-2 shadow-xl">
          <div className="flex items-center gap-1.5 px-1 pb-1.5">
            <AgentMark className="h-3.5 w-3.5 text-primary" />
            <span className="text-[11px] font-medium text-foreground">Ask me anything</span>
          </div>
          <div className="flex items-center gap-1.5">
            <input
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
              placeholder="e.g. connect and show my schemas…"
              className="h-8 min-w-0 flex-1 rounded-lg border border-border bg-editor px-2.5 text-[12px] outline-none placeholder:text-muted-foreground focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/15"
            />
            <button
              onClick={submit}
              disabled={!text.trim()}
              aria-label="Ask"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/85 disabled:opacity-40"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ) : null}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Ask the Exasol AI pet"
        title="Ask me anything"
        className={cn(
          "agent-pet flex h-11 w-11 items-center justify-center rounded-[16px] border border-primary/30 bg-panel shadow-lg transition-transform hover:scale-105",
          open && "scale-105 border-primary/60",
        )}
      >
        <AgentMark className="h-6 w-6 text-primary" active={open} />
      </button>
    </div>
  );
}

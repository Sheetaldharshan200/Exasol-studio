// Asks for the values of a script's placeholders (`&name`, `:name`) before
// it runs. A value is inserted as SQL, or as a text literal when "Text" is
// ticked. Values are remembered for this session to prefill the next run.

import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { paramKey, textLiteral, type Param } from "@/lib/sql-params";

type Ask = { params: Param[]; resolve: (v: Record<string, string> | null) => void };
type Entry = { value: string; text: boolean };

let ask: ((params: Param[]) => Promise<Record<string, string> | null>) | null = null;

/** The values to substitute (keys `&name` / `:name`), or null when cancelled. */
export function askParams(params: Param[]): Promise<Record<string, string> | null> {
  return ask ? ask(params) : Promise.resolve(null);
}

export function ParamsDialog() {
  const [pending, setPending] = useState<Ask | null>(null);
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const remembered = useRef<Record<string, Entry>>({});

  useEffect(() => {
    ask = (params) =>
      new Promise((resolve) => {
        setEntries(Object.fromEntries(params.map((p) => [paramKey(p), remembered.current[paramKey(p)] ?? { value: "", text: false }])));
        setPending({ params, resolve });
      });
    return () => {
      ask = null;
    };
  }, []);

  const finish = (run: boolean) => {
    if (!pending) return;
    if (run) {
      remembered.current = { ...remembered.current, ...entries };
      pending.resolve(Object.fromEntries(Object.entries(entries).map(([k, e]) => [k, e.text ? textLiteral(e.value) : e.value])));
    } else {
      pending.resolve(null);
    }
    setPending(null);
  };

  return (
    <Dialog open={!!pending} onOpenChange={(open) => !open && finish(false)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Values for this run</DialogTitle>
          <DialogDescription>Each placeholder is replaced before the SQL runs. Tick "Text" to insert a value as a quoted string.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            finish(true);
          }}
          className="space-y-2"
        >
          {pending?.params.map((p, i) => {
            const k = paramKey(p);
            const e = entries[k] ?? { value: "", text: false };
            return (
              <div key={k} className="flex items-center gap-2">
                <span className="w-28 shrink-0 truncate font-mono text-[12px] text-foreground" title={k}>
                  {k}
                </span>
                <input
                  autoFocus={i === 0}
                  value={e.value}
                  aria-label={k}
                  onChange={(ev) => setEntries((m) => ({ ...m, [k]: { ...e, value: ev.target.value } }))}
                  className="h-8 min-w-0 flex-1 rounded-md border border-border bg-secondary/30 px-2 font-mono text-[12.5px] text-foreground outline-none focus:border-primary/60"
                />
                <label className="flex shrink-0 items-center gap-1 text-[11.5px] text-muted-foreground">
                  <input type="checkbox" checked={e.text} onChange={(ev) => setEntries((m) => ({ ...m, [k]: { ...e, text: ev.target.checked } }))} /> Text
                </label>
              </div>
            );
          })}
          <DialogFooter className="gap-2 pt-2">
            <button type="button" onClick={() => finish(false)} className="h-8 rounded-md border border-border px-3 text-[12.5px] text-foreground hover:bg-secondary">
              Cancel
            </button>
            <button type="submit" className="h-8 rounded-md bg-primary px-3 text-[12.5px] font-medium text-primary-foreground hover:bg-primary/85">
              Run
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

import { cn } from "@/lib/utils";
import { VS_ADAPTERS } from "../adapters/index.ts";
import type { VsAdapter } from "../types.ts";
import { SourceLogo } from "../SourceLogo";

const GROUPS: { kind: VsAdapter["kind"]; title: string; hint: string }[] = [
  { kind: "jdbc", title: "Databases", hint: "Relational sources, through their JDBC drivers" },
  { kind: "document", title: "Object storage and document stores", hint: "Files in a bucket, or a document database, mapped to tables" },
  { kind: "exasol", title: "Another Exasol", hint: "A schema on another Exasol, read live" },
];

/** Step 1: what the data lives in. One tile per adapter in the catalog. */
export function SourcePicker({ selected, onSelect }: { selected: VsAdapter | null; onSelect: (a: VsAdapter) => void }) {
  return (
    <div className="grid gap-5">
      {GROUPS.map((g) => {
        const items = VS_ADAPTERS.filter((a) => a.kind === g.kind);
        return (
          <section key={g.kind}>
            <h4 className="text-[12px] font-semibold text-foreground">{g.title}</h4>
            <p className="mb-2 text-[11px] text-muted-foreground">{g.hint}</p>
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
              {items.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  data-agent-id={`add-source.pick.${a.id}`}
                  onClick={() => onSelect(a)}
                  className={cn(
                    "flex h-[68px] flex-col items-center justify-center gap-1.5 rounded-md border px-2 text-center text-[11px] leading-tight",
                    selected?.id === a.id
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-panel/40 text-muted-foreground hover:border-primary/50 hover:text-foreground",
                  )}
                >
                  <SourceLogo logo={a.logo} className="h-6 w-6" />
                  <span className="truncate w-full">{a.name}</span>
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

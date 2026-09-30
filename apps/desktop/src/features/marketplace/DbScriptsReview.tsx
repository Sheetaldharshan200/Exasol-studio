// Review before a script library runs into a database: the connection it
// goes to, the schema it goes into, and every statement — nothing runs
// until the person confirms. The plan comes from the backend, which has
// downloaded and verified the release's files to build it.

import { useEffect, useState } from "react";
import { Check, ChevronDown, Loader2, ShieldCheck, X } from "lucide-react";
import { Icon as BxIcon } from "@/components/ui/icon";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { errorMessage, ipc, type ScriptPlan } from "@/lib/ipc";
import { cn } from "@/lib/utils";
import type { ResolvedCatalogItem as CatalogItem } from "@/features/marketplace/catalog-data";

type Profile = { id: string; name: string };

/** A schema name Studio will put into a statement: one plain identifier. */
export function validSchema(s: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(s);
}

export function DbScriptsReview({
  item,
  profiles,
  requested,
  onConfirm,
  onClose,
}: {
  item: CatalogItem;
  profiles: Profile[];
  /** The version picked on the card, if any. */
  requested?: string;
  /** The reviewed plan travels with the confirmation: its version pins the
   *  release and its fingerprint pins the statements. */
  onConfirm: (profileId: string, schema: string, plan: { version: string; fingerprint: string }) => void;
  onClose: () => void;
}) {
  const defaultSchema = item.source?.kind === "db-scripts" ? item.source.schema : "";
  const [profileId, setProfileId] = useState<string>(profiles.length === 1 ? profiles[0].id : "");
  const [schema, setSchema] = useState(defaultSchema);
  const [plan, setPlan] = useState<ScriptPlan | "loading" | { error: string }>("loading");
  const schemaOk = validSchema(schema);

  // The plan follows the schema: statements name it, so a change re-reads.
  // Only the newest request may land — an older reply must not show a plan
  // for a schema that is no longer the one on screen.
  useEffect(() => {
    if (!schemaOk || !item.repo) return;
    setPlan("loading");
    let live = true;
    const handle = window.setTimeout(() => {
      ipc.marketDbScriptsPlan(item.id, item.repo!, requested, schema).then(
        (p) => live && setPlan(p),
        (e) => live && setPlan({ error: errorMessage(e) }),
      );
    }, 400);
    return () => {
      live = false;
      window.clearTimeout(handle);
    };
  }, [item.id, item.repo, requested, schema, schemaOk]);

  const connection = profiles.find((p) => p.id === profileId);
  const ready = Boolean(connection) && schemaOk && typeof plan === "object" && !("error" in plan);
  const count = typeof plan === "object" && !("error" in plan) ? plan.statements.length : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm">
      <div className="relative flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-panel shadow-2xl">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <span className="flex-1 text-[13px] font-semibold text-foreground">Review · {item.name}</span>
          <button onClick={onClose} aria-label="Close" className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="grid gap-3 overflow-y-auto p-5">
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            This changes a database. Pick where it goes and read what will run; nothing runs until you confirm.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  aria-label="Connection to install into"
                  className="flex h-8 max-w-[260px] items-center gap-1.5 rounded-md border border-border bg-background px-2 text-[12px] text-foreground hover:bg-secondary"
                >
                  <BxIcon name="database" className="h-3.5 w-3.5 text-primary" />
                  <span className="truncate">{connection?.name ?? "Choose a connection"}</span>
                  <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64">
                <DropdownMenuLabel>Install into</DropdownMenuLabel>
                {profiles.length === 0 ? (
                  <div className="px-2 py-1.5 text-[11px] text-muted-foreground">No connections yet — add one first.</div>
                ) : null}
                {profiles.map((p) => (
                  <DropdownMenuItem key={p.id} onClick={() => setProfileId(p.id)}>
                    <BxIcon name="database" className="h-3.5 w-3.5" />
                    <span className="flex-1 truncate">{p.name}</span>
                    {profileId === p.id ? <Check className="h-3 w-3" /> : null}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <label className="flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-2 text-[12px]">
              <span className="text-muted-foreground">Schema</span>
              <input
                value={schema}
                onChange={(e) => setSchema(e.target.value.trim())}
                spellCheck={false}
                aria-label="Schema to install into"
                className={cn("w-40 bg-transparent font-mono text-[12px] outline-none", !schemaOk && "text-destructive")}
              />
            </label>
            {!schemaOk ? <span className="text-[11px] text-destructive">One plain name: letters, digits and underscores.</span> : null}
          </div>

          {plan === "loading" ? (
            <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading and verifying the release's scripts…
            </div>
          ) : "error" in plan ? (
            <p className="text-[12px] text-destructive">{plan.error}</p>
          ) : (
            <div className="grid gap-2">
              <div className="text-[11px] text-muted-foreground">
                {plan.version} · {plan.files.join(", ")} · {plan.statements.length} statements
              </div>
              <ol className="max-h-80 overflow-y-auto rounded-md border border-border bg-background p-2 font-mono text-[11px] leading-relaxed">
                {plan.statements.map((s, i) => (
                  <li key={i} className="text-foreground">
                    <details>
                      <summary className="flex cursor-pointer gap-2">
                        <span className="w-6 shrink-0 text-right text-muted-foreground">{i + 1}</span>
                        <span className="truncate">{s.head}</span>
                      </summary>
                      <pre className="ml-8 mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-secondary/40 p-2 text-[10.5px] text-muted-foreground">{s.body}</pre>
                    </details>
                  </li>
                ))}
              </ol>
              <p className="text-[11px] text-muted-foreground">
                Removal drops exactly these objects on this connection; the schema only if it was created here.
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button onClick={onClose} className="flex h-8 items-center rounded-md border border-border px-3 text-[12px] text-muted-foreground hover:bg-secondary hover:text-foreground">
            Cancel
          </button>
          <button
            onClick={() => connection && typeof plan === "object" && !("error" in plan) && onConfirm(connection.id, schema, { version: plan.version, fingerprint: plan.fingerprint })}
            disabled={!ready}
            className="cta-glow flex h-8 items-center gap-1.5 rounded-md bg-primary px-3.5 text-[12px] font-medium text-primary-foreground hover:bg-primary/85 disabled:opacity-50"
          >
            <BxIcon name="arrow-to-bottom" className="h-3.5 w-3.5" />
            {connection ? `Run ${count} statements on ${connection.name}` : "Choose a connection"}
          </button>
        </div>
      </div>
    </div>
  );
}

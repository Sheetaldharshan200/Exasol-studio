import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ExternalLink, Lightbulb, Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { agent, skills as skillsApi } from "@/lib/agent-client";
import { errorMessage, ipc, type SkillTarget } from "@/lib/ipc";
import { cn } from "@/lib/utils";
import { ExasolMark } from "@/components/brand/ExasolMark";
import { Icon } from "@/components/ui/icon";
import type { IconName } from "@/components/ui/boxicons";

/**
 * Skills — Exasol's official agent skills (exasol-labs/exasol-agent-skills),
 * installable one by one or as role bundles, into Studio's own agent (exa-ai)
 * and any detected external agent. External installs run the cross-agent
 * `skills` CLI (each provider's supported path); exa-ai fetches the official
 * SKILL.md and activates it. Bundles contain ONLY official skills.
 */

type OfficialSkill = { id: string; label: string; desc: string; icon: IconName };

const OFFICIAL: OfficialSkill[] = [
  { id: "exasol-database", label: "Database", desc: "SQL, schemas, profiling and Exasol-specific behavior.", icon: "database" },
  { id: "exasol-import", label: "Import", desc: "Load data into Exasol from files and sources.", icon: "download" },
  { id: "exasol-export", label: "Export", desc: "Move query results and tables out of Exasol.", icon: "upload" },
  { id: "exasol-bucketfs", label: "BucketFS", desc: "Manage the bucket filesystem and its contents.", icon: "package" },
  { id: "exasol-udfs", label: "UDFs", desc: "Write and run user-defined functions.", icon: "terminal" },
  { id: "exasol-jdbc-virtual-schemas", label: "JDBC virtual schemas", desc: "Query external databases through JDBC adapters.", icon: "git-merge" },
  { id: "exasol-document-virtual-schemas", label: "Document virtual schemas", desc: "Map document sources into schemas.", icon: "file" },
  { id: "exasol-text-ai", label: "Text AI", desc: "Text analytics inside the database.", icon: "brain-circuit" },
  { id: "exasol-distributed-ml", label: "Distributed ML", desc: "Train models across the cluster.", icon: "cognition" },
  { id: "exasol-transformers", label: "Transformers", desc: "Run transformer models in-database.", icon: "chip" },
  { id: "exasol-cloud-storage-extension", label: "Cloud storage", desc: "Read and write cloud object storage.", icon: "files" },
  { id: "exasol-extension-catalog", label: "Extension catalog", desc: "Discover and manage extensions.", icon: "extension" },
  { id: "exasol-notebook-connections", label: "Notebook connections", desc: "Connect notebooks to Exasol.", icon: "notebook" },
  { id: "exasol-ai-setup", label: "AI setup", desc: "Prepare the database for AI workloads.", icon: "brain-circuit" },
  { id: "exasol-setup-personal", label: "Set up Personal", desc: "Install and run Exasol Personal locally.", icon: "plug" },
  { id: "exasol-itde", label: "ITDE", desc: "The integration-test Docker environment.", icon: "spanner" },
  { id: "exasol-virtual-schema-adapter-development", label: "Adapter development", desc: "Build your own virtual-schema adapters.", icon: "wrench" },
  { id: "exasol", label: "Exasol core", desc: "The umbrella skill routing to the others.", icon: "skills" },
];

const byId = new Map(OFFICIAL.map((s) => [s.id, s]));

/** Role bundles — curated groupings of OFFICIAL skills only. */
const BUNDLES: { id: string; label: string; desc: string; icon: IconName; skills: string[] }[] = [
  { id: "data-engineer", label: "Data Engineer", desc: "Move data in and out, storage, pipelines.", icon: "database", skills: ["exasol-import", "exasol-export", "exasol-bucketfs", "exasol-cloud-storage-extension"] },
  { id: "analyst", label: "Analyst", desc: "Query, explore and analyze.", icon: "dashboards", skills: ["exasol-database", "exasol-text-ai", "exasol-notebook-connections"] },
  { id: "ml-engineer", label: "ML Engineer", desc: "Models and functions in the database.", icon: "chip", skills: ["exasol-distributed-ml", "exasol-transformers", "exasol-udfs", "exasol-ai-setup"] },
  { id: "integration-developer", label: "Integration Developer", desc: "Connect external systems via virtual schemas.", icon: "git-merge", skills: ["exasol-jdbc-virtual-schemas", "exasol-document-virtual-schemas", "exasol-virtual-schema-adapter-development", "exasol-extension-catalog"] },
  { id: "getting-started", label: "Getting Started", desc: "A local database and the essentials.", icon: "play", skills: ["exasol", "exasol-setup-personal", "exasol-database", "exasol-itde"] },
];

/* Brand marks (inline, currentColor) — Anthropic/Claude and OpenAI/Codex. */
function ClaudeLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M17.304 3.541h-3.672l6.696 16.918H24Zm-10.608 0L0 20.459h3.744l1.37-3.553h7.005l1.369 3.553h3.744L10.536 3.541Zm-.371 10.223 2.291-5.946 2.292 5.946Z" />
    </svg>
  );
}
function OpenAiLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.182a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .511 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073ZM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.142-.081 4.778-2.758a.795.795 0 0 0 .393-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.495 4.494ZM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646ZM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786a4.504 4.504 0 0 1-1.648-6.117Zm16.597 3.855-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667Zm2.01-3.023-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66Zm-12.64 4.135-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681Zm1.098-2.365 2.602-1.5 2.607 1.5v3l-2.597 1.5-2.607-1.5Z" />
    </svg>
  );
}

type Dest = {
  id: string;
  label: string;
  logo: (c: string) => React.ReactNode;
  installed: boolean;
  installUrl?: string;
};

/** Multi-select add menu (per skill or per bundle): check destinations, one
 * "Add" applies to all. Hoisted so it keeps identity across parent renders. */
function InstallMenu({ rowId, skillIds, allActive, dests, busy, onInstall, label = "Add", installedIn }: {
  rowId: string;
  skillIds: string[];
  allActive: boolean;
  dests: Dest[];
  busy: string | null;
  onInstall: (destIds: string[], skillIds: string[], rowId: string) => void;
  label?: string;
  /** Whether a destination already has ALL of this row's skills. */
  installedIn: (destId: string) => boolean;
}) {
  const isBusy = busy === rowId;
  const [sel, setSel] = useState<Set<string>>(() => new Set(["studio"]));
  const toggle = (id: string) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  // Only currently-available destinations count — a stale selection for an
  // agent that disappeared must never be attempted — and already-added ones
  // are inert rows, so they never re-install.
  const chosen = [...sel].filter((id) => dests.some((d) => d.id === id && d.installed) && !installedIn(id));
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "flex h-7 shrink-0 items-center gap-1 rounded-md border px-2.5 text-[11.5px] font-medium transition-colors",
            allActive
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:bg-secondary hover:text-foreground",
          )}
          disabled={isBusy || busy !== null}
        >
          {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          {allActive ? "Added" : label}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Add to</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {dests.map((d) =>
          d.installed && installedIn(d.id) ? (
            // Already added everywhere this row covers — a plain, inert row.
            // No checkbox tick: "Added" already says it, and a tick reads as a
            // pending selection.
            <DropdownMenuItem key={d.id} disabled className="gap-2 text-[12px]" onSelect={(e) => e.preventDefault()}>
              {d.logo("h-3.5 w-3.5")}
              {d.label}
              <span className="ml-auto text-[10px] font-medium text-primary">Added</span>
            </DropdownMenuItem>
          ) : d.installed ? (
            <DropdownMenuCheckboxItem
              key={d.id}
              checked={sel.has(d.id)}
              // keep the menu open while picking destinations
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={() => toggle(d.id)}
              className="gap-2 text-[12px]"
            >
              {d.logo("h-3.5 w-3.5")}
              {d.label}
            </DropdownMenuCheckboxItem>
          ) : (
            <DropdownMenuItem
              key={d.id}
              className="gap-2 text-[12px] text-muted-foreground"
              onClick={() => d.installUrl && ipc.openExternal(d.installUrl).catch(() => window.open(d.installUrl, "_blank"))}
            >
              {d.logo("h-3.5 w-3.5 opacity-50")}
              {d.label}
              <ExternalLink className="ml-auto h-3 w-3 opacity-50" />
            </DropdownMenuItem>
          ),
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={chosen.length === 0}
          onClick={() => onInstall(chosen, skillIds, rowId)}
          className="justify-center text-[12px] font-medium text-primary focus:text-primary"
        >
          Add to {chosen.length} agent{chosen.length === 1 ? "" : "s"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function SkillsTab() {
  const [active, setActive] = useState<Set<string>>(new Set());
  const [targets, setTargets] = useState<SkillTarget[]>([]);
  // What each EXTERNAL agent already has (scanned skill dirs), by target id.
  const [installedMap, setInstalledMap] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Monotonic guard so an older scan can never overwrite a newer one.
  const scanSeq = useRef(0);

  const refreshInstalledMap = useCallback(async () => {
    const seq = ++scanSeq.current;
    const map = await ipc.skillsInstalledOfficial().catch(() => null);
    if (map && scanSeq.current === seq) setInstalledMap(map);
  }, []);

  const refresh = useCallback(async () => {
    ipc.skillsListTargets().then(setTargets).catch(() => undefined);
    void refreshInstalledMap();
    try {
      const { settings } = await agent.getSettings();
      setActive(new Set(settings.defaultSkills));
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [refreshInstalledMap]);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const ext = (id: string) => targets.find((t) => t.id === id);
  const dests: Dest[] = [
    { id: "studio", label: "exa-ai", logo: (c) => <ExasolMark size={14} className={c} />, installed: true },
    { id: "claude-code", label: "Claude Code", logo: (c) => <ClaudeLogo className={c} />, installed: !!ext("claude-code")?.installed, installUrl: ext("claude-code")?.installUrl },
    { id: "codex", label: "Codex", logo: (c) => <OpenAiLogo className={c} />, installed: !!ext("codex")?.installed, installUrl: ext("codex")?.installUrl },
  ];

  /** True when `destId` already has every skill in `ids`. */
  const installedIn = (destId: string, ids: string[]) =>
    destId === "studio"
      ? ids.every((id) => active.has(id))
      : ids.every((id) => (installedMap[destId] ?? []).includes(id));
  /** "Added" only when EVERY installed agent (exa-ai + detected ones) has it. */
  const addedEverywhere = (ids: string[]) =>
    dests.filter((d) => d.installed).every((d) => installedIn(d.id, ids));

  /** Add official skills to the chosen destinations. Each destination is
   * attempted independently; failures carry the REAL error message. */
  async function installTo(destIds: string[], skillIds: string[], rowId: string) {
    if (busy) return; // one install at a time — settings updates must not race
    setBusy(rowId);
    setNote(null);
    const done: string[] = [];
    const failed: string[] = [];
    for (const destId of destIds) {
      const label = dests.find((d) => d.id === destId)?.label ?? destId;
      try {
        if (destId === "studio") {
          // Save every skill first, then ONE settings update (no per-skill
          // read-modify-write, which could drop concurrent additions).
          const saved: string[] = [];
          for (const id of skillIds) {
            const s = await ipc.skillsFetchOfficial(id);
            await skillsApi.save(s.id, s.description || byId.get(id)?.desc || s.name, s.body);
            saved.push(s.id);
          }
          const { settings } = await agent.getSettings();
          const set = new Set(settings.defaultSkills);
          saved.forEach((id) => set.add(id));
          await agent.setSettings({ defaultSkills: [...set] });
        } else {
          await ipc.skillsInstallOfficial(destId, skillIds);
        }
        done.push(label);
      } catch (e) {
        failed.push(`${label} — ${errorMessage(e)}`);
      }
    }
    if (destIds.includes("studio")) await refresh();
    await refreshInstalledMap();
    setNote(
      failed.length
        ? `${done.length ? `Added to ${done.join(", ")}. ` : ""}Failed: ${failed.join("; ")}`
        : `Added to ${done.join(", ")}.`,
    );
    setBusy(null);
  }

  const menuProps = (rowId: string, skillIds: string[], label?: string) => ({
    rowId,
    skillIds,
    label,
    allActive: addedEverywhere(skillIds),
    dests,
    busy,
    installedIn: (d: string) => installedIn(d, skillIds),
    onInstall: (d: string[], ids: string[], r: string) => void installTo(d, ids, r),
  });

  return (
    <div className="flex h-full min-h-0 flex-col bg-editor">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-4">
        <Lightbulb className="h-4 w-4 text-primary" />
        <span className="font-heading text-[14px] font-bold text-foreground">Skills</span>
        <span className="text-xs text-muted-foreground">{loading ? "…" : `${active.size} active in exa-ai`}</span>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 [scrollbar-width:thin]">
        <div className="w-full">
          <p className="mb-4 text-[12.5px] leading-relaxed text-muted-foreground">
            Exasol's official agent skills — add them one by one or as a role bundle, to{" "}
            <span className="font-medium text-foreground">exa-ai</span>, Claude Code or Codex. External installs use each
            agent's own tooling; Studio never edits an agent's files by hand.
          </p>
          {note ? <p className="mb-3 rounded-md bg-secondary/60 px-2.5 py-1.5 text-[11.5px] text-foreground">{note}</p> : null}

          <Tabs defaultValue="official">
            <div className="mb-4 flex items-center justify-between">
              <TabsList className="h-8">
                <TabsTrigger value="official" className="text-[12px] data-[state=active]:bg-primary/15 data-[state=active]:text-primary">Official skills</TabsTrigger>
                <TabsTrigger value="bundles" className="text-[12px] data-[state=active]:bg-primary/15 data-[state=active]:text-primary">Bundles</TabsTrigger>
              </TabsList>
              <InstallMenu {...menuProps("__all", OFFICIAL.map((s) => s.id), "Add all")} />
            </div>

            <TabsContent value="official">
              <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
                {OFFICIAL.map((s) => {
                  const added = addedEverywhere([s.id]);
                  return (
                    <div key={s.id} className="flex flex-col rounded-xl border border-border bg-panel/60 p-3.5 transition-colors hover:border-primary/40">
                      <div className="flex items-center gap-2">
                        <Icon name={s.icon} className={cn("h-4.5 w-4.5 shrink-0", added ? "text-primary" : "text-muted-foreground")} />
                        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground">{s.label}</span>
                        <span className="rounded bg-primary/15 px-1 py-px text-[9px] font-medium uppercase text-primary">official</span>
                      </div>
                      <p className="mt-1.5 flex-1 text-[11.5px] leading-relaxed text-muted-foreground">{s.desc}</p>
                      <div className="mt-2.5 flex justify-end">
                        <InstallMenu {...menuProps(s.id, [s.id])} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </TabsContent>

            <TabsContent value="bundles">
              <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]">
                {BUNDLES.map((b) => {
                  const added = addedEverywhere(b.skills);
                  return (
                    <div key={b.id} className="flex flex-col rounded-xl border border-border bg-panel/60 p-3.5 transition-colors hover:border-primary/40">
                      <div className="flex items-center gap-2">
                        <Icon name={b.icon} className={cn("h-4.5 w-4.5 shrink-0", added ? "text-primary" : "text-muted-foreground")} />
                        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground">{b.label}</span>
                        <span className="rounded bg-secondary/70 px-1.5 py-px font-mono text-[9.5px] text-muted-foreground">{b.skills.length} skills</span>
                      </div>
                      <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted-foreground">{b.desc}</p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {b.skills.map((id) => (
                          <span key={id} className={cn("rounded px-1.5 py-px text-[10px]", installedIn("studio", [id]) ? "bg-primary/15 text-primary" : "bg-secondary/60 text-muted-foreground")}>
                            {byId.get(id)?.label ?? id}
                          </span>
                        ))}
                      </div>
                      <div className="mt-2.5 flex justify-end">
                        <InstallMenu {...menuProps(b.id, b.skills)} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

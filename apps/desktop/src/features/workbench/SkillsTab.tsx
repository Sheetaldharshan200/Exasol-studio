import { useCallback, useEffect, useState } from "react";
import { Check, ChevronDown, ExternalLink, Lightbulb, Loader2 } from "lucide-react";
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
import { ipc, type SkillTarget } from "@/lib/ipc";
import { cn } from "@/lib/utils";
import { ExasolMark } from "@/components/brand/ExasolMark";

/**
 * Skills — Exasol's official agent skills (exasol-labs/exasol-agent-skills),
 * installable one by one or as role bundles, into Studio's own agent and any
 * detected external agent. External installs run each provider's own tooling
 * (the cross-agent `skills` CLI / claude plugin); the Studio agent fetches the
 * official SKILL.md and activates it. Bundles contain ONLY official skills.
 */

type OfficialSkill = { id: string; label: string; desc: string };

const OFFICIAL: OfficialSkill[] = [
  { id: "exasol-database", label: "database", desc: "sql, schemas, profiling and exasol-specific behavior" },
  { id: "exasol-import", label: "import", desc: "load data into exasol from files and sources" },
  { id: "exasol-export", label: "export", desc: "move query results and tables out of exasol" },
  { id: "exasol-bucketfs", label: "bucketfs", desc: "manage the bucket filesystem and its contents" },
  { id: "exasol-udfs", label: "udfs", desc: "write and run user-defined functions" },
  { id: "exasol-jdbc-virtual-schemas", label: "jdbc virtual schemas", desc: "query external databases through jdbc adapters" },
  { id: "exasol-document-virtual-schemas", label: "document virtual schemas", desc: "map document sources into schemas" },
  { id: "exasol-text-ai", label: "text ai", desc: "text analytics inside the database" },
  { id: "exasol-distributed-ml", label: "distributed ml", desc: "train models across the cluster" },
  { id: "exasol-transformers", label: "transformers", desc: "run transformer models in-database" },
  { id: "exasol-cloud-storage-extension", label: "cloud storage", desc: "read and write cloud object storage" },
  { id: "exasol-extension-catalog", label: "extension catalog", desc: "discover and manage extensions" },
  { id: "exasol-notebook-connections", label: "notebook connections", desc: "connect notebooks to exasol" },
  { id: "exasol-ai-setup", label: "ai setup", desc: "prepare the database for ai workloads" },
  { id: "setup-personal", label: "set up personal", desc: "install and run exasol personal locally" },
  { id: "exasol-itde", label: "itde", desc: "the integration test docker environment" },
  { id: "exasol-virtual-schema-adapter-development", label: "adapter development", desc: "build your own virtual-schema adapters" },
  { id: "exasol", label: "exasol core", desc: "the umbrella skill routing to the others" },
];

const byId = new Map(OFFICIAL.map((s) => [s.id, s]));

/** Role bundles — curated groupings of OFFICIAL skills only. */
const BUNDLES: { id: string; label: string; desc: string; skills: string[] }[] = [
  { id: "data-engineer", label: "data engineer", desc: "move data in and out, storage, pipelines", skills: ["exasol-import", "exasol-export", "exasol-bucketfs", "exasol-cloud-storage-extension"] },
  { id: "analyst", label: "analyst", desc: "query, explore and analyze", skills: ["exasol-database", "exasol-text-ai", "exasol-notebook-connections"] },
  { id: "ml-engineer", label: "ml engineer", desc: "models and functions in the database", skills: ["exasol-distributed-ml", "exasol-transformers", "exasol-udfs", "exasol-ai-setup"] },
  { id: "integration-developer", label: "integration developer", desc: "connect external systems via virtual schemas", skills: ["exasol-jdbc-virtual-schemas", "exasol-document-virtual-schemas", "exasol-virtual-schema-adapter-development", "exasol-extension-catalog"] },
  { id: "getting-started", label: "getting started", desc: "a local database and the essentials", skills: ["exasol", "setup-personal", "exasol-database", "exasol-itde"] },
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

/** The shared add menu (per skill or per bundle): a MULTI-SELECT of agents —
 * check the destinations, then one "add" applies to all of them. Hoisted to
 * module level so it keeps identity (and its open/selection state) across
 * parent re-renders. */
function InstallMenu({ rowId, skillIds, allActive, dests, busy, onInstall, label = "add", installedIn }: {
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
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "flex h-6 shrink-0 items-center gap-1 rounded-md px-2 text-[11px] lowercase transition-colors",
            allActive ? "text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
          )}
          disabled={isBusy}
        >
          {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : allActive ? <Check className="h-3 w-3" /> : null}
          {allActive ? "added" : label}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="text-[10px] font-normal lowercase text-muted-foreground">add to</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {dests.map((d) =>
          d.installed ? (
            <DropdownMenuCheckboxItem
              key={d.id}
              checked={sel.has(d.id)}
              // keep the menu open while picking destinations
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={() => toggle(d.id)}
              className="gap-2 text-[12px] lowercase"
            >
              {d.logo("h-3.5 w-3.5")}
              {d.label}
              {installedIn(d.id) ? <Check className="ml-auto h-3 w-3 text-primary" /> : null}
            </DropdownMenuCheckboxItem>
          ) : (
            <DropdownMenuItem
              key={d.id}
              className="gap-2 text-[12px] lowercase text-muted-foreground"
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
          disabled={sel.size === 0}
          onClick={() => onInstall([...sel], skillIds, rowId)}
          className="justify-center text-[12px] lowercase text-primary focus:text-primary"
        >
          add to {sel.size} agent{sel.size === 1 ? "" : "s"}
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
  const [busy, setBusy] = useState<string | null>(null); // "<rowId>" while installing
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    ipc.skillsListTargets().then(setTargets).catch(() => undefined);
    ipc.skillsInstalledOfficial().then(setInstalledMap).catch(() => undefined);
    try {
      const { settings } = await agent.getSettings();
      setActive(new Set(settings.defaultSkills));
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const ext = (id: string) => targets.find((t) => t.id === id);
  const dests: Dest[] = [
    { id: "studio", label: "exa-ai", logo: (c) => <ExasolMark size={14} className={c} />, installed: true },
    { id: "claude-code", label: "claude code", logo: (c) => <ClaudeLogo className={c} />, installed: !!ext("claude-code")?.installed, installUrl: ext("claude-code")?.installUrl },
    { id: "codex", label: "codex", logo: (c) => <OpenAiLogo className={c} />, installed: !!ext("codex")?.installed, installUrl: ext("codex")?.installUrl },
  ];

  /** True when `destId` already has every skill in `ids`. */
  const installedIn = (destId: string, ids: string[]) =>
    destId === "studio"
      ? ids.every((id) => active.has(id))
      : ids.every((id) => (installedMap[destId] ?? []).includes(id));
  /** "added" only when EVERY installed agent (exa-ai + detected ones) has it. */
  const addedEverywhere = (ids: string[]) =>
    dests.filter((d) => d.installed).every((d) => installedIn(d.id, ids));

  /** Add a set of official skills to the CHOSEN destinations (multi-select).
   * Each destination is attempted independently; failures are named. */
  async function installTo(destIds: string[], skillIds: string[], rowId: string) {
    setBusy(rowId);
    setNote(null);
    const done: string[] = [];
    const failed: string[] = [];
    for (const destId of destIds) {
      const label = dests.find((d) => d.id === destId)?.label ?? destId;
      try {
        if (destId === "studio") {
          for (const id of skillIds) {
            const s = await ipc.skillsFetchOfficial(id);
            await skillsApi.save(s.id, s.description || byId.get(id)?.desc || s.name, s.body);
            const { settings } = await agent.getSettings();
            const set = new Set(settings.defaultSkills);
            set.add(s.id);
            await agent.setSettings({ defaultSkills: [...set] });
          }
        } else {
          await ipc.skillsInstallOfficial(destId, skillIds);
        }
        done.push(label);
      } catch {
        failed.push(label);
      }
    }
    if (destIds.includes("studio")) await refresh();
    ipc.skillsInstalledOfficial().then(setInstalledMap).catch(() => undefined);
    setNote(
      failed.length
        ? `added to ${done.join(", ") || "none"} — failed for ${failed.join(", ")}`
        : `added to ${done.join(", ")}`,
    );
    setBusy(null);
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-editor">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-4">
        <Lightbulb className="h-4 w-4 text-primary" />
        <span className="font-heading text-[14px] font-bold text-foreground">Skills</span>
        <span className="text-xs lowercase text-muted-foreground">{loading ? "…" : `${active.size} active in studio`}</span>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 [scrollbar-width:thin]">
        <div className="w-full">
          <p className="mb-4 text-[12px] lowercase leading-relaxed text-muted-foreground">
            exasol's official agent skills — install them one by one or as a role bundle, into studio's agent, claude code or codex. external installs use each agent's own tooling.
          </p>
          {note ? <p className="mb-3 text-[11.5px] lowercase text-primary">{note}</p> : null}

          <Tabs defaultValue="official">
            <div className="mb-4 flex items-center justify-between">
              <TabsList className="h-8">
                <TabsTrigger value="official" className="text-[12px] lowercase data-[state=active]:bg-primary/15 data-[state=active]:text-primary">official skills</TabsTrigger>
                <TabsTrigger value="bundles" className="text-[12px] lowercase data-[state=active]:bg-primary/15 data-[state=active]:text-primary">bundles</TabsTrigger>
              </TabsList>
              <InstallMenu
                rowId="__all"
                label="add all"
                skillIds={OFFICIAL.map((s) => s.id)}
                allActive={addedEverywhere(OFFICIAL.map((s) => s.id))}
                dests={dests}
                busy={busy}
                installedIn={(d) => installedIn(d, OFFICIAL.map((s) => s.id))}
                onInstall={(d, ids, r) => void installTo(d, ids, r)}
              />
            </div>

            <TabsContent value="official">
              <div className="divide-y divide-border/40">
                {OFFICIAL.map((s) => (
                  <div key={s.id} className="flex items-center gap-3 py-2">
                    <div className="min-w-0 flex-1">
                      <span className={cn("text-[12.5px] lowercase", addedEverywhere([s.id]) ? "text-primary" : "text-foreground")}>{s.label}</span>
                      <p className="truncate text-[11px] lowercase text-muted-foreground">{s.desc}</p>
                    </div>
                    <InstallMenu rowId={s.id} skillIds={[s.id]} allActive={addedEverywhere([s.id])} dests={dests} busy={busy} installedIn={(d) => installedIn(d, [s.id])} onInstall={(d, ids, r) => void installTo(d, ids, r)} />
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="bundles">
              <div className="divide-y divide-border/40">
                {BUNDLES.map((b) => {
                  const allActive = addedEverywhere(b.skills);
                  return (
                    <div key={b.id} className="flex items-start gap-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <span className={cn("text-[12.5px] lowercase", allActive ? "text-primary" : "text-foreground")}>{b.label}</span>
                        <p className="text-[11px] lowercase text-muted-foreground">{b.desc}</p>
                        <p className="mt-0.5 text-[10.5px] lowercase text-muted-foreground/60">
                          {b.skills.map((id) => byId.get(id)?.label ?? id).join(" · ")}
                        </p>
                      </div>
                      <InstallMenu rowId={b.id} skillIds={b.skills} allActive={allActive} dests={dests} busy={busy} installedIn={(d) => installedIn(d, b.skills)} onInstall={(d, ids, r) => void installTo(d, ids, r)} />
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

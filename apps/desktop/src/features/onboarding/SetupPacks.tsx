import { useState } from "react";
import { BarChart3, BookOpen, Boxes, Check, Cpu, Database, Package, Rocket, Server, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export type Pack = {
  id: string;
  name: string;
  tagline: string;
  icon: typeof Rocket;
  items: { id: string; label: string; icon: typeof Database }[];
};

// Curated bundles — each installs a preselected set from the Marketplace.
export const PACKS: Pack[] = [
  {
    id: "starter-kit",
    name: "Starter Kit",
    tagline: "The essentials to go from zero to querying with AI.",
    icon: Rocket,
    items: [
      { id: "exasol-personal", label: "Exasol Personal (local)", icon: Database },
      { id: "pyexasol", label: "PyExasol", icon: Boxes },
      { id: "exapump", label: "ExaPump", icon: Cpu },
      { id: "mcp-server", label: "MCP Server", icon: Server },
      { id: "agent-skills", label: "Agent Skills", icon: Sparkles },
    ],
  },
  {
    id: "student",
    name: "Student / Learning",
    tagline: "Lightweight and free — learn SQL and AI on a local database.",
    icon: BookOpen,
    items: [
      { id: "exasol-personal", label: "Exasol Personal (local)", icon: Database },
      { id: "pyexasol", label: "PyExasol", icon: Boxes },
      { id: "mcp-server", label: "MCP Server", icon: Server },
      { id: "agent-skills", label: "Agent Skills", icon: Sparkles },
    ],
  },
  {
    id: "explorer",
    name: "Data Explorer",
    tagline: "Query fast, load files, and build dashboards.",
    icon: BarChart3,
    items: [
      { id: "exasol-personal", label: "Exasol Personal (local)", icon: Database },
      { id: "exapump", label: "ExaPump", icon: Cpu },
      { id: "mcp-server", label: "MCP Server", icon: Server },
    ],
  },
  {
    id: "scientist",
    name: "Data Scientist",
    tagline: "Notebooks, ML, and data wrangling on Exasol.",
    icon: Boxes,
    items: [
      { id: "exasol-personal", label: "Exasol Personal (local)", icon: Database },
      { id: "ai-lab", label: "AI Lab", icon: Boxes },
      { id: "pyexasol", label: "PyExasol", icon: Boxes },
      { id: "json-tables", label: "JSON Tables", icon: Boxes },
      { id: "exapump", label: "ExaPump", icon: Cpu },
    ],
  },
  {
    id: "ai-builder",
    name: "AI / Agent Builder",
    tagline: "Wire LLMs and agents to your Exasol data.",
    icon: Sparkles,
    items: [
      { id: "exasol-personal", label: "Exasol Personal (local)", icon: Database },
      { id: "mcp-server", label: "MCP Server", icon: Server },
      { id: "agent-skills", label: "Agent Skills", icon: Sparkles },
      { id: "pyexasol", label: "PyExasol", icon: Boxes },
    ],
  },
];

export const PENDING_PACK_KEY = "exasol-studio-pending-pack";

/** Post-onboarding page: pick a curated pack of tools to set up, or skip. */
export function SetupPacks({ onDone }: { onDone: (packItemIds: string[] | null) => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const pack = PACKS.find((p) => p.id === selected) ?? null;

  return (
    <div className="flex h-screen flex-col overflow-auto bg-editor">
      <div className="mx-auto w-full max-w-4xl px-6 py-12">
        <div className="mb-1 flex items-center gap-2 text-primary">
          <Package className="h-4 w-4" />
          <span className="font-mono text-[11px] font-semibold uppercase tracking-widest">Set up your workspace</span>
        </div>
        <h1 className="font-heading text-[26px] font-bold text-foreground">Choose a starter pack</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Each pack installs a curated set of official Exasol tools from the Marketplace. Everything is optional — you can
          skip this and add tools any time.
        </p>

        <div className="mt-7 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {PACKS.map((p) => {
            const Icon = p.icon;
            const active = selected === p.id;
            return (
              <button
                key={p.id}
                onClick={() => setSelected(active ? null : p.id)}
                className={cn(
                  "group flex flex-col rounded-xl border p-4 text-left transition-all",
                  active
                    ? "border-primary bg-primary/8 ring-2 ring-primary/20"
                    : "border-border bg-panel/60 hover:border-primary/40",
                )}
              >
                <div className="flex items-center gap-2.5">
                  <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg", active ? "text-primary" : "text-foreground")}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5 text-[14px] font-semibold text-foreground">
                      {p.name}
                      {active ? <Check className="h-3.5 w-3.5 text-primary" /> : null}
                    </div>
                    <div className="text-[11.5px] text-muted-foreground">{p.tagline}</div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {p.items.map((it) => (
                    <span key={it.id} className="rounded-md border border-border bg-editor px-1.5 py-0.5 text-[10.5px] text-muted-foreground">
                      {it.label}
                    </span>
                  ))}
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-8 flex items-center justify-between">
          <button onClick={() => onDone(null)} className="text-[13px] text-muted-foreground hover:text-foreground">
            Skip for now
          </button>
          <button
            disabled={!pack}
            onClick={() => onDone(pack ? pack.items.map((i) => i.id) : null)}
            className="cta-glow flex h-9 items-center gap-2 rounded-lg bg-primary px-5 text-[13px] font-semibold text-primary-foreground hover:bg-primary/85 disabled:opacity-50"
          >
            {pack ? `Set up ${pack.name}` : "Select a pack"}
          </button>
        </div>
      </div>
    </div>
  );
}

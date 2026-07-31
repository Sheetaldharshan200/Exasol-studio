import { useCallback, useEffect, useState } from "react";
import { BarChart3, Boxes, Check, Download, ExternalLink, GraduationCap, Lightbulb, Loader2, Plus, Sparkles, Table2, Trash2, Wrench, X } from "lucide-react";
import { ipc, type SkillTarget } from "@/lib/ipc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { agent, skills as skillsApi } from "@/lib/agent-client";
import { cn } from "@/lib/utils";

/**
 * Role-based skill packs. Each role bundles several focused, evidence-first
 * playbooks (grounded in real analytics/data-science practice). Adding a skill
 * saves it AND marks it a PRIORITY skill applied on every agent turn. Users can
 * also author their own with "Add new skill".
 */
type SkillDef = { id: string; name: string; desc: string; body: string };
type Role = { id: string; name: string; icon: typeof Sparkles; blurb: string; skills: SkillDef[] };
/** User-authored pack (persisted locally; the skills themselves live in the agent). */
type StoredPack = { id: string; name: string; blurb: string; skills: SkillDef[] };
const PACKS_KEY = "exasol-custom-skill-packs";
function loadPacks(): StoredPack[] {
  try {
    return JSON.parse(window.localStorage.getItem(PACKS_KEY) || "[]") as StoredPack[];
  } catch {
    return [];
  }
}

const ROLES: Role[] = [
  {
    id: "data-scientist",
    name: "Data Scientist",
    icon: Boxes,
    blurb: "Modeling, statistics, and features on Exasol.",
    skills: [
      { id: "ds-eda", name: "Exploratory analysis", desc: "Profile a dataset: shape, nulls, distributions, correlations — with SQL.", body: "When exploring a dataset on Exasol:\n- Start with shape: COUNT(*), column count, and per-column NULL/blank rates.\n- Numeric columns: MIN/MAX/AVG/STDDEV and a few PERCENTILE points; flag skew and outliers.\n- Categorical columns: top values via GROUP BY … ORDER BY COUNT(*) DESC LIMIT 20, and distinct counts (APPROXIMATE_COUNT_DISTINCT for big tables).\n- Always ground column names in the real schema first (kb_search / DESCRIBE). Show the SQL and the numbers; never invent findings." },
      { id: "ds-features", name: "Feature engineering", desc: "Build model-ready features and train/test splits in SQL.", body: "For feature engineering on Exasol:\n- Derive features with SQL: ratios, date parts, rolling windows (OVER … ), one-hot via CASE, target/frequency encodings.\n- Deterministic train/test split with a hashed key: WHERE MOD(HASH(id),100) < 80.\n- Call out and prevent leakage (target-derived features, look-ahead in time series).\n- Produce a single model-ready table/view and describe each column's meaning." },
      { id: "ds-stats", name: "A/B testing & stats", desc: "Design and read experiments; significance done right.", body: "For experiment analysis:\n- State the hypothesis, metric, unit of analysis, and guardrails before querying.\n- Compute per-variant sample size, mean/rate, and variance in SQL; report lift with a confidence interval, not just a point estimate.\n- Warn about peeking, multiple comparisons, and unequal exposure.\n- Be explicit about what the data does and doesn't support." },
    ],
  },
  {
    id: "bi-developer",
    name: "BI Developer",
    icon: BarChart3,
    blurb: "Metrics, dashboards, and the semantic layer.",
    skills: [
      { id: "bi-metrics", name: "Metric definitions", desc: "Define consistent, reproducible business metrics.", body: "When defining a metric:\n- Give the exact formula, grain, filters, and de-duplication; name it consistently across the project.\n- Watch for join fan-out that double-counts measures — aggregate to the right grain first.\n- Every metric must be reproducible from a query you show." },
      { id: "bi-dashboards", name: "Dashboard design", desc: "Build live SQL-backed dashboards that answer a question.", body: "When building a dashboard:\n- Lead with the headline number, then supporting cuts (time, segment, region).\n- Propose each panel and the SQL behind it; prefer live SQL over static text.\n- Keep it scannable: summary before detail, consistent units, semantic colors for good/warning/critical." },
      { id: "bi-semantic", name: "Semantic modeling", desc: "Model entities & metrics in the Semantic Views layer.", body: "When a Semantic Views layer is available:\n- Model entities, their joins, and metrics there; compile through the semantic compiler rather than hand-writing physical SQL.\n- Never reconstruct metric formulas or infer physical joins after a compiler error — fix the model." },
    ],
  },
  {
    id: "analytics-engineer",
    name: "Analytics Engineer",
    icon: Wrench,
    blurb: "Layered models, tests, and clean marts (dbt-style).",
    skills: [
      { id: "ae-layers", name: "Layered modeling", desc: "staging → intermediate → marts, with clear grain.", body: "Structure transformations in layers:\n- staging (typed, renamed, 1:1 with sources) → intermediate (joins/reshaping) → marts (business-facing).\n- Document each model's grain and keys; use surrogate + business keys.\n- Prefer idempotent, re-runnable SQL; state full-refresh vs incremental." },
      { id: "ae-tests", name: "Data-quality tests", desc: "not-null, unique, referential integrity, freshness.", body: "Add runnable data-quality checks as SQL:\n- not-null and uniqueness on keys, referential integrity across models, freshness on load timestamps.\n- Return failing rows, not just counts, so issues are debuggable.\n- Run tests after each transform and report pass/fail plainly." },
    ],
  },
  {
    id: "data-analyst",
    name: "Data Analyst",
    icon: Table2,
    blurb: "Answer business questions fast and correctly.",
    skills: [
      { id: "da-answer", name: "Question → SQL", desc: "Turn plain questions into correct, sanity-checked SQL.", body: "When answering a business question:\n- State assumptions (date range, filters, definitions of 'active'/'revenue').\n- Sanity-check results (row counts, nulls, obvious outliers) before presenting.\n- Lead with the one-sentence answer, then numbers, then the SQL." },
      { id: "da-cohort", name: "Cohort & funnel", desc: "Retention, cohorts, and step-by-step funnels.", body: "For cohort/funnel analysis:\n- Define the cohort key and the time grain up front.\n- Build funnels as ordered step CTEs with per-step counts and conversion rates.\n- For retention, pivot activity by cohort period; show the triangle and call out the trend." },
    ],
  },
  {
    id: "sql-tutor",
    name: "SQL Tutor",
    icon: GraduationCap,
    blurb: "Explain and teach, step by step.",
    skills: [
      { id: "tutor-explain", name: "Teach & explain", desc: "Beginner-friendly, jargon defined, incremental.", body: "As a SQL tutor for Exasol:\n- Explain in plain language; define terms in brackets the first time.\n- Build queries incrementally — one clause at a time, saying why.\n- Point at the learner's real tables; end with one small next step to try." },
    ],
  },
];

/** Exasol's official, curated agent skills (from exasol-labs/exasol-agent-skills)
 * — shown for discovery. Installing pushes the whole set into the chosen agent
 * via that provider's own tooling. Names are Studio-side (not fetched live). */
const OFFICIAL_SKILLS = [
  "Exasol database", "Import", "Export", "BucketFS", "UDFs",
  "JDBC virtual schemas", "Document virtual schemas", "Text AI",
  "Distributed ML", "Transformers", "Cloud storage extension",
  "Extension catalog", "Notebook connections", "AI setup", "Set up Personal",
];

/**
 * Skills Marketplace — the Exasol-recommended skill set, installable into every
 * AI agent the user has. Studio installs via each provider's OWN tooling
 * (`claude plugin …`, `npx skills … --agent …`), never by hand-writing skill
 * dirs; uninstalled providers are linked, not downloaded.
 */
function ExasolSkillsForAgents() {
  const [targets, setTargets] = useState<SkillTarget[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, boolean>>({});

  const loadTargets = useCallback(() => {
    setLoadError(false);
    ipc
      .skillsListTargets()
      .then((t) => setTargets(t))
      .catch(() => {
        setTargets([]);
        setLoadError(true);
      });
  }, []);
  useEffect(() => loadTargets(), [loadTargets]);

  async function install(t: SkillTarget) {
    setBusy(t.id);
    setNote(null);
    try {
      await ipc.skillsInstallTarget(t.id);
      setDone((d) => ({ ...d, [t.id]: true }));
      setNote(`Exasol skills installed into ${t.name}.`);
    } catch (e) {
      setNote(e instanceof Error ? e.message : `Could not install skills into ${t.name}.`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mb-6 rounded-xl border border-primary/25 bg-primary/5 p-4">
      <div className="mb-1 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <span className="text-[13px] font-semibold text-foreground">Exasol skills for your AI agents</span>
        <span className="rounded bg-primary/15 px-1.5 py-px text-[9px] font-medium uppercase text-primary">official</span>
      </div>
      <p className="mb-3 text-[11.5px] leading-relaxed text-muted-foreground">
        Exasol's recommended agent skills — installed into whichever agents you use, via each one's own tooling. Studio never edits an agent's files by hand.
      </p>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {OFFICIAL_SKILLS.map((s) => (
          <span key={s} className="rounded border border-border bg-panel px-1.5 py-px text-[10px] text-muted-foreground">{s}</span>
        ))}
      </div>
      {note ? <p className="mb-2 rounded-md bg-secondary/60 px-2.5 py-1.5 text-[11.5px] text-foreground">{note}</p> : null}
      {loadError ? (
        <p className="mb-2 flex items-center gap-2 text-[11.5px] text-muted-foreground">
          Couldn't check which agents are installed.
          <button onClick={loadTargets} className="rounded border border-border px-1.5 py-px text-[11px] hover:bg-secondary hover:text-foreground">Retry</button>
        </p>
      ) : targets === null ? (
        <p className="text-[11.5px] text-muted-foreground"><Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" /> Checking your agents…</p>
      ) : targets.length === 0 ? (
        <p className="text-[11.5px] text-muted-foreground">No supported AI agents detected on this machine.</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {(targets ?? []).map((t) => {
          const isBusy = busy === t.id;
          if (!t.installed)
            return (
              <button
                key={t.id}
                onClick={() => ipc.openExternal(t.installUrl).catch(() => window.open(t.installUrl, "_blank"))}
                title={`${t.name} isn't installed — get it, then reopen this tab`}
                className="flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-[11.5px] text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <ExternalLink className="h-3.5 w-3.5" /> {t.name} — not installed
              </button>
            );
          return (
            <button
              key={t.id}
              onClick={() => void install(t)}
              disabled={isBusy}
              className="flex h-8 items-center gap-1.5 rounded-md bg-primary px-2.5 text-[11.5px] font-medium text-primary-foreground hover:bg-primary/85 disabled:opacity-60"
            >
              {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : done[t.id] ? <Check className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
              {done[t.id] ? `Reinstall in ${t.name}` : `Install in ${t.name}`}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function SkillsTab() {
  const [active, setActive] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: "", desc: "", body: "", pack: "", newPack: "" });
  const [customPacks, setCustomPacks] = useState<StoredPack[]>(() => loadPacks());
  const persistPacks = (next: StoredPack[]) => {
    setCustomPacks(next);
    window.localStorage.setItem(PACKS_KEY, JSON.stringify(next));
  };
  // Kit-style pack modal: click a role card to see the skills inside.
  const [packModal, setPackModal] = useState<(typeof ROLES)[number] | null>(null);

  const refresh = useCallback(async () => {
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

  async function setDefault(id: string, on: boolean) {
    const { settings } = await agent.getSettings();
    const set = new Set(settings.defaultSkills);
    if (on) set.add(id);
    else set.delete(id);
    await agent.setSettings({ defaultSkills: [...set] });
    setActive(set);
  }

  async function toggle(skill: SkillDef) {
    setBusy(skill.id);
    try {
      if (active.has(skill.id)) {
        await setDefault(skill.id, false);
      } else {
        await skillsApi.save(skill.id, skill.desc, skill.body);
        await setDefault(skill.id, true);
      }
    } finally {
      setBusy(null);
    }
  }

  // Activate every skill in a role pack (skips ones already active).
  async function usePack(role: (typeof ROLES)[number]) {
    setBusy(`pack:${role.id}`);
    try {
      for (const sk of role.skills) {
        if (!active.has(sk.id)) {
          await skillsApi.save(sk.id, sk.desc, sk.body);
          await setDefault(sk.id, true);
        }
      }
    } finally {
      setBusy(null);
    }
  }

  async function addCustom() {
    const name = draft.name.trim();
    if (!name || !draft.body.trim()) return;
    if (draft.pack === "__new" && !draft.newPack.trim()) return;
    setBusy("__new");
    try {
      const id = name.toLowerCase().replace(/[^\w-]+/g, "-").replace(/^-|-$/g, "") || "skill";
      const desc = draft.desc.trim() || name;
      await skillsApi.save(id, desc, draft.body.trim());
      await setDefault(id, true);
      // File the skill into a custom pack (existing or new) if one was chosen.
      const skill: SkillDef = { id, name, desc, body: draft.body.trim() };
      if (draft.pack === "__new") {
        const packName = draft.newPack.trim();
        const packId = packName.toLowerCase().replace(/[^\w-]+/g, "-").replace(/^-|-$/g, "") || "pack";
        const existing = customPacks.find((cp) => cp.id === packId);
        persistPacks(
          existing
            ? customPacks.map((cp) => (cp.id === packId ? { ...cp, skills: [...cp.skills.filter((k) => k.id !== id), skill] } : cp))
            : [...customPacks, { id: packId, name: packName, blurb: "Custom pack", skills: [skill] }],
        );
      } else if (draft.pack) {
        persistPacks(customPacks.map((cp) => (cp.id === draft.pack ? { ...cp, skills: [...cp.skills.filter((k) => k.id !== id), skill] } : cp)));
      }
      setDraft({ name: "", desc: "", body: "", pack: "", newPack: "" });
      setAdding(false);
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  // Built-in role packs + the user's own packs, one grid.
  const allPacks: (Role & { custom?: boolean })[] = [
    ...ROLES,
    ...customPacks.map((cp) => ({ ...cp, icon: Sparkles, custom: true as const })),
  ];
  // User-arranged order (drag a card onto another to reorder), persisted locally.
  const [packOrder, setPackOrder] = useState<string[]>(() => {
    try {
      return JSON.parse(window.localStorage.getItem("exasol-skill-pack-order") || "[]") as string[];
    } catch {
      return [];
    }
  });
  const orderIdx = (id: string) => {
    const i = packOrder.indexOf(id);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  const orderedPacks = [...allPacks].sort((a, b) => orderIdx(a.id) - orderIdx(b.id));
  const countOn = (r: Role) => r.skills.filter((sk) => active.has(sk.id)).length;
  const addedPacks = orderedPacks.filter((p) => countOn(p) > 0);
  const restPacks = orderedPacks.filter((p) => countOn(p) === 0);
  const moveBefore = (src: string, dst: string) => {
    if (src === dst) return;
    const ids = orderedPacks.map((p) => p.id).filter((id) => id !== src);
    const at = ids.indexOf(dst);
    ids.splice(at === -1 ? ids.length : at, 0, src);
    setPackOrder(ids);
    window.localStorage.setItem("exasol-skill-pack-order", JSON.stringify(ids));
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-editor">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-4">
        <Lightbulb className="h-4 w-4 text-primary" />
        <span className="font-heading text-[14px] font-bold text-foreground">Skills</span>
        <span className="text-xs text-muted-foreground">{loading ? "…" : `${active.size} active`}</span>
        <button
          onClick={() => setAdding((v) => !v)}
          className="ml-auto flex h-7 items-center gap-1.5 rounded-md bg-primary px-2.5 text-[12px] font-medium text-primary-foreground hover:bg-primary/85"
        >
          <Plus className="h-3.5 w-3.5" /> Add new skill
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 [scrollbar-width:thin]">
        <div className="mx-auto max-w-3xl">
          <p className="mb-5 text-[12.5px] text-muted-foreground">
            Add focused playbooks by role. Active skills become{" "}
            <span className="font-medium text-foreground">priority skills</span> — applied on every turn in the AI panel.
          </p>

          {/* Skills Marketplace: push Exasol's official skills into external
              agents (Claude Code, Codex, Cursor). The role packs below stay
              Studio's own in-app agent. */}
          <ExasolSkillsForAgents />

          {/* Add-your-own form */}
          {adding ? (
            <div className="mb-6 rounded-xl border border-primary/30 bg-primary/5 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-[13px] font-semibold text-foreground">New skill</span>
                <button onClick={() => setAdding(false)} className="ml-auto flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="space-y-2">
                <input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="Name (e.g. Finance analyst)" className="h-9 w-full rounded-lg border border-border bg-panel px-3 text-[12.5px] outline-none" />
                <input value={draft.desc} onChange={(e) => setDraft((d) => ({ ...d, desc: e.target.value }))} placeholder="One-line description" className="h-9 w-full rounded-lg border border-border bg-panel px-3 text-[12.5px] outline-none" />
                <div className="flex items-center gap-2">
                  <Select value={draft.pack || "__none"} onValueChange={(v) => setDraft((d) => ({ ...d, pack: v === "__none" ? "" : v }))}>
                    <SelectTrigger className="h-9 w-56 text-[12.5px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">No pack (standalone)</SelectItem>
                      {customPacks.map((cp) => <SelectItem key={cp.id} value={cp.id}>{cp.name}</SelectItem>)}
                      <SelectItem value="__new">New pack…</SelectItem>
                    </SelectContent>
                  </Select>
                  {draft.pack === "__new" ? (
                    <input value={draft.newPack} onChange={(e) => setDraft((d) => ({ ...d, newPack: e.target.value }))} placeholder="Pack name" className="h-9 flex-1 rounded-lg border border-border bg-panel px-3 text-[12.5px] outline-none" />
                  ) : null}
                </div>
                <textarea value={draft.body} onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))} rows={6} placeholder="Instructions for the agent — how to behave for this role…" className="w-full resize-none rounded-lg border border-border bg-panel p-3 font-mono text-[12px] outline-none [scrollbar-width:thin]" />
                <div className="flex justify-end">
                  <button onClick={() => void addCustom()} disabled={busy === "__new" || !draft.name.trim() || !draft.body.trim()} className="flex h-8 items-center gap-1.5 rounded-md bg-primary px-3.5 text-[12.5px] font-medium text-primary-foreground hover:bg-primary/85 disabled:opacity-50">
                    {busy === "__new" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Add &amp; activate
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {/* Role packs — marketplace-kit style: + activates the whole pack,
              clicking the card shows the skills inside. */}
          {(() => {
            const renderPackCard = (role: Role & { custom?: boolean }) => {
              const Icon = role.icon;
              const allOn = role.skills.every((sk) => active.has(sk.id));
              const packBusy = busy === `pack:${role.id}`;
              return (
                <div
                  key={role.id}
                  role="button"
                  tabIndex={0}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/pack", role.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); const src = e.dataTransfer.getData("text/pack"); if (src) moveBefore(src, role.id); }}
                  onClick={() => setPackModal(role)}
                  onKeyDown={(e) => { if (e.key === "Enter") setPackModal(role); }}
                  title="See the skills in this pack — drag to rearrange"
                  className="group flex cursor-pointer flex-col rounded-xl border border-border bg-panel/60 p-3.5 text-left transition-colors hover:border-primary/40 hover:bg-secondary/40"
                >
                  <div className="flex items-center gap-2">
                    <Icon className="h-5 w-5 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground">{role.name}</span>
                    <span className="shrink-0 rounded bg-secondary/70 px-1.5 py-px font-mono text-[9.5px] text-muted-foreground" title="Skills added from this pack">
                      {countOn(role)}/{role.skills.length}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); if (!allOn) void usePack(role); }}
                      disabled={allOn || packBusy}
                      title={allOn ? "All skills active" : "Activate this pack"}
                      className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors",
                        allOn ? "text-primary" : "text-muted-foreground hover:text-primary",
                      )}
                    >
                      {packBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : allOn ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-4 w-4" />}
                    </button>
                    {"custom" in role && role.custom ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); persistPacks(customPacks.filter((cp) => cp.id !== role.id)); }}
                        title="Remove this pack (its skills stay)"
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>
                  <p className="mt-1.5 flex-1 text-[11.5px] leading-relaxed text-muted-foreground">{role.blurb}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {role.skills.map((sk) => (
                      <span key={sk.id} className={cn("rounded px-1.5 py-px text-[10px]", active.has(sk.id) ? "bg-primary/15 text-primary" : "bg-secondary/60 text-muted-foreground")}>{sk.name}</span>
                    ))}
                  </div>
                </div>
              );
            };
            const grid = (list: (Role & { custom?: boolean })[]) => (
              <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">{list.map(renderPackCard)}</div>
            );
            return (
              <div className="space-y-6">
                {addedPacks.length ? (
                  <section>
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">Added</p>
                    {grid(addedPacks)}
                  </section>
                ) : null}
                {restPacks.length ? (
                  <section>
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">Not added</p>
                    {grid(restPacks)}
                  </section>
                ) : null}
              </div>
            );
          })()}
        </div>
      </div>

      {/* Pack modal — what's inside + per-skill toggles + one-click activate. */}
      {packModal ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-6" onClick={() => setPackModal(null)}>
          <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-popover shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-2.5 px-5 pt-5">
              <packModal.icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <h3 className="text-[15px] font-semibold text-foreground">{packModal.name}</h3>
                <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">{packModal.blurb}</p>
              </div>
              <button onClick={() => setPackModal(null)} aria-label="Close" className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
            </div>
            <div className="mt-3 border-t border-border px-5 py-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">In this pack</p>
              <div className="space-y-2.5">
                {packModal.skills.map((sk) => (
                  <div key={sk.id} className="flex items-start gap-2.5">
                    <div className="min-w-0 flex-1">
                      <span className="text-[12.5px] font-medium text-foreground">{sk.name}</span>
                      <p className="text-[11px] leading-snug text-muted-foreground">{sk.desc}</p>
                    </div>
                    <button
                      onClick={() => void toggle(sk)}
                      disabled={busy === sk.id}
                      className={cn(
                        "flex h-6 w-20 shrink-0 items-center justify-center gap-1 rounded-md text-[11px] font-medium transition-colors disabled:opacity-50",
                        active.has(sk.id) ? "border border-border text-muted-foreground hover:text-foreground" : "bg-primary text-primary-foreground hover:bg-primary/85",
                      )}
                    >
                      {busy === sk.id ? <Loader2 className="h-3 w-3 animate-spin" /> : active.has(sk.id) ? <><Check className="h-3 w-3" /> Active</> : <><Plus className="h-3 w-3" /> Add</>}
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border bg-panel/40 px-5 py-3">
              <button onClick={() => setPackModal(null)} className="flex h-8 items-center rounded-lg border border-border px-3 text-[12.5px] text-muted-foreground hover:bg-secondary hover:text-foreground">Close</button>
              <button
                onClick={() => void usePack(packModal)}
                disabled={packModal.skills.every((sk) => active.has(sk.id)) || busy === `pack:${packModal.id}`}
                className="cta-glow flex h-8 items-center gap-1.5 rounded-lg bg-primary px-4 text-[12.5px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {busy === `pack:${packModal.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : packModal.skills.every((sk) => active.has(sk.id)) ? <><Check className="h-3.5 w-3.5" /> All active</> : <><Sparkles className="h-3.5 w-3.5" /> Use this pack</>}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SkillCard({ name, desc, on, busy, onToggle }: { name: string; desc: string; on: boolean; busy: boolean; onToggle: () => void }) {
  return (
    <div className={cn("flex flex-col rounded-lg border p-3 transition-colors", on ? "border-primary/40 bg-primary/5" : "border-border bg-panel/40")}>
      <div className="flex items-center gap-2">
        <span className="text-[12.5px] font-medium text-foreground">{name}</span>
        {on ? <span className="ml-auto rounded-full bg-primary/15 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-primary">priority</span> : null}
      </div>
      <p className="mt-1 flex-1 text-[11px] leading-relaxed text-muted-foreground">{desc}</p>
      <button
        onClick={onToggle}
        disabled={busy}
        className={cn(
          "mt-2.5 flex h-7 items-center justify-center gap-1.5 rounded-md text-[11.5px] font-medium transition-colors disabled:opacity-50",
          on ? "border border-border text-muted-foreground hover:bg-secondary hover:text-foreground" : "bg-primary text-primary-foreground hover:bg-primary/85",
        )}
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : on ? <><Check className="h-3.5 w-3.5" /> Added</> : <><Plus className="h-3.5 w-3.5" /> Add</>}
      </button>
    </div>
  );
}

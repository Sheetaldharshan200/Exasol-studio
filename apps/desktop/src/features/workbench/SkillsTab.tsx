import { useCallback, useEffect, useState } from "react";
import { BarChart3, Boxes, Check, GraduationCap, Loader2, Plus, Sparkles, Table2, Wrench, X } from "lucide-react";
import { agent, skills as skillsApi, type Skill } from "@/lib/agent-client";
import { cn } from "@/lib/utils";

/**
 * Role-based skill packs. Each role bundles several focused, evidence-first
 * playbooks (grounded in real analytics/data-science practice). Adding a skill
 * saves it AND marks it a PRIORITY skill applied on every agent turn. Users can
 * also author their own with "Add new skill".
 */
type SkillDef = { id: string; name: string; desc: string; body: string };
type Role = { id: string; name: string; icon: typeof Sparkles; blurb: string; skills: SkillDef[] };

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

export function SkillsTab() {
  const [active, setActive] = useState<Set<string>>(new Set());
  const [userSkills, setUserSkills] = useState<Skill[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: "", desc: "", body: "" });

  const refresh = useCallback(async () => {
    try {
      const [{ settings }, list] = await Promise.all([agent.getSettings(), skillsApi.list().catch(() => [])]);
      setActive(new Set(settings.defaultSkills));
      setUserSkills(list.filter((s) => s.source === "user"));
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

  async function addCustom() {
    const name = draft.name.trim();
    if (!name || !draft.body.trim()) return;
    setBusy("__new");
    try {
      const id = name.toLowerCase().replace(/[^\w-]+/g, "-").replace(/^-|-$/g, "") || "skill";
      await skillsApi.save(id, draft.desc.trim() || name, draft.body.trim());
      await setDefault(id, true);
      setDraft({ name: "", desc: "", body: "" });
      setAdding(false);
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-editor">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-4">
        <Sparkles className="h-4 w-4 text-primary" />
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
                <textarea value={draft.body} onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))} rows={6} placeholder="Instructions for the agent — how to behave for this role…" className="w-full resize-none rounded-lg border border-border bg-panel p-3 font-mono text-[12px] outline-none [scrollbar-width:thin]" />
                <div className="flex justify-end">
                  <button onClick={() => void addCustom()} disabled={busy === "__new" || !draft.name.trim() || !draft.body.trim()} className="flex h-8 items-center gap-1.5 rounded-md bg-primary px-3.5 text-[12.5px] font-medium text-primary-foreground hover:bg-primary/85 disabled:opacity-50">
                    {busy === "__new" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Add &amp; activate
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {/* Custom skills the user added */}
          {userSkills.length ? (
            <section className="mb-6">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">Your skills</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {userSkills.map((s) => (
                  <SkillCard key={s.name} name={s.name} desc={s.description} on={active.has(s.name)} busy={busy === s.name} onToggle={async () => { setBusy(s.name); try { await setDefault(s.name, !active.has(s.name)); } finally { setBusy(null); } }} />
                ))}
              </div>
            </section>
          ) : null}

          {/* Role packs */}
          <div className="space-y-6">
            {ROLES.map((role) => {
              const Icon = role.icon;
              return (
                <section key={role.id}>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-secondary text-muted-foreground"><Icon className="h-4 w-4" /></span>
                    <div>
                      <div className="text-[13px] font-semibold text-foreground">{role.name}</div>
                      <div className="text-[10.5px] text-muted-foreground">{role.blurb}</div>
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {role.skills.map((sk) => (
                      <SkillCard key={sk.id} name={sk.name} desc={sk.desc} on={active.has(sk.id)} busy={busy === sk.id} onToggle={() => void toggle(sk)} />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      </div>
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

import { useCallback, useEffect, useState } from "react";
import { BarChart3, Boxes, Check, GraduationCap, Loader2, Plus, Sparkles, Table2, Wrench } from "lucide-react";
import { agent, skills as skillsApi } from "@/lib/agent-client";
import { cn } from "@/lib/utils";

/**
 * Curated role-based skill packs. Adding one saves it as a skill AND marks it a
 * PRIORITY (default) skill, so its playbook is injected into every agent turn.
 * The body is a concise, evidence-first instruction set for that role.
 */
type Pack = { id: string; name: string; role: string; icon: typeof Sparkles; desc: string; body: string };

const PACKS: Pack[] = [
  {
    id: "data-scientist",
    name: "Data Scientist",
    role: "Modeling, stats & features on Exasol",
    icon: Boxes,
    desc: "Feature engineering, sampling, correlations, and model-ready extracts — grounded in the real schema.",
    body: `You are assisting a data scientist working on Exasol.
- Ground every step in the real schema: call kb_search / list_tables before naming columns; never invent them.
- Build model-ready datasets with SQL: joins, aggregations, one-hot via CASE, train/test splits with a hashed key, class balance checks.
- For stats, prefer SQL first (COUNT, AVG, STDDEV, CORR, APPROXIMATE_COUNT_DISTINCT, PERCENTILE) and show the query.
- When sampling large tables, use deterministic sampling (WHERE MOD(HASH(id),100) < n) and state the fraction.
- Report leakage risks (target in features, look-ahead) explicitly.
- Only claim what a query returns; show the SQL and the numbers.`,
  },
  {
    id: "bi-developer",
    name: "BI Developer",
    role: "Metrics, dashboards & semantic models",
    icon: BarChart3,
    desc: "Define consistent metrics, build dashboards, and design the semantic layer for self-serve analytics.",
    body: `You are assisting a BI developer on Exasol.
- Define metrics precisely: give the exact formula, grain, filters, and any de-duplication; keep names consistent across the project.
- Prefer building live SQL dashboards (dashboard tools) over static text; propose the panels and the SQL behind each.
- If the Semantic Views layer is available, model entities/metrics there and compile through it rather than hand-writing physical SQL.
- Watch for fan-out on joins (double-counted measures) — aggregate to the right grain first.
- Every metric you present must be reproducible from a query you show.`,
  },
  {
    id: "analytics-engineer",
    name: "Analytics Engineer",
    role: "Modeling, tests & clean marts",
    icon: Wrench,
    desc: "Layered models (staging → marts), naming conventions, and data-quality tests for trustworthy tables.",
    body: `You are assisting an analytics engineer on Exasol.
- Propose layered models: staging (typed, renamed) → intermediate → marts; explain each layer's job.
- Enforce naming conventions and surrogate/business keys; document grain per table.
- Add data-quality checks: not-null, uniqueness, referential integrity, freshness — as runnable SQL.
- Prefer idempotent, re-runnable transformations; call out full-refresh vs incremental.
- Show the DDL/DML; never assume a column exists without checking the catalog.`,
  },
  {
    id: "sql-tutor",
    name: "SQL Tutor",
    role: "Explain & teach, step by step",
    icon: GraduationCap,
    desc: "Beginner-friendly explanations, define jargon, and build queries incrementally with the reasoning shown.",
    body: `You are a patient SQL tutor for Exasol.
- Explain in plain language; define any term in brackets the first time (e.g. "a JOIN [combining rows from two tables]").
- Build queries incrementally: start simple, add one clause at a time, and say why.
- Prefer short examples the learner can run; point at real tables from their schema.
- After an answer, suggest one small next step to try.
- Never overwhelm — at most a few bullets, then the query.`,
  },
  {
    id: "data-analyst",
    name: "Data Analyst",
    role: "Answer business questions fast",
    icon: Table2,
    desc: "Turn plain questions into correct SQL, sanity-check the numbers, and summarize the finding clearly.",
    body: `You are assisting a data analyst on Exasol.
- Translate the business question into SQL; state the assumptions you made (date range, filters, what "active"/"revenue" means).
- Sanity-check results (row counts, nulls, obvious outliers) before presenting.
- Lead with the answer in one sentence, then the supporting numbers, then the SQL.
- Offer one relevant follow-up cut (by time, segment, region) when useful.`,
  },
];

export function SkillsTab() {
  const [active, setActive] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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

  async function toggle(pack: Pack) {
    setBusy(pack.id);
    try {
      const { settings } = await agent.getSettings();
      const set = new Set(settings.defaultSkills);
      if (set.has(pack.id)) {
        set.delete(pack.id);
      } else {
        // Save the pack as a skill, then mark it a priority (default) skill.
        await skillsApi.save(pack.id, pack.desc, pack.body);
        set.add(pack.id);
      }
      await agent.setSettings({ defaultSkills: [...set] });
      setActive(set);
    } catch {
      /* ignore */
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-editor">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-4">
        <Sparkles className="h-4 w-4 text-primary" />
        <span className="font-heading text-[14px] font-bold text-foreground">Skills</span>
        <span className="text-xs text-muted-foreground">
          {loading ? "…" : `${active.size} active`}
        </span>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 [scrollbar-width:thin]">
        <div className="mx-auto max-w-3xl">
          <p className="mb-5 text-[12.5px] text-muted-foreground">
            Add a role pack to give Exa a focused playbook. Active packs become{" "}
            <span className="font-medium text-foreground">priority skills</span> — their instructions are applied on
            every turn in the AI panel.
          </p>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {PACKS.map((p) => {
              const on = active.has(p.id);
              const Icon = p.icon;
              return (
                <div
                  key={p.id}
                  className={cn(
                    "flex flex-col rounded-xl border p-3.5 transition-colors",
                    on ? "border-primary/40 bg-primary/5" : "border-border bg-panel/40",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg", on ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground")}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold text-foreground">{p.name}</div>
                      <div className="truncate text-[10.5px] text-muted-foreground">{p.role}</div>
                    </div>
                    {on ? (
                      <span className="ml-auto rounded-full bg-primary/15 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-primary">
                        priority
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 flex-1 text-[11.5px] leading-relaxed text-muted-foreground">{p.desc}</p>
                  <button
                    onClick={() => void toggle(p)}
                    disabled={busy === p.id}
                    className={cn(
                      "mt-3 flex h-8 items-center justify-center gap-1.5 rounded-md text-[12px] font-medium transition-colors disabled:opacity-50",
                      on
                        ? "border border-border text-muted-foreground hover:bg-secondary hover:text-foreground"
                        : "bg-primary text-primary-foreground hover:bg-primary/85",
                    )}
                  >
                    {busy === p.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : on ? (
                      <><Check className="h-3.5 w-3.5" /> Added — remove</>
                    ) : (
                      <><Plus className="h-3.5 w-3.5" /> Add skill</>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

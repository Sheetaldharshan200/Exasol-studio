// The decisions the model answers about every row: presets to start from,
// then each question's id, type, instructions and criteria. Problems are
// shown per question; the run button upstream disables on any of them.

import { Check, ChevronDown, Plus, Trash2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { PRESETS, parseCriteria, questionProblem, type Question, type QuestionType } from "./decisions";

const TYPES: { id: QuestionType; label: string; hint: string }[] = [
  { id: "noul", label: "yes / no", hint: "a probability that the statement holds" },
  { id: "score", label: "score", hint: "levels, lowest first" },
  { id: "choice", label: "choice", hint: "options, the 'nothing wrong' one first" },
];

export function QuestionsEditor({ questions, onChange }: { questions: Question[]; onChange: (q: Question[]) => void }) {
  const update = (i: number, patch: Partial<Question>) => onChange(questions.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const ids = questions.map((q) => q.id);
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        <span className="text-muted-foreground">Start from</span>
        {PRESETS.map((p) => (
          <button key={p.id} onClick={() => onChange(p.questions.map((q) => ({ ...q, criteria: [...q.criteria], criteriaText: q.criteria.join(", ") })))} className="flex h-7 items-center rounded-md border border-border px-2.5 text-foreground hover:bg-secondary">
            {p.label}
          </button>
        ))}
        <button
          onClick={() => onChange([...questions, { id: `q${questions.length + 1}`, type: "noul", instructions: "", criteria: [] }])}
          className="ml-auto flex h-7 items-center gap-1 rounded-md border border-border px-2.5 text-foreground hover:bg-secondary"
        >
          <Plus className="h-3.5 w-3.5" /> Add a decision
        </button>
      </div>
      {questions.length === 0 ? <p className="text-[12px] text-muted-foreground">No decisions yet. Pick a preset or add one.</p> : null}
      {questions.map((q, i) => {
        const problem = questionProblem(q) ?? (ids.indexOf(q.id) !== i ? "id is used twice" : null);
        const type = TYPES.find((t) => t.id === q.type) ?? TYPES[0];
        return (
          <div key={i} className={cn("grid gap-1.5 rounded-lg border p-2 text-[12px]", problem ? "border-destructive/50" : "border-border")}>
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={q.id}
                onChange={(e) => update(i, { id: e.target.value.trim() })}
                spellCheck={false}
                aria-label="Decision id"
                className="h-7 w-36 rounded-md border border-border bg-background px-2 font-mono text-[11px] outline-none focus:border-primary"
              />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button aria-label="Decision type" className="flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2 text-[12px] text-foreground hover:bg-secondary">
                    {type.label}
                    <ChevronDown className="h-3 w-3 opacity-60" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {TYPES.map((t) => (
                    <DropdownMenuItem key={t.id} onClick={() => update(i, { type: t.id, criteria: t.id === "noul" ? [] : q.criteria, criteriaText: t.id === "noul" ? "" : q.criteriaText })}>
                      <span className="flex-1">{t.label}</span>
                      <span className="ml-3 text-[11px] text-muted-foreground">{t.hint}</span>
                      {t.id === q.type ? <Check className="ml-2 h-3 w-3" /> : null}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              {problem ? <span className="text-[11px] text-destructive">{problem}</span> : null}
              <button onClick={() => onChange(questions.filter((_, j) => j !== i))} aria-label="Remove decision" className="ml-auto flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-destructive">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            <input
              value={q.instructions}
              onChange={(e) => update(i, { instructions: e.target.value })}
              placeholder="The question, asked of one record — e.g. Does this transaction look fraudulent?"
              aria-label="Instructions"
              className="h-7 w-full rounded-md border border-border bg-background px-2 text-[12px] outline-none focus:border-primary"
            />
            {q.type !== "noul" ? (
              <input
                value={q.criteriaText ?? q.criteria.join(", ")}
                onChange={(e) => update(i, { criteriaText: e.target.value, criteria: parseCriteria(e.target.value) })}
                placeholder={q.type === "score" ? "levels, lowest first: none, low, medium, high" : "options, the 'nothing wrong' one first: none, duplicate, …"}
                aria-label="Criteria"
                className="h-7 w-full rounded-md border border-border bg-background px-2 font-mono text-[11px] outline-none focus:border-primary"
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

// The Anomalies tab: typed decisions over rows, on this machine, through the
// Marketplace-installed decision engine. Source (connection + SQL), the
// decisions, the engine, and the results — top to bottom, no modal, and no
// write to the database: only one read-only statement of the person's runs
// there, checked here before it is sent.

import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { Check, ChevronDown, Loader2, Play } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Icon as BxIcon } from "@/components/ui/icon";
import { errorMessage, ipc, type ColumnMeta, type DecisionStatus } from "@/lib/ipc";
import { PRESETS, decodeRow, isReadOnlyQuery, questionProblem, rowState, toQuestions, type Answer, type Question } from "./decisions";
import { DEFAULT_MODEL, EngineBar } from "./EngineBar";
import { QuestionsEditor } from "./QuestionsEditor";
import { ResultsGrid } from "./ResultsGrid";

type Conn = { profileId: string; connectionName: string } | null;
type Profile = { id: string; name: string };
type Source = { columns: ColumnMeta[]; rows: unknown[][] };
/** A finished run, frozen: the rows and questions it answered, not the ones on screen now. */
type Results = Source & { questions: Question[]; answers: (Record<string, Answer> | null)[]; model: string };
const ROW_CAPS = [100, 500, 1000, 5000];

export function AnomalyTab({ connection }: { connection: Conn }) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profileId, setProfileId] = useState<string>(connection?.profileId ?? "");
  const [sql, setSql] = useState("SELECT * FROM MY_SCHEMA.TRANSACTIONS");
  const [cap, setCap] = useState(500);
  const [source, setSource] = useState<Source | null>(null);
  const [querying, setQuerying] = useState(false);
  const [questions, setQuestions] = useState<Question[]>(PRESETS[0].questions.map((q) => ({ ...q, criteria: [...q.criteria], criteriaText: q.criteria.join(", ") })));
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [engine, setEngine] = useState<DecisionStatus | null>(null);
  const [running, setRunning] = useState<{ done: number; total: number } | null>(null);
  const [results, setResults] = useState<Results | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Which run is current: an older run that finishes late must not show or
  // export its answers against rows and questions it did not see.
  const runId = useRef(0);
  const live = useRef(true);

  useEffect(() => {
    live.current = true;
    void ipc.listConnectionProfiles().then((list) => {
      if (!live.current) return;
      const flat = list.map((p) => ({ id: p.id, name: p.name }));
      setProfiles(flat);
      if (!profileId && flat.length === 1) setProfileId(flat[0].id);
    });
    return () => {
      live.current = false;
      runId.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const profile = profiles.find((p) => p.id === profileId) ?? (connection && connection.profileId === profileId ? { id: connection.profileId, name: connection.connectionName } : undefined);
  const problems = questions.map(questionProblem).filter(Boolean).length + (new Set(questions.map((q) => q.id)).size !== questions.length ? 1 : 0);
  const readOnly = isReadOnlyQuery(sql);
  const modelReady = engine?.installed === true && engine.models.includes(model);
  const canDecide = source !== null && running === null && problems === 0 && questions.length > 0 && modelReady;
  const whyNot = !source
    ? "Run the query first."
    : problems
      ? "Fix the marked decisions first."
      : !engine?.installed
        ? "Install the engine first."
        : !modelReady
          ? `Pull ${model} first.`
          : undefined;

  async function runQuery() {
    if (!profile || !readOnly) return;
    setQuerying(true);
    setError(null);
    setResults(null);
    runId.current += 1;
    try {
      const res = await ipc.executeSql(profile.id, profile.name, sql, cap, false, false);
      if (!live.current) return;
      const first = res.results[0];
      if (!first || first.error) throw new Error(first?.error ?? "The query returned nothing.");
      if (first.columns.length === 0) throw new Error("The statement returned no result set.");
      setSource({ columns: first.columns, rows: first.rows });
    } catch (e) {
      if (live.current) setError(errorMessage(e));
    } finally {
      if (live.current) setQuerying(false);
    }
  }

  async function runDecisions() {
    if (!source || !canDecide) return;
    const mine = ++runId.current;
    const frozen = { columns: source.columns, rows: source.rows, questions: questions.map((q) => ({ ...q, criteria: [...q.criteria] })), model };
    setError(null);
    setRunning({ done: 0, total: frozen.rows.length });
    const un = await listen<{ done: number; total: number }>("anomaly:progress", (e) => {
      if (runId.current === mine && live.current) setRunning(e.payload);
    });
    if (runId.current !== mine || !live.current) {
      un();
      return;
    }
    try {
      const states = frozen.rows.map((r) => rowState(frozen.columns, r));
      const out = await ipc.decisionsDecide(frozen.model, states, toQuestions(frozen.questions));
      if (runId.current !== mine || !live.current) return;
      const answers = out.answers.map((a) => decodeRow(a, frozen.questions));
      if (answers.some(Boolean)) setResults({ ...frozen, answers });
      if (out.error) setError(out.error + (answers.some(Boolean) ? " The rows answered before it are shown." : ""));
    } catch (e) {
      if (runId.current === mine && live.current) setError(errorMessage(e));
    } finally {
      un();
      if (runId.current === mine && live.current) setRunning(null);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto bg-editor p-4">
      <div className="flex items-center gap-2">
        <BxIcon name="alert" className="h-5 w-5 text-primary" />
        <h1 className="text-[15px] font-semibold text-foreground">Anomalies</h1>
        <p className="text-[12px] text-muted-foreground">Typed decisions about every row, answered on this machine. Nothing is written to the database.</p>
      </div>

      <EngineBar model={model} onModel={setModel} onStatus={setEngine} />

      <section className="grid gap-2 rounded-lg border border-border bg-panel p-3">
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          <span className="font-semibold text-foreground">Source</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button aria-label="Connection" className="flex h-7 max-w-[240px] items-center gap-1.5 rounded-md border border-border bg-background px-2 text-foreground hover:bg-secondary">
                <BxIcon name="database" className="h-3.5 w-3.5 text-primary" />
                <span className="truncate">{profile?.name ?? "Choose a connection"}</span>
                <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuLabel>Read rows from</DropdownMenuLabel>
              {profiles.map((p) => (
                <DropdownMenuItem key={p.id} onClick={() => setProfileId(p.id)}>
                  <span className="flex-1 truncate">{p.name}</span>
                  {p.id === profileId ? <Check className="h-3 w-3" /> : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button aria-label="Row cap" className="flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2 font-mono text-[11px] text-foreground hover:bg-secondary">
                up to {cap} rows <ChevronDown className="h-3 w-3 opacity-60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {ROW_CAPS.map((n) => (
                <DropdownMenuItem key={n} onClick={() => setCap(n)} className="font-mono text-[12px]">
                  {n}
                  {n === cap ? <Check className="ml-auto h-3 w-3" /> : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            onClick={() => void runQuery()}
            disabled={!profile || querying || !readOnly}
            title={!readOnly ? "One SELECT (or WITH … SELECT) statement, nothing else." : undefined}
            className="ml-auto flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 text-foreground hover:bg-secondary disabled:opacity-50"
          >
            {querying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />} Run query
          </button>
        </div>
        <textarea
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          spellCheck={false}
          rows={3}
          aria-label="Source SQL"
          className={`w-full resize-y rounded-md border bg-background p-2 font-mono text-[12px] text-foreground outline-none focus:border-primary ${readOnly ? "border-border" : "border-destructive/50"}`}
        />
        <p className="text-[11px] text-muted-foreground">
          {!readOnly
            ? "Only one read-only statement runs here: a SELECT, or WITH … SELECT."
            : source
              ? `${source.rows.length} rows · ${source.columns.length} columns read. Each row is sent as its columns and values.`
              : "Rows are read once and sent to the engine on this machine."}
        </p>
      </section>

      <section className="grid gap-2 rounded-lg border border-border bg-panel p-3">
        <span className="text-[12px] font-semibold text-foreground">Decisions</span>
        <QuestionsEditor questions={questions} onChange={setQuestions} />
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => void runDecisions()}
            disabled={!canDecide}
            title={whyNot}
            className="cta-glow flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-[12px] font-medium text-primary-foreground hover:bg-primary/85 disabled:opacity-50"
          >
            {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BxIcon name="play" className="h-3.5 w-3.5" />}
            {running ? `Deciding ${running.done} / ${running.total}…` : source ? `Decide ${source.rows.length} rows with ${model}` : "Decide rows"}
          </button>
          {!canDecide && whyNot && !running ? <span className="text-[12px] text-muted-foreground">{whyNot}</span> : null}
          {error ? <span className="text-[12px] text-destructive">{error}</span> : null}
        </div>
      </section>

      {results ? (
        <section className="grid min-h-0 gap-2 rounded-lg border border-border bg-panel p-3">
          <span className="text-[12px] font-semibold text-foreground">
            Results <span className="font-normal text-muted-foreground">· {results.rows.length} rows · {results.model}</span>
          </span>
          <ResultsGrid columns={results.columns} rows={results.rows} questions={results.questions} answers={results.answers} />
        </section>
      ) : null}
    </div>
  );
}

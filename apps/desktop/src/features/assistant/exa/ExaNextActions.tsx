import { useMemo } from "react";
import { useAui, useAuiState } from "@assistant-ui/react";
import { BarChart3, FileCode2, LayoutDashboard, Play, Waypoints, Wrench, type LucideIcon } from "lucide-react";
import { useExaApplySql, useExaComposer } from "./ExaThread";
import { tableArguments } from "./context";
import { suggestNextActions, type NextAction } from "./next-actions";

const ICON: Record<NextAction["kind"], LucideIcon> = {
  "run-sql": Play,
  "open-sql": FileCode2,
  "explain-plan": FileCode2,
  visualize: Waypoints,
  chart: BarChart3,
  dashboard: LayoutDashboard,
  fix: Wrench,
};

/**
 * Up to three "what next" chips under a finished assistant reply, derived
 * from the reply itself (see next-actions.ts). Editor actions go through the
 * studio's apply-SQL bridge; the rest are follow-up prompts to the engine.
 */
export function ExaNextActions() {
  const aui = useAui();
  const api = useExaComposer();
  const applySql = useExaApplySql();
  const role = useAuiState((s) => s.message.role);
  const running = useAuiState((s) => s.message.status?.type === "running");
  const text = useAuiState((s) => (s.message.content ?? []).map((p) => (p.type === "text" ? p.text : "")).join("\n"));
  const tables = useMemo(() => (api ? tableArguments(api.getSnapshot()) : []), [api, text]);
  const actions = useMemo(() => (role === "assistant" && !running ? suggestNextActions(text, { tables }) : []), [role, running, text, tables]);
  if (!actions.length) return null;

  const ask = (prompt: string) => {
    aui.composer().setText(prompt);
    void Promise.resolve(aui.composer().send()).catch(() => aui.composer().setText(prompt));
  };
  const perform = (a: NextAction) => {
    switch (a.kind) {
      case "run-sql":
        window.dispatchEvent(new CustomEvent("studio:run-sql", { detail: { sql: a.sql } }));
        return;
      case "open-sql":
        applySql?.(a.sql);
        return;
      case "explain-plan":
        ask(`Explain the execution plan of this query and where the time goes:\n\`\`\`sql\n${a.sql}\n\`\`\``);
        return;
      case "visualize": {
        const [schema, table] = a.tables[0].split(".");
        window.dispatchEvent(new CustomEvent("studio:open-visualizer"));
        window.setTimeout(() => window.dispatchEvent(new CustomEvent("studio:visualizer-locate", { detail: { schema, table } })), 250);
        return;
      }
      case "chart":
        ask("Chart the table above as a line chart over time.");
        return;
      case "dashboard":
        ask("Add the result above to a dashboard as a chart widget.");
        return;
      case "fix":
        ask("Fix the error above and show the corrected SQL.");
        return;
    }
  };
  return (
    <div className="mt-2 flex flex-wrap gap-1.5 px-2" data-agent-id="chat.next-actions">
      {actions.map((a) => {
        const Icon = ICON[a.kind];
        return (
          <button
            key={a.kind}
            type="button"
            onClick={() => perform(a)}
            className="flex h-7 items-center gap-1.5 rounded-full border border-border bg-background px-2.5 text-[11.5px] text-foreground transition-colors hover:border-primary/50 hover:text-primary"
          >
            <Icon className="h-3.5 w-3.5" /> {a.label}
          </button>
        );
      })}
    </div>
  );
}

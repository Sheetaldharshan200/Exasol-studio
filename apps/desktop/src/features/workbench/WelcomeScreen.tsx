import { ArrowRight, BookOpen, Database, FileCode2, FolderOpen, Plug, Store, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * VS Code-style start page, shown whenever the workspace has no open tabs —
 * before or after connecting. Nothing is forced open; the user chooses.
 */
export function WelcomeScreen({
  connected,
  onNewQuery,
  onOpenFile,
  onConnect,
  onMarketplace,
  onGuides,
}: {
  connected: boolean;
  onNewQuery: () => void;
  onOpenFile: () => void;
  onConnect: () => void;
  onMarketplace: () => void;
  onGuides: () => void;
}) {
  const actions = [
    { icon: FileCode2, title: "New query", desc: "Open a blank SQL editor tab", onClick: onNewQuery, primary: true },
    { icon: FolderOpen, title: "Open SQL file", desc: "Edit a .sql file from disk", onClick: onOpenFile },
    connected
      ? { icon: Database, title: "Add connection", desc: "Connect another database", onClick: onConnect }
      : { icon: Plug, title: "Connect to a database", desc: "Point Exasol Studio at your Exasol", onClick: onConnect, primary: true },
    { icon: Store, title: "Marketplace", desc: "Drivers, tools, MCP, BI & more", onClick: onMarketplace },
    { icon: BookOpen, title: "Guides & docs", desc: "Learn Exasol, right in the app", onClick: onGuides },
  ];

  const tips = [
    "Double-click the tab bar (or press the + button) to open a new query.",
    "You don't need a connection to write SQL — connect when you're ready to run.",
    "Right-click any object in the tree for details, edit forms and safe actions.",
    "Install PyExasol / JDBC from the Marketplace to run queries over other drivers.",
  ];

  return (
    <div className="hero-surface h-full overflow-auto bg-editor [scrollbar-width:thin]">
      <div className="mx-auto flex min-h-full max-w-3xl flex-col justify-center px-8 py-12">
        <div className="mb-8">
          <div className="flex items-baseline gap-2">
            <span className="font-heading text-[28px] font-extrabold tracking-tight text-foreground">Exasol</span>
            <span className="font-heading text-[28px] font-extrabold tracking-tight text-primary">Studio</span>
          </div>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {connected ? "Pick up where you left off, or start something new." : "Start writing SQL now — connect to a database whenever you're ready."}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {actions.map((a) => {
            const Icon = a.icon;
            return (
              <button
                key={a.title}
                onClick={a.onClick}
                className={cn(
                  "group flex items-center gap-3 rounded-xl border p-3.5 text-left transition-colors",
                  a.primary
                    ? "border-primary/40 bg-primary/8 hover:bg-primary/15"
                    : "border-border bg-panel/50 hover:border-primary/30 hover:bg-secondary/50",
                )}
              >
                <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", a.primary ? "bg-primary/15 text-primary" : "bg-secondary text-foreground")}>
                  <Icon className="h-4.5 w-4.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold text-foreground">{a.title}</div>
                  <div className="truncate text-[11.5px] text-muted-foreground">{a.desc}</div>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            );
          })}
        </div>

        <div className="mt-8">
          <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Zap className="h-3 w-3 text-primary" /> Tips
          </div>
          <ul className="space-y-1.5">
            {tips.map((t) => (
              <li key={t} className="flex items-start gap-2 text-[12.5px] text-muted-foreground">
                <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-primary/60" />
                {t}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

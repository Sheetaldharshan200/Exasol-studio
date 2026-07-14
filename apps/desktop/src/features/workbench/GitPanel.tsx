import { useCallback, useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  FilePlus2,
  FileMinus2,
  FilePen,
  GitBranch,
  GitCommitHorizontal,
  History,
  Loader2,
  RefreshCcw,
} from "lucide-react";
import { errorMessage, ipc, type GitStatus, type GitLogEntry } from "@/lib/ipc";
import { cn } from "@/lib/utils";

const STATUS_ICON: Record<string, typeof FilePen> = {
  modified: FilePen,
  added: FilePlus2,
  untracked: FilePlus2,
  deleted: FileMinus2,
  renamed: FilePen,
};

const STATUS_COLOR: Record<string, string> = {
  modified: "text-warning",
  added: "text-primary",
  untracked: "text-syntax-function",
  deleted: "text-destructive",
  renamed: "text-syntax-function",
};

/**
 * Git version control for the workspace folder (~/ExasolStudio). Shows the
 * current branch, changed files, a commit box, and recent history — enough to
 * version saved SQL scripts without leaving the app.
 */
export function GitPanel() {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [log, setLog] = useState<GitLogEntry[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showLog, setShowLog] = useState(false);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const s = await ipc.gitStatus();
      setStatus(s);
      if (s.isRepo) setLog(await ipc.gitLog(30));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function init() {
    setBusy(true);
    setError(null);
    try {
      await ipc.gitInit();
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const r = await ipc.gitCommit(message.trim());
      setMessage("");
      setNotice(r);
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (!status) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    );
  }

  if (!status.hasGit) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
          <GitBranch className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">Git not found</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Install Git to version your saved SQL scripts in <span className="font-mono">~/ExasolStudio</span>.
          </p>
        </div>
      </div>
    );
  }

  if (!status.isRepo) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
          <GitBranch className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">Version your workspace</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Track changes to the SQL scripts you save in <span className="font-mono">~/ExasolStudio</span>.
          </p>
        </div>
        <button
          onClick={init}
          disabled={busy}
          className="cta-glow flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-[12px] font-medium text-primary-foreground hover:bg-primary/85 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitBranch className="h-3.5 w-3.5" />}
          Initialize repository
        </button>
        {error ? <p className="text-[11.5px] text-destructive">{error}</p> : null}
      </div>
    );
  }

  const clean = status.files.length === 0;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Branch header */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-[12px]">
        <GitBranch className="h-3.5 w-3.5 text-primary" />
        <span className="font-medium text-foreground">{status.branch ?? "(no branch)"}</span>
        {status.ahead > 0 ? (
          <span className="flex items-center gap-0.5 text-muted-foreground">
            <ArrowUp className="h-3 w-3" />
            {status.ahead}
          </span>
        ) : null}
        {status.behind > 0 ? (
          <span className="flex items-center gap-0.5 text-muted-foreground">
            <ArrowDown className="h-3 w-3" />
            {status.behind}
          </span>
        ) : null}
        <button
          onClick={() => void refresh()}
          className="ml-auto flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground"
          title="Refresh"
        >
          <RefreshCcw className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Changed files */}
      <div className="min-h-0 flex-1 overflow-auto [scrollbar-width:thin]">
        <p className="px-3 pt-2 text-[10px] uppercase tracking-wide text-muted-foreground">
          Changes {clean ? "" : `(${status.files.length})`}
        </p>
        {clean ? (
          <p className="flex items-center gap-1.5 px-3 py-3 text-[12px] text-muted-foreground">
            <Check className="h-3.5 w-3.5 text-primary" /> Working tree clean
          </p>
        ) : (
          <ul className="py-1">
            {status.files.map((f) => {
              const Icon = STATUS_ICON[f.label] ?? FilePen;
              return (
                <li
                  key={f.path}
                  className="flex items-center gap-2 px-3 py-1 text-[12px] hover:bg-secondary/50"
                  title={`${f.label}${f.staged ? " (staged)" : ""}`}
                >
                  <Icon className={cn("h-3.5 w-3.5 shrink-0", STATUS_COLOR[f.label] ?? "text-muted-foreground")} />
                  <span className="min-w-0 flex-1 truncate font-mono text-foreground/85">{f.path}</span>
                  <span className={cn("shrink-0 text-[9px] uppercase", STATUS_COLOR[f.label] ?? "text-muted-foreground")}>
                    {f.code.trim() || f.label[0]}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        {/* History */}
        <button
          onClick={() => setShowLog((s) => !s)}
          className="flex w-full items-center gap-1.5 px-3 py-2 text-[10px] uppercase tracking-wide text-muted-foreground hover:text-foreground"
        >
          <History className="h-3 w-3" /> History {showLog ? "▾" : "▸"}
        </button>
        {showLog ? (
          <ul className="pb-2">
            {log.length === 0 ? (
              <li className="px-3 py-1 text-[11.5px] text-muted-foreground">No commits yet.</li>
            ) : (
              log.map((c) => (
                <li key={c.hash} className="px-3 py-1 text-[11.5px]">
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-mono text-[10px] text-primary">{c.hash}</span>
                    <span className="min-w-0 flex-1 truncate text-foreground/85">{c.subject}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {c.author} · {c.relative}
                  </span>
                </li>
              ))
            )}
          </ul>
        ) : null}
      </div>

      {/* Commit box */}
      <div className="shrink-0 border-t border-border p-2.5">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={2}
          placeholder="Commit message…"
          className="w-full resize-none rounded-md border border-border bg-editor p-2 text-[12px] text-foreground [scrollbar-width:thin]"
        />
        <button
          onClick={commit}
          disabled={busy || !message.trim() || clean}
          className="mt-2 flex h-8 w-full items-center justify-center gap-1.5 rounded-md bg-primary text-[12px] font-medium text-primary-foreground hover:bg-primary/85 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitCommitHorizontal className="h-3.5 w-3.5" />}
          Commit all changes
        </button>
        {notice ? <p className="mt-1.5 truncate text-[11px] text-primary">{notice}</p> : null}
        {error ? <p className="mt-1.5 text-[11px] text-destructive">{error}</p> : null}
      </div>
    </div>
  );
}

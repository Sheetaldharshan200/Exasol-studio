import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  DownloadCloud,
  FileMinus2,
  FilePen,
  FilePlus2,
  GitBranch,
  GitCommitHorizontal,
  Loader2,
  Network,
  Plus,
  RefreshCcw,
  RotateCcw,
  UploadCloud,
  X,
} from "lucide-react";
import { errorMessage, ipc, type GitBranches, type GitCommit, type GitStatus } from "@/lib/ipc";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type FileEntry = GitStatus["files"][number];

const STATUS_COLOR: Record<string, string> = {
  modified: "text-warning",
  added: "text-primary",
  untracked: "text-syntax-function",
  deleted: "text-destructive",
  renamed: "text-info",
};
const STATUS_ICON: Record<string, typeof FilePen> = {
  modified: FilePen,
  added: FilePlus2,
  untracked: FilePlus2,
  deleted: FileMinus2,
  renamed: FilePen,
};

const LANE_COLORS = ["#4fa823", "#3b82f6", "#e0a63a", "#c65fd0", "#e05f5f", "#2bb8a3", "#8b7ff0"];

export function GitPanel() {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [branches, setBranches] = useState<GitBranches | null>(null);
  const [graph, setGraph] = useState<GitCommit[]>([]);
  const [view, setView] = useState<"changes" | "graph">("changes");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [diff, setDiff] = useState<{ path: string; staged: boolean; text: string } | null>(null);
  const [newBranch, setNewBranch] = useState(false);
  const [branchName, setBranchName] = useState("");

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const s = await ipc.gitStatus();
      setStatus(s);
      if (s.isRepo) {
        setBranches(await ipc.gitBranches().catch(() => null));
        setGraph(await ipc.gitGraph(200).catch(() => []));
      }
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const staged = useMemo(() => (status?.files ?? []).filter((f) => f.code[0] !== " " && f.code[0] !== "?"), [status]);
  const unstaged = useMemo(
    () => (status?.files ?? []).filter((f) => f.code === "??" || (f.code[1] && f.code[1] !== " ")),
    [status],
  );

  async function act<T>(fn: () => Promise<T>, ok?: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
      if (ok) setNotice(ok);
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function openDiff(f: FileEntry, isStaged: boolean) {
    try {
      const text = await ipc.gitDiff(f.path, isStaged);
      setDiff({ path: f.path, staged: isStaged, text });
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  if (!status) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    );
  }
  if (!status.hasGit) return <Empty title="Git not found" body="Install Git to version the SQL scripts in ~/ExasolStudio." />;
  if (!status.isRepo)
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl text-muted-foreground">
          <GitBranch className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">Version your workspace</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Track your saved SQL scripts in <span className="font-mono">~/ExasolStudio</span>.</p>
        </div>
        <button
          onClick={() => void act(() => ipc.gitInit())}
          disabled={busy}
          className="cta-glow flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-[12px] font-medium text-primary-foreground hover:bg-primary/85 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitBranch className="h-3.5 w-3.5" />} Initialize repository
        </button>
        {error ? <p className="text-[11.5px] text-destructive">{error}</p> : null}
      </div>
    );

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      {/* Branch bar */}
      <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex h-7 min-w-0 items-center gap-1.5 rounded-md px-1.5 text-[12px] text-foreground hover:bg-secondary">
              <GitBranch className="h-3.5 w-3.5 shrink-0 text-primary" />
              <span className="truncate font-medium">{status.branch ?? "(detached)"}</span>
              <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-80 w-60 overflow-auto">
            <DropdownMenuLabel>Switch branch</DropdownMenuLabel>
            {(branches?.local ?? []).map((b) => (
              <DropdownMenuItem key={b} onClick={() => void act(() => ipc.gitCheckout(b))}>
                <GitBranch className="h-3.5 w-3.5" />
                <span className="flex-1 truncate">{b}</span>
                {b === status.branch ? <Check className="h-3.5 w-3.5 text-primary" /> : null}
              </DropdownMenuItem>
            ))}
            {branches?.remote.length ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Remote</DropdownMenuLabel>
                {branches.remote.map((b) => (
                  <DropdownMenuItem key={b} onClick={() => void act(() => ipc.gitCheckout(b.replace(/^origin\//, "")))}>
                    <DownloadCloud className="h-3.5 w-3.5" />
                    <span className="flex-1 truncate">{b}</span>
                  </DropdownMenuItem>
                ))}
              </>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setNewBranch(true)}>
              <Plus className="h-3.5 w-3.5" /> New branch…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {status.ahead > 0 ? <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground"><ArrowUp className="h-3 w-3" />{status.ahead}</span> : null}
        {status.behind > 0 ? <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground"><ArrowDown className="h-3 w-3" />{status.behind}</span> : null}

        <div className="ml-auto flex items-center gap-0.5">
          <IconBtn label="Fetch" onClick={() => void act(() => ipc.gitFetch(), "Fetched.")}><RefreshCcw className="h-3.5 w-3.5" /></IconBtn>
          <IconBtn label="Pull" onClick={() => void act(() => ipc.gitPull(), "Pulled.")}><DownloadCloud className="h-3.5 w-3.5" /></IconBtn>
          <IconBtn label="Push" onClick={() => void act(() => ipc.gitPush(), "Pushed.")}><UploadCloud className="h-3.5 w-3.5" /></IconBtn>
        </div>
      </div>

      {/* View tabs */}
      <div className="flex items-center gap-1 border-b border-border px-2 py-1">
        <ViewTab active={view === "changes"} onClick={() => setView("changes")} icon={GitCommitHorizontal} label="Changes" count={status.files.length} />
        <ViewTab active={view === "graph"} onClick={() => setView("graph")} icon={Network} label="Graph" />
        <button onClick={() => void refresh()} className="ml-auto flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground" title="Refresh">
          <RefreshCcw className="h-3.5 w-3.5" />
        </button>
      </div>

      {newBranch ? (
        <div className="flex items-center gap-1.5 border-b border-border bg-secondary/30 px-2 py-1.5">
          <input
            autoFocus
            value={branchName}
            onChange={(e) => setBranchName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && branchName.trim()) { void act(() => ipc.gitCreateBranch(branchName.trim())); setNewBranch(false); setBranchName(""); }
              else if (e.key === "Escape") { setNewBranch(false); setBranchName(""); }
            }}
            placeholder="new-branch-name"
            className="h-7 flex-1 rounded-md border border-border bg-editor px-2 text-[12px] text-foreground outline-none"
          />
          <button onClick={() => { setNewBranch(false); setBranchName(""); }} className="text-[11px] text-muted-foreground hover:text-foreground">Cancel</button>
        </div>
      ) : null}

      {view === "changes" ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-auto [scrollbar-width:thin]">
            <Section
              title="Staged"
              count={staged.length}
              action={staged.length ? { label: "Unstage all", onClick: () => void act(() => ipc.gitUnstage(staged.map((f) => f.path))) } : undefined}
            >
              {staged.map((f) => (
                <FileRow key={"s" + f.path} f={f} onOpen={() => void openDiff(f, true)}
                  actions={[
                    { icon: RotateCcw, title: "Unstage", onClick: () => void act(() => ipc.gitUnstage([f.path])) },
                  ]} />
              ))}
            </Section>
            <Section
              title="Changes"
              count={unstaged.length}
              action={unstaged.length ? { label: "Stage all", onClick: () => void act(() => ipc.gitStageAll()) } : undefined}
            >
              {unstaged.map((f) => (
                <FileRow key={"u" + f.path} f={f} onOpen={() => void openDiff(f, false)}
                  actions={[
                    { icon: RotateCcw, title: "Discard", onClick: () => { if (window.confirm(`Discard changes to ${f.path}?`)) void act(() => ipc.gitDiscard([f.path])); }, danger: true },
                    { icon: Plus, title: "Stage", onClick: () => void act(() => ipc.gitStage([f.path])) },
                  ]} />
              ))}
            </Section>
            {status.files.length === 0 ? (
              <p className="flex items-center gap-1.5 px-3 py-4 text-[12px] text-muted-foreground"><Check className="h-3.5 w-3.5 text-primary" /> Working tree clean</p>
            ) : null}
          </div>

          {/* Commit box */}
          <div className="shrink-0 border-t border-border p-2.5">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={2}
              placeholder={staged.length ? `Commit ${staged.length} staged change${staged.length > 1 ? "s" : ""}…` : "Message (Commit all to stage everything)"}
              className="w-full resize-none rounded-md border border-border bg-editor p-2 text-[12px] text-foreground [scrollbar-width:thin]"
            />
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => void act(async () => { await ipc.gitCommit(message.trim(), staged.length === 0); }, "Committed.").then(() => setMessage(""))}
                disabled={busy || !message.trim() || status.files.length === 0}
                className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md bg-primary text-[12px] font-medium text-primary-foreground hover:bg-primary/85 disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitCommitHorizontal className="h-3.5 w-3.5" />}
                {staged.length ? "Commit" : "Commit all"}
              </button>
            </div>
            {notice ? <p className="mt-1.5 truncate text-[11px] text-primary">{notice}</p> : null}
            {error ? <p className="mt-1.5 text-[11px] text-destructive">{error}</p> : null}
          </div>
        </div>
      ) : (
        <CommitGraph commits={graph} headBranch={status.branch} />
      )}

      {diff ? <DiffOverlay diff={diff} onClose={() => setDiff(null)} /> : null}
    </div>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl text-muted-foreground"><GitBranch className="h-5 w-5" /></div>
      <div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={label} className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground">
      {children}
    </button>
  );
}

function ViewTab({ active, onClick, icon: Icon, label, count }: { active: boolean; onClick: () => void; icon: typeof GitBranch; label: string; count?: number }) {
  return (
    <button onClick={onClick} className={cn("flex h-6 items-center gap-1.5 rounded-md px-2 text-[11.5px]", active ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground")}>
      <Icon className="h-3.5 w-3.5" /> {label}
      {count ? <span className="rounded-full bg-secondary px-1 text-[9px]">{count}</span> : null}
    </button>
  );
}

function Section({ title, count, action, children }: { title: string; count: number; action?: { label: string; onClick: () => void }; children: React.ReactNode }) {
  if (count === 0) return null;
  return (
    <div>
      <div className="flex items-center gap-2 px-3 pt-2 pb-0.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</span>
        <span className="rounded-full bg-secondary px-1.5 text-[9.5px] text-muted-foreground">{count}</span>
        {action ? (
          <button onClick={action.onClick} className="ml-auto text-[10.5px] text-primary hover:underline">{action.label}</button>
        ) : null}
      </div>
      <ul>{children}</ul>
    </div>
  );
}

function FileRow({ f, onOpen, actions }: { f: FileEntry; onOpen: () => void; actions: { icon: typeof Plus; title: string; onClick: () => void; danger?: boolean }[] }) {
  const Icon = STATUS_ICON[f.label] ?? FilePen;
  return (
    <li className="group flex items-center gap-2 px-3 py-1 text-[12px] hover:bg-secondary/50">
      <Icon className={cn("h-3.5 w-3.5 shrink-0", STATUS_COLOR[f.label] ?? "text-muted-foreground")} />
      <button onClick={onOpen} className="min-w-0 flex-1 truncate text-left font-mono text-foreground/85 hover:underline" title={`${f.label} — view diff`}>
        {f.path}
      </button>
      <span className={cn("shrink-0 text-[9px] uppercase", STATUS_COLOR[f.label] ?? "text-muted-foreground")}>{f.code.trim() || f.label[0]}</span>
      <span className="flex shrink-0 items-center opacity-0 group-hover:opacity-100">
        {actions.map((a) => (
          <button key={a.title} onClick={a.onClick} title={a.title} className={cn("flex h-5 w-5 items-center justify-center rounded hover:bg-secondary", a.danger ? "text-muted-foreground hover:text-destructive" : "text-muted-foreground hover:text-foreground")}>
            <a.icon className="h-3.5 w-3.5" />
          </button>
        ))}
      </span>
    </li>
  );
}

/** The commit graph ("git map"): lane routing + SVG edges, with commit rows. */
function CommitGraph({ commits, headBranch }: { commits: GitCommit[]; headBranch: string | null }) {
  const ROW = 34;
  const COLW = 16;
  const layout = useMemo(() => {
    const pos = new Map<string, { row: number; col: number }>();
    const lanes: (string | null)[] = [];
    commits.forEach((c, row) => {
      let col = lanes.indexOf(c.hash);
      if (col === -1) {
        col = lanes.indexOf(null);
        if (col === -1) { col = lanes.length; lanes.push(null); }
      }
      lanes[col] = null;
      pos.set(c.hash, { row, col });
      // route parents
      c.parents.forEach((p, i) => {
        if (i === 0) {
          lanes[col] = p;
        } else {
          let pc = lanes.indexOf(p);
          if (pc === -1) { pc = lanes.indexOf(null); if (pc === -1) { pc = lanes.length; lanes.push(null); } lanes[pc] = p; }
        }
      });
    });
    const maxCol = commits.reduce((m, c) => Math.max(m, pos.get(c.hash)?.col ?? 0), 0);
    return { pos, width: (maxCol + 1) * COLW };
  }, [commits]);

  if (!commits.length) {
    return <p className="px-3 py-4 text-[12px] text-muted-foreground">No commits yet.</p>;
  }

  const cx = (col: number) => col * COLW + COLW / 2;
  const cy = (row: number) => row * ROW + ROW / 2;

  return (
    <div className="min-h-0 flex-1 overflow-auto [scrollbar-width:thin]">
      <div className="relative flex" style={{ minHeight: commits.length * ROW }}>
        {/* graph gutter */}
        <svg width={layout.width + 8} height={commits.length * ROW} className="shrink-0">
          {commits.map((c) => {
            const from = layout.pos.get(c.hash)!;
            return c.parents.map((p) => {
              const to = layout.pos.get(p);
              if (!to) return null;
              const x1 = cx(from.col), y1 = cy(from.row), x2 = cx(to.col), y2 = cy(to.row);
              const color = LANE_COLORS[(x1 === x2 ? from.col : Math.min(from.col, to.col)) % LANE_COLORS.length];
              const d = x1 === x2 ? `M${x1},${y1} L${x2},${y2}` : `M${x1},${y1} C${x1},${(y1 + y2) / 2} ${x2},${(y1 + y2) / 2} ${x2},${y2}`;
              return <path key={c.hash + p} d={d} stroke={color} strokeWidth={1.5} fill="none" />;
            });
          })}
          {commits.map((c) => {
            const { row, col } = layout.pos.get(c.hash)!;
            return <circle key={c.hash} cx={cx(col)} cy={cy(row)} r={4} fill={LANE_COLORS[col % LANE_COLORS.length]} stroke="var(--background)" strokeWidth={1.5} />;
          })}
        </svg>
        {/* commit rows */}
        <div className="min-w-0 flex-1">
          {commits.map((c) => (
            <div key={c.hash} className="flex items-center gap-2 border-b border-border/40 px-2 text-[12px]" style={{ height: ROW }}>
              <span className="min-w-0 flex-1 truncate text-foreground/90">
                {refsBadges(c.refs, headBranch)}
                {c.subject}
              </span>
              <span className="hidden shrink-0 font-mono text-[10px] text-primary sm:inline">{c.short}</span>
              <span className="shrink-0 text-[10px] text-muted-foreground">{c.author} · {c.relative}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function refsBadges(refs: string, headBranch: string | null) {
  if (!refs) return null;
  const parts = refs.split(",").map((r) => r.replace("HEAD ->", "").trim()).filter(Boolean);
  return (
    <>
      {parts.slice(0, 3).map((r) => (
        <span
          key={r}
          className={cn(
            "mr-1.5 rounded px-1.5 py-px text-[9.5px] font-medium",
            r === headBranch ? "bg-primary/20 text-primary" : r.startsWith("tag:") ? "bg-warning/20 text-warning" : "bg-secondary text-muted-foreground",
          )}
        >
          {r.replace("tag: ", "⌂ ")}
        </span>
      ))}
    </>
  );
}

/** Colorized unified-diff overlay for one file. */
function DiffOverlay({ diff, onClose }: { diff: { path: string; staged: boolean; text: string }; onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-editor">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <FilePen className="h-3.5 w-3.5 text-primary" />
        <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-foreground">{diff.path}</span>
        {diff.staged ? <span className="rounded bg-primary/15 px-1.5 py-px text-[9.5px] text-primary">staged</span> : null}
        <button onClick={onClose} className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground"><X className="h-4 w-4" /></button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2 [scrollbar-width:thin]">
        {diff.text.trim() ? (
          <pre className="font-mono text-[11.5px] leading-relaxed">
            {diff.text.split("\n").map((line, i) => (
              <div
                key={i}
                className={cn(
                  "whitespace-pre-wrap px-1",
                  line.startsWith("+") && !line.startsWith("+++") ? "bg-primary/10 text-primary" :
                  line.startsWith("-") && !line.startsWith("---") ? "bg-destructive/10 text-destructive" :
                  line.startsWith("@@") ? "text-info" : "text-foreground/70",
                )}
              >
                {line || " "}
              </div>
            ))}
          </pre>
        ) : (
          <p className="p-3 text-[12px] text-muted-foreground">No differences.</p>
        )}
      </div>
    </div>
  );
}

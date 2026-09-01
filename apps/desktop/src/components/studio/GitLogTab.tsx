/**
 * The Git Log dock tab: commit history for the workspace repo — filterable
 * list on the left, full commit detail (message, author, changed files with
 * line counts, per-file diff) on the right.
 *
 * Ported from GitDesktop (https://github.com/theBGuy/GitDesktop) —
 * src/features/history/HistoryPanel.tsx, CommitDetailView.tsx,
 * src/components/diff-stat.tsx and relative-time.tsx — adapted to this app's
 * IPC layer, theme, and icon set. Copyright 2026 theBGuy. Licensed under the
 * Apache License, Version 2.0. See THIRD-PARTY-NOTICES.md at the repo root.
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ArrowUp, Copy, GitCommitHorizontal, Loader2, Search, Tag, X } from "lucide-react";

import { DiffBody } from "@/features/workbench/GitPanel";
import { ipc } from "@/lib/ipc";
import type { GitCommitDetails, GitCommitInfo, GitDiffStat } from "@/lib/ipc";
import { formatRelativeTime, parseableDate } from "@/lib/git-time";
import { cn } from "@/lib/utils";

// ── Shared 30s clock (GitDesktop's relative-time.tsx) ────────────────────────
// All mounted timestamps compute from ONE shared snapshot, refreshed every 30s,
// so two rows mounted at different moments never disagree about the same date.
const TICK_MS = 30_000;
let now = Date.now();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (timer === null) {
    timer = setInterval(() => {
      now = Date.now();
      for (const l of listeners) l();
    }, TICK_MS);
    now = Date.now();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

function RelativeTime({ date }: { date: string }) {
  const nowMs = useSyncExternalStore(subscribe, () => now);
  if (!parseableDate(date)) return null;
  return (
    <time dateTime={date} title={new Date(date).toLocaleString()}>
      {formatRelativeTime(date, nowMs)}
    </time>
  );
}

/** `+added -deleted` line counts (GitDesktop's diff-stat.tsx). The glyphs carry
 *  the meaning on their own, so the colors stay decorative. */
function DiffStat({ added, deleted, isBinary, className }: { added: number; deleted: number; isBinary?: boolean; className?: string }) {
  if (isBinary) return <span className={cn("shrink-0 text-muted-foreground", className)}>bin</span>;
  return (
    <span className={cn("shrink-0 font-mono tabular-nums", className)}>
      <span className="text-primary">+{added}</span> <span className="text-destructive">-{deleted}</span>
    </span>
  );
}

/** Author initial in a circle — GitDesktop's CommitAuthorAvatar fallback
 *  (no network avatars here; the workspace repo is usually single-author). */
function AuthorDot({ name }: { name: string }) {
  return (
    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-semibold text-muted-foreground" aria-hidden>
      {(name || "?").charAt(0).toUpperCase()}
    </span>
  );
}

const PAGE = 100;

export function GitLogTab() {
  const [isRepo, setIsRepo] = useState<boolean | null>(null);
  const [ahead, setAhead] = useState(0);
  const [commits, setCommits] = useState<GitCommitInfo[]>([]);
  const [exhausted, setExhausted] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filter, setFilter] = useState("");
  // Search-all mode: the filter text sent to `git log --grep` over ALL history,
  // instead of narrowing the loaded page client-side.
  const [searchAll, setSearchAll] = useState(false);
  const [searchResults, setSearchResults] = useState<GitCommitInfo[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [details, setDetails] = useState<GitCommitDetails | null>(null);
  const [files, setFiles] = useState<GitDiffStat[] | null>(null);
  const [fileDiff, setFileDiff] = useState<{ path: string; text: string } | null>(null);
  const filterRef = useRef<HTMLInputElement>(null);

  const load = () => {
    ipc.gitStatus()
      .then((s) => {
        setIsRepo(s.isRepo);
        setAhead(s.ahead);
        if (!s.isRepo) {
          setCommits([]);
          return;
        }
        ipc.gitLogRich(PAGE, 0)
          .then((rows) => {
            setCommits(rows);
            setExhausted(rows.length < PAGE);
          })
          .catch(() => setCommits([]));
      })
      .catch(() => setIsRepo(false));
  };
  useEffect(() => {
    load();
    window.addEventListener("studio:git-changed", load);
    return () => window.removeEventListener("studio:git-changed", load);
  }, []);

  // The most recent {hash, path} the user asked a diff for — later-arriving
  // responses for anything else are dropped.
  const diffReqRef = useRef("");

  // Selecting a commit loads its details + changed files; the diff resets.
  // Stale-response guard: a slower response for a PREVIOUSLY selected commit
  // must never overwrite the current selection's panes.
  useEffect(() => {
    if (!selected) return;
    let alive = true;
    setDetails(null);
    setFiles(null);
    setFileDiff(null);
    diffReqRef.current = "";
    ipc.gitCommitDetails(selected)
      .then((d) => { if (alive) setDetails(d); })
      .catch(() => { if (alive) setDetails(null); });
    ipc.gitCommitFiles(selected)
      .then((f) => { if (alive) setFiles(f); })
      .catch(() => { if (alive) setFiles([]); });
    return () => { alive = false; };
  }, [selected]);

  const q = filter.trim().toLowerCase();
  const visible = useMemo(() => {
    if (searchAll && searchResults) return searchResults;
    if (!q) return commits;
    return commits.filter(
      (c) => c.subject.toLowerCase().includes(q) || c.author.toLowerCase().includes(q) || c.hash.startsWith(q),
    );
  }, [commits, q, searchAll, searchResults]);

  // The unpushed set: the top `ahead` commits of the HEAD-order log.
  const unpushed = useMemo(() => new Set(commits.slice(0, ahead).map((c) => c.hash)), [commits, ahead]);

  const loadMore = () => {
    setLoadingMore(true);
    ipc.gitLogRich(PAGE, commits.length)
      .then((rows) => {
        setCommits((cur) => [...cur, ...rows]);
        setExhausted(rows.length < PAGE);
      })
      .catch(() => setExhausted(true))
      .finally(() => setLoadingMore(false));
  };

  const runSearchAll = () => {
    if (!q) return;
    setSearchAll(true);
    setSearchResults(null);
    ipc.gitLogRich(200, 0, filter.trim()).then(setSearchResults).catch(() => setSearchResults([]));
  };
  const clearSearch = () => {
    setSearchAll(false);
    setSearchResults(null);
    setFilter("");
    filterRef.current?.focus();
  };

  const totals = useMemo(() => {
    const list = files ?? [];
    return {
      added: list.reduce((n, f) => n + f.added, 0),
      deleted: list.reduce((n, f) => n + f.deleted, 0),
    };
  }, [files]);

  if (isRepo === null) {
    return <div className="flex h-full items-center justify-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /></div>;
  }
  if (!isRepo) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 text-[12px] text-muted-foreground">
        <GitCommitHorizontal className="h-5 w-5" />
        <p>Not a git repo yet — commits appear here once the workspace is versioned.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      {/* Commit list */}
      <div className="flex w-[340px] shrink-0 flex-col border-r border-border">
        <div className="flex h-8 shrink-0 items-center gap-1.5 border-b border-border/60 px-2">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <input
            data-bare
            ref={filterRef}
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              if (searchAll) {
                setSearchAll(false);
                setSearchResults(null);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") runSearchAll();
            }}
            placeholder="Filter commits…"
            className="h-full w-full bg-transparent text-[12px] text-foreground outline-none placeholder:text-muted-foreground/60"
          />
          {filter ? (
            <button onClick={clearSearch} aria-label="Clear filter" className="text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
          {searchAll && searchResults === null ? (
            <div className="flex justify-center py-6 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /></div>
          ) : visible.length === 0 ? (
            <div className="px-3 py-4 text-center text-[11.5px] text-muted-foreground">
              {commits.length === 0 ? "No commits yet." : `No commits match “${filter.trim()}”.`}
            </div>
          ) : (
            visible.map((c) => (
              <button
                key={c.hash}
                data-hash={c.hash}
                onClick={() => setSelected(c.hash)}
                className={cn(
                  "flex w-full items-start gap-2 border-b border-border/40 px-2.5 py-1.5 text-left",
                  selected === c.hash ? "bg-secondary" : "hover:bg-secondary/50",
                )}
              >
                <AuthorDot name={c.author} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-[11.5px] font-medium text-foreground">
                    <span className="min-w-0 truncate" title={c.subject}>{c.subject}</span>
                    {c.tags.slice(0, 2).map((tag) => (
                      <span key={tag} className="flex max-w-24 shrink-0 items-center gap-0.5 rounded border border-border px-1 py-px text-[9.5px] font-normal text-muted-foreground" title={`tag: ${tag}`}>
                        <Tag className="h-2.5 w-2.5 shrink-0" />
                        <span className="truncate">{tag}</span>
                      </span>
                    ))}
                    {c.tags.length > 2 ? (
                      <span className="shrink-0 text-[9.5px] font-normal text-muted-foreground" title={c.tags.join(", ")}>+{c.tags.length - 2}</span>
                    ) : null}
                    {unpushed.has(c.hash) ? (
                      <span className="ml-auto shrink-0 text-muted-foreground" title="Not pushed yet" aria-label="Not pushed yet">
                        <ArrowUp className="h-3 w-3" />
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
                    <span className="truncate">{c.author}</span>
                    <span>•</span>
                    <span className="shrink-0"><RelativeTime date={c.date} /></span>
                    {c.isMerge ? <span className="shrink-0 rounded bg-secondary px-1 text-[9px]">merge</span> : null}
                  </span>
                </span>
              </button>
            ))
          )}
          {!searchAll && q && (
            <div className="px-3 py-2 text-center">
              <button onClick={runSearchAll} className="text-[11px] text-primary hover:underline">
                Search all history for “{filter.trim()}”
              </button>
            </div>
          )}
          {!searchAll && !q && !exhausted && commits.length > 0 && (
            <div className="px-3 py-2 text-center">
              <button onClick={loadMore} disabled={loadingMore} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground">
                {loadingMore ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                Load more ({commits.length} loaded)
              </button>
            </div>
          )}
          {searchAll && searchResults !== null && (
            <div className="space-y-0.5 px-3 py-2 text-center">
              {searchResults.length >= 200 ? (
                <p className="text-[10.5px] text-muted-foreground">Showing the first 200 matches — refine the search to narrow down.</p>
              ) : null}
              <button onClick={clearSearch} className="text-[11px] text-muted-foreground hover:text-foreground">
                Back to recent history
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Commit detail */}
      <div className="relative flex min-w-0 flex-1 flex-col">
        {!selected ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-[12px] text-muted-foreground">
            <GitCommitHorizontal className="h-5 w-5" />
            <p>Select a commit to see its message and changed files.</p>
          </div>
        ) : details === null ? (
          <div className="flex h-full items-center justify-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /></div>
        ) : (
          <>
            <header className="space-y-1 border-b border-border px-4 py-2.5">
              <h2 className="text-[13px] font-medium text-foreground">{details.subject}</h2>
              {details.body ? (
                <p className="max-h-24 overflow-y-auto text-[11.5px] whitespace-pre-wrap text-muted-foreground [scrollbar-width:thin]">{details.body}</p>
              ) : null}
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <AuthorDot name={details.author} />
                <span>{details.author}</span>
                <span>•</span>
                <span><RelativeTime date={details.date} /></span>
                <span>•</span>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 font-mono hover:text-foreground"
                  onClick={() => navigator.clipboard?.writeText(details.hash)}
                  title="Copy full hash"
                >
                  {details.hash.slice(0, 7)}
                  <Copy className="h-3 w-3" />
                </button>
                <span className="flex-1" />
                {files && files.length > 0 ? <DiffStat added={totals.added} deleted={totals.deleted} /> : null}
              </div>
            </header>
            <div className="flex min-h-0 flex-1">
              <div className="flex w-72 shrink-0 flex-col border-r border-border">
                <p className="shrink-0 border-b border-border/60 px-3 py-1.5 text-[10.5px] text-muted-foreground">
                  {files === null ? "Loading changed files…" : `${files.length} changed file${files.length === 1 ? "" : "s"}`}
                </p>
                <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
                  {(files ?? []).map((f) => (
                    <button
                      key={f.path}
                      onClick={() => {
                        const key = `${details.hash}\0${f.path}`;
                        diffReqRef.current = key;
                        setFileDiff(null);
                        ipc.gitCommitFileDiff(details.hash, f.path, f.oldPath)
                          .then((text) => {
                            if (diffReqRef.current === key) setFileDiff({ path: f.path, text });
                          })
                          .catch(() => {
                            if (diffReqRef.current === key) setFileDiff({ path: f.path, text: "" });
                          });
                      }}
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-1 text-left text-[11px]",
                        fileDiff?.path === f.path ? "bg-secondary" : "hover:bg-secondary/50",
                      )}
                    >
                      <span
                        className="min-w-0 flex-1 truncate font-mono text-foreground/80"
                        title={f.oldPath ? `${f.oldPath} → ${f.path}` : f.path}
                      >
                        {f.oldPath ? `${f.oldPath} → ${f.path}` : f.path}
                      </span>
                      <DiffStat added={f.added} deleted={f.deleted} isBinary={f.isBinary} className="text-[10px]" />
                    </button>
                  ))}
                </div>
              </div>
              <div className="min-h-0 min-w-0 flex-1 overflow-auto p-2 [scrollbar-width:thin]">
                {fileDiff === null ? (
                  <p className="px-2 py-3 text-[11.5px] text-muted-foreground">Select a file to see the diff this commit introduced.</p>
                ) : (
                  <DiffBody text={fileDiff.text} />
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

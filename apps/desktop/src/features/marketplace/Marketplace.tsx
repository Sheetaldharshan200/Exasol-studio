import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  Boxes,
  Check,
  Cloud,
  Cpu,
  Database,
  Download,
  ExternalLink,
  FileCode2,
  Loader2,
  Plug,
  RefreshCcw,
  Server,
  ShieldCheck,
  Store,
  Terminal,
  Trash2,
  TriangleAlert,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  errorMessage,
  ipc,
  isTauri,
  type InstalledItem,
  type MarketCatalog,
  type MarketEnv,
  type Release,
  type ReleaseAsset,
} from "@/lib/ipc";
import { cn } from "@/lib/utils";
import { Terminal as TerminalBox, AnimatedSpan } from "@/components/ui/terminal";

type Kind = "database" | "cli" | "driver" | "server" | "extension" | "skills" | "cloud";
type Install = "download" | "pip" | "personal" | "cloud";

type CatalogItem = {
  id: string;
  name: string;
  repo?: string;
  kind: Kind;
  install: Install;
  description: string;
  homepage: string;
  labs?: boolean;
};

const CATALOG: CatalogItem[] = [
  {
    id: "exasol-personal",
    name: "Exasol Personal — Local",
    kind: "database",
    install: "personal",
    description:
      "A free, local Exasol database. Installed natively on macOS via the official starter kit; runs via Docker/Podman on Windows & Linux.",
    homepage: "https://github.com/krishna-exasol/starter-kit-testing-v1",
  },
  {
    id: "exasol-cloud",
    name: "Exasol Personal — Cloud (AWS)",
    kind: "cloud",
    install: "cloud",
    description:
      "Deploy Exasol on AWS with the official c4 tool. Installs the c4 binary and shows the AWS deploy command — you keep control of the deployment.",
    homepage: "https://docs.exasol.com/db/latest/administration/aws/c4/using_c4.htm",
  },
  {
    id: "exapump",
    name: "ExaPump",
    repo: "exasol/exapump",
    kind: "cli",
    install: "download",
    description: "Single-binary CLI for Exasol data exchange — import, export, and SQL in one command.",
    homepage: "https://github.com/exasol/exapump",
  },
  {
    id: "mcp-server",
    name: "Exasol MCP Server",
    repo: "exasol/mcp-server",
    kind: "server",
    install: "pip",
    description: "Gives an LLM knowledge of your Exasol database over the Model Context Protocol.",
    homepage: "https://github.com/exasol/mcp-server",
  },
  {
    id: "pyexasol",
    name: "PyExasol",
    repo: "exasol/pyexasol",
    kind: "driver",
    install: "pip",
    description: "Official Python driver with low overhead, fast HTTP transport and compression.",
    homepage: "https://github.com/exasol/pyexasol",
  },
  {
    id: "json-tables",
    name: "JSON Tables",
    repo: "exasol/json-tables",
    kind: "extension",
    install: "download",
    description: "Ingest, query and reshape JSON-shaped data in Exasol.",
    homepage: "https://github.com/exasol/json-tables",
  },
  {
    id: "ai-lab",
    name: "Exasol AI Lab",
    repo: "exasol/ai-lab",
    kind: "extension",
    install: "download",
    description: "A data-science environment with extensions like the Transformer Extension for in-DB ML.",
    homepage: "https://github.com/exasol/ai-lab",
  },
  {
    id: "agent-skills",
    name: "Exasol Agent Skills",
    repo: "exasol-labs/exasol-agent-skills",
    kind: "skills",
    install: "download",
    labs: true,
    description: "Skills for AI agents, optimized for Claude Code and Codex.",
    homepage: "https://github.com/exasol-labs/exasol-agent-skills",
  },
];

const KIND_ICON: Record<Kind, LucideIcon> = {
  database: Database,
  cli: Cpu,
  driver: Plug,
  server: Server,
  extension: Boxes,
  skills: FileCode2,
  cloud: Cloud,
};

function openExternal(url: string) {
  window.open(url, "_blank");
}

/** Pick the release asset that best matches the host platform. */
function pickAsset(assets: ReleaseAsset[], env: MarketEnv | null): ReleaseAsset | null {
  if (!assets.length) return null;
  if (!env) return assets[0];
  const osTokens =
    env.os === "macos"
      ? ["darwin", "macos", "apple", "osx"]
      : env.os === "windows"
        ? ["windows", "win", ".exe", ".msi"]
        : ["linux"];
  const archTokens = env.arch === "aarch64" ? ["arm64", "aarch64"] : ["x86_64", "amd64", "x64"];
  const byOsArch = assets.find((a) => {
    const n = a.name.toLowerCase();
    return osTokens.some((t) => n.includes(t)) && archTokens.some((t) => n.includes(t));
  });
  const byOs = assets.find((a) => osTokens.some((t) => a.name.toLowerCase().includes(t)));
  return byOsArch ?? byOs ?? assets[0];
}

/** Plain-language steps shown on the permission screen before anything runs. */
function planFor(item: CatalogItem, env: MarketEnv | null, asset: ReleaseAsset | null): string[] {
  switch (item.install) {
    case "download":
      return asset
        ? [`Download ${asset.name} from GitHub`, "Place it in Exasol Studio's managed folder", "Mark it as installed"]
        : ["No prebuilt asset was found for this platform"];
    case "pip":
      return item.id === "mcp-server"
        ? [
            "Ensure the uv Python package manager (install it if missing)",
            "Install exasol-mcp-server as a uv tool",
          ]
        : [
            "Ensure the uv Python package manager (install it if missing)",
            "Create a managed Python environment",
            "Install pyexasol into it",
          ];
    case "personal": {
      const reuse = "Reuse your existing local Exasol if one is already installed — never a duplicate";
      if (env?.os === "macos") {
        return [
          reuse,
          "Otherwise, run the official Exasol starter-kit installer",
          "Deploy a local Exasol database natively (no Docker needed)",
          "Load the bundled sample data",
        ];
      }
      const rt = env?.docker ? "Docker" : env?.podman ? "Podman" : null;
      if (env?.os === "windows") {
        return rt
          ? [reuse, "Otherwise, use Docker to pull & start a local Exasol database"]
          : ["Docker Desktop is required on Windows — none was detected"];
      }
      return rt
        ? [reuse, `Otherwise, use ${rt} to pull & start a local Exasol database`]
        : ["Docker or Podman is required on Linux — none was detected"];
    }
    case "cloud":
      return [
        "Download the Exasol c4 deployment binary for your platform",
        "Make it executable in Exasol Studio's managed folder",
        "Show the AWS deploy command (c4 aws play …) — you run it when ready",
      ];
  }
}

type LogLine = { level: string; text: string };

export function Marketplace() {
  const [env, setEnv] = useState<MarketEnv | null>(null);
  const [catalog, setCatalog] = useState<MarketCatalog | null>(null);
  const [releases, setReleases] = useState<Record<string, Release>>({});
  const [installed, setInstalled] = useState<InstalledItem[]>([]);
  const [detected, setDetected] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [loadingReleases, setLoadingReleases] = useState(true);
  const [consoleItem, setConsoleItem] = useState<CatalogItem | null>(null);

  const refreshInstalled = useCallback(() => {
    ipc.marketInstalled().then(setInstalled).catch(() => undefined);
    ipc.marketDetect().then(setDetected).catch(() => undefined);
  }, []);

  // Re-check environment, installed state and latest releases WITHOUT reloading
  // the app — a full reload would drop every open database connection.
  const refresh = useCallback(() => {
    ipc.marketEnv().then(setEnv).catch(() => undefined);
    ipc.marketInstalled().then(setInstalled).catch(() => undefined);
    ipc.marketDetect().then(setDetected).catch(() => undefined);
    ipc.marketCatalog().then(setCatalog).catch(() => undefined);
    setLoadingReleases(true);
    Promise.allSettled(
      CATALOG.filter((c) => c.repo).map((c) => ipc.marketRelease(c.repo!).then((r) => [c.id, r] as const)),
    )
      .then((results) => {
        const map: Record<string, Release> = {};
        for (const res of results) if (res.status === "fulfilled") map[res.value[0]] = res.value[1];
        setReleases(map);
      })
      .finally(() => setLoadingReleases(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const installedMap = useMemo(() => {
    const m: Record<string, InstalledItem> = {};
    installed.forEach((i) => (m[i.id] = i));
    return m;
  }, [installed]);

  // Catalog is the authoritative version; fall back to the per-repo release tag.
  const latestFor = useCallback(
    (id: string): string | null => catalog?.items?.[id]?.latest ?? releases[id]?.tag ?? null,
    [catalog, releases],
  );

  const updatesAvailable = useMemo(
    () =>
      CATALOG.filter((item) => {
        const inst = installedMap[item.id];
        const latest = catalog?.items?.[item.id]?.latest ?? releases[item.id]?.tag ?? null;
        return inst && latest && latest !== inst.version;
      }).length,
    [installedMap, catalog, releases],
  );

  async function uninstall(item: CatalogItem) {
    setBusy((b) => ({ ...b, [item.id]: true }));
    try {
      await ipc.marketUninstall(item.id);
      refreshInstalled();
    } finally {
      setBusy((b) => ({ ...b, [item.id]: false }));
    }
  }

  const runtime = env?.docker ? "docker" : env?.podman ? "podman" : null;

  return (
    <div className="h-full overflow-auto bg-editor">
      <div className="mx-auto max-w-5xl p-6">
        <header className="mb-5 flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/12 text-primary">
            <Store className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <h2 className="font-heading text-[15px] font-bold text-foreground">Marketplace</h2>
            <p className="text-xs text-muted-foreground">
              Install Exasol tools, drivers and extensions — one click, with a live install log.
            </p>
          </div>
          {updatesAvailable > 0 ? (
            <span className="flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
              </span>
              {updatesAvailable} update{updatesAvailable > 1 ? "s" : ""} available
            </span>
          ) : null}
          {env ? (
            <div className="flex items-center gap-1.5">
              <span className="rounded-md border border-border px-2 py-1 font-mono text-[10px] text-muted-foreground">
                {env.os} · {env.arch}
              </span>
              <span
                className={cn(
                  "rounded-md border px-2 py-1 font-mono text-[10px]",
                  runtime ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground",
                )}
              >
                {runtime ? `${runtime} ✓` : "no docker/podman"}
              </span>
            </div>
          ) : null}
          <button
            onClick={refresh}
            disabled={loadingReleases}
            title="Check for updates"
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-60"
          >
            <RefreshCcw className={cn("h-3.5 w-3.5", loadingReleases && "animate-spin")} />
          </button>
        </header>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {CATALOG.map((item) => {
            const Icon = KIND_ICON[item.kind];
            const inst = installedMap[item.id];
            const onSystem = detected[item.id] && !inst;
            const isBusy = busy[item.id];
            const latest = latestFor(item.id);
            const newer = inst && latest && latest !== inst.version;
            return (
              <div key={item.id} className="flex flex-col rounded-xl border border-border bg-panel/60 p-4">
                <div className="flex items-start gap-2.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-foreground">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-[13px] font-semibold text-foreground">{item.name}</span>
                      {item.labs ? (
                        <span className="rounded bg-syntax-function/15 px-1 py-px text-[9px] font-medium uppercase text-syntax-function">
                          labs
                        </span>
                      ) : (
                        <span className="rounded bg-primary/15 px-1 py-px text-[9px] font-medium uppercase text-primary">
                          official
                        </span>
                      )}
                      {inst ? (
                        <span className="flex items-center gap-0.5 rounded bg-primary/15 px-1 py-px text-[9px] font-medium uppercase text-primary">
                          <Check className="h-2.5 w-2.5" /> installed
                        </span>
                      ) : onSystem ? (
                        <span className="flex items-center gap-0.5 rounded bg-syntax-function/15 px-1 py-px text-[9px] font-medium uppercase text-syntax-function">
                          <Check className="h-2.5 w-2.5" /> detected
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">{item.description}</p>
                    <div className="mt-1 flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
                      {latest ? <span>{latest}</span> : null}
                      <button
                        onClick={() => openExternal(item.homepage)}
                        className="flex items-center gap-0.5 hover:text-foreground"
                      >
                        GitHub <ExternalLink className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* One unified action row for every item */}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {inst ? (
                    <>
                      {newer ? (
                        <button
                          onClick={() => setConsoleItem(item)}
                          disabled={isBusy}
                          className="flex h-7 items-center gap-1.5 rounded-md bg-primary px-2.5 text-[12px] font-medium text-primary-foreground hover:bg-primary/85 disabled:opacity-50"
                        >
                          <Download className="h-3.5 w-3.5" /> Update to {latest}
                        </button>
                      ) : (
                        <span className="flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 text-[12px] text-muted-foreground">
                          <Check className="h-3.5 w-3.5 text-primary" /> Up to date
                        </span>
                      )}
                      <button
                        onClick={() => uninstall(item)}
                        disabled={isBusy}
                        className="flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 text-[12px] text-muted-foreground hover:border-destructive/50 hover:text-destructive disabled:opacity-50"
                      >
                        {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        Uninstall
                      </button>
                    </>
                  ) : onSystem ? (
                    <>
                      <span className="flex h-7 items-center gap-1.5 rounded-md border border-syntax-function/40 bg-syntax-function/10 px-2.5 text-[12px] text-syntax-function">
                        <Check className="h-3.5 w-3.5" /> Already on your system
                      </span>
                      <button
                        onClick={() => setConsoleItem(item)}
                        className="flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 text-[12px] text-muted-foreground hover:bg-secondary hover:text-foreground"
                      >
                        <RefreshCcw className="h-3.5 w-3.5" /> Reinstall
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setConsoleItem(item)}
                      className="cta-glow flex h-7 items-center gap-1.5 rounded-md bg-primary px-3 text-[12px] font-medium text-primary-foreground hover:bg-primary/85"
                    >
                      <Download className="h-3.5 w-3.5" /> Install
                    </button>
                  )}
                </div>

                {item.install === "personal" && env && env.os !== "macos" && !runtime ? (
                  <p className="mt-2 flex items-start gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-2 py-1.5 text-[11px] text-muted-foreground">
                    <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0 text-warning" />
                    {env.os === "windows"
                      ? "Docker Desktop is required to run Exasol locally on Windows."
                      : "Docker or Podman is required to run Exasol locally on Linux."}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {consoleItem ? (
        <InstallConsole
          item={consoleItem}
          env={env}
          asset={pickAsset(releases[consoleItem.id]?.assets ?? [], env)}
          version={latestFor(consoleItem.id) ?? undefined}
          onDone={refreshInstalled}
          onClose={() => setConsoleItem(null)}
        />
      ) : null}
    </div>
  );
}

function InstallConsole({
  item,
  env,
  asset,
  version,
  onDone,
  onClose,
}: {
  item: CatalogItem;
  env: MarketEnv | null;
  asset: ReleaseAsset | null;
  version?: string;
  onDone: () => void;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<"confirm" | "running" | "done">("confirm");
  const [ok, setOk] = useState(false);
  const [lines, setLines] = useState<LogLine[]>([]);
  const [progress, setProgress] = useState<{ pct: number | null; received: number; total: number | null } | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);
  const unlisteners = useRef<UnlistenFn[]>([]);
  const plan = planFor(item, env, asset);
  const isBinary = item.install === "download" || item.install === "cloud";

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [lines]);

  useEffect(
    () => () => {
      unlisteners.current.forEach((u) => u());
      unlisteners.current = [];
    },
    [],
  );

  const push = useCallback((level: string, text: string) => {
    setLines((prev) => [...prev, { level, text }]);
  }, []);

  async function run() {
    setLines([]);
    setProgress(isBinary ? { pct: null, received: 0, total: null } : null);
    setPhase("running");

    if (isTauri()) {
      const onLog = await listen<{ id: string; line: string; level: string }>("market:log", (e) => {
        if (e.payload.id === item.id) push(e.payload.level, e.payload.line);
      });
      const onProg = await listen<{ id: string; pct: number | null; received: number; total: number | null }>(
        "market:progress",
        (e) => {
          if (e.payload.id === item.id)
            setProgress({ pct: e.payload.pct ?? null, received: e.payload.received, total: e.payload.total ?? null });
        },
      );
      const onEnd = await listen<{ id: string; ok: boolean; error?: string }>("market:done", (e) => {
        if (e.payload.id !== item.id) return;
        setOk(e.payload.ok);
        setPhase("done");
        if (e.payload.ok) onDone();
      });
      unlisteners.current.push(onLog, onProg, onEnd);
      try {
        await ipc.marketInstallRun(item.id, version, asset?.url, asset?.name);
      } catch (err) {
        // The backend also emits market:done on failure; guard against a hard throw.
        push("err", errorMessage(err));
        setOk(false);
        setPhase("done");
      }
    } else {
      // Browser design-preview: replay the plan as a simulated log/progress.
      await simulate(item, plan, push, isBinary ? setProgress : undefined);
      setOk(true);
      setPhase("done");
      onDone();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm">
      <div className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-panel shadow-2xl">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Terminal className="h-4 w-4 text-primary" />
          <span className="flex-1 text-[13px] font-semibold text-foreground">
            Install · {item.name}
            {version ? <span className="ml-1.5 font-mono text-[11px] text-muted-foreground">{version}</span> : null}
          </span>
          {phase !== "running" ? (
            <button
              onClick={onClose}
              className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        {phase === "confirm" ? (
          <div className="p-5">
            <div className="mb-3 flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/8 p-3">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div className="text-[12px] leading-relaxed text-foreground">
                Exasol Studio needs your permission to run the following on your machine. Nothing runs until you press
                <span className="font-semibold"> Install</span>.
              </div>
            </div>
            <ol className="mb-4 space-y-1.5">
              {plan.map((step, i) => (
                <li key={i} className="flex items-start gap-2 text-[12px] text-muted-foreground">
                  <span className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-secondary text-[9px] font-semibold text-foreground">
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
            <div className="flex justify-end gap-2">
              <button
                onClick={onClose}
                className="flex h-8 items-center rounded-md border border-border px-3 text-[12px] text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={run}
                className="cta-glow flex h-8 items-center gap-1.5 rounded-md bg-primary px-3.5 text-[12px] font-medium text-primary-foreground hover:bg-primary/85"
              >
                <Download className="h-3.5 w-3.5" /> Install
              </button>
            </div>
          </div>
        ) : (
          <>
            {isBinary ? (
              <div className="border-b border-border px-4 py-3">
                <div className="mb-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>{phase === "running" ? "Downloading…" : ok ? "Downloaded" : "Stopped"}</span>
                  <span className="font-mono">
                    {progress?.pct != null ? `${progress.pct}% · ` : ""}
                    {progress ? fmtBytes(progress.received) : "0 B"}
                    {progress?.total ? ` / ${fmtBytes(progress.total)}` : ""}
                  </span>
                </div>
                <ProgressBar pct={progress?.pct ?? null} done={phase === "done" && ok} />
              </div>
            ) : null}
            <div ref={logRef} className="min-h-[220px] max-h-[46vh] flex-1 overflow-auto p-3 [scrollbar-width:thin]">
              <TerminalBox sequence={false} startOnView={false} className="w-full max-w-none max-h-none">
                {lines.length === 0 ? (
                  <AnimatedSpan startOnView={false} className="text-muted-foreground">
                    Preparing…
                  </AnimatedSpan>
                ) : null}
                {lines.map((l, i) => (
                  <AnimatedSpan key={i} startOnView={false} className={cn("whitespace-pre-wrap break-words", lineClass(l.level))}>
                    {l.text}
                  </AnimatedSpan>
                ))}
              </TerminalBox>
            </div>
            <div className="flex items-center gap-2 border-t border-border px-4 py-2.5">
              {phase === "running" ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  <span className="flex-1 text-[12px] text-muted-foreground">Installing… you can watch progress above.</span>
                </>
              ) : (
                <>
                  {ok ? (
                    <Check className="h-4 w-4 text-primary" />
                  ) : (
                    <X className="h-4 w-4 text-destructive" />
                  )}
                  <span
                    className={cn(
                      "flex-1 text-[12px] font-medium",
                      ok ? "text-primary" : "text-destructive",
                    )}
                  >
                    {ok ? "Installed successfully." : "Installation failed — see the log above."}
                  </span>
                  <button
                    onClick={onClose}
                    className="flex h-7 items-center rounded-md border border-border px-3 text-[12px] text-foreground hover:bg-secondary"
                  >
                    Close
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function lineClass(level: string): string {
  switch (level) {
    case "err":
      return "text-red-500";
    case "cmd":
      return "text-blue-400";
    case "success":
      return "text-green-500 font-semibold";
    case "info":
      return "text-cyan-400";
    default:
      return "text-foreground/80";
  }
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function ProgressBar({ pct, done }: { pct: number | null; done: boolean }) {
  const indeterminate = pct == null && !done;
  const width = done ? 100 : (pct ?? 0);
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
      <div
        className={cn(
          "h-full rounded-full bg-primary transition-[width] duration-200",
          indeterminate && "w-1/3 animate-pulse",
        )}
        style={indeterminate ? undefined : { width: `${width}%` }}
      />
    </div>
  );
}

/** Design-preview only: fake a streamed log (and progress) so the UX is visible in the browser. */
async function simulate(
  item: CatalogItem,
  plan: string[],
  push: (level: string, text: string) => void,
  setProgress?: (p: { pct: number | null; received: number; total: number | null }) => void,
) {
  const wait = (ms: number) => new Promise((r) => window.setTimeout(r, ms));
  push("info", "Starting installation…");
  for (const step of plan) {
    await wait(450);
    push("cmd", `$ ${step}`);
    if (setProgress) {
      for (let p = 0; p <= 100; p += 25) {
        setProgress({ pct: p, received: p * 42_000, total: 4_200_000 });
        await wait(120);
      }
    } else {
      await wait(400);
    }
    push("out", "done");
  }
  await wait(300);
  push("success", `✓ ${item.name} installed.`);
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  BarChart3,
  Boxes,
  Check,
  ChevronDown,
  ChevronRight,
  Cloud,
  Cpu,
  Database,
  Download,
  ExternalLink,
  FileCode2,
  LayoutGrid,
  List,
  Loader2,
  Plug,
  RefreshCcw,
  Search,
  Server,
  ShieldCheck,
  Sparkles,
  Store,
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
import { INSTALL_DONE } from "@/lib/install-window";
import { PACKS, type Pack } from "@/features/onboarding/SetupPacks";
import { LocalExasolPanel } from "@/features/marketplace/LocalExasolPanel";

type Kind = "database" | "cli" | "driver" | "server" | "extension" | "skills" | "cloud" | "bi";
type Install = "personal-local" | "personal-cloud" | "binary" | "uv-tool" | "uv-pip" | "source-build" | "bundled" | "reference";

export type CatalogItem = {
  id: string;
  name: string;
  repo?: string;
  kind: Kind;
  install: Install;
  description: string;
  homepage: string;
  labs?: boolean;
};

// Official Exasol / Exasol-Labs repositories only.
export const CATALOG: CatalogItem[] = [
  {
    id: "exasol-personal",
    name: "Exasol Personal — Local",
    repo: "exasol/exasol-personal",
    kind: "database",
    install: "personal-local",
    description: "Native Exasol Personal on macOS; Exasol Nano via Docker/Podman on Windows and Linux. Starts automatically.",
    homepage: "https://github.com/exasol/exasol-personal",
  },
  {
    id: "exapump",
    name: "ExaPump",
    repo: "exasol-labs/exapump",
    kind: "cli",
    install: "binary",
    labs: true,
    description: "CLI to import, export, and run SQL.",
    homepage: "https://github.com/exasol-labs/exapump",
  },
  {
    id: "json-tables",
    name: "JSON Tables",
    repo: "exasol-labs/exasol-json-tables",
    kind: "extension",
    install: "source-build",
    labs: true,
    description: "Query JSON data in Exasol.",
    homepage: "https://github.com/exasol-labs/exasol-json-tables",
  },
  {
    id: "mcp-server",
    name: "Exasol MCP Server",
    repo: "exasol/mcp-server",
    kind: "server",
    install: "uv-tool",
    description: "Connect an LLM to your database.",
    homepage: "https://github.com/exasol/mcp-server",
  },
  {
    id: "pyexasol",
    name: "PyExasol",
    repo: "exasol/pyexasol",
    kind: "driver",
    install: "uv-pip",
    description: "Python driver for Exasol.",
    homepage: "https://github.com/exasol/pyexasol",
  },
  {
    id: "sqlalchemy-exasol",
    name: "SQLAlchemy Exasol",
    repo: "exasol/sqlalchemy-exasol",
    kind: "driver",
    install: "uv-pip",
    description: "SQLAlchemy dialect for Exasol.",
    homepage: "https://github.com/exasol/sqlalchemy-exasol",
  },
  {
    id: "exarrow-rs",
    name: "exarrow-rs",
    repo: "exasol-labs/exarrow-rs",
    kind: "driver",
    install: "reference",
    labs: true,
    description: "Rust Arrow / ADBC driver.",
    homepage: "https://github.com/exasol-labs/exarrow-rs",
  },
  {
    id: "driver-jdbc",
    name: "JDBC Driver",
    kind: "driver",
    install: "reference",
    description: "JDBC driver for Java tools.",
    homepage: "https://docs.exasol.com/db/latest/connect_exasol/drivers/jdbc.htm",
  },
  {
    id: "driver-odbc",
    name: "ODBC Driver",
    kind: "driver",
    install: "reference",
    description: "ODBC driver for apps and BI tools.",
    homepage: "https://docs.exasol.com/db/latest/connect_exasol/drivers/odbc.htm",
  },
  {
    id: "driver-ts",
    name: "TypeScript / JavaScript Driver",
    repo: "exasol/exasol-driver-ts",
    kind: "driver",
    install: "reference",
    description: "Node / TypeScript driver.",
    homepage: "https://github.com/exasol/exasol-driver-ts",
  },
  {
    id: "driver-go",
    name: "Go SQL Driver",
    repo: "exasol/exasol-driver-go",
    kind: "driver",
    install: "reference",
    description: "Go SQL driver.",
    homepage: "https://github.com/exasol/exasol-driver-go",
  },
  {
    id: "driver-adonet",
    name: "ADO.NET Provider",
    kind: "driver",
    install: "reference",
    description: "ADO.NET provider for .NET.",
    homepage: "https://docs.exasol.com/db/latest/connect_exasol/drivers/ado.net.htm",
  },
  {
    id: "driver-r",
    name: "R Integration",
    kind: "driver",
    install: "reference",
    description: "R integration for Exasol.",
    homepage: "https://docs.exasol.com/db/latest/connect_exasol/drivers/r.htm",
  },
  {
    id: "driver-websocket",
    name: "WebSocket API",
    repo: "exasol/websocket-api",
    kind: "driver",
    install: "reference",
    description: "Native WebSocket protocol.",
    homepage: "https://github.com/exasol/websocket-api",
  },
  {
    id: "ai-lab",
    name: "Exasol AI Lab",
    repo: "exasol/ai-lab",
    kind: "extension",
    install: "uv-pip",
    description: "Data-science environment for in-DB ML.",
    homepage: "https://github.com/exasol/ai-lab",
  },
  {
    id: "agent-skills",
    name: "Exasol Agent Skills",
    repo: "exasol-labs/exasol-agent-skills",
    kind: "skills",
    install: "bundled",
    labs: true,
    description: "Pinned Exasol skills bundled into the Studio AI agent.",
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
  bi: BarChart3,
};

// Marketplace sections (ordered). Every catalog item maps to exactly one.
type SectionKey = "database" | "load" | "drivers" | "extension" | "ai" | "bi";
// Left category rail — one entry per view.
const NAV: { key: string; label: string; icon: LucideIcon }[] = [
  { key: "all", label: "All", icon: Store },
  { key: "recommended", label: "Recommended", icon: Sparkles },
  { key: "database", label: "Databases", icon: Database },
  { key: "load", label: "Data & tools", icon: Cpu },
  { key: "drivers", label: "Drivers", icon: Plug },
  { key: "extension", label: "Extensions", icon: Boxes },
  { key: "ai", label: "AI & Agents", icon: Sparkles },
  { key: "bi", label: "BI & Analytics", icon: BarChart3 },
  { key: "installed", label: "Installed", icon: Check },
  { key: "installing", label: "Installing", icon: Loader2 },
  { key: "updates", label: "Updates", icon: Download },
];

const SECTION_META: { key: SectionKey; label: string; hint: string }[] = [
  { key: "database", label: "Databases", hint: "Run Exasol locally or in the cloud" },
  { key: "load", label: "Data loading & tools", hint: "Move data in and out" },
  { key: "drivers", label: "Drivers", hint: "Connect your apps & scripts to Exasol" },
  { key: "extension", label: "Extensions", hint: "Extend what Exasol can store & query" },
  { key: "ai", label: "AI & Agents", hint: "MCP, agent skills, LLM workflows" },
  { key: "bi", label: "BI & Analytics", hint: "Dashboards and visual analytics" },
];
function sectionOf(kind: Kind): SectionKey {
  switch (kind) {
    case "database":
    case "cloud":
      return "database";
    case "cli":
      return "load";
    case "driver":
      return "drivers";
    case "extension":
      return "extension";
    case "server":
    case "skills":
      return "ai";
    case "bi":
      return "bi";
  }
}


function openExternal(url: string) {
  if (isTauri()) {
    // OS opener via the backend — reliable regardless of JS plugin scoping.
    ipc.openExternal(url).catch(() => window.open(url, "_blank"));
  } else {
    window.open(url, "_blank");
  }
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
    case "binary":
      return asset
        ? [`Download ${asset.name} from the official release`, "Make it executable in Exasol Studio's managed folder", "Mark it as installed"]
        : ["No prebuilt asset was found for this platform"];
    case "uv-tool":
      return [
        "Ensure the uv Python package manager (install it if missing)",
        `Install ${item.id === "mcp-server" ? "exasol-mcp-server" : "exasol-agent-skills"} as a uv tool`,
      ];
    case "uv-pip":
      return [
        "Ensure the uv Python package manager (install it if missing)",
        "Create a managed Python environment",
        `Install ${item.id === "pyexasol" ? "pyexasol" : "exasol-ai-lab"} into it`,
      ];
    case "source-build":
      return [
        "Download the prebuilt ingest engine for your platform (built by our CI)",
        "Download the Python package (wheel)",
        "Install it with uv — no Rust, cargo or git needed on your machine",
      ];
    case "bundled":
      return ["Verify the pinned skills shipped inside Exasol Studio", "Make them available to the AI agent immediately"];
    case "reference":
      return ["Opens the official download / documentation page"];
    case "personal-local":
      return env && env.os === "macos"
        ? ["Install the verified native Exasol Personal launcher", "Run `exasol install local` and save its generated credential in the Studio vault"]
        : ["Detect a running Docker or Podman engine", "Pull the pinned official Exasol Nano image", "Create a persistent local container with a generated vault-backed SYS credential"];
    case "personal-cloud":
      return [
        "Install the official Exasol launcher (if not already present)",
        "Show the deploy commands: exasol install aws | azure | exoscale | stackit",
        "You run the deploy with your own cloud credentials",
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
  const [manageLocal, setManageLocal] = useState(false);
  // Starter-pack install queue (populated from the setup step).
  const [queue, setQueue] = useState<{ id: string; name: string; status: "pending" | "installing" | "done" | "failed" }[]>([]);
  const [pendingPack, setPendingPack] = useState<string[] | null>(null);

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

  // A standalone install window finished → refresh installed/detected state.
  useEffect(() => {
    if (!isTauri()) return;
    let un: UnlistenFn | undefined;
    listen(INSTALL_DONE, () => refreshInstalled())
      .then((u) => (un = u))
      .catch(() => undefined);
    return () => un?.();
  }, [refreshInstalled]);

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

  // ── Starter-pack queue ──────────────────────────────────────────────────
  // Read the pack chosen during setup once, then run it after releases load
  // (so binary items have their download asset resolved).
  useEffect(() => {
    const raw = window.localStorage.getItem("exasol-studio-pending-pack");
    if (!raw) return;
    window.localStorage.removeItem("exasol-studio-pending-pack");
    try {
      const ids = JSON.parse(raw);
      if (Array.isArray(ids) && ids.length) setPendingPack(ids);
    } catch {
      /* ignore */
    }
  }, []);

  // Install one item, resolving when its `market:done` fires.
  const installOne = useCallback(
    (item: CatalogItem) =>
      new Promise<boolean>((resolve) => {
        if (!isTauri()) {
          window.setTimeout(() => resolve(true), 800);
          return;
        }
        const asset = pickAsset(releases[item.id]?.assets ?? [], env);
        const version = latestFor(item.id) ?? undefined;
        let un: UnlistenFn | undefined;
        let settled = false;
        const finish = (v: boolean) => {
          if (settled) return;
          settled = true;
          un?.();
          resolve(v);
        };
        listen<{ id: string; ok: boolean }>("market:done", (e) => {
          if (e.payload.id === item.id) finish(e.payload.ok);
        })
          .then((u) => {
            un = u;
            ipc.marketInstallRun(item.id, version, asset?.url, asset?.name).catch(() => finish(false));
          })
          .catch(() => finish(false));
      }),
    [releases, env, latestFor],
  );

  // Queue items and install them all IN PARALLEL — one install never blocks
  // another, and each reports its own status independently.
  const enqueue = useCallback(
    (items: CatalogItem[]) => {
      const fresh = items.filter((i) => i.install !== "reference");
      if (!fresh.length) return;
      setQueue((q) => {
        const seen = new Set(q.filter((x) => x.status === "installing" || x.status === "pending").map((x) => x.id));
        const add = fresh
          .filter((i) => !seen.has(i.id))
          .map((i) => ({ id: i.id, name: i.name, status: "installing" as const }));
        // drop any prior finished entry for these ids, then add fresh
        const kept = q.filter((x) => !fresh.some((f) => f.id === x.id));
        return [...kept, ...add];
      });
      for (const item of fresh) {
        void installOne(item).then((ok) => {
          setQueue((q) => q.map((x) => (x.id === item.id ? { ...x, status: ok ? "done" : "failed" } : x)));
          refreshInstalled();
        });
      }
    },
    [installOne, refreshInstalled],
  );

  // Start the pending pack once releases are ready.
  useEffect(() => {
    if (!pendingPack || loadingReleases) return;
    const items = pendingPack
      .map((id) => CATALOG.find((c) => c.id === id))
      .filter((c): c is CatalogItem => !!c && c.install !== "reference");
    setPendingPack(null);
    if (items.length) enqueue(items);
  }, [pendingPack, loadingReleases, enqueue]);

  const queueBusy = queue.some((q) => q.status === "pending" || q.status === "installing");
  const installingIds = useMemo(() => new Set(queue.filter((q) => q.status === "installing").map((q) => q.id)), [queue]);

  // Install a single item (parallel, via the queue) or open the page for
  // reference-only items.
  function startInstall(item: CatalogItem) {
    if (item.install === "reference") {
      openExternal(item.homepage);
      return;
    }
    enqueue([item]);
  }

  // Install every item in a recommended pack, in parallel.
  function installPack(pack: Pack) {
    const items = pack.items
      .map((it) => CATALOG.find((c) => c.id === it.id))
      .filter((c): c is CatalogItem => !!c && c.install !== "reference");
    enqueue(items);
  }

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

  const [query, setQuery] = useState("");
  const [nav, setNav] = useState<string>("all");
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const isList = layout === "list";
  const gridClass = isList ? "grid grid-cols-1 gap-2" : "grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(250px,1fr))]";

  // Query-filtered catalog (the category rail narrows further).
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return CATALOG.filter(
      (item) =>
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.id.includes(q) ||
        (item.repo ?? "").toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q),
    );
  }, [query]);

  // Items to show for the selected category (flat lists; "all" is grouped below).
  const navItems = useMemo(() => {
    if (nav === "installed") return visible.filter((i) => installedMap[i.id] || detected[i.id]);
    if (nav === "installing") return visible.filter((i) => queue.some((x) => x.id === i.id));
    if (nav === "updates")
      return visible.filter((i) => {
        const inst = installedMap[i.id];
        const l = catalog?.items?.[i.id]?.latest ?? releases[i.id]?.tag ?? null;
        return inst && l && l !== inst.version;
      });
    if (["database", "load", "drivers", "extension", "ai", "bi"].includes(nav))
      return visible.filter((i) => sectionOf(i.kind) === nav);
    return visible;
  }, [nav, visible, installedMap, detected, queue, catalog, releases]);

  const installedCount = useMemo(() => CATALOG.filter((i) => installedMap[i.id] || detected[i.id]).length, [installedMap, detected]);

  // Driver runtimes: marketplace item id → the driver id the connect dialog uses.
  // These install the SAME on-demand runtime, so "installed" here == usable there.
  const DRIVER_RUNTIME: Record<string, string> = {
    pyexasol: "pyexasol",
    "sqlalchemy-exasol": "sqlalchemy",
    "driver-jdbc": "jdbc",
    "driver-odbc": "odbc",
  };
  const [driverReady, setDriverReady] = useState<Record<string, boolean>>({});
  const [driverBusy, setDriverBusy] = useState<Record<string, boolean>>({});
  const refreshDrivers = useCallback(() => {
    for (const did of new Set(Object.values(DRIVER_RUNTIME))) {
      ipc.driverStatus(did).then((s) => setDriverReady((r) => ({ ...r, [did]: s.ready }))).catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    refreshDrivers();
  }, [refreshDrivers]);
  async function installDriverRuntime(did: string) {
    setDriverBusy((b) => ({ ...b, [did]: true }));
    try {
      await ipc.driverSetup(did);
      const s = await ipc.driverStatus(did);
      setDriverReady((r) => ({ ...r, [did]: s.ready }));
    } catch {
      /* surfaced when they try to use it */
    } finally {
      setDriverBusy((b) => ({ ...b, [did]: false }));
    }
  }

  const renderCard = (item: CatalogItem, compact = false) => {
    const Icon = KIND_ICON[item.kind];
    const inst = installedMap[item.id];
    const onSystem = detected[item.id] && !inst;
    const isBusy = busy[item.id];
    const isInstalling = installingIds.has(item.id);
    const latest = latestFor(item.id);
    const newer = inst && latest && latest !== inst.version;
    const did = DRIVER_RUNTIME[item.id];
    const runtimeReady = did ? driverReady[did] : false;
    const comingSoon = !did && item.install === "reference";

    const badges = (
      <>
        {item.labs ? (
          <span className="rounded bg-syntax-function/15 px-1 py-px text-[9px] font-medium uppercase text-syntax-function">labs</span>
        ) : (
          <span className="rounded bg-primary/15 px-1 py-px text-[9px] font-medium uppercase text-primary">official</span>
        )}
        {inst || (did && runtimeReady) ? (
          <span className="flex items-center gap-0.5 rounded bg-primary/15 px-1 py-px text-[9px] font-medium uppercase text-primary">
            <Check className="h-2.5 w-2.5" /> installed
          </span>
        ) : onSystem ? (
          <span className="flex items-center gap-0.5 rounded bg-syntax-function/15 px-1 py-px text-[9px] font-medium uppercase text-syntax-function">
            <Check className="h-2.5 w-2.5" /> detected
          </span>
        ) : comingSoon ? (
          <span className="rounded bg-secondary px-1 py-px text-[9px] font-medium uppercase text-muted-foreground">coming soon</span>
        ) : null}
      </>
    );

    const actions = (
      <div className="flex flex-wrap items-center gap-2">
        {did ? (
          runtimeReady ? (
            <>
              {newer ? (
                <button onClick={() => startInstall(item)} disabled={isBusy} className="cta-glow flex h-7 items-center gap-1.5 rounded-md bg-primary px-2.5 text-[12px] font-medium text-primary-foreground hover:bg-primary/85 disabled:opacity-50">
                  <Download className="h-3.5 w-3.5" /> Update to {latest}
                </button>
              ) : (
                <span className="flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 text-[12px] text-muted-foreground">
                  <Check className="h-3.5 w-3.5 text-primary" /> Ready to use
                </span>
              )}
              <button onClick={() => void installDriverRuntime(did)} disabled={driverBusy[did]} className="flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 text-[12px] text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50">
                {driverBusy[did] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />} Reinstall
              </button>
            </>
          ) : (
            <button onClick={() => void installDriverRuntime(did)} disabled={driverBusy[did]} className="cta-glow flex h-7 items-center gap-1.5 rounded-md bg-primary px-3 text-[12px] font-medium text-primary-foreground hover:bg-primary/85 disabled:opacity-60">
              {driverBusy[did] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              {driverBusy[did] ? "Installing…" : "Install & use here"}
            </button>
          )
        ) : comingSoon ? (
          <>
            <span className="flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 text-[12px] text-muted-foreground">Coming soon to Exasol Studio</span>
            <button onClick={() => openExternal(item.homepage)} className="flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 text-[12px] text-muted-foreground hover:bg-secondary hover:text-foreground">
              Docs <ExternalLink className="h-3.5 w-3.5" />
            </button>
          </>
        ) : inst ? (
          <>
            {newer ? (
              <button onClick={() => startInstall(item)} disabled={isBusy} className="flex h-7 items-center gap-1.5 rounded-md bg-primary px-2.5 text-[12px] font-medium text-primary-foreground hover:bg-primary/85 disabled:opacity-50">
                <Download className="h-3.5 w-3.5" /> Update to {latest}
              </button>
            ) : (
              <span className="flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 text-[12px] text-muted-foreground">
                <Check className="h-3.5 w-3.5 text-primary" /> Up to date
              </span>
            )}
            <button onClick={() => uninstall(item)} disabled={isBusy} className="flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 text-[12px] text-muted-foreground hover:border-destructive/50 hover:text-destructive disabled:opacity-50">
              {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Uninstall
            </button>
          </>
        ) : onSystem ? (
          <>
            <span className="flex h-7 items-center gap-1.5 rounded-md border border-syntax-function/40 bg-syntax-function/10 px-2.5 text-[12px] text-syntax-function">
              <Check className="h-3.5 w-3.5" /> Already on your system
            </span>
            <button onClick={() => startInstall(item)} className="flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 text-[12px] text-muted-foreground hover:bg-secondary hover:text-foreground">
              <RefreshCcw className="h-3.5 w-3.5" /> Reinstall
            </button>
          </>
        ) : item.install === "reference" ? (
          <button onClick={() => openExternal(item.homepage)} className="flex h-7 items-center gap-1.5 rounded-md border border-border px-3 text-[12px] text-foreground hover:bg-secondary">
            Get <ExternalLink className="h-3.5 w-3.5" />
          </button>
        ) : (
          <button onClick={() => startInstall(item)} disabled={isInstalling} className="cta-glow flex h-7 items-center gap-1.5 rounded-md bg-primary px-3 text-[12px] font-medium text-primary-foreground hover:bg-primary/85 disabled:opacity-60">
            {isInstalling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            {isInstalling ? "Installing…" : "Install"}
          </button>
        )}
        {item.install === "personal-local" && (inst || onSystem) ? (
          <button onClick={() => setManageLocal(true)} className="flex h-7 items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-2.5 text-[12px] font-medium text-primary hover:bg-primary/20">
            <Server className="h-3.5 w-3.5" /> Manage (start/stop)
          </button>
        ) : null}
      </div>
    );

    // Compact list row.
    if (compact) {
      return (
        <div key={item.id} className="flex items-center gap-3 rounded-lg border border-border bg-panel/60 px-3 py-2">
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-[12.5px] font-semibold text-foreground">{item.name}</span>
              {badges}
            </div>
            <p className="truncate text-[11px] text-muted-foreground">{item.description}</p>
          </div>
          <div className="shrink-0">{actions}</div>
        </div>
      );
    }

    // Full grid card.
    return (
      <div key={item.id} className="flex flex-col rounded-xl border border-border bg-panel/60 p-4">
        <div className="flex items-start gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-foreground">
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-[13px] font-semibold text-foreground">{item.name}</span>
              {badges}
            </div>
            {did ? (
              <p className="mt-0.5 text-[10px] font-medium text-primary">✓ Runs inside Exasol Studio</p>
            ) : comingSoon ? (
              <p className="mt-0.5 text-[10px] text-muted-foreground">Supported by Exasol — not yet runnable in Exasol Studio</p>
            ) : null}
            <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">{item.description}</p>
            <div className="mt-1 flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
              {latest ? <span>{latest}</span> : null}
              <button onClick={() => openExternal(item.homepage)} className="flex items-center gap-0.5 hover:text-foreground">
                GitHub <ExternalLink className="h-2.5 w-2.5" />
              </button>
            </div>
          </div>
        </div>
        <div className="mt-3">{actions}</div>
        {item.install === "personal-local" && env && env.os !== "macos" && !env.docker && !env.podman ? (
          <p className="mt-2 flex items-start gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-2 py-1.5 text-[11px] text-muted-foreground">
            <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0 text-warning" />
            Start or install Docker/Podman to run Exasol Nano on {env.os}.
          </p>
        ) : null}
      </div>
    );
  };

  return (
    <div className="h-full overflow-auto bg-editor">
      <div className="mx-auto w-full max-w-[1600px] px-8 py-6">
        <header className="mb-5 flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg text-primary">
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

        {/* Two-pane: category rail + content */}
        <div className="flex items-start gap-6">
          {/* Category rail — sticky so it stays in view while the content scrolls */}
          <nav className="sticky top-2 w-44 shrink-0 space-y-0.5 self-start rounded-xl border border-border/60 bg-panel/40 p-1.5">
            {NAV.map((n) => {
              const Icon = n.icon;
              const active = nav === n.key;
              const count =
                n.key === "installed" ? installedCount : n.key === "installing" ? installingIds.size : n.key === "updates" ? updatesAvailable : 0;
              return (
                <button
                  key={n.key}
                  onClick={() => setNav(n.key)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12.5px] transition-colors",
                    active ? "bg-primary/12 font-medium text-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                  )}
                >
                  <Icon className={cn("h-3.5 w-3.5 shrink-0", active ? "text-primary" : "", n.key === "installing" && count > 0 ? "animate-spin" : "")} />
                  <span className="flex-1 truncate">{n.label}</span>
                  {count > 0 ? <span className="rounded-full bg-secondary px-1.5 text-[9.5px] text-muted-foreground">{count}</span> : null}
                </button>
              );
            })}
          </nav>

          {/* Content */}
          <div className="min-w-0 flex-1">
            <div className="mb-4 flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search tools, drivers, extensions…"
                  className="h-9 w-full rounded-lg border border-border bg-panel/70 pl-8 pr-8 text-[12.5px] text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
                />
                {query ? (
                  <button onClick={() => setQuery("")} className="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground">
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
              <div className="flex h-9 shrink-0 items-center gap-0.5 rounded-lg border border-border bg-panel/70 p-1">
                <button
                  onClick={() => setLayout("grid")}
                  aria-label="Grid view"
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
                    layout === "grid" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <LayoutGrid className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setLayout("list")}
                  aria-label="List view"
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
                    layout === "list" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <List className="h-4 w-4" />
                </button>
              </div>
            </div>

            {nav === "recommended" ? (
              <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
                {PACKS.map((pack) => {
                  const PackIcon = pack.icon;
                  const allInstalled = pack.items.every((it) => {
                    const c = CATALOG.find((x) => x.id === it.id);
                    return c?.install === "reference" || installedMap[it.id] || detected[it.id];
                  });
                  return (
                    <div key={pack.id} className="flex flex-col rounded-xl border border-border bg-panel/60 p-3.5">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg text-primary"><PackIcon className="h-4 w-4" /></div>
                        <span className="text-[13px] font-semibold text-foreground">{pack.name}</span>
                      </div>
                      <p className="mt-1.5 flex-1 text-[11.5px] leading-relaxed text-muted-foreground">{pack.tagline}</p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {pack.items.map((it) => (
                          <span key={it.id} className="rounded bg-secondary/60 px-1.5 py-px text-[10px] text-muted-foreground">{it.label}</span>
                        ))}
                      </div>
                      <button
                        onClick={() => installPack(pack)}
                        disabled={allInstalled}
                        className="mt-3 flex h-7 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-[12px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                      >
                        {allInstalled ? <><Check className="h-3.5 w-3.5" /> Installed</> : <><Download className="h-3.5 w-3.5" /> Install pack</>}
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : nav === "all" && !query ? (
              <>
                {SECTION_META.map((sec) => {
                  const items = visible.filter((i) => sectionOf(i.kind) === sec.key);
                  if (!items.length) return null;
                  return (
                    <section key={sec.key} className="mb-6">
                      <div className="mb-2.5 flex items-baseline gap-2">
                        <h3 className="text-[12px] font-semibold uppercase tracking-wider text-foreground/80">{sec.label}</h3>
                        <span className="rounded-full bg-secondary px-1.5 py-px font-mono text-[10px] text-muted-foreground">{items.length}</span>
                        <span className="text-[11px] text-muted-foreground">- {sec.hint}</span>
                      </div>
                      <div className={gridClass}>{items.map((i) => renderCard(i, isList))}</div>
                    </section>
                  );
                })}
              </>
            ) : navItems.length ? (
              <div className={gridClass}>{navItems.map((i) => renderCard(i, isList))}</div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
                <Search className="h-6 w-6 opacity-40" />
                <p className="text-sm">{query ? "No items match “" + query + "”." : "Nothing here yet."}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {manageLocal ? <LocalExasolPanel onClose={() => setManageLocal(false)} /> : null}

      {queue.length ? (
        <div className="fixed bottom-4 right-4 z-50 w-72 overflow-hidden rounded-xl border border-border bg-popover shadow-2xl">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
            {queueBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" /> : <Check className="h-3.5 w-3.5 text-primary" />}
            <span className="flex-1 text-[12.5px] font-semibold text-foreground">
              {queueBusy ? "Installing your starter pack…" : "Starter pack installed"}
            </span>
            {!queueBusy ? (
              <button onClick={() => setQueue([])} className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
          <ul className="max-h-64 overflow-auto p-1.5 [scrollbar-width:thin]">
            {queue.map((q) => (
              <li key={q.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[12px]">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                  {q.status === "installing" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  ) : q.status === "done" ? (
                    <Check className="h-3.5 w-3.5 text-primary" />
                  ) : q.status === "failed" ? (
                    <X className="h-3.5 w-3.5 text-destructive" />
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate text-foreground/90">{q.name}</span>
                <span className="shrink-0 text-[10.5px] text-muted-foreground">
                  {q.status === "installing" ? "installing" : q.status === "done" ? "done" : q.status === "failed" ? "failed" : "queued"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function InstallConsole({
  item,
  env,
  asset,
  version,
  onDone,
  onClose,
  embedded,
}: {
  item: CatalogItem;
  env: MarketEnv | null;
  asset: ReleaseAsset | null;
  version?: string;
  onDone: () => void;
  onClose: () => void;
  /** True when hosted in its own install window — render plainly (no overlay/box). */
  embedded?: boolean;
}) {
  const [phase, setPhase] = useState<"confirm" | "running" | "done">("confirm");
  const [ok, setOk] = useState(false);
  const [lines, setLines] = useState<LogLine[]>([]);
  const [progress, setProgress] = useState<{ pct: number | null; received: number; total: number | null } | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const logRef = useRef<HTMLDivElement | null>(null);
  const unlisteners = useRef<UnlistenFn[]>([]);
  const plan = planFor(item, env, asset);
  const isBinary = item.install === "binary";

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

  // In its own window: fill it plainly (no dimmed overlay, no inner card/box).
  // As a fallback modal: dim the backdrop and show a centered card.
  const Outer = embedded
    ? ({ children }: { children: React.ReactNode }) => (
        <div className="flex h-screen w-screen flex-col overflow-hidden bg-panel">{children}</div>
      )
    : ({ children }: { children: React.ReactNode }) => (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm">
          <div className="relative flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-panel shadow-2xl">
            {children}
          </div>
        </div>
      );

  return (
    <Outer>
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Boxes className="h-4 w-4 text-primary" />
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
            {(() => {
              // A real, advancing progress bar for every install. Binary
              // downloads use byte progress; script installs (pip/uv/git) derive
              // a step-based percentage from how many commands have run so far.
              const stepsSeen = lines.filter((l) => l.level === "cmd").length;
              const estSteps = Math.max(plan.length, 1);
              const stepPct = Math.min(95, Math.round((stepsSeen / estSteps) * 100));
              const shownPct =
                phase === "done"
                  ? ok
                    ? 100
                    : (isBinary ? progress?.pct ?? 0 : stepPct)
                  : isBinary
                    ? progress?.pct ?? 0
                    : Math.max(6, stepPct); // small head start so the bar is visible immediately
              return (
                <div className="px-5 pt-5 pb-3">
                  <div className="mb-1.5 flex items-center justify-between text-[11.5px]">
                    <span className="font-medium text-foreground">
                      {phase === "running"
                        ? isBinary
                          ? "Downloading…"
                          : "Installing…"
                        : ok
                          ? "Installed successfully"
                          : "Installation failed"}
                    </span>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {isBinary && progress
                        ? `${fmtBytes(progress.received)}${progress.total ? ` / ${fmtBytes(progress.total)}` : ""}`
                        : phase === "running"
                          ? `${shownPct}%`
                          : ""}
                    </span>
                  </div>
                  <ProgressBar pct={shownPct} done={phase === "done" && ok} />
                  {phase === "done" && !ok ? (
                    <p className="mt-2 text-[11.5px] text-destructive">Something went wrong — open the logs for details.</p>
                  ) : null}
                </div>
              );
            })()}

            <div className="px-5">
              <button
                onClick={() => setShowLogs((s) => !s)}
                className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
              >
                {showLogs ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                {showLogs ? "Hide logs" : "Show logs"}
              </button>
            </div>

            {showLogs ? (
              <div
                ref={logRef}
                className="mx-5 mt-2 max-h-[40vh] flex-1 overflow-auto rounded-md border border-border bg-editor p-2.5 font-mono text-[11px] leading-relaxed [scrollbar-width:thin]"
              >
                {lines.length === 0 ? (
                  <p className="text-muted-foreground">Preparing…</p>
                ) : (
                  lines.map((l, i) => (
                    <div key={i} className={cn("whitespace-pre-wrap break-words", lineClass(l.level))}>
                      {l.text}
                    </div>
                  ))
                )}
              </div>
            ) : null}

            <div className="mt-3 flex items-center gap-2 border-t border-border px-4 py-2.5">
              {phase === "running" ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  <span className="flex-1 text-[12px] text-muted-foreground">This can take a little while.</span>
                </>
              ) : (
                <>
                  {ok ? <Check className="h-4 w-4 text-primary" /> : <X className="h-4 w-4 text-destructive" />}
                  <span className={cn("flex-1 text-[12px] font-medium", ok ? "text-primary" : "text-destructive")}>
                    {ok ? "Done." : "Failed."}
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
    </Outer>
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

function ProgressBar({ pct, done, indeterminate }: { pct: number | null; done: boolean; indeterminate?: boolean }) {
  if (indeterminate && !done) {
    return (
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary">
        <div className="exa-indeterminate" />
      </div>
    );
  }
  const width = done ? 100 : (pct ?? 0);
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
      <div className="h-full rounded-full bg-primary transition-[width] duration-200" style={{ width: `${width}%` }} />
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

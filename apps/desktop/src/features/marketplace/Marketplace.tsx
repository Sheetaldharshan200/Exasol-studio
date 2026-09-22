import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  Boxes,
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  Plus,
  ExternalLink,
  DatabaseBackup,
  Loader2,
  RefreshCcw,
  Server,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import {
  errorMessage,
  ipc,
  isTauri,
  type ComponentInfo,
  type InstalledItem,
  type MarketCatalog,
  type MarketEnv,
  type Release,
  type ReleaseAsset,
} from "@/lib/ipc";
import { cn } from "@/lib/utils";
import { Icon as BxIcon } from "@/components/ui/icon";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { INSTALL_DONE } from "@/lib/install-window";
import { PACKS, type Pack } from "@/features/onboarding/SetupPacks";
import { BrandLoader } from "@/components/brand/BrandLoader";
import { LocalExasolPanel } from "@/features/marketplace/LocalExasolPanel";
import { AiClientsTab } from "@/features/marketplace/AiClientsTab";

import {
  catalogRepos,
  metaFromCatalogItems,
  readMetaSnapshot,
  resolveCatalog,
  writeMetaSnapshot,
} from "@/features/marketplace/catalog-data";
import type { ResolvedCatalogItem } from "@/features/marketplace/catalog-data";
import { CATALOG_TO_COMPONENT, isNewerVersion } from "@/features/marketplace/updates";
import { pickAsset } from "@/features/marketplace/assets";
import { versionSource } from "@/features/marketplace/versions";
import { StudioUpdateCard } from "@/features/marketplace/StudioUpdateCard";
import { itemState, type ItemSources } from "@/features/marketplace/item-state";
import { applyFilters, emptyFilters, sectionOf, type HubFilters, type SectionKey, type Sort } from "@/features/marketplace/hub/filters";
import { HubHeader, type HubPage } from "@/features/marketplace/hub/HubHeader";
import { HubHome, type Featured } from "@/features/marketplace/hub/HubHome";
import { HubSearch } from "@/features/marketplace/hub/HubSearch";
import { FilterDrawer } from "@/features/marketplace/hub/FilterDrawer";
import { HubDetail } from "@/features/marketplace/hub/HubDetail";

// The registry lives in catalog-data.ts (one line per addon: id + repo + kind
// + install); every display field resolves from the official GitHub repo at
// runtime. Consumers see the RESOLVED shape, so `.name`/`.description` stay
// plain strings everywhere.
export type CatalogItem = ResolvedCatalogItem;

// Left category rail — one entry per view.
// Driver runtimes: marketplace item id → the driver id the connect dialog uses.
// These install the SAME on-demand runtime, so "installed" here == usable there.
const DRIVER_RUNTIME: Record<string, string> = {
  pyexasol: "pyexasol",
  "sqlalchemy-exasol": "sqlalchemy",
  "driver-jdbc": "jdbc",
  "driver-odbc": "odbc",
};

function openExternal(url: string) {
  if (isTauri()) {
    // OS opener via the backend — reliable regardless of JS plugin scoping.
    ipc.openExternal(url).catch(() => window.open(url, "_blank"));
  } else {
    window.open(url, "_blank");
  }
}


/** Catalog items that ARE managed components. Their installed state + version
 * is the AUTHORITATIVE `list_components` value (single source of truth), not the
 * marketplace manifest or a presence heuristic — and updating them lives in the
 * Managed Components panel (verify-or-refuse), not the catalog card. */
/** Plain-language steps shown on the permission screen before anything runs. */
function planFor(item: CatalogItem, env: MarketEnv | null, asset: ReleaseAsset | null): string[] {
  switch (item.install) {
    case "binary":
      return asset
        ? [
            "Download the official release build for this platform",
            "Extract it and put CLI binaries on Studio's PATH (terminal + AI agent) — usable immediately",
            "Mark it as installed",
          ]
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
        "Install the package (the chosen version, else the verified one) into it",
      ];
    case "source-build":
      return [
        "Download the prebuilt ingest engine for your platform (built by our CI)",
        "Download the Python package (wheel)",
        "Install it with uv — no Rust, cargo or git needed on your machine",
      ];
    case "semantic-views":
      return [
        "Start your local Exasol database (if it is not running)",
        "Install the pinned Semantic Views framework into it",
        "Verify readiness — your data stays untouched (no example dataset is seeded)",
      ];
    case "bundled":
      return ["Verify the pinned skills shipped inside Exasol Studio", "Make them available to the AI agent immediately"];
    case "maven":
      return [
        "Resolve the latest exasol-jdbc version from Maven Central (live)",
        "Download the driver jar into Studio's marketplace folder for your Java tools",
      ];
    case "package":
      return [
        "Resolve the chosen version from the official source (registry or Exasol downloads portal)",
        "Download and extract it — usable immediately, no manual steps (the ODBC driver is wired straight into Studio's connections)",
      ];
    case "reference":
      return ["Opens the official download / documentation page"];
    case "personal-local":
      return ["Install the verified native Exasol Personal launcher", "Run `exasol install local` and save its generated credential in the Studio vault"];
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
  // Display metadata (name, About, homepage) straight from each item's GitHub
  // repo: last-known snapshot for instant paint, then the live fetch (Rust
  // disk-caches it for 24h). While neither exists the repo tail is the name.
  const [repoMeta, setRepoMeta] = useState(() => readMetaSnapshot());
  useEffect(() => {
    ipc.marketRepoMeta(catalogRepos())
      .then((m) => {
        if (m && Object.keys(m).length) {
          setRepoMeta((cur) => {
            const next = { ...(cur ?? {}), ...m };
            writeMetaSnapshot(next);
            return next;
          });
        }
      })
      .catch(() => undefined);
  }, []);
  // Base layer: catalog.json metadata (cron-fetched AUTHENTICATED, so it
  // survives the 60/hr unauthenticated GitHub rate limit that can empty the
  // live fetch). Live metadata overlays it when available.
  const CATALOG = useMemo(
    () => resolveCatalog({ ...metaFromCatalogItems(catalog?.items), ...(repoMeta ?? {}) }),
    [catalog, repoMeta],
  );
  const [releases, setReleases] = useState<Record<string, Release>>({});
  const [installed, setInstalled] = useState<InstalledItem[]>([]);
  // Semantic Views installs INTO a database, so the card offers which one.
  // "" means the managed local runtime. Read via a ref inside the install
  // queue so a queued install uses the choice made when it was clicked.
  const [profiles, setProfiles] = useState<{ id: string; name: string }[]>([]);
  const [semanticTarget, setSemanticTarget] = useState<string>("");
  const semanticTargetRef = useRef("");
  useEffect(() => {
    semanticTargetRef.current = semanticTarget;
  }, [semanticTarget]);
  // "Install into" targets are the user's DISTINCT writable databases — read
  // LIVE from the connection profiles, refreshed when they change and when the
  // picker opens (event-driven, not a busy timer).
  const refreshTargets = useCallback(() => {
    void ipc
      .listConnectionProfiles()
      .then((list) => {
        const norm = (h: string) => (h === "localhost" ? "127.0.0.1" : h);
        // The managed local database is ALREADY represented by the fixed
        // "Local database (managed)" entry — never list it again as a profile.
        const isManaged = (p: (typeof list)[number]) =>
          (p.notes ?? "").includes("Managed automatically by Exasol Studio") ||
          (/^Exasol Personal \(local\)/i.test(p.name) && norm(p.host) === "127.0.0.1" && p.username.toUpperCase() === "SYS");
        const seen = new Set<string>();
        setProfiles(
          list
            .filter((p) => !p.username.startsWith("STUDIO_MCP_")) // internal AI identity
            .filter((p) => !isManaged(p)) // the managed local DB
            .filter((p) => {
              const key = `${norm(p.host)}:${p.port}`; // collapse same-endpoint dupes
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            })
            .map((p) => ({ id: p.id, name: p.name })),
        );
      })
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    refreshTargets();
    // Live: refresh when a connection is added/removed/reconfigured or the DB's
    // state changes — mirrors the Connections tab without polling GitHub or the DB.
    const onChange = () => refreshTargets();
    window.addEventListener("studio:conn-settings-changed", onChange);
    window.addEventListener("studio:connect-profile", onChange);
    window.addEventListener("studio:disconnect", onChange);
    let un: UnlistenFn | undefined;
    if (isTauri()) listen("personal-local:status", onChange).then((u) => (un = u)).catch(() => undefined);
    return () => {
      window.removeEventListener("studio:conn-settings-changed", onChange);
      window.removeEventListener("studio:connect-profile", onChange);
      window.removeEventListener("studio:disconnect", onChange);
      un?.();
    };
  }, [refreshTargets]);
  // Authoritative install/version for the managed components (single source).
  const [components, setComponents] = useState<ComponentInfo[]>([]);
  // Live upstream tags for managed components — the SAME source the Updates tab
  // uses, so a managed component's card can't disagree with the Updates tab.
  const [componentUpstream, setComponentUpstream] = useState<Record<string, string>>({});
  const [detected, setDetected] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [loadingReleases, setLoadingReleases] = useState(true);
  // The essential (fast, local) data has been fetched at least once — gates the
  // brand loader so first open shows something immediately instead of hanging.
  const [ready, setReady] = useState(false);
  const [manageLocal, setManageLocal] = useState(false);
  // Starter-pack install queue (populated from the setup step).
  const [queue, setQueue] = useState<{ id: string; name: string; status: "pending" | "installing" | "done" | "failed" }[]>([]);
  const [pendingPack, setPendingPack] = useState<string[] | null>(null);

  // Notification deep-link ("Update available" → the Updates section).
  useEffect(() => {
    const on = (e: Event) => {
      const nav = (e as CustomEvent<{ nav?: string }>).detail?.nav;
      // Legacy names from older deep links still land somewhere sensible.
      const mapped: Record<string, HubPage> = { all: "search", recommended: "kits", updates: "updates", installed: "installed", installing: "installing", kits: "kits", "ai-clients": "ai-clients", home: "home" };
      if (nav && mapped[nav]) goto(mapped[nav]);
    };
    window.addEventListener("studio:marketplace-nav", on);
    return () => window.removeEventListener("studio:marketplace-nav", on);
  }, []);

  const refreshInstalled = useCallback(() => {
    ipc.marketInstalled().then(setInstalled).catch(() => undefined);
    ipc.marketDetect().then(setDetected).catch(() => undefined);
    // Managed components are the source of truth for their own state — re-read
    // after any install/update/revert so cards reflect the change immediately.
    ipc.listComponents().then(setComponents).catch(() => undefined);
  }, []);

  // Essential state only (env, installed, detected) — fast, LOCAL reads.
  // `ready` flips once these settle so the page paints immediately from the
  // bundled CATALOG. Deliberately excludes the remote catalog and GitHub
  // releases: both are network calls that used to gate first paint and made
  // the tab "hang". The remote catalog is fetched here too, but in the
  // BACKGROUND — it only enriches "latest" labels, so it never blocks the loader.
  const refresh = useCallback(() => {
    Promise.allSettled([
      ipc.marketEnv().then(setEnv),
      ipc.marketInstalled().then(setInstalled),
      ipc.marketDetect().then(setDetected),
    ]).finally(() => setReady(true));
    ipc.marketCatalog().then(setCatalog).catch(() => undefined);
    // Managed-component truth: fetched in the BACKGROUND so it can never stall
    // first paint. Until it lands, cards fall back to the marketplace manifest.
    ipc.listComponents().then(setComponents).catch(() => undefined);
    // Live upstream tags (same call the Updates tab uses) — keep last-known on
    // failure so a managed card never falsely reads "up to date".
    ipc
      .componentsUpstream()
      .then((list) => setComponentUpstream(Object.fromEntries(list.map((u) => [u.id, u.tag]))))
      .catch(() => undefined);
  }, []);

  // Latest upstream versions (one GitHub call per repo) — slower + network, so
  // fetched AFTER the essential data is in, filling in the "latest" labels
  // without blocking the first render.
  const refreshReleases = useCallback(() => {
    setLoadingReleases(true);
    Promise.allSettled(
      CATALOG.filter((c) => c.repo).map((c) => ipc.marketRelease(c.repo!).then((r) => [c.id, r] as const)),
    )
      .then((results) => {
        const map: Record<string, Release> = {};
        for (const res of results) if (res.status === "fulfilled") map[res.value[0]] = res.value[1];
        setReleases(map);
      })
      .finally(() => {
        setLoadingReleases(false);
        // "Checked" means the slowest source answered too, not that we asked.
        setCheckedAt(Date.now());
      });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Kick the release fetch once the page is ready (painted) — never before, so
  // it can't compete with the first paint. Gated on `ready`, not the remote
  // catalog, so releases still load (and fill "latest") even if that network
  // fetch is slow or fails.
  useEffect(() => {
    if (ready) refreshReleases();
  }, [ready, refreshReleases]);


  // A standalone install window finished → refresh installed/detected state.
  useEffect(() => {
    if (!isTauri()) return;
    let un: UnlistenFn | undefined;
    listen(INSTALL_DONE, () => refreshInstalled())
      .then((u) => (un = u))
      .catch(() => undefined);
    return () => un?.();
  }, [refreshInstalled]);

  // The DB starting/stopping or a component finishing setup changes what's
  // "installed"/"running" — re-detect whenever the bootstrap status changes so
  // the badges stay in lockstep with reality.
  useEffect(() => {
    if (!isTauri()) return;
    let un: UnlistenFn | undefined;
    listen("personal-local:status", () => refreshInstalled())
      .then((u) => (un = u))
      .catch(() => undefined);
    return () => un?.();
  }, [refreshInstalled]);

  const installedMap = useMemo(() => {
    const m: Record<string, InstalledItem> = {};
    installed.forEach((i) => (m[i.id] = i));
    // Single source of truth for managed components: PRESENCE comes from real
    // detection (market_detect checks the actual runtime/binary/marker), and the
    // VERSION comes from list_components — never the stale marketplace manifest.
    // Gating on `detected` matters because list_components reports the verified
    // version as a fallback even when a component isn't installed, so `installed`
    // alone can't tell presence. Skip until components load (fall back to manifest).
    if (components.length) {
      for (const [catalogId, compId] of Object.entries(CATALOG_TO_COMPONENT)) {
        const comp = components.find((c) => c.id === compId);
        if (!comp) continue;
        if (detected[catalogId] && comp.installed) {
          m[catalogId] = { id: catalogId, version: comp.installed, path: "", filename: "" };
        } else {
          delete m[catalogId]; // not actually present → not installed
        }
      }
    }
    return m;
  }, [installed, components, detected]);

  // Displayed "latest" is LIVE-first: the repo's actual newest GitHub release
  // (fetched per repo at mount), falling back to the weekly catalog when the
  // live fetch is rate-limited/offline. Nothing pinned: what the official repo
  // shows is what the card shows.
  const latestFor = useCallback(
    (id: string): string | null => releases[id]?.tag ?? catalog?.items?.[id]?.latest ?? null,
    [releases, catalog],
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
          // Web: the engine installs for real — pip packages finish inline;
          // the starter-kit stack runs detached, so poll detection until the
          // component actually shows up (first DB deployment ≈ 2 minutes).
          void (async () => {
            try {
              const res = await ipc.marketInstallEngine(item.id);
              if (res.note) {
                window.dispatchEvent(
                  new CustomEvent("studio:notice", { detail: { kind: "info", title: item.name, body: res.note } }),
                );
              }
              if (res.done) {
                resolve(true);
                return;
              }
              if (res.started) {
                for (let i = 0; i < 72; i++) {
                  await new Promise((r) => window.setTimeout(r, 5000));
                  const det = await ipc.marketDetect().catch(() => ({}) as Record<string, boolean>);
                  if (det[item.id]) {
                    resolve(true);
                    return;
                  }
                }
              }
              resolve(false);
            } catch (e) {
              window.dispatchEvent(
                new CustomEvent("studio:notice", { detail: { kind: "warning", title: `${item.name} install`, body: errorMessage(e) } }),
              );
              resolve(false);
            }
          })();
          return;
        }
        let un: UnlistenFn | undefined;
        let settled = false;
        const finish = (v: boolean) => {
          if (settled) return;
          settled = true;
          un?.();
          resolve(v);
        };
        void (async () => {
          try {
            // The card's version dropdown wins over "latest". A chosen tag on a
            // GitHub-release item resolves THAT release's assets, so the
            // download matches exactly the version the user asked for.
            const chosen = verPickRef.current[item.id];
            let release = releases[item.id] ?? null;
            if (chosen && item.repo && item.install === "binary" && release?.tag !== chosen) {
              release = await ipc.marketRelease(item.repo, chosen).catch(() => null);
            }
            const asset = pickAsset(release?.assets ?? [], env);
            const version = chosen ?? latestFor(item.id) ?? undefined;
            un = await listen<{ id: string; ok: boolean }>("market:done", (e) => {
              if (e.payload.id === item.id) finish(e.payload.ok);
            });
            await ipc.marketInstallRun(
              item.id,
              version,
              asset?.url,
              asset?.name,
              item.id === "semantic-views" && semanticTargetRef.current ? semanticTargetRef.current : undefined,
              // Only the explicit dropdown pick may override a verified pip
              // pin — the display version above never does.
              chosen,
            );
          } catch {
            finish(false);
          }
        })();
      }),
    [releases, env, latestFor],
  );

  // Any-version installs: per-item chosen version + lazily fetched live lists
  // (fetched the first time a card's version dropdown opens — never on a
  // timer). undefined = not fetched, null = loading, [] = none found.
  const [verPick, setVerPick] = useState<Record<string, string>>({});
  const verPickRef = useRef<Record<string, string>>({});
  useEffect(() => {
    verPickRef.current = verPick;
  }, [verPick]);
  // undefined = not fetched, null = loading, "error" = fetch failed (rate
  // limit / offline — NOT the same as "this project has no versions").
  const [verLists, setVerLists] = useState<Record<string, string[] | null | "error" | undefined>>({});
  const loadVersions = (item: CatalogItem) => {
    const src = versionSource(item);
    if (!src || (item.id in verLists && verLists[item.id] !== "error")) return;
    setVerLists((m) => ({ ...m, [item.id]: null }));
    ipc
      .marketVersions(src.source, src.reference)
      .then((v) => setVerLists((m) => ({ ...m, [item.id]: v })))
      .catch(() => setVerLists((m) => ({ ...m, [item.id]: "error" })));
  };

  // Ids with an installer ACTUALLY running. A ref (not derived queue state) so
  // two enqueues in the same tick — a double-click, a stale multi-select — can
  // never start a second installer for the same id.
  const activeInstallsRef = useRef<Set<string>>(new Set());

  // Queue items and install them all IN PARALLEL — one install never blocks
  // another, and each reports its own status independently.
  const enqueue = useCallback(
    (items: CatalogItem[]) => {
      const fresh = items.filter((i) => i.install !== "reference" && !activeInstallsRef.current.has(i.id));
      if (!fresh.length) return;
      for (const item of fresh) activeInstallsRef.current.add(item.id);
      setQueue((q) => {
        // drop any prior finished entry for these ids, then add fresh
        const kept = q.filter((x) => !fresh.some((f) => f.id === x.id));
        return [...kept, ...fresh.map((i) => ({ id: i.id, name: i.name, status: "installing" as const }))];
      });
      for (const item of fresh) {
        void installOne(item).then((ok) => {
          activeInstallsRef.current.delete(item.id);
          // A finished install consumes its dropdown pick — a stale hidden
          // pick must never redirect a later "Update to latest" click.
          setVerPick(({ [item.id]: _consumed, ...rest }) => rest);
          setQueue((q) => q.map((x) => (x.id === item.id ? { ...x, status: ok ? "done" : "failed" } : x)));
          refreshInstalled();
        });
      }
    },
    [installOne, refreshInstalled],
  );

  // Start the pending pack once releases are ready. Anything already
  // installed or detected on the system is skipped — packs fill gaps, they
  // never reinstall over a working setup.
  useEffect(() => {
    if (!pendingPack || loadingReleases) return;
    const items = pendingPack
      .map((id) => CATALOG.find((c) => c.id === id))
      .filter((c): c is CatalogItem => !!c && c.install !== "reference")
      .filter((c) => !installedMap[c.id] && !detected[c.id]);
    setPendingPack(null);
    if (items.length) enqueue(items);
  }, [pendingPack, loadingReleases, enqueue, installedMap, detected]);

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

  // Install every item in a recommended pack, in parallel — skipping what the
  // user already has (explicit per-item Reinstall still bypasses this).
  function installPack(pack: Pack) {
    const items = pack.items
      .map((it) => CATALOG.find((c) => c.id === it.id))
      .filter((c): c is CatalogItem => !!c && c.install !== "reference")
      .filter((c) => !installedMap[c.id] && !detected[c.id]);
    enqueue(items);
  }

  // Managed components (Personal, ExaPump, MCP Server, Exa Agent) never swap
  // via a plain marketplace download — they go through the managed
  // verify-or-refuse path (digest-verified official release; the DB engine is
  // backup-first with automatic rollback; the AI engine restarts its sidecar).
  async function switchManaged(item: CatalogItem, version?: string) {
    const compId = CATALOG_TO_COMPONENT[item.id];
    if (!compId) return;
    setBusy((b) => ({ ...b, [item.id]: true }));
    try {
      await ipc.updateComponent(compId, version);
      if (compId === "exa-agent") await ipc.agentRestart().catch(() => undefined);
      setVerPick(({ [item.id]: _consumed, ...rest }) => rest);
      window.dispatchEvent(
        new CustomEvent("studio:notice", {
          detail: {
            kind: "info",
            title: item.name,
            body:
              compId === "personal"
                ? `Database engine switched to ${version ?? "the verified build"} (your data was backed up first).`
                : `${item.name} updated${version ? ` to ${version}` : ""}.`,
          },
        }),
      );
    } catch (e) {
      // e.g. "already on X; there's nothing newer to install" — honest refusal.
      window.dispatchEvent(
        new CustomEvent("studio:notice", { detail: { kind: "warning", title: item.name, body: errorMessage(e) } }),
      );
    } finally {
      setBusy((b) => ({ ...b, [item.id]: false }));
      refreshInstalled();
      ipc.listComponents().then(setComponents).catch(() => undefined);
    }
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


  const [query, setQuery] = useState("");
  const [nav, setNavState] = useState<HubPage>("home");
  // Tab switches render a LOT of cards at once. A transition lets the clicked
  // tab highlight paint immediately and time-slices the heavy grid render, so
  // Kits → Catalog never feels stuck; navPending dims the content meanwhile.
  const [navPending, startNavTransition] = useTransition();
  const setNav = useCallback((key: HubPage) => startNavTransition(() => setNavState(key)), []);
  // The page one level below the nav: an item's own page.
  const [detailId, setDetailId] = useState<string | null>(null);
  const page: HubPage = detailId ? "detail" : nav;
  const goto = useCallback(
    (next: HubPage) => {
      setDetailId(null);
      setNav(next === "detail" ? "home" : next);
    },
    [setNav],
  );
  const openDetail = useCallback((id: string) => setDetailId(id), []);
  // Search-page state: the rail's filters, the sort, the drawer.
  const [filters, setFilters] = useState<HubFilters>(emptyFilters);
  const [sort, setSort] = useState<Sort>("suggested");
  const [drawerOpen, setDrawerOpen] = useState(false);
  // READMEs for item pages, by repo (undefined = loading, null = none).
  const [readmes, setReadmes] = useState<Record<string, string | null>>({});
  // When every surface was last re-synced together.
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  // An item page shows the repo's README — fetched once per repo (Rust caches
  // it on disk), never for repo-less items.
  useEffect(() => {
    const item = detailId ? CATALOG.find((c) => c.id === detailId) : undefined;
    const repo = item?.repo;
    if (!repo || repo in readmes) return;
    ipc
      .marketDoc(repo)
      .then((md) => setReadmes((m) => ({ ...m, [repo]: md ?? null })))
      .catch(() => setReadmes((m) => ({ ...m, [repo]: null })));
  }, [detailId, CATALOG, readmes]);
  // A light fade on every switch WITHOUT remounting the subtree (a key= remount
  // re-created every card and made switching slower, not smoother).
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    contentRef.current?.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: 180, easing: "ease-out" });
  }, [nav]);
  // Fetch-on-demand ONLY (user rule): update state re-syncs when the app opens
  // (mount) and when a tab is clicked — never on a background timer. Uses the
  // rate-limit-free catalog.json mirror + local reads; componentsUpstream (the
  // unauthenticated 60/hr GitHub API, now with a mirror fallback) re-fires only
  // for the Updates tab, where its answer is what the user came to see.
  useEffect(() => {
    ipc.marketCatalog().then(setCatalog).catch(() => undefined);
    ipc.marketInstalled().then(setInstalled).catch(() => undefined);
    ipc.listComponents().then(setComponents).catch(() => undefined);
    if (nav === "updates") {
      ipc
        .componentsUpstream()
        .then((list) => setComponentUpstream(Object.fromEntries(list.map((u) => [u.id, u.tag]))))
        .catch(() => undefined);
    }
  }, [nav]);
  // Kit "template" modal (Image-45 style): shows a kit's tools + install action.
  const [kitModal, setKitModal] = useState<Pack | null>(null);
  // Global search (⌘K) deep-link: land on the marketplace with the query set.
  useEffect(() => {
    const onSearch = (e: Event) => {
      const q = (e as CustomEvent<{ query?: string }>).detail?.query ?? "";
      goto("search");
      setQuery(q);
    };
    window.addEventListener("studio:marketplace-search", onSearch);
    return () => window.removeEventListener("studio:marketplace-search", onSearch);
  }, [goto]);

  // Driver runtime state lives above navItems — the memo below reads it.
  const [driverReady, setDriverReady] = useState<Record<string, boolean>>({});
  const [driverBusy, setDriverBusy] = useState<Record<string, boolean>>({});

  // ONE decision per item — the card, the item page, the Updates page and the
  // header badge all read it, so they cannot disagree.
  const stateOf = useCallback(
    (item: CatalogItem) => {
      const did = DRIVER_RUNTIME[item.id];
      const sources: ItemSources = {
        installed: installedMap,
        componentUpstream,
        detected,
        installing: installingIds,
        latestFor,
        releaseAssets: (id) => releases[id]?.assets ?? [],
        env,
        driverRuntime: did ? { id: did, ready: Boolean(driverReady[did]), busy: Boolean(driverBusy[did]) } : undefined,
      };
      return itemState(item, sources);
    },
    [installedMap, componentUpstream, detected, installingIds, latestFor, releases, env, driverReady, driverBusy],
  );
  const updateItems = useMemo(() => CATALOG.filter((i) => stateOf(i).kind === "update"), [CATALOG, stateOf]);
  // The header count IS the Updates page's length — one decision, one number.
  const totalUpdates = updateItems.length;
  const installedItems = useMemo(
    () => CATALOG.filter((i) => ["installed", "update", "running", "ready", "onSystem"].includes(stateOf(i).kind)),
    [CATALOG, stateOf],
  );
  const installingItems = useMemo(() => CATALOG.filter((i) => stateOf(i).kind === "installing"), [CATALOG, stateOf]);
  const installedCount = installedItems.length;
  // The search page and the list pages share one pipeline: query → rail → sort.
  const listBase = page === "updates" ? updateItems : page === "installed" ? installedItems : page === "installing" ? installingItems : CATALOG;
  const results = useMemo(() => applyFilters(listBase, stateOf, query, filters, sort), [listBase, stateOf, query, filters, sort]);


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
      // Connection forms filter their driver dropdown by readiness — tell
      // them a driver just became available.
      window.dispatchEvent(new CustomEvent("studio:drivers-changed"));
    } catch {
      /* surfaced when they try to use it */
    } finally {
      setDriverBusy((b) => ({ ...b, [did]: false }));
    }
  }

  // ONE seamless action for the runs-inside-Studio drivers: download the
  // picked version (when one is chosen), wire it into Studio where supported
  // (the JDBC jar becomes the SQL editor's driver), and set up the runtime —
  // never separate Download / Install / Use buttons. Busy for the WHOLE flow
  // and deduped via activeInstallsRef, so a double-click during the download
  // phase (before installDriverRuntime's own busy flag) can't start twice.
  async function installDriverAndUse(item: CatalogItem, did: string) {
    // Synchronous re-entry guard for the WHOLE flow (React state commits too
    // late to stop a fast double-click, even on the runtime-only path).
    const flowKey = `driver-flow:${did}`;
    if (activeInstallsRef.current.has(flowKey) || activeInstallsRef.current.has(item.id)) return;
    activeInstallsRef.current.add(flowKey);
    setDriverBusy((b) => ({ ...b, [did]: true }));
    try {
      const chosen = verPickRef.current[item.id];
      if (chosen) {
        activeInstallsRef.current.add(item.id);
        let ok = false;
        try {
          ok = await installOne(item);
        } finally {
          activeInstallsRef.current.delete(item.id);
        }
        refreshInstalled();
        if (!ok) {
          // The chosen version did NOT arrive — keep the pick and stop here,
          // never run the runtime setup as if "Install {v} & use here" worked.
          window.dispatchEvent(
            new CustomEvent("studio:notice", {
              detail: { kind: "warning", title: `${item.name} ${chosen}`, body: "The download failed — nothing was changed. Check the install log and try again." },
            }),
          );
          return;
        }
        setVerPick(({ [item.id]: _consumed, ...rest }) => rest);
        if (item.id === "driver-jdbc") {
          await ipc.marketUseDownloaded(item.id, chosen).catch((e) =>
            window.dispatchEvent(
              new CustomEvent("studio:notice", { detail: { kind: "warning", title: "Could not switch the JDBC jar", body: errorMessage(e) } }),
            ),
          );
        }
      }
      await installDriverRuntime(did);
    } finally {
      activeInstallsRef.current.delete(flowKey);
      setDriverBusy((b) => ({ ...b, [did]: false }));
    }
  }

  // Multi-select install: checked cards batch into ONE "Install selected"
  // action (the existing parallel queue) instead of one click per card.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggleSelected = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  // One eligibility check shared by the card checkbox AND the batch action, so
  // a selection made before state moved on (item got installed, release info
  // arrived and revealed no host build) is re-validated at install time.
  const canBatchInstall = (item: CatalogItem): boolean => {
    if (item.install === "reference") return false;
    // Runs-inside-Studio drivers join the batch too — their batch action is
    // the runtime setup (installDriverRuntime), skipped once ready.
    const did = DRIVER_RUNTIME[item.id];
    if (did) return !driverReady[did] && !driverBusy[did];
    if (installedMap[item.id] || detected[item.id]) return false;
    if (installingIds.has(item.id)) return false;
    const assets = releases[item.id]?.assets ?? [];
    return !(item.install === "binary" && assets.length > 0 && pickAsset(assets, env) === null);
  };
  // A card is also batch-selectable when it has an UPDATE available — installs
  // and updates are the same gesture ("everything is same"): managed
  // components update via update_component, addons via their install path.
  const batchUpdateTarget = (item: CatalogItem): string | null => {
    const compId = CATALOG_TO_COMPONENT[item.id];
    if (compId) {
      const comp = components.find((c) => c.id === compId);
      const tag = componentUpstream[compId];
      return comp?.installed && tag && isNewerVersion(tag, comp.installed) ? tag : null;
    }
    const instVersion = installedMap[item.id]?.version;
    const l = latestFor(item.id);
    return instVersion && l && isNewerVersion(l, instVersion) ? l : null;
  };
  async function installSelected(ids: Set<string> = selected) {
    const chosen = CATALOG.filter((c) => ids.has(c.id));
    setSelected(new Set());
    enqueue(
      chosen.filter(
        (c) => !CATALOG_TO_COMPONENT[c.id] && !DRIVER_RUNTIME[c.id] && (canBatchInstall(c) || batchUpdateTarget(c) !== null),
      ),
    );
    // Runs-inside-Studio drivers batch through their runtime setup (parallel).
    for (const c of chosen) {
      const did = DRIVER_RUNTIME[c.id];
      if (did && canBatchInstall(c)) void installDriverAndUse(c, did);
    }
    // Managed updates run sequentially — the DB engine takes a maintenance lock.
    for (const c of chosen) {
      const target = CATALOG_TO_COMPONENT[c.id] ? batchUpdateTarget(c) : null;
      if (target) await switchManaged(c, target);
    }
  }

  // The install / update / manage controls for one item — shown on its page.
  // Every state decision the buttons need is derived here, from the same
  // sources `stateOf` reads.
  const renderActions = (item: CatalogItem) => {
    const managedCompId = CATALOG_TO_COMPONENT[item.id];
    const managedComp = managedCompId ? components.find((c) => c.id === managedCompId) : undefined;
    // Managed components (Personal, ExaPump, MCP, Exa Agent) are installed the
    // moment list_components says so — the market manifest is only for addons.
    // Everything renders through the SAME card states; no separate panel.
    const inst =
      installedMap[item.id] ??
      (managedComp?.installed
        ? { id: item.id, version: managedComp.installed, path: "", filename: "" }
        : undefined);
    const onSystem = detected[item.id] && !inst;
    const isBusy = busy[item.id];
    const isInstalling = installingIds.has(item.id);
    const latest = latestFor(item.id);
    // Non-managed catalog items update in place from the card.
    const newer = !CATALOG_TO_COMPONENT[item.id] && isNewerVersion(latest, inst?.version);
    // Managed components update IN PLACE from the card too (verify-or-refuse
    // via update_component) — the available tag comes from the same live
    // upstream the badge counts.
    const managedTag = managedCompId ? componentUpstream[managedCompId] : undefined;
    const managedUpdate = Boolean(inst && managedTag && isNewerVersion(managedTag, inst?.version));
    const did = DRIVER_RUNTIME[item.id];
    const runtimeReady = did ? driverReady[did] : false;

    // A binary release that ships builds — but none for THIS host (e.g. the
    // linux-only exa-postgres-interface on macOS) — gets an honest state
    // instead of an Install button that can only fail.
    const noHostBuild =
      item.install === "binary" &&
      !inst &&
      !onSystem &&
      !did &&
      (releases[item.id]?.assets?.length ?? 0) > 0 &&
      pickAsset(releases[item.id]?.assets ?? [], env) === null;

    // Live any-version picker: list fetched on first open (GitHub tags / PyPI
    // versions / Maven Central), newest first. Shared by the
    // plain Install branch AND the runs-inside-Studio driver branch, so every
    // installable item lists its versions.
    // Direct driver flows bypass the install queue, so the menu must also
    // freeze on driverBusy — changing the pick mid-install would desync the
    // label from what actually ran.
    const versionMenuBusy = isInstalling || (did ? driverBusy[did] : false);
    const versionMenu = versionSource(item) ? (
      <DropdownMenu onOpenChange={(o) => o && loadVersions(item)}>
        <DropdownMenuTrigger asChild>
          <button
            disabled={versionMenuBusy}
            aria-label={`${item.name} version to install`}
            className="flex h-7 max-w-[150px] items-center gap-1 rounded-md border border-border bg-background px-2 font-mono text-[11px] text-foreground hover:bg-secondary disabled:opacity-50"
          >
            <span className="truncate">{verPick[item.id] ?? "latest"}</span>
            <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
          <DropdownMenuItem
            onClick={() => setVerPick(({ [item.id]: _drop, ...rest }) => rest)}
            className="font-mono text-[12px]"
          >
            latest
            {!verPick[item.id] ? <Check className="ml-auto h-3 w-3" /> : null}
          </DropdownMenuItem>
          {verLists[item.id] === null ? (
            <div className="flex items-center gap-1.5 px-2 py-1.5 text-[11px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading versions…
            </div>
          ) : verLists[item.id] === "error" ? (
            <div className="max-w-56 px-2 py-1.5 text-[11px] text-muted-foreground">
              Couldn't load the version list (offline or rate-limited) — reopen to retry.
            </div>
          ) : (
            (verLists[item.id] as string[] | undefined ?? []).map((v) => (
              <DropdownMenuItem key={v} onClick={() => setVerPick((m) => ({ ...m, [item.id]: v }))} className="font-mono text-[12px]">
                {v}
                {verPick[item.id] === v ? <Check className="ml-auto h-3 w-3" /> : null}
              </DropdownMenuItem>
            ))
          )}
          {Array.isArray(verLists[item.id]) && (verLists[item.id] as string[]).length === 0 ? (
            <div className="px-2 py-1.5 text-[11px] text-muted-foreground">No published versions found.</div>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    ) : null;
    const actions = (
      <div className="flex flex-wrap items-center gap-2">
        {did ? (
          // ONE button end to end: picking a version makes the same button
          // download that version, wire it in where supported (the JDBC jar
          // becomes the SQL editor's driver) and set up the runtime.
          <>
            {versionMenu}
            {verPick[item.id] || !runtimeReady ? (
              <button
                onClick={() => void installDriverAndUse(item, did)}
                disabled={driverBusy[did] || isInstalling}
                className="cta-glow flex h-7 items-center gap-1.5 rounded-md bg-primary px-3 text-[12px] font-medium text-primary-foreground hover:bg-primary/85 disabled:opacity-60"
              >
                {driverBusy[did] || isInstalling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BxIcon name="arrow-to-bottom" className="h-3.5 w-3.5" />}
                {driverBusy[did] || isInstalling
                  ? "Installing…"
                  : verPick[item.id]
                    ? `Install ${verPick[item.id]}`
                    : "Install"}
              </button>
            ) : (
              <>
                {newer ? (
                  <button onClick={() => startInstall(item)} disabled={isBusy} className="cta-glow flex h-7 items-center gap-1.5 rounded-md bg-primary px-2.5 text-[12px] font-medium text-primary-foreground hover:bg-primary/85 disabled:opacity-50">
                    <BxIcon name="rotate-ccw-dot" className="h-3.5 w-3.5" /> Update to {latest}
                  </button>
                ) : (
                  <span className="flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 text-[12px] text-muted-foreground">
                    <Check className="h-3.5 w-3.5 text-primary" /> Ready to use
                  </span>
                )}
                <button
                  onClick={() => void installDriverRuntime(did)}
                  disabled={driverBusy[did]}
                  title="Reinstall"
                  aria-label={`Reinstall ${item.name}`}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/60 hover:bg-secondary hover:text-foreground disabled:opacity-50"
                >
                  {driverBusy[did] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
                </button>
              </>
            )}
          </>
        ) : inst ? (
          <>
            {versionMenu}
            {verPick[item.id] && verPick[item.id] !== inst.version ? (
              // Switching versions is a first-class action, not a reinstall
              // trick: pick any version and this replaces the installed one.
              // The DB engine routes through the managed backup-first path.
              <button
                onClick={() => (managedCompId ? void switchManaged(item, verPick[item.id]) : startInstall(item))}
                disabled={isInstalling || isBusy}
                className="cta-glow flex h-7 items-center gap-1.5 rounded-md bg-primary px-2.5 text-[12px] font-medium text-primary-foreground hover:bg-primary/85 disabled:opacity-50"
              >
                {isInstalling || isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BxIcon name="rotate-ccw-dot" className="h-3.5 w-3.5" />}
                {isInstalling || isBusy ? "Switching…" : `Switch to ${verPick[item.id]}`}
              </button>
            ) : newer ? (
              <button onClick={() => startInstall(item)} disabled={isBusy} className="flex h-7 items-center gap-1.5 rounded-md bg-primary px-2.5 text-[12px] font-medium text-primary-foreground hover:bg-primary/85 disabled:opacity-50">
                <BxIcon name="rotate-ccw-dot" className="h-3.5 w-3.5" /> Update to {latest}
              </button>
            ) : managedUpdate ? (
              // Managed component: the verify-or-refuse update runs RIGHT HERE
              // (digest-verified; DB engine backs up first) — no separate panel.
              <button
                onClick={() => void switchManaged(item, managedTag)}
                disabled={isBusy}
                className="cta-glow flex h-7 items-center gap-1.5 rounded-md bg-primary px-2.5 text-[12px] font-medium text-primary-foreground hover:bg-primary/85 disabled:opacity-50"
                title={`Install the official ${managedTag} release (digest-verified)`}
              >
                {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BxIcon name="rotate-ccw-dot" className="h-3.5 w-3.5" />}
                {isBusy ? "Updating…" : `Update to ${managedTag}`}
              </button>
            ) : (
              <span className="flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 text-[12px] text-muted-foreground">
                <Check className="h-3.5 w-3.5 text-primary" />
                {/* Claim "up to date" only when a known latest CONFIRMS it —
                    otherwise state what is installed, honestly. */}
                {latest
                  ? "Up to date"
                  : inst.version && inst.version !== "latest"
                    ? `Installed · ${inst.version}`
                    : "Installed"}
              </span>
            )}
            {/* Managed components have their own lifecycle (the DB's Manage
                panel, the engine's baseline) — a marketplace-folder uninstall
                would be meaningless there. */}
            {!managedCompId ? (
              <button onClick={() => uninstall(item)} disabled={isBusy} className="flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 text-[12px] text-muted-foreground hover:border-destructive/50 hover:text-destructive disabled:opacity-50">
                {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Uninstall
              </button>
            ) : null}
          </>
        ) : onSystem ? (
          <>
            {versionMenu}
            {managedCompId && verPick[item.id] ? (
              <button
                onClick={() => void switchManaged(item, verPick[item.id])}
                disabled={isBusy}
                className="cta-glow flex h-7 items-center gap-1.5 rounded-md bg-primary px-2.5 text-[12px] font-medium text-primary-foreground hover:bg-primary/85 disabled:opacity-50"
              >
                {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BxIcon name="rotate-ccw-dot" className="h-3.5 w-3.5" />}
                {isBusy ? "Switching…" : `Switch to ${verPick[item.id]}`}
              </button>
            ) : null}
            <span className="flex h-7 items-center gap-1.5 rounded-md border border-syntax-function/40 bg-syntax-function/10 px-2.5 text-[12px] text-syntax-function">
              <Check className="h-3.5 w-3.5" /> Already on your system
            </span>
            {/* Reinstall stays available but quiet — nothing here needs doing. */}
            <button
              onClick={() => startInstall(item)}
              disabled={isInstalling}
              title="Reinstall"
              aria-label={`Reinstall ${item.name}`}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/60 hover:bg-secondary hover:text-foreground disabled:opacity-50"
            >
              {isInstalling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
            </button>
          </>
        ) : item.install === "reference" ? (
          <button onClick={() => openExternal(item.homepage)} className="flex h-7 items-center gap-1.5 rounded-md border border-border px-3 text-[12px] text-foreground hover:bg-secondary">
            Get <ExternalLink className="h-3.5 w-3.5" />
          </button>
        ) : noHostBuild ? (
          <>
            <span
              title="The upstream release ships platform-specific builds, but none for this machine."
              className="flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 text-[12px] text-muted-foreground"
            >
              <TriangleAlert className="h-3.5 w-3.5 text-warning" /> No {env?.os === "macos" ? "macOS" : (env?.os ?? "this-platform")} build yet
            </span>
            <button onClick={() => openExternal(item.homepage)} className="flex h-7 items-center gap-1.5 rounded-md border border-border px-3 text-[12px] text-foreground hover:bg-secondary">
              Get <ExternalLink className="h-3.5 w-3.5" />
            </button>
          </>
        ) : (
          <>
            {item.id === "semantic-views" && profiles.length > 0 ? (
              <DropdownMenu onOpenChange={(o) => o && refreshTargets()}>
                <DropdownMenuTrigger asChild>
                  <button
                    disabled={isInstalling}
                    aria-label="Database to install Semantic Views into"
                    className="flex h-7 max-w-[220px] items-center gap-1.5 rounded-md border border-border bg-background px-2 text-[12px] text-foreground hover:bg-secondary disabled:opacity-50"
                  >
                    <BxIcon name="database" className="h-3.5 w-3.5 text-primary" />
                    <span className="truncate">
                      {profiles.find((p) => p.id === semanticTarget)?.name ?? "Local database (managed)"}
                    </span>
                    <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-64">
                  <DropdownMenuLabel>Install into</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => setSemanticTarget("")}>
                    <BxIcon name="database" className="h-3.5 w-3.5 text-primary" />
                    <span className="flex-1">Local database (managed)</span>
                    {semanticTarget === "" ? <span className="h-1.5 w-1.5 rounded-full bg-primary" /> : null}
                  </DropdownMenuItem>
                  {profiles.map((p) => (
                    <DropdownMenuItem key={p.id} onClick={() => setSemanticTarget(p.id)}>
                      <BxIcon name="database" className="h-3.5 w-3.5" />
                      <span className="flex-1 truncate">{p.name}</span>
                      {semanticTarget === p.id ? <span className="h-1.5 w-1.5 rounded-full bg-primary" /> : null}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            {versionMenu}
            <button onClick={() => startInstall(item)} disabled={isInstalling} className="cta-glow flex h-7 items-center gap-1.5 rounded-md bg-primary px-3 text-[12px] font-medium text-primary-foreground hover:bg-primary/85 disabled:opacity-60">
              {isInstalling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BxIcon name="arrow-to-bottom" className="h-3.5 w-3.5" />}
              {isInstalling
                ? "Installing…"
                : item.id === "semantic-views"
                  ? `Install in ${semanticTarget ? (profiles.find((p) => p.id === semanticTarget)?.name ?? "database") : "local database"}`
                  : verPick[item.id]
                    ? `Install ${verPick[item.id]}`
                    : "Install"}
            </button>
          </>
        )}
        {item.homepage && item.install !== "reference" ? (
          <button
            onClick={() => openExternal(item.homepage)}
            title={`Docs — ${item.homepage}`}
            aria-label={`Open the ${item.name} documentation on GitHub`}
            className="flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[12px] text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            Docs <ExternalLink className="h-3 w-3" />
          </button>
        ) : null}
        {item.install === "personal-local" && (inst || onSystem) ? (
          <>
            <button onClick={() => setManageLocal(true)} className="flex h-7 items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-2.5 text-[12px] font-medium text-primary hover:bg-primary/20">
              <Server className="h-3.5 w-3.5" /> Manage (start/stop)
            </button>
            {/* The DB carries data — back up any time, right from the card
                (this used to live in the removed Components panel). */}
            <button
              onClick={() =>
                void (async () => {
                  setBusy((b) => ({ ...b, [item.id]: true }));
                  try {
                    await ipc.backupLocalDatabase();
                    window.dispatchEvent(
                      new CustomEvent("studio:notice", { detail: { kind: "info", title: "Exasol Personal", body: "Local database backed up (see personal-local/backups)." } }),
                    );
                  } catch (e) {
                    window.dispatchEvent(
                      new CustomEvent("studio:notice", { detail: { kind: "warning", title: "Backup failed", body: errorMessage(e) } }),
                    );
                  } finally {
                    setBusy((b) => ({ ...b, [item.id]: false }));
                  }
                })()
              }
              disabled={isBusy}
              title="Stop the database, copy config + data to a timestamped backup, then restart"
              className="flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 text-[12px] text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50"
            >
              {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <DatabaseBackup className="h-3.5 w-3.5" />} Back up
            </button>
          </>
        ) : null}
        {item.id === "driver-jdbc" ? (
          // Pin your OWN jar — the same override the Drivers tab offers, so
          // the marketplace card is the one-stop surface for JDBC.
          <button
            onClick={() =>
              void (async () => {
                try {
                  const { open } = await import("@tauri-apps/plugin-dialog");
                  const path = await open({ multiple: false, filters: [{ name: "Java archive", extensions: ["jar"] }], title: "Choose the driver JAR" });
                  if (typeof path === "string" && path) {
                    await ipc.driverOverrideSet("jdbc", path);
                    window.dispatchEvent(new CustomEvent("studio:drivers-changed"));
                    window.dispatchEvent(
                      new CustomEvent("studio:notice", { detail: { kind: "info", title: "JDBC driver", body: "Studio's SQL editor now uses your custom JAR." } }),
                    );
                  }
                } catch (e) {
                  window.dispatchEvent(
                    new CustomEvent("studio:notice", { detail: { kind: "warning", title: "Custom JAR", body: errorMessage(e) } }),
                  );
                }
              })()
            }
            className="flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 text-[12px] text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            Custom JAR
          </button>
        ) : null}
      </div>
    );

    return actions;
  };

  // First open: show the brand loader immediately instead of a blank/janky
  // frame while the essential catalog loads (release info streams in after).
  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center bg-editor">
        <BrandLoader label="Loading Marketplace" />
      </div>
    );
  }

  const detailItem = detailId ? CATALOG.find((c) => c.id === detailId) ?? null : null;
  const selection = {
    selectable: (item: CatalogItem) => canBatchInstall(item) || batchUpdateTarget(item) !== null,
    selected,
    toggle: toggleSelected,
  };
  const crumb =
    page === "detail" && detailItem ? (detailItem.repo ?? detailItem.name)
    : page === "search" ? "Search"
    : page === "updates" ? "Updates"
    : page === "installed" ? "Installed"
    : page === "installing" ? "Installing"
    : page === "kits" ? "Kits"
    : page === "ai-clients" ? "AI clients"
    : null;
  const featured: Featured[] = [
    {
      eyebrow: "Exasol Personal 2.3",
      title: "Run Exasol on your laptop",
      body: "One local database Studio manages for you — start, stop, back up — and, since 2.3, virtual schemas.",
      art: "database",
      onClick: () => openDetail("exasol-personal"),
    },
    {
      eyebrow: "Analytics hub",
      title: "Attach any database as a virtual schema",
      body: "PostgreSQL, MySQL, Snowflake, S3 and 19 more adapters. Query them from one Exasol, live, without copying.",
      art: "federation",
      onClick: () => window.dispatchEvent(new CustomEvent("studio:open-add-source")),
    },
    {
      eyebrow: "AI clients",
      title: "Connect Claude, Codex and Cursor to Exasol",
      body: "The bundled MCP server gives every AI client read-only access to your data, set up in one click.",
      art: "mcp",
      onClick: () => goto("ai-clients"),
    },
  ];
  const openSection = (key: SectionKey) => {
    const next = emptyFilters();
    next.sections.add(key);
    setFilters(next);
    goto("search");
  };
  const refreshAll = () => {
    refresh();
    refreshReleases();
    refreshDrivers();
  };
  const emptyText =
    query ? `No items match “${query}”.`
    : page === "installing" ? "Nothing installing right now — active installs (including drivers) show up here live."
    : page === "updates" ? "Everything is up to date."
    : page === "installed" ? "Nothing installed yet — everything you add shows up here."
    : "Nothing here yet.";

  return (
    <div className="h-full overflow-auto bg-editor">
      <div className="mx-auto w-full max-w-[1400px] px-8 py-5">
        <HubHeader
          page={page}
          crumb={crumb}
          counts={{ updates: totalUpdates, installed: installedCount, installing: installingIds.size + Object.values(driverBusy).filter(Boolean).length }}
          checkedAt={checkedAt}
          refreshing={loadingReleases}
          onNavigate={goto}
          onRefresh={refreshAll}
        />
        <div ref={contentRef} className={cn("pt-6 transition-opacity", navPending && "opacity-60")}>
          {page === "detail" && detailItem ? (
            <HubDetail
              key={detailItem.id}
              item={detailItem}
              state={stateOf(detailItem)}
              actions={renderActions(detailItem)}
              versions={versionSource(detailItem) ? verLists[detailItem.id] : []}
              pickedVersion={verPick[detailItem.id]}
              onPickVersion={(v) => setVerPick(({ [detailItem.id]: _drop, ...rest }) => (v ? { ...rest, [detailItem.id]: v } : rest))}
              onLoadVersions={() => loadVersions(detailItem)}
              readme={detailItem.repo ? readmes[detailItem.repo] : null}
              related={CATALOG.filter((c) => c.id !== detailItem.id && sectionOf(c.kind) === sectionOf(detailItem.kind))}
              stateOf={stateOf}
              onOpen={openDetail}
              onBack={() => setDetailId(null)}
              onOpenExternal={openExternal}
            />
          ) : page === "home" ? (
            <HubHome
              items={CATALOG}
              stateOf={stateOf}
              query={query}
              onQuery={setQuery}
              onSearch={() => goto("search")}
              onOpenSection={openSection}
              onOpen={openDetail}
              featured={featured}
              selection={selection}
              updatesBanner={
                totalUpdates > 0 ? (
                  <button
                    onClick={() => goto("updates")}
                    className="flex items-center gap-3 rounded-xl border border-primary/40 bg-primary/10 px-4 py-3 text-left text-[13px] text-foreground hover:bg-primary/15"
                  >
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                    </span>
                    <span className="font-medium">{totalUpdates} update{totalUpdates > 1 ? "s" : ""} available</span>
                    <span className="text-muted-foreground">— review and update everything from one page</span>
                    <ChevronRight className="ml-auto h-4 w-4 text-primary" />
                  </button>
                ) : null
              }
            />
          ) : page === "ai-clients" ? (
            <AiClientsTab />
          ) : page === "kits" ? (
            <div className="grid gap-5">
              <div>
                <h1 className="font-heading text-[22px] font-bold text-foreground">Kits</h1>
                <p className="mt-1 text-[13px] text-muted-foreground">Curated bundles — one click installs a whole workflow.</p>
              </div>
              <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]">
                {PACKS.map((pack) => {
                  const PackIcon = pack.icon;
                  const allInstalled = pack.items.every((it) => {
                    const c = CATALOG.find((x) => x.id === it.id);
                    return c?.install === "reference" || installedMap[it.id] || detected[it.id];
                  });
                  return (
                    <div
                      key={pack.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setKitModal(pack)}
                      onKeyDown={(e) => { if (e.key === "Enter") setKitModal(pack); }}
                      title="See what's in this kit"
                      className="group flex min-h-[188px] cursor-pointer flex-col rounded-xl border border-border bg-panel text-left transition-colors hover:border-foreground/25"
                    >
                      <div className="flex-1 p-5">
                        <div className="flex items-center gap-3.5">
                          <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-white shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]"><PackIcon className="h-6 w-6 text-[#0b1730]" strokeWidth={1.75} /></span>
                          <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-foreground">{pack.name}</span>
                          <button
                            onClick={(e) => { e.stopPropagation(); if (!allInstalled) installPack(pack); }}
                            disabled={allInstalled}
                            title={allInstalled ? "Already installed" : "Install this kit"}
                            aria-label={allInstalled ? `${pack.name} is installed` : `Install ${pack.name}`}
                            className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors", allInstalled ? "text-primary" : "text-muted-foreground hover:text-primary")}
                          >
                            {allInstalled ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                          </button>
                        </div>
                        <p className="mt-3.5 line-clamp-2 text-[13px] leading-relaxed text-foreground/85">{pack.tagline}</p>
                      </div>
                      <div className="flex flex-wrap gap-1.5 border-t border-border px-5 py-3">
                        {pack.items.map((it) => (
                          <span key={it.id} className="rounded-full bg-secondary px-2 py-px text-[10.5px] text-muted-foreground">{it.label}</span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="grid gap-5">
              {page === "updates" ? (
                <>
                  <StudioUpdateCard />
                  {updateItems.length > 0 ? (
                    <div className="flex items-center justify-end">
                      <button
                        onClick={() => void installSelected(new Set(updateItems.map((i) => i.id)))}
                        disabled={queueBusy}
                        data-agent-id="market.update-all"
                        className="cta-glow flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-[13px] font-medium text-primary-foreground hover:bg-primary/85 disabled:opacity-60"
                      >
                        <BxIcon name="rotate-ccw-dot" className="h-4 w-4" /> Update all ({updateItems.length})
                      </button>
                    </div>
                  ) : null}
                </>
              ) : null}
              <HubSearch
                title={page === "updates" ? "Updates" : page === "installed" ? "Installed" : page === "installing" ? "Installing" : "Search"}
                results={results}
                total={listBase.length}
                query={query}
                onQuery={setQuery}
                filters={filters}
                onFilters={setFilters}
                onOpenFilters={() => setDrawerOpen(true)}
                sort={sort}
                onSort={setSort}
                stateOf={stateOf}
                onOpen={openDetail}
                selection={selection}
                emptyText={emptyText}
              />
            </div>
          )}
        </div>
      </div>

      <FilterDrawer open={drawerOpen} onOpenChange={setDrawerOpen} filters={filters} onChange={setFilters} />

      {manageLocal ? <LocalExasolPanel onClose={() => setManageLocal(false)} /> : null}

      {selected.size > 0 ? (
        <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-xl border border-border bg-popover px-3 py-2 shadow-2xl">
          <span className="text-[12px] font-medium text-foreground">
            {selected.size} selected
          </span>
          <button
            onClick={() => void installSelected()}
            className="cta-glow flex h-7 items-center gap-1.5 rounded-md bg-primary px-3 text-[12px] font-medium text-primary-foreground hover:bg-primary/85"
          >
            <BxIcon name="arrow-to-bottom" className="h-3.5 w-3.5" /> Install / update selected
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="flex h-7 items-center rounded-md border border-border px-2.5 text-[12px] text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            Clear
          </button>
        </div>
      ) : null}

      {queue.length ? (
        <div className="fixed bottom-4 right-4 z-50 w-72 overflow-hidden rounded-xl border border-border bg-popover shadow-2xl">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
            {queueBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" /> : <Check className="h-3.5 w-3.5 text-primary" />}
            <span className="flex-1 text-[12.5px] font-semibold text-foreground">
              {queueBusy ? "Installing your kit pack…" : "Kit pack installed"}
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
                    <BxIcon name="cross-circle" className="h-3.5 w-3.5 text-destructive" />
                  ) : (
                    <BxIcon name="clock-dashed-half" className="h-3.5 w-3.5 text-muted-foreground/50" />
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

      {/* Kit "template" modal — what's inside a kit + one-click install. */}
      {kitModal ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-6" onClick={() => setKitModal(null)}>
          <div
            className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-popover shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-2.5 px-5 pt-5">
              <kitModal.icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <h3 className="text-[15px] font-semibold text-foreground">{kitModal.name}</h3>
                <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">{kitModal.tagline}</p>
              </div>
              <button onClick={() => setKitModal(null)} aria-label="Close" className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
            </div>

            <div className="mt-3 border-t border-border px-5 py-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">In this kit</p>
              <div className="space-y-2">
                {kitModal.items.map((it) => {
                  const c = CATALOG.find((x) => x.id === it.id);
                  const ItIcon = it.icon;
                  const done = c?.install === "reference" || installedMap[it.id] || detected[it.id];
                  return (
                    <div key={it.id} className="flex items-start gap-2.5">
                      <ItIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[12.5px] font-medium text-foreground">{c?.name ?? it.label}</span>
                          {done ? <Check className="h-3 w-3 text-primary" /> : null}
                        </div>
                        {c?.description ? <p className="text-[11px] leading-snug text-muted-foreground">{c.description}</p> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-border bg-panel/40 px-5 py-3">
              <button onClick={() => setKitModal(null)} className="flex h-8 items-center rounded-lg border border-border px-3 text-[12.5px] text-muted-foreground hover:bg-secondary hover:text-foreground">Close</button>
              {(() => {
                const allInstalled = kitModal.items.every((it) => {
                  const c = CATALOG.find((x) => x.id === it.id);
                  return c?.install === "reference" || installedMap[it.id] || detected[it.id];
                });
                return (
                  <button
                    onClick={() => { installPack(kitModal); setKitModal(null); }}
                    disabled={allInstalled}
                    className="cta-glow flex h-8 items-center gap-1.5 rounded-lg bg-primary px-4 text-[12.5px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {allInstalled ? <><Check className="h-3.5 w-3.5" /> Installed</> : <><Download className="h-3.5 w-3.5" /> Use this kit</>}
                  </button>
                );
              })()}
            </div>
          </div>
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
  push("success", `${item.name} installed.`);
}


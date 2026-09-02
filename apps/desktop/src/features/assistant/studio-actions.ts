// The app-control bridge's action registry: the assistant asks Studio to DO
// things (open a view, search, install/uninstall/verify a component) and this
// executes them against the app's real IPCs and events. Kept as a flat,
// validated dispatch so the routing is testable and every action fails
// gracefully with a message rather than throwing into the app.

import { ipc } from "@/lib/ipc";

import { STUDIO_ACTIONS, isStudioAction, type StudioActionName } from "./studio-action-names";
export { STUDIO_ACTIONS, isStudioAction, type StudioActionName };

export type StudioActionResult = { ok: boolean; data?: unknown; error?: string };

/** Views the assistant can open. Maps to the events ExasolStudio listens on. */
const OPEN_EVENTS: Record<string, { event: string; detail?: (arg?: string) => unknown }> = {
  marketplace: { event: "studio:open-marketplace" },
  notebook: { event: "studio:open-notebook" },
  visualizer: { event: "studio:open-visualizer" },
  git: { event: "studio:open-git" },
  skills: { event: "studio:open-skills" },
  mcp: { event: "studio:open-mcp" },
  settings: { event: "studio:open-settings" },
  docs: { event: "studio:open-docs", detail: (arg) => ({ path: arg }) },
  assistant: { event: "studio:assistant-open" },
  search: { event: "studio:global-search" },
};

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** Resolve a component/marketplace id or name from the catalog to its id. */
async function resolveComponentId(idOrName: string): Promise<string | null> {
  const q = idOrName.trim().toLowerCase();
  if (!q) return null;
  const catalog = await ipc.marketCatalog().catch(() => null);
  const items = catalog?.items ?? {};
  if (items[q]) return q; // exact id
  for (const [id, entry] of Object.entries(items)) {
    const name = (entry as { name?: string }).name?.toLowerCase() ?? "";
    if (id.toLowerCase() === q || name === q || name.includes(q) || id.includes(q)) return id;
  }
  return q; // fall through — let the install IPC report if it's unknown
}

export async function executeStudioAction(name: string, rawArgs: unknown): Promise<StudioActionResult> {
  const args = (rawArgs ?? {}) as Record<string, unknown>;
  try {
    switch (name) {
      case "open": {
        const spec = OPEN_EVENTS[str(args.target).toLowerCase()];
        if (!spec) return { ok: false, error: `Unknown view "${str(args.target)}". One of: ${Object.keys(OPEN_EVENTS).join(", ")}.` };
        window.dispatchEvent(spec.detail ? new CustomEvent(spec.event, { detail: spec.detail(str(args.arg) || undefined) }) : new Event(spec.event));
        return { ok: true, data: `Opened ${str(args.target)}.` };
      }
      case "close_tab": {
        window.dispatchEvent(new CustomEvent("studio:close-tab", { detail: { title: str(args.title) || undefined } }));
        return { ok: true, data: str(args.title) ? `Closed "${str(args.title)}".` : "Closed the active tab." };
      }
      case "search": {
        const query = str(args.query);
        window.dispatchEvent(new CustomEvent("studio:global-search", { detail: { query } }));
        // Also return marketplace matches so the agent has something to act on.
        const catalog = await ipc.marketCatalog().catch(() => null);
        const q = query.toLowerCase();
        const hits = Object.entries(catalog?.items ?? {})
          .filter(([id, e]) => id.includes(q) || ((e as { name?: string; description?: string }).name ?? "").toLowerCase().includes(q) || ((e as { description?: string }).description ?? "").toLowerCase().includes(q))
          .slice(0, 12)
          .map(([id, e]) => ({ id, name: (e as { name?: string }).name ?? id, latest: (e as { latest?: string }).latest ?? null }));
        return { ok: true, data: { query, marketplace: hits } };
      }
      case "list_components": {
        const comps = await ipc.listComponents();
        return { ok: true, data: comps.map((c) => ({ id: c.id, installed: c.installed ?? null, verified: c.verified ?? null })) };
      }
      case "component_status": {
        const id = await resolveComponentId(str(args.id));
        const [comps, detected] = await Promise.all([ipc.listComponents().catch(() => []), ipc.marketDetect().catch(() => ({}))]);
        const comp = comps.find((c) => c.id === id);
        return { ok: true, data: { id, installed: comp?.installed ?? Boolean((detected as Record<string, boolean>)[id ?? ""]) ? (comp?.installed ?? "detected") : null } };
      }
      case "install_component": {
        const id = await resolveComponentId(str(args.id));
        if (!id) return { ok: false, error: "Which component? Pass its id or name." };
        window.dispatchEvent(new CustomEvent("studio:open-marketplace"));
        const res = await ipc.marketInstallEngine(id).catch((e) => ({ done: false, note: String(e) }));
        return { ok: true, data: { id, ...res, note: (res as { note?: string }).note ?? "Install started — the Installing tab shows live progress." } };
      }
      case "uninstall_component": {
        const id = await resolveComponentId(str(args.id));
        if (!id) return { ok: false, error: "Which component? Pass its id or name." };
        await ipc.marketUninstall(id);
        return { ok: true, data: `Uninstalled ${id}.` };
      }
      case "connect": {
        window.dispatchEvent(new CustomEvent("studio:connect-profile", { detail: { name: str(args.name) || undefined } }));
        return { ok: true, data: "Connecting…" };
      }
      case "disconnect": {
        window.dispatchEvent(new CustomEvent("studio:disconnect", { detail: { name: str(args.name) || undefined } }));
        return { ok: true, data: "Disconnected." };
      }
      default:
        return { ok: false, error: `Unknown action "${name}". One of: ${STUDIO_ACTIONS.join(", ")}.` };
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

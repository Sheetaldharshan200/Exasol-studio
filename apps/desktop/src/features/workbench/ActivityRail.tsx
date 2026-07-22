import { Icon, type IconName } from "@/components/ui/icon";
import { AgentMark } from "@/components/studio/AgentMark";

/** Official MCP mark (Boxicons v3, MIT/free license) — currentColor, so it
 * follows light/dark themes automatically. */
function McpMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="m19.97,11.84c.66-.66,1.02-1.53,1.02-2.46s-.36-1.8-1.02-2.46l-.04-.04c-.66-.66-1.53-1.02-2.46-1.02-.17,0-.34.03-.51.05.02-.17.05-.33.05-.51,0-.93-.36-1.8-1.02-2.46-.66-.66-1.53-1.02-2.46-1.02s-1.8.36-2.46,1.02l-7.87,7.87c-.27.27-.27.71,0,.98s.71.27.98,0l7.87-7.87c.39-.39.92-.61,1.47-.61s1.08.22,1.47.61c.39.39.61.92.61,1.48s-.22,1.08-.61,1.48l-5.86,5.86-.08.08c-.27.27-.27.71,0,.98.14.14.31.2.49.2s.36-.07.49-.2l5.94-5.94c.39-.39.92-.61,1.48-.61s1.08.22,1.47.61l.04.04c.39.39.61.92.61,1.47s-.22,1.08-.61,1.48l-7.11,7.11c-.63.63-.63,1.66,0,2.29l1.46,1.46c.14.14.31.2.49.2s.36-.07.49-.2c.27-.27.27-.71,0-.98l-1.46-1.46c-.09-.09-.09-.24,0-.33l7.11-7.11Z"/>
      <path d="m17.96,9.83c.27-.27.27-.71,0-.98-.27-.27-.71-.27-.98,0l-5.82,5.82c-.81.81-2.14.81-2.95,0-.81-.81-.81-2.14,0-2.95l5.82-5.82c.27-.27.27-.71,0-.98-.27-.27-.71-.27-.98,0l-5.82,5.82c-1.36,1.36-1.36,3.56,0,4.92.68.68,1.57,1.02,2.46,1.02s1.78-.34,2.46-1.02l5.82-5.82Z"/>
    </svg>
  );
}
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type ActivityId =
  | "databases"
  | "files"
  | "favorites"
  | "visualizer"
  | "git"
  | "notebook"
  | "skills"
  | "marketplace"
  | "guides"
  | "bi"
  | "mcp";

// Ordered by how often they're used: everyday data work first (databases,
// files, notebook, visualizer), then project tools, then occasional ones.
export const ACTIVITIES: { id: ActivityId; label: string; icon: IconName }[] = [
  { id: "databases", label: "Databases", icon: "database" },
  { id: "files", label: "Files", icon: "files" },
  { id: "notebook", label: "Notebook", icon: "notebook" },
  { id: "visualizer", label: "Schema visualizer", icon: "visualizer" },
  { id: "bi", label: "Dashboards", icon: "dashboards" },
  { id: "git", label: "Source Control", icon: "git" },
  { id: "favorites", label: "Favorites", icon: "favorites" },
  { id: "skills", label: "Skills", icon: "skills" },
  { id: "marketplace", label: "Marketplace", icon: "marketplace" },
  { id: "guides", label: "Guides & Docs", icon: "guides" },
];

// Items that open a full-screen tab (highlighted by the active tab's view,
// not the sidebar panel). "bi" launches an external tool, so it's an action —
// never a persistent selection. Everything else is a sidebar panel.
const FULL_TAB_VIEWS = new Set<ActivityId>(["visualizer", "marketplace", "guides", "git", "notebook", "skills", "bi"]);
const SIDEBAR_PANELS = new Set<ActivityId>(["databases", "files", "favorites", "mcp"]);

export function ActivityRail({
  active,
  sidebarOpen,
  aiOpen,
  activeView,
  visualizerCount,
  onSelect,
  onToggleAi,
  onOpenSettings,
}: {
  active: ActivityId;
  sidebarOpen: boolean;
  aiOpen: boolean;
  /** The active workspace tab's view (drives full-tab icon highlighting). */
  activeView: string | null;
  /** Number of open Visualizer tabs, shown as a badge. */
  visualizerCount: number;
  onSelect: (id: ActivityId) => void;
  onToggleAi: () => void;
  onOpenSettings: () => void;
}) {
  return (
    <aside
      data-tour="rail"
      className="flex w-12 shrink-0 flex-col items-center justify-between border-r border-border bg-activitybar py-2"
    >
      <div className="flex flex-col items-center gap-1">
        {ACTIVITIES.map((item) => {
          const isViz = item.id === "visualizer";
          const selected = FULL_TAB_VIEWS.has(item.id)
            ? activeView === item.id
            : SIDEBAR_PANELS.has(item.id) && active === item.id && sidebarOpen;
          return (
            <Tooltip key={item.id}>
              <TooltipTrigger asChild>
                <button
                  data-tour={isViz ? "visualizer" : undefined}
                  data-agent-id={`rail.${item.id}`}
                  aria-label={item.label}
                  onClick={() => onSelect(item.id)}
                  className={cn(
                    "relative flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground",
                    selected && "text-primary",
                  )}
                >
                  {selected ? (
                    <span className="absolute top-1/2 left-0 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary" />
                  ) : null}
                  <Icon name={item.icon} className="h-[18px] w-[18px]" />
                  {isViz && visualizerCount > 0 ? (
                    <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 font-mono text-[9px] font-semibold text-primary-foreground">
                      {visualizerCount}
                    </span>
                  ) : null}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">{item.label}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>

      <div className="flex flex-col items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              aria-label="MCP servers"
              data-agent-id="rail.mcp"
              onClick={() => onSelect("mcp")}
              className={cn(
                "relative flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground",
                active === "mcp" && sidebarOpen && "text-primary",
              )}
            >
              {active === "mcp" && sidebarOpen ? (
                <span className="absolute top-1/2 left-0 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary" />
              ) : null}
              <McpMark className="h-[18px] w-[18px]" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">MCP servers — connect Jira, Excel, files & more</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              aria-label="Exa"
              onClick={onToggleAi}
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground",
                aiOpen && "text-primary",
              )}
            >
              <AgentMark className="h-[19px] w-[19px]" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Exa</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              aria-label="Settings"
              data-agent-id="rail.settings"
              onClick={onOpenSettings}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground"
            >
              <Icon name="settings" className="h-[18px] w-[18px]" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Settings</TooltipContent>
        </Tooltip>
      </div>
    </aside>
  );
}

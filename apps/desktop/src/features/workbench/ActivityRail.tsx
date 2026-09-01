import { Icon, type IconName } from "@/components/ui/icon";
import { AgentMark } from "@/components/studio/AgentMark";

/** Official MCP mark (Boxicons v3, MIT/free license) — currentColor, so it
 * follows light/dark themes automatically. */
import { McpMark } from "@/components/brand/McpMark";
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
  | "exaEngine"
  | "mcp";

// Ordered by how often they're used: everyday data work first (databases,
// files, notebook, visualizer), then project tools, then occasional ones.
export const ACTIVITIES: { id: ActivityId; label: string; icon: IconName }[] = [
  { id: "databases", label: "Databases", icon: "database" },
  { id: "files", label: "Files", icon: "files" },
  { id: "marketplace", label: "Marketplace", icon: "extension" },
  { id: "skills", label: "Skills", icon: "skills" },
  { id: "notebook", label: "Notebook", icon: "notebook" },
  { id: "visualizer", label: "Schema visualizer", icon: "visualizer" },
  { id: "git", label: "Source Control", icon: "git" },
  { id: "favorites", label: "Favorites", icon: "favorites" },
];

// Items that open a full-screen tab (highlighted by the active tab's view,
// not the sidebar panel). "bi" launches an external tool, so it's an action —
// never a persistent selection. Everything else is a sidebar panel.
const FULL_TAB_VIEWS = new Set<ActivityId>(["visualizer", "marketplace", "guides", "git", "notebook", "skills", "exaEngine"]);
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
  /** Whether the Exa side dock is open (drives the AI logo highlight). */
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
                (aiOpen || activeView === "exaEngine") && "text-primary",
              )}
            >
              <AgentMark className="h-[19px] w-[19px]" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Exa — AI assistant</TooltipContent>
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

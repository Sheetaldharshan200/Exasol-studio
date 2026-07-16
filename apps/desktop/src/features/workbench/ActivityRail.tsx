import { BarChart3, BookOpen, Database, Eye, FileCode2, GitBranch, Settings, Star, Store, type LucideIcon } from "lucide-react";
import { AgentMark } from "@/components/studio/AgentMark";
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
  | "marketplace"
  | "guides"
  | "bi";

export const ACTIVITIES: { id: ActivityId; label: string; icon: LucideIcon }[] = [
  { id: "databases", label: "Databases", icon: Database },
  { id: "files", label: "Files", icon: FileCode2 },
  { id: "favorites", label: "Favorites", icon: Star },
  { id: "visualizer", label: "Visualizer", icon: Eye },
  { id: "git", label: "Git", icon: GitBranch },
  { id: "marketplace", label: "Marketplace", icon: Store },
  { id: "guides", label: "Guides & Docs", icon: BookOpen },
  { id: "bi", label: "Dashboards", icon: BarChart3 },
];

// Items that open a full-screen tab (highlighted by the active tab's view,
// not the sidebar panel). "bi" launches an external tool, so it's an action —
// never a persistent selection. Everything else is a sidebar panel.
const FULL_TAB_VIEWS = new Set<ActivityId>(["visualizer", "marketplace", "guides"]);
const SIDEBAR_PANELS = new Set<ActivityId>(["databases", "files", "favorites", "git"]);

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
          const Icon = item.icon;
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
                    "relative flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
                    selected && "text-primary",
                  )}
                >
                  {selected ? (
                    <span className="absolute top-1/2 left-0 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary" />
                  ) : null}
                  <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
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
              aria-label="Exa"
              onClick={onToggleAi}
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
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
              className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <Settings className="h-[18px] w-[18px]" strokeWidth={1.75} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Settings</TooltipContent>
        </Tooltip>
      </div>
    </aside>
  );
}

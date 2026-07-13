import { BookOpen, Database, Eye, FileCode2, GitBranch, Sparkles, Star, Store, type LucideIcon } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type ActivityId = "databases" | "files" | "favorites" | "visualizer" | "git" | "marketplace" | "guides";

export const ACTIVITIES: { id: ActivityId; label: string; icon: LucideIcon }[] = [
  { id: "databases", label: "Databases", icon: Database },
  { id: "files", label: "Files", icon: FileCode2 },
  { id: "favorites", label: "Favorites", icon: Star },
  { id: "visualizer", label: "Visualizer", icon: Eye },
  { id: "git", label: "Git", icon: GitBranch },
  { id: "marketplace", label: "Marketplace", icon: Store },
  { id: "guides", label: "Guides & Docs", icon: BookOpen },
];

export function ActivityRail({
  active,
  sidebarOpen,
  aiOpen,
  visualizerActive,
  visualizerCount,
  onSelect,
  onToggleAi,
}: {
  active: ActivityId;
  sidebarOpen: boolean;
  aiOpen: boolean;
  /** True when the focused workspace tab is a Visualizer. */
  visualizerActive: boolean;
  /** Number of open Visualizer tabs, shown as a badge. */
  visualizerCount: number;
  onSelect: (id: ActivityId) => void;
  onToggleAi: () => void;
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
          const selected = (active === item.id && sidebarOpen) || (isViz && visualizerActive);
          return (
            <Tooltip key={item.id}>
              <TooltipTrigger asChild>
                <button
                  data-tour={isViz ? "visualizer" : undefined}
                  aria-label={item.label}
                  onClick={() => onSelect(item.id)}
                  className={cn(
                    "relative flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
                    selected && "bg-secondary text-primary",
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
              aria-label="AI Assistant"
              onClick={onToggleAi}
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
                aiOpen && "bg-primary/15 text-primary",
              )}
            >
              <Sparkles className="h-[18px] w-[18px]" strokeWidth={1.75} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">AI Assistant</TooltipContent>
        </Tooltip>
      </div>
    </aside>
  );
}

import { Database, FileCode2, GitBranch, Sparkles, Star, Store, type LucideIcon } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type ActivityId = "databases" | "files" | "favorites" | "git" | "marketplace";

export const ACTIVITIES: { id: ActivityId; label: string; icon: LucideIcon }[] = [
  { id: "databases", label: "Databases", icon: Database },
  { id: "files", label: "Files", icon: FileCode2 },
  { id: "favorites", label: "Favorites", icon: Star },
  { id: "git", label: "Git", icon: GitBranch },
  { id: "marketplace", label: "Marketplace", icon: Store },
];

export function ActivityRail({
  active,
  sidebarOpen,
  aiOpen,
  onSelect,
  onToggleAi,
}: {
  active: ActivityId;
  sidebarOpen: boolean;
  aiOpen: boolean;
  onSelect: (id: ActivityId) => void;
  onToggleAi: () => void;
}) {
  return (
    <aside className="flex w-12 shrink-0 flex-col items-center justify-between border-r border-border bg-activitybar py-2">
      <div className="flex flex-col items-center gap-1">
        {ACTIVITIES.map((item) => {
          const Icon = item.icon;
          const selected = active === item.id && sidebarOpen;
          return (
            <Tooltip key={item.id}>
              <TooltipTrigger asChild>
                <button
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

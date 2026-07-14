import { useEffect, useState } from "react";
import { Cloud, Database, Plug, Star, Table2, User, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { getFavorites, removeFavorite, FAVORITES_CHANGED, type Favorite } from "@/lib/favorites";

const ICON: Record<string, typeof Star> = {
  schema: Database,
  "virtual-schema": Cloud,
  table: Table2,
  view: Table2,
  user: User,
  column: Plug,
};

/** The Favorites navigator panel — starred objects for the active connection. */
export function FavoritesPanel({
  profileId,
  onOpen,
}: {
  profileId: string | null;
  onOpen: (fav: Favorite) => void;
}) {
  const [items, setItems] = useState<Favorite[]>(getFavorites());

  useEffect(() => {
    const sync = () => setItems(getFavorites());
    window.addEventListener(FAVORITES_CHANGED, sync);
    return () => window.removeEventListener(FAVORITES_CHANGED, sync);
  }, []);

  const shown = profileId ? items.filter((f) => f.profileId === profileId) : items;

  if (shown.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl text-muted-foreground">
          <Star className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">Favorites</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Right-click a schema, table, view or user → <span className="text-foreground">Add to Favorites</span> for quick access here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto py-1 [scrollbar-width:thin]">
      {shown.map((f) => {
        const Icon = ICON[f.type] ?? Star;
        return (
          <div
            key={`${f.type}:${f.schema ?? ""}:${f.name}`}
            onClick={() => onOpen(f)}
            className={cn(
              "group flex cursor-pointer items-center gap-2 px-3 py-1.5 text-[13px] text-foreground/90 hover:bg-secondary/70 hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="min-w-0 flex-1 truncate">
              {f.name}
              {f.schema ? <span className="ml-1 font-mono text-[10px] text-muted-foreground">{f.schema}</span> : null}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                removeFavorite(f);
              }}
              title="Remove"
              className="hidden shrink-0 rounded p-0.5 text-muted-foreground hover:text-destructive group-hover:block"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

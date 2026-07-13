export type Favorite = { profileId: string; type: string; schema?: string; name: string };

const KEY = "exasol-studio-favorites";
export const FAVORITES_CHANGED = "exasol-studio-favorites-changed";

export function favKey(f: Favorite): string {
  return `${f.profileId}:${f.type}:${f.schema ?? ""}:${f.name}`;
}

export function getFavorites(): Favorite[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as Favorite[];
  } catch {
    return [];
  }
}

function save(items: Favorite[]) {
  localStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent(FAVORITES_CHANGED));
}

export function addFavorite(f: Favorite) {
  const cur = getFavorites();
  if (!cur.some((x) => favKey(x) === favKey(f))) save([...cur, f]);
}

export function removeFavorite(f: Favorite) {
  save(getFavorites().filter((x) => favKey(x) !== favKey(f)));
}

export function isFavorite(f: Favorite): boolean {
  return getFavorites().some((x) => favKey(x) === favKey(f));
}

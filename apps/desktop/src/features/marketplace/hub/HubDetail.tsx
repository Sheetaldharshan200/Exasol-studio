import { useState, type ReactNode } from "react";
import { ChevronLeft, Download, ExternalLink, Loader2, Star } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { ResolvedCatalogItem } from "../catalog-data";
import { stateLabel, type ItemState } from "../item-state";
import { compactCount, relativeAge, sectionLabel, sectionOf } from "./filters";
import { HubCard, TrustMark } from "./HubCard";
import { HubLogo } from "./HubLogo";

function absUrl(repo: string | undefined, src?: string): string | undefined {
  if (!src || !repo) return src;
  if (/^https?:\/\//i.test(src) || src.startsWith("data:")) return src;
  return `https://raw.githubusercontent.com/${repo}/HEAD/${src.replace(/^\.?\//, "")}`;
}

/**
 * One item's page: identity row (logo, `publisher/name`, trust, publisher
 * link, description, category chip, stars, kind pill) with the version
 * picker and actions on the right; then Overview (README) | Versions.
 */
export function HubDetail({
  item,
  state,
  actions,
  versions,
  pickedVersion,
  onPickVersion,
  onLoadVersions,
  readme,
  related,
  stateOf,
  onOpen,
  onBack,
  onOpenExternal,
}: {
  item: ResolvedCatalogItem;
  state: ItemState;
  /** The install / update / manage controls the container owns. */
  actions: ReactNode;
  versions: string[] | null | "error" | undefined;
  pickedVersion: string | undefined;
  onPickVersion: (v: string | undefined) => void;
  onLoadVersions: () => void;
  /** undefined = loading, null = no README, string = markdown. */
  readme: string | null | undefined;
  related: ResolvedCatalogItem[];
  stateOf: (item: ResolvedCatalogItem) => ItemState;
  onOpen: (id: string) => void;
  onBack: () => void;
  onOpenExternal: (url: string) => void;
}) {
  const [tab, setTab] = useState("overview");
  const slug = item.repo ?? `exasol/${item.id}`;
  const publisher = slug.split("/")[0];
  const stars = compactCount(item.stars);
  const list = Array.isArray(versions) ? versions : [];
  const pills = list.slice(0, 10);
  return (
    <div className="grid gap-6">
      <div className="flex items-start gap-5">
        <button onClick={onBack} aria-label="Back" className="mt-4 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-primary hover:bg-secondary/60">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <HubLogo item={item} size="lg" className="mt-1" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="font-heading text-[24px] font-bold leading-tight text-foreground">{slug}</h1>
            <TrustMark labs={item.labs} withLabel />
          </div>
          <button onClick={() => onOpenExternal(`https://github.com/${publisher}`)} className="mt-1 text-[13px] text-primary underline-offset-2 hover:underline">
            {publisher}
          </button>
          <p className="mt-3 max-w-3xl text-[14px] leading-relaxed text-foreground/90">{item.description || "No description yet."}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-secondary px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-secondary-foreground">{sectionLabel(sectionOf(item.kind))}</span>
          </div>
          <div className="mt-3 flex items-center gap-4 text-[13px] text-muted-foreground">
            {stars ? (
              <span className="inline-flex items-center gap-1.5">
                <Star className="h-4 w-4" /> {stars}
              </span>
            ) : null}
            <span className={cn("inline-flex items-center gap-1.5", state.kind === "update" && "text-primary")}>
              {state.kind === "installing" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} {stateLabel(state)}
            </span>
            {item.pushedAt ? <span>updated {relativeAge(item.pushedAt)}</span> : null}
          </div>
          <div className="mt-3">
            <span className="rounded-full bg-syntax-function/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-syntax-function">{item.kind}</span>
          </div>
        </div>
        {/* The container's controls are sized for a card row; on the item page they
            are THE call to action, so they scale up to Docker Hub's Tag | Pull | Run. */}
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2.5 pt-3 [&_button]:h-11 [&_button]:rounded-lg [&_button]:px-5 [&_button]:text-[14px] [&_button]:font-medium [&_button>svg]:h-4 [&_button>svg]:w-4 [&_span.flex]:h-11 [&_span.flex]:rounded-lg [&_span.flex]:px-4 [&_span.flex]:text-[14px] [&_button.max-w-\[150px\]]:max-w-[220px] [&_button.max-w-\[150px\]]:min-w-[140px] [&_button.font-mono]:text-[13px]">
          {actions}
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => { setTab(v); if (v === "versions") onLoadVersions(); }}>
        <TabsList variant="line" className="h-11 w-full justify-start gap-6 border-b border-border bg-transparent p-0">
          <TabsTrigger value="overview" className="h-11 rounded-none px-2 text-[15px] data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-primary">Overview</TabsTrigger>
          <TabsTrigger value="versions" className="h-11 rounded-none px-2 text-[15px] data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-primary">Versions</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="pt-6">
          <div className="grid gap-10 lg:[grid-template-columns:minmax(0,1fr)_320px]">
            <div className="min-w-0">
              {readme === undefined ? (
                <div className="flex items-center gap-2 py-10 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading the README…</div>
              ) : readme ? (
                <div
                  className="md-body max-w-3xl"
                  onClick={(e) => {
                    const a = (e.target as HTMLElement).closest("a");
                    const href = a?.getAttribute("href");
                    if (href) {
                      e.preventDefault();
                      onOpenExternal(/^https?:/i.test(href) ? href : `https://github.com/${slug}/blob/HEAD/${href.replace(/^\.?\//, "")}`);
                    }
                  }}
                >
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeRaw]}
                    components={{
                      a: ({ href, children }) => <a href={href}>{children}</a>,
                      img: ({ src, alt }) => <img src={absUrl(item.repo, typeof src === "string" ? src : undefined)} alt={alt ?? ""} />,
                    }}
                  >
                    {readme}
                  </ReactMarkdown>
                </div>
              ) : (
                <div className="py-10 text-[13px] text-muted-foreground">
                  No README to show.{" "}
                  {item.homepage ? (
                    <button onClick={() => onOpenExternal(item.homepage)} className="inline-flex items-center gap-1 text-primary hover:underline">
                      Open the documentation <ExternalLink className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
              )}
            </div>
            <aside className="min-w-0">
              <h2 className="font-heading text-[18px] font-semibold text-foreground">Recent versions</h2>
              <div className="mt-3 border-t border-border pt-4">
                {versions === undefined ? (
                  <button onClick={onLoadVersions} className="text-[13px] text-primary hover:underline">Load the version list</button>
                ) : versions === null ? (
                  <div className="flex items-center gap-2 text-[13px] text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
                ) : versions === "error" ? (
                  <p className="text-[13px] text-muted-foreground">Couldn't load versions (offline or rate-limited).</p>
                ) : pills.length === 0 ? (
                  <p className="text-[13px] text-muted-foreground">No published versions found.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <VersionPill label="LATEST" active={!pickedVersion} onClick={() => onPickVersion(undefined)} />
                    {pills.map((v) => (
                      <VersionPill key={v} label={v} active={pickedVersion === v} onClick={() => onPickVersion(v)} />
                    ))}
                  </div>
                )}
              </div>
              {item.homepage ? (
                <button onClick={() => onOpenExternal(item.homepage)} className="mt-6 inline-flex items-center gap-1.5 text-[13px] text-primary hover:underline">
                  Documentation and source <ExternalLink className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </aside>
          </div>
        </TabsContent>

        <TabsContent value="versions" className="pt-6">
          {versions === null || versions === undefined ? (
            <div className="flex items-center gap-2 text-[13px] text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading versions…</div>
          ) : versions === "error" ? (
            <p className="text-[13px] text-muted-foreground">Couldn't load versions (offline or rate-limited).</p>
          ) : list.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">No published versions found.</p>
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {list.map((v, i) => (
                <li key={v} className="flex items-center gap-4 px-5 py-3">
                  <span className="font-mono text-[13px] text-foreground">{v}</span>
                  {i === 0 ? <span className="rounded-full bg-primary/15 px-2 py-px text-[10px] font-semibold uppercase text-primary">latest</span> : null}
                  {state.kind !== "install" && "installed" in state && state.installed === v ? (
                    <span className="rounded-full bg-secondary px-2 py-px text-[10px] font-semibold uppercase text-muted-foreground">installed</span>
                  ) : null}
                  <button
                    onClick={() => { onPickVersion(v); setTab("overview"); }}
                    className={cn("ml-auto h-7 rounded-md border px-2.5 text-[12px]", pickedVersion === v ? "border-primary text-primary" : "border-border text-muted-foreground hover:text-foreground")}
                  >
                    {pickedVersion === v ? "Selected" : "Select"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>

      {related.length ? (
        <section className="border-t border-border pt-6">
          <h2 className="mb-4 font-heading text-[18px] font-semibold text-foreground">More in {sectionLabel(sectionOf(item.kind))}</h2>
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]">
            {related.slice(0, 3).map((r) => (
              <HubCard key={r.id} item={r} state={stateOf(r)} selectable={false} selected={false} onToggleSelect={() => undefined} onOpen={() => onOpen(r.id)} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function VersionPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "h-8 rounded-full px-3.5 font-mono text-[11.5px] font-semibold uppercase tracking-wide transition-colors",
        active ? "bg-primary text-primary-foreground" : "bg-primary/15 text-primary hover:bg-primary/25",
      )}
    >
      {label}
    </button>
  );
}

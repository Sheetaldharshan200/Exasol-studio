import { Icon, type IconName } from "@/components/ui/icon";
import { ipc, isTauri } from "@/lib/ipc";

type Recent = { id: string; label: string; sub: string };

/**
 * VS Code-style start page: a plain surface with text links (no buttons or
 * colored cards). Shown whenever the workspace has no open tabs — before or
 * after connecting, and after the last tab is closed.
 */
export function WelcomeScreen({
  connected,
  recents,
  onNewQuery,
  onOpenFile,
  onConnect,
  onMarketplace,
  onGuides,
  onOpenRecent,
}: {
  connected: boolean;
  recents: Recent[];
  onNewQuery: () => void;
  onOpenFile: () => void;
  onConnect: () => void;
  onMarketplace: () => void;
  onGuides: (path: string) => void;
  onOpenRecent: (id: string) => void;
}) {
  const start: { icon: IconName; label: string; onClick: () => void }[] = [
    { icon: "querytab", label: "New query", onClick: onNewQuery },
    { icon: "folder-open", label: "Open SQL file…", onClick: onOpenFile },
    { icon: connected ? "database" : "plug", label: connected ? "Add connection…" : "Connect to a database…", onClick: onConnect },
    { icon: "extension", label: "Browse the Marketplace…", onClick: onMarketplace },
  ];

  // Each entry deep-links to its page in the in-app Docs tab.
  const guides: { label: string; path: string }[] = [
    { label: "Get started with Exasol Studio", path: "getting-started" },
    { label: "Connect to your Exasol database", path: "connections" },
    { label: "Load data with ExaPump", path: "workbench/files" },
    { label: "Write and run your first query", path: "workbench/sql-editor" },
    { label: "Drivers & multi-driver execution", path: "connections/drivers" },
  ];

  const openExternal = (url: string) => {
    if (isTauri()) void ipc.openExternal(url).catch(() => window.open(url, "_blank"));
    else window.open(url, "_blank");
  };

  const Link = ({ icon, children, onClick }: { icon?: IconName; children: React.ReactNode; onClick: () => void }) => (
    <button
      onClick={onClick}
      className="group flex items-center gap-2 py-1 text-left text-[13px] text-primary outline-none hover:underline focus-visible:underline"
    >
      {icon ? <Icon name={icon} className="h-4 w-4 shrink-0 opacity-90" /> : null}
      <span>{children}</span>
    </button>
  );

  return (
    <div className="h-full overflow-auto bg-editor [scrollbar-width:thin]">
      <div className="mx-auto grid max-w-4xl grid-cols-1 gap-x-16 gap-y-10 px-12 py-16 md:grid-cols-2">
        {/* Left: title + Start + Recent */}
        <div>
          <h1 className="text-[34px] font-semibold leading-none tracking-tight text-foreground">Exasol Studio</h1>
          <p className="mt-1.5 text-[15px] text-muted-foreground">Everything Exasol, on your desktop.</p>

          <div className="mt-8">
            <h2 className="mb-1 text-[15px] font-medium text-foreground/90">Start</h2>
            <div className="flex flex-col">
              {start.map((s) => (
                <Link key={s.label} icon={s.icon} onClick={s.onClick}>
                  {s.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="mt-8">
            <h2 className="mb-1 text-[15px] font-medium text-foreground/90">Recent</h2>
            {recents.length === 0 ? (
              <p className="py-1 text-[13px] text-muted-foreground">No recent connections yet.</p>
            ) : (
              <div className="flex flex-col">
                {recents.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => onOpenRecent(r.id)}
                    className="group flex items-baseline gap-2 py-1 text-left outline-none"
                  >
                    <span className="text-[13px] text-primary group-hover:underline group-focus-visible:underline">{r.label}</span>
                    <span className="truncate text-[12px] text-muted-foreground">{r.sub}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Guides */}
        <div>
          <h2 className="mb-1 flex items-center gap-1.5 text-[15px] font-medium text-foreground/90">Guides</h2>
          <div className="flex flex-col">
            {guides.map((g) => (
              <Link key={g.path} icon="guides" onClick={() => onGuides(g.path)}>
                {g.label}
              </Link>
            ))}
          </div>

          {/* Subtle promo — Personal is free; production scales low-cost. */}
          <div className="mt-8 rounded-lg border border-border/70 bg-panel/40 p-3">
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground">Exasol Personal is free</span> for local &amp; personal use.
              Ready for production? Exasol scales to your cloud at low cost.{" "}
              <button onClick={() => openExternal("https://www.exasol.com/exasol-personal/")} className="text-primary hover:underline">
                Learn more
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

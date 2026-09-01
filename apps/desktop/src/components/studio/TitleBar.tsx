/**
 * The studio title bar: brand mark, connection state with connect/disconnect,
 * notifications, and the theme controls.
 *
 * Extracted from ExasolStudio.tsx.
 */
import { BookOpen, PlugZap, Search as SearchIcon, Unplug } from "lucide-react";

import { ExasolMark } from "@/components/brand/ExasolMark";
import { ThemeToggle } from "@/components/brand/ThemeToggle";
import { ThemeCustomizer } from "@/components/studio/ThemeCustomizer";
import { Notifications } from "@/features/workbench/Notifications";
import { cn } from "@/lib/utils";
import { agent } from "@/lib/agent-client";
import { ipc, isTauri } from "@/lib/ipc";
import type { ActiveConnection } from "@/state/useConnections";

/**
 * The docs ship inside the exa engine the app already runs — serving them
 * from the sidecar means an installed Studio has the complete documentation
 * (both the Studio and exa notebooks) with no network and no separate copy.
 */
function openDocs() {
  // Render the docs INSIDE the app (Docs tab, iframe of the served site).
  window.dispatchEvent(new CustomEvent("studio:open-docs"));
}

export function TitleBar({
  connection,
  onConnect,
  onDisconnect,
  hideConnect,
}: {
  connection: ActiveConnection | null;
  onConnect: () => void;
  onDisconnect: () => void;
  /** Hide the Connect CTA while the connect view is already on screen. */
  hideConnect?: boolean;
}) {
  const connected = Boolean(connection);
  return (
    <header
      className="flex h-9 shrink-0 items-center justify-between border-b border-border bg-titlebar text-xs text-muted-foreground"
      style={{
        paddingLeft: "calc(0.75rem + var(--wc-left, 0px))",
        paddingRight: "calc(0.75rem + var(--wc-right, 0px))",
      }}
      data-tauri-drag-region
    >
      <div className="flex items-center gap-2.5">
        <ExasolMark size={18} className="text-foreground" />
        <span className="font-heading text-[13px] font-bold text-foreground">Exasol Studio</span>
        <span className="text-border">/</span>
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              connected ? "bg-primary shadow-[0_0_6px_var(--primary)]" : "bg-muted-foreground/50",
            )}
          />
          <span className={cn("font-medium", connected && "text-foreground")}>
            {connected ? connection!.profile.name : "Not connected"}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("studio:global-search"))}
          title="Search everything (⌘K)"
          aria-label="Universal search"
          className="flex h-6 w-44 items-center gap-1.5 rounded-md border border-border/70 bg-background/50 px-2 text-[11px] text-muted-foreground hover:border-border hover:text-foreground"
        >
          <SearchIcon className="h-3 w-3" />
          <span className="flex-1 text-left">Search</span>
          <kbd className="rounded border border-border/70 px-1 text-[9px]">⌘K</kbd>
        </button>
        <button
          onClick={openDocs}
          title="Documentation (Exasol Studio & exa)"
          aria-label="Open the documentation"
          className="flex h-6 items-center gap-1.5 rounded-md px-2 text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <BookOpen className="h-3.5 w-3.5" />
          Docs
        </button>
        <Notifications />
        <ThemeCustomizer />
        <ThemeToggle className="h-6 w-6 rounded-md hover:bg-secondary" />
        {connected ? (
          <button
            // Never pass the handler directly: onClick's MouseEvent would land
            // in disconnect(profileId?) and be mistaken for a profile id.
            onClick={() => onDisconnect()}
            className="flex h-6 items-center gap-1.5 rounded-md border border-border px-2 text-[11px] hover:border-destructive/50 hover:text-foreground"
          >
            <Unplug className="h-3.5 w-3.5" />
            Disconnect
          </button>
        ) : hideConnect ? null : (
          <button
            onClick={onConnect}
            data-agent-id="titlebar.connect"
            className="cta-glow flex h-6 items-center gap-1.5 rounded-md bg-primary px-2.5 text-[11px] font-medium text-primary-foreground hover:bg-primary/85"
          >
            <PlugZap className="h-3.5 w-3.5" />
            Connect
          </button>
        )}
      </div>
    </header>
  );
}

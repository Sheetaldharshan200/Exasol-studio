/**
 * The studio title bar: brand mark, connection state with connect/disconnect,
 * notifications, and the theme controls.
 *
 * Extracted from ExasolStudio.tsx.
 */
import { PlugZap, Unplug } from "lucide-react";

import { ExasolMark } from "@/components/brand/ExasolMark";
import { ThemeToggle } from "@/components/brand/ThemeToggle";
import { ThemeCustomizer } from "@/components/studio/ThemeCustomizer";
import { Notifications } from "@/features/workbench/Notifications";
import { cn } from "@/lib/utils";
import type { ActiveConnection } from "@/state/useConnections";

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
        {connected ? (
          <span className="hidden font-mono text-[11px] md:inline">
            {connection!.server.databaseName ?? "exasol"} {connection!.server.version ?? ""}
          </span>
        ) : null}
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

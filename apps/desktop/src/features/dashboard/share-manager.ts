// Orchestrates a dashboard live share from the app side: render the current
// snapshot, hand it to the isolated share server (agent-core), and — for a
// public share — bring up a cloudflared tunnel in front of it. The share server
// holds only rendered HTML, so nothing DB-connected is ever exposed; the tunnel
// points solely at the share port, never the agent gateway.

import { agent } from "@/lib/agent-client";
import { ipc } from "@/lib/ipc";
import { renderSnapshotHtml } from "./export-dashboard";
import { shareUrl } from "./share-url";
import type { DashboardDoc } from "./model";
import type { DashConn } from "./useWidgetData";

export { shareUrl };
export type ShareMode = "public" | "local";
export type ShareSession = { id: string; base: string; token: string; mode: ShareMode };

/** Start sharing a dashboard. Public brings up a cloudflared tunnel; local serves
 *  on localhost (useful for a quick check on the same machine). */
export async function startShare(id: string, doc: DashboardDoc, conn: DashConn, mode: ShareMode): Promise<ShareSession> {
  const html = await renderSnapshotHtml(doc, conn, "live");
  const { ok, port, token } = await agent.shareStart(id, html);
  if (!ok || !port) throw new Error("Could not start the share server — is the AI engine running?");
  let base: string;
  if (mode === "public") {
    await ipc.cloudflaredEnsure(); // fetch cloudflared on first use (self-sustained)
    base = await ipc.cloudflaredStart(port);
  } else {
    base = `http://127.0.0.1:${port}`;
  }
  return { id, base, token, mode };
}

/** Push the latest rendered snapshot to the running share (the refresh publish). */
export async function publishShare(id: string, doc: DashboardDoc, conn: DashConn): Promise<void> {
  const html = await renderSnapshotHtml(doc, conn, "live");
  await agent.sharePublish(id, html);
}

/** Rotate the share token; the previous link dies. Returns the new session. */
export async function rotateShare(session: ShareSession): Promise<ShareSession> {
  const { ok, token } = await agent.shareRotate(session.id);
  if (!ok || !token) throw new Error("Could not rotate the share link.");
  return { ...session, token };
}

/** Stop the share and tear down the tunnel. */
export async function stopShare(session: ShareSession): Promise<void> {
  await agent.shareStop(session.id);
  if (session.mode === "public") await ipc.cloudflaredStop().catch(() => undefined);
}

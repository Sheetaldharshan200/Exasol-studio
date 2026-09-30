// The host side of Panorama's shell bridge, pure so it is unit-tested: which
// messages from the frame are commands, which commands Studio answers and
// how, and what goes back. The tab wires this to IPC and postMessage.

/** A command the frame sent through the shim. */
export type ShellRequest = { id: number; cmd: string; args: Record<string, unknown> | null };

/** The frame's message, if it is one of the shim's requests. */
export function parseRequest(data: unknown): ShellRequest | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (d.panoramaShell !== 1 || typeof d.id !== "number" || typeof d.cmd !== "string") return null;
  const args = d.args && typeof d.args === "object" ? (d.args as Record<string, unknown>) : null;
  return { id: d.id, cmd: d.cmd, args };
}

export type ShellAnswerers = {
  proxyUrl: () => string | null;
  deployments: () => Promise<unknown>;
  credentials: (name: string) => Promise<unknown>;
};

/** Studio's answer to one shell command — or a rejection for the rest. Only
 *  these commands exist inside Studio; the others are Panorama's own shell's. */
export async function answer(req: ShellRequest, s: ShellAnswerers): Promise<unknown> {
  switch (req.cmd) {
    case "database_proxy": {
      const url = s.proxyUrl();
      if (!url) throw new Error("Studio's database proxy is not running.");
      return url;
    }
    case "exasol_deployments":
      return s.deployments();
    case "exasol_deployment_credentials": {
      const name = req.args?.name;
      if (typeof name !== "string" || !name) throw new Error("Which connection?");
      return s.credentials(name);
    }
    // Panorama's own shell answers these; Studio has nothing to say and the
    // page treats "nothing" as fine (no update staged, no timing kept, no
    // agent attached, no Claude pairing).
    case "update_status":
    case "report_timing":
    case "agent_status":
    case "claude_status":
    case "claude_pair":
    case "claude_open":
      return null;
    case "agent_attach":
    case "agent_detach":
    case "agent_reply":
      return {};
    default:
      throw new Error(`${req.cmd} is not available inside Studio.`);
  }
}

/** The frame URL of the served build, as Tauri spells custom schemes per platform. */
export function frameUrl(userAgent: string): string {
  return /Windows/i.test(userAgent) ? "http://panorama.localhost/" : "panorama://localhost/";
}

/** The origin replies are addressed to — the frame's, never `*`. */
export function frameOrigin(userAgent: string): string {
  return frameUrl(userAgent).replace(/\/$/, "");
}

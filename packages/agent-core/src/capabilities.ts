import { readFileSync } from "node:fs";
import { join } from "node:path";

export type SemanticViewsCapability = {
  state: "ready" | "installing" | "failed";
  version?: string;
  error?: string;
  connectionId?: string;
};

export type AgentCapabilities = {
  localReady?: boolean;
  semanticViews?: SemanticViewsCapability;
};

/**
 * Read the desktop-managed capability marker. It is intentionally read on
 * every turn so a background installer can unlock features without requiring
 * the agent sidecar to restart.
 */
export function readAgentCapabilities(dataDir: string): AgentCapabilities {
  try {
    const parsed = JSON.parse(readFileSync(join(dataDir, "capabilities.json"), "utf8")) as AgentCapabilities;
    const semanticViews = parsed?.semanticViews;
    if (!semanticViews || !["ready", "installing", "failed"].includes(semanticViews.state)) return {};
    return {
      ...(typeof parsed.localReady === "boolean" ? { localReady: parsed.localReady } : {}),
      semanticViews: {
        state: semanticViews.state,
        ...(typeof semanticViews.version === "string" ? { version: semanticViews.version } : {}),
        ...(typeof semanticViews.error === "string" ? { error: semanticViews.error } : {}),
        ...(typeof semanticViews.connectionId === "string" ? { connectionId: semanticViews.connectionId } : {}),
      },
    };
  } catch {
    return {};
  }
}

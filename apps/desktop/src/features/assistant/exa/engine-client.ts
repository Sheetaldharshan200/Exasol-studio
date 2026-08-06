import { createOpencodeClient } from "@assistant-ui/react-opencode";

/**
 * The frontend's direct line to the opencode engine, for the official
 * assistant-ui opencode runtime.
 *
 * The webview cannot fetch localhost itself (mixed-content rules in the
 * packaged app), so the SDK client is built with tauri-plugin-http's fetch:
 * requests execute in Rust and the response body arrives as a genuine
 * pull-based ReadableStream — which is what keeps the engine's SSE event
 * subscription alive (verified against the plugin's shipped source).
 * The capability scope restricts this fetch to http://127.0.0.1 only.
 */

type EngineClient = ReturnType<typeof createOpencodeClient>;

let cached: { port: number; client: EngineClient } | null = null;

/** Build (or reuse) the engine SDK client for the engine's current port. */
export async function engineClientFor(port: number): Promise<EngineClient> {
  if (cached?.port === port) return cached.client;
  const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  let fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis);
  if (inTauri) {
    const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
    fetchImpl = tauriFetch as typeof fetch;
  }
  const client = createOpencodeClient({
    baseUrl: `http://127.0.0.1:${port}`,
    fetch: fetchImpl,
  });
  cached = { port, client };
  return client;
}

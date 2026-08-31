import { listen } from "@tauri-apps/api/event";

/**
 * Single global listener for PTY output. The shell prints its prompt within
 * milliseconds of spawn — before a per-component `listen()` can attach — so
 * output is buffered per terminal id until its xterm view claims it.
 */
type Sink = (data: string) => void;

const sinks = new Map<number, Sink>();
const buffers = new Map<number, string[]>();
let ready: Promise<void> | null = null;

const EXIT_MSG = "\r\n\x1b[2m[process exited]\x1b[0m\r\n";

export function termBusReady(): Promise<void> {
  if (!ready) {
    ready = Promise.all([
      listen<{ id: number; data: string }>("term-data", (e) => deliver(e.payload.id, e.payload.data)),
      listen<{ id: number }>("term-exit", (e) => deliver(e.payload.id, EXIT_MSG)),
    ]).then(() => undefined);
  }
  return ready;
}

function deliver(id: number, data: string) {
  const sink = sinks.get(id);
  if (sink) sink(data);
  else {
    const buf = buffers.get(id) ?? [];
    buf.push(data);
    buffers.set(id, buf);
  }
}

/** Attach the live view; replays anything buffered since spawn. Returns detach. */
export function attachTermSink(id: number, sink: Sink): () => void {
  const buf = buffers.get(id);
  if (buf) {
    buffers.delete(id);
    for (const chunk of buf) sink(chunk);
  }
  sinks.set(id, sink);
  return () => {
    if (sinks.get(id) === sink) sinks.delete(id);
  };
}

/**
 * Send a prompt to the exa assistant from anywhere in the app (notebook
 * cells, editor AI actions). Opens the assistant surface, then dispatches
 * `exa:prompt`, which the mounted ExaThread claims and sends as a normal
 * turn. `send: false` only prefills the composer for the user to finish.
 */
export function askExa(text: string, opts?: { send?: boolean }) {
  if (!text.trim()) return;
  window.dispatchEvent(new CustomEvent("studio:assistant-open"));
  window.dispatchEvent(new CustomEvent("exa:prompt", { detail: { text, send: opts?.send !== false } }));
}

/**
 * Point @monaco-editor/react at the BUNDLED monaco-editor instead of its
 * default CDN loader. Two reasons:
 *  1. Self-contained desktop app — the editor must work with no network.
 *  2. Deep ESM imports (e.g. IQuickInputService for the ⌘P Quick Access
 *     binding) must resolve against the SAME module instance as the running
 *     editor; with the CDN copy the service identifier never matches and
 *     accessor.get() throws.
 */
import * as monaco from "monaco-editor";
import { loader } from "@monaco-editor/react";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";

self.MonacoEnvironment = {
  // SQL/markdown use the base editor worker; no language services needed.
  getWorker: () => new EditorWorker(),
};

loader.config({ monaco });

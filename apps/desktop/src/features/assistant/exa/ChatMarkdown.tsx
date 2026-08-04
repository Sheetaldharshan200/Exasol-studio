import { useMemo, useRef, useState } from "react";
import { Check, Copy, Download, FileInput } from "lucide-react";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { extractTableDataFromElement, tableDataToCSV, tableDataToMarkdown } from "streamdown";
import type { BundledLanguage } from "shiki";
import { MessageResponse } from "@/components/ai-elements/message";
import { CodeBlock } from "@/components/ai-elements/code-block";
import { ipc } from "@/lib/ipc";
import { cleanAssistant, hasLeakedToolCall, stripToolJson } from "@/features/assistant/chat-text";

/**
 * Assistant markdown for the Exa panel — the same shiki/streamdown pipeline the
 * rest of Studio uses (MessageResponse + CodeBlock), with a per-code-block
 * toolbar. SQL blocks additionally get an "Apply to editor" action (the
 * continue.dev "Apply" grammar), routed to the workbench via `onApplySql`.
 */

const SHIKI_LANGS = new Set([
  "sql", "javascript", "js", "typescript", "ts", "tsx", "jsx", "python", "py", "json", "html",
  "css", "bash", "sh", "shell", "yaml", "yml", "xml", "markdown", "md", "java", "go", "rust",
  "c", "cpp", "csharp", "php", "ruby", "kotlin", "swift", "scala", "r", "dart", "diff", "text",
]);

const LANG_EXT: Record<string, string> = {
  sql: "sql", javascript: "js", js: "js", typescript: "ts", ts: "ts", tsx: "tsx", jsx: "jsx",
  python: "py", py: "py", json: "json", html: "html", css: "css", bash: "sh", sh: "sh",
  shell: "sh", yaml: "yaml", yml: "yaml", xml: "xml", markdown: "md", md: "md", java: "java",
};

/** Clipboard write that works in every webview (async API + textarea fallback). */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    return true;
  } catch {
    return false;
  }
}

function ChatCodeBlock({ code, language, onApplySql }: { code: string; language: string; onApplySql?: (sql: string) => void }) {
  const [copied, setCopied] = useState(false);
  const [applied, setApplied] = useState(false);
  const lang = language || "text";
  const isSql = lang.toLowerCase() === "sql";
  const safeLang = (SHIKI_LANGS.has(lang.toLowerCase()) ? lang.toLowerCase() : "text") as BundledLanguage;
  const copy = async () => {
    if (await copyText(code)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    }
  };
  const apply = () => {
    onApplySql?.(code);
    setApplied(true);
    window.setTimeout(() => setApplied(false), 1400);
  };
  const download = async () => {
    const ext = LANG_EXT[lang.toLowerCase()] ?? "txt";
    try {
      const path = await saveDialog({ defaultPath: `snippet.${ext}`, filters: [{ name: lang.toUpperCase(), extensions: [ext] }] });
      if (path) await ipc.writeTextFile(path, code);
    } catch {
      /* cancelled */
    }
  };
  const btn = "flex h-6 w-6 items-center justify-center rounded-md bg-background/70 text-muted-foreground opacity-0 backdrop-blur transition-opacity hover:text-foreground group-hover:opacity-100";
  return (
    <div className="group relative my-2">
      <CodeBlock code={code} language={safeLang}>
        {isSql && onApplySql ? (
          <button type="button" onClick={apply} aria-label="Apply to editor" title="Apply to the SQL editor" className={btn}>
            {applied ? <Check className="h-3.5 w-3.5 text-primary" /> : <FileInput className="h-3.5 w-3.5" />}
          </button>
        ) : null}
        <button type="button" onClick={copy} aria-label="Copy code" title="Copy" className={btn}>
          {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
        <button type="button" onClick={() => void download()} aria-label="Download code" title="Download" className={btn}>
          <Download className="h-3.5 w-3.5" />
        </button>
      </CodeBlock>
    </div>
  );
}

function ChatTable({ children }: { children?: React.ReactNode }) {
  const ref = useRef<HTMLTableElement>(null);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!ref.current) return;
    if (await copyText(tableDataToMarkdown(extractTableDataFromElement(ref.current)))) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    }
  };
  const download = async () => {
    if (!ref.current) return;
    const data = extractTableDataFromElement(ref.current);
    try {
      const path = await saveDialog({ defaultPath: "table.csv", filters: [{ name: "CSV", extensions: ["csv"] }] });
      if (path) await ipc.writeTextFile(path, tableDataToCSV(data));
    } catch {
      /* cancelled */
    }
  };
  return (
    <div className="group/table my-2">
      <div className="flex justify-end gap-1 pb-1 opacity-0 transition-opacity group-hover/table:opacity-100">
        <button type="button" onClick={() => void copy()} title="Copy as markdown" className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground">
          {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
        <button type="button" onClick={() => void download()} title="Download as CSV" className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground">
          <Download className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="overflow-x-auto rounded-md border border-border">
        <table ref={ref} className="w-full border-collapse text-[12px]">
          {children}
        </table>
      </div>
    </div>
  );
}

/** Pull raw code + language out of react-markdown's <pre><code> children. */
function extractCode(children: unknown): { code: string; language: string } {
  const el = (Array.isArray(children) ? children[0] : children) as { props?: { className?: string; children?: unknown } } | undefined;
  const className = el?.props?.className ?? "";
  const language = /language-(\S+)/.exec(className)?.[1] ?? "";
  const raw = el?.props?.children;
  const code = (typeof raw === "string" ? raw : Array.isArray(raw) ? raw.join("") : String(raw ?? "")).replace(/\n$/, "");
  return { code, language };
}

export function ChatMarkdown({ text, onApplySql }: { text: string; onApplySql?: (sql: string) => void }) {
  // Component map is rebuilt only when the apply handler changes.
  const components = useMemo(
    () => ({
      pre: ({ children }: { children?: unknown }) => {
        const { code, language } = extractCode(children);
        if (hasLeakedToolCall(code)) {
          const rest = stripToolJson(code).replace(/```/g, "").replace(/'''/g, "").trim();
          return rest ? <p className="whitespace-pre-wrap">{rest}</p> : null;
        }
        return <ChatCodeBlock code={code} language={language} onApplySql={onApplySql} />;
      },
      table: ({ children }: { children?: React.ReactNode }) => <ChatTable>{children}</ChatTable>,
      ol: ({ children }: { children?: React.ReactNode }) => <ol className="my-1 list-decimal space-y-0.5 pl-5">{children}</ol>,
      ul: ({ children }: { children?: React.ReactNode }) => <ul className="my-1 list-disc space-y-0.5 pl-5">{children}</ul>,
    }),
    [onApplySql],
  );
  return (
    <div className="prose-none text-[12.5px] leading-relaxed text-foreground [&_a]:text-primary [&_a]:underline [&_code]:rounded [&_code]:bg-secondary [&_code]:px-1 [&_code]:py-px [&_code]:font-mono [&_code]:text-[11.5px] [&_h1]:mt-2 [&_h1]:mb-1 [&_h1]:text-[15px] [&_h1]:font-semibold [&_h2]:mt-2 [&_h2]:mb-1 [&_h2]:text-[13.5px] [&_h2]:font-semibold [&_p]:my-1">
      <MessageResponse components={components} controls={{ table: false }}>
        {cleanAssistant(text)}
      </MessageResponse>
    </div>
  );
}

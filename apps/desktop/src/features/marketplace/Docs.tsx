import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  BarChart3,
  BookOpen,
  Boxes,
  Cloud,
  Cpu,
  Database,
  Download,
  ExternalLink,
  FileCode2,
  HardDriveDownload,
  Loader2,
  Plug,
  Server,
  type LucideIcon,
} from "lucide-react";
import { ipc } from "@/lib/ipc";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";

type DocItem = { id: string; name: string; repo: string; icon: LucideIcon; labs?: boolean };

// Official Exasol / Exasol-Labs repositories only — mirrors the Marketplace catalog.
const DOCS: DocItem[] = [
  { id: "exasol-personal", name: "Exasol Personal", repo: "exasol/exasol-personal", icon: Database },
  { id: "exasol-cloud", name: "Exasol Personal — Cloud", repo: "exasol/exasol-personal", icon: Cloud },
  { id: "exapump", name: "ExaPump", repo: "exasol-labs/exapump", icon: Cpu, labs: true },
  { id: "json-tables", name: "JSON Tables", repo: "exasol-labs/exasol-json-tables", icon: Boxes, labs: true },
  { id: "mcp-server", name: "Exasol MCP Server", repo: "exasol/mcp-server", icon: Server },
  { id: "pyexasol", name: "PyExasol", repo: "exasol/pyexasol", icon: Plug },
  { id: "ai-lab", name: "Exasol AI Lab", repo: "exasol/ai-lab", icon: Boxes },
  { id: "agent-skills", name: "Exasol Agent Skills", repo: "exasol-labs/exasol-agent-skills", icon: FileCode2, labs: true },
  { id: "superset", name: "Apache Superset (BI)", repo: "apache/superset", icon: BarChart3 },
];

function openExternal(url: string) {
  window.open(url, "_blank");
}

/** Resolve a relative README asset path to a raw GitHub URL. */
function absUrl(repo: string, src?: string): string | undefined {
  if (!src) return src;
  if (/^https?:\/\//i.test(src) || src.startsWith("data:")) return src;
  return `https://raw.githubusercontent.com/${repo}/HEAD/${src.replace(/^\.?\//, "")}`;
}

export function Docs() {
  const [selected, setSelected] = useState<DocItem>(DOCS[0]);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [source, setSource] = useState<"github" | "offline" | null>(null);
  // Guards against out-of-order responses (clicking B then A must not let A's
  // slower response overwrite B's content).
  const reqId = useRef<string>(DOCS[0].id);

  const open = useCallback(async (item: DocItem) => {
    reqId.current = item.id;
    setSelected(item);
    setLoading(true);
    setError(null);
    setContent("");
    setSource(null);
    const [online, offline] = await Promise.all([
      ipc.marketDoc(item.repo).catch(() => null),
      ipc.marketDocLoad(item.id).catch(() => null),
    ]);
    if (reqId.current !== item.id) return; // a newer selection superseded this one
    setSaved(offline != null);
    if (online) {
      setContent(online);
      setSource("github");
    } else if (offline) {
      setContent(offline);
      setSource("offline");
    } else {
      setError("Couldn't load the documentation. Check your connection, or open it on GitHub.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void open(DOCS[0]);
  }, [open]);

  async function toggleOffline(next: boolean) {
    if (next) {
      await ipc.marketDocSave(selected.id, content).catch(() => undefined);
      setSaved(true);
    } else {
      await ipc.marketDocForget(selected.id).catch(() => undefined);
      setSaved(false);
    }
  }

  return (
    <div className="flex h-full bg-editor">
      {/* Sidebar list */}
      <div className="flex w-56 shrink-0 flex-col border-r border-border bg-panel/50">
        <div className="flex items-center gap-2 border-b border-border px-3 py-3">
          <BookOpen className="h-4 w-4 text-primary" />
          <span className="text-[13px] font-semibold text-foreground">Guides & Docs</span>
        </div>
        <div className="flex-1 overflow-auto p-2">
          {DOCS.map((d) => {
            const Icon = d.icon;
            const active = d.id === selected.id;
            return (
              <button
                key={d.id}
                onClick={() => open(d)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px]",
                  active ? "bg-primary/12 text-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                <Icon className={cn("h-3.5 w-3.5 shrink-0", active && "text-primary")} />
                <span className="min-w-0 flex-1 truncate">{d.name}</span>
                {d.labs ? <span className="text-[8px] font-medium uppercase text-syntax-function">labs</span> : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
          <span className="flex-1 truncate text-[13px] font-semibold text-foreground">{selected.name}</span>
          {source ? (
            <span
              className={cn(
                "flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px]",
                source === "offline"
                  ? "border-syntax-function/40 bg-syntax-function/10 text-syntax-function"
                  : "border-border text-muted-foreground",
              )}
            >
              {source === "offline" ? <HardDriveDownload className="h-3 w-3" /> : null}
              {source === "offline" ? "Offline copy" : "github.com"}
            </span>
          ) : null}
          <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Download className="h-3.5 w-3.5" /> Offline
            <Switch checked={saved} onCheckedChange={toggleOffline} disabled={!content} />
          </label>
          <button
            onClick={() => openExternal(`https://github.com/${selected.repo}`)}
            className="flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            GitHub <ExternalLink className="h-3 w-3" />
          </button>
        </div>

        <div className="flex-1 overflow-auto px-6 py-5 [scrollbar-width:thin]">
          {loading ? (
            <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading documentation…
            </div>
          ) : error ? (
            <div className="mx-auto mt-10 max-w-md text-center">
              <p className="text-[13px] text-muted-foreground">{error}</p>
              <button
                onClick={() => openExternal(`https://github.com/${selected.repo}`)}
                className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground hover:bg-primary/85"
              >
                Open on GitHub <ExternalLink className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <div className="md-body mx-auto max-w-3xl">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  a: ({ href, children }) => (
                    <a
                      href={href}
                      onClick={(e) => {
                        e.preventDefault();
                        if (href) openExternal(href);
                      }}
                    >
                      {children}
                    </a>
                  ),
                  img: ({ src, alt }) => <img src={absUrl(selected.repo, typeof src === "string" ? src : undefined)} alt={alt ?? ""} />,
                }}
              >
                {content}
              </ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

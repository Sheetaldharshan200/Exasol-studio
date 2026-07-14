import { useEffect, useMemo, useState } from "react";
import { Search, Settings2, X } from "lucide-react";
import { ipc, isTauri } from "@/lib/ipc";
import { cn } from "@/lib/utils";

type SettingValue = string | number | boolean;

type Ctrl =
  | { key: string; label: string; type: "toggle"; help?: string }
  | { key: string; label: string; type: "number"; help?: string; min?: number; max?: number; unit?: string }
  | { key: string; label: string; type: "text" | "password"; help?: string; placeholder?: string }
  | { key: string; label: string; type: "select" | "radio"; options: { value: string; label: string }[]; help?: string };

type Category = { tab: "general" | "database"; key: string; label: string; desc: string; controls: Ctrl[] };

// Curated, DBVisualizer-informed settings that map to real Exasol Studio behavior.
const CATEGORIES: Category[] = [
  {
    tab: "general",
    key: "appearance",
    label: "Appearance",
    desc: "Theme and interface density.",
    controls: [
      {
        key: "theme",
        label: "Theme",
        type: "radio",
        help: "Light, dark, or follow the OS.",
        options: [
          { value: "system", label: "System" },
          { value: "light", label: "Light" },
          { value: "dark", label: "Dark" },
        ],
      },
      { key: "uiFontSize", label: "Interface font size", type: "number", min: 11, max: 18, unit: "px" },
      {
        key: "uiDensity",
        label: "Density",
        type: "select",
        options: [
          { value: "comfortable", label: "Comfortable" },
          { value: "compact", label: "Compact" },
        ],
      },
    ],
  },
  {
    tab: "general",
    key: "objectsTree",
    label: "Database Objects Tree",
    desc: "How schemas and objects are shown in the navigator.",
    controls: [
      { key: "showSystemSchemas", label: "Show system schemas (SYS, EXA_*)", type: "toggle" },
      { key: "autoExpandFirstSchema", label: "Auto-expand the first schema on connect", type: "toggle" },
    ],
  },
  {
    tab: "general",
    key: "metadata",
    label: "Metadata",
    desc: "Caching schema/table metadata avoids repeated round-trips. No data is cached — only names and types.",
    controls: [
      {
        key: "metadataCache",
        label: "Metadata cache",
        type: "radio",
        options: [
          { value: "persistent", label: "Persistent — restored next session" },
          { value: "transient", label: "Transient — cleared on exit" },
          { value: "disabled", label: "Disabled" },
        ],
      },
      { key: "metadataStaleDays", label: "Stale content threshold", type: "number", min: 0, max: 365, unit: "days" },
    ],
  },
  {
    tab: "general",
    key: "sqlEditor",
    label: "SQL Editor",
    desc: "Editing behavior for the SQL editor.",
    controls: [
      { key: "editorFontSize", label: "Editor font size", type: "number", min: 11, max: 22, unit: "px" },
      { key: "wordWrap", label: "Word wrap", type: "toggle" },
      { key: "autoComplete", label: "Auto-completion", type: "toggle" },
      { key: "statementDelimiter", label: "Statement delimiter", type: "text", placeholder: ";" },
    ],
  },
  {
    tab: "general",
    key: "grid",
    label: "Result Grid",
    desc: "How query results are displayed.",
    controls: [
      { key: "maxRows", label: "Max rows to fetch", type: "number", min: 10, max: 1000000, unit: "rows" },
      { key: "nullText", label: "Display NULL as", type: "text", placeholder: "null" },
      { key: "gridFontSize", label: "Grid font size", type: "number", min: 10, max: 18, unit: "px" },
      { key: "zebraStripes", label: "Zebra striping", type: "toggle" },
    ],
  },
  {
    tab: "general",
    key: "execution",
    label: "Execution",
    desc: "Defaults applied when you run SQL.",
    controls: [
      { key: "splitStatements", label: "Split buffer into separate statements", type: "toggle" },
      { key: "stopOnError", label: "Stop on first error", type: "toggle" },
      { key: "autoCommit", label: "Auto-commit", type: "toggle" },
      { key: "stripComments", label: "Strip comments before executing", type: "toggle" },
    ],
  },
  {
    tab: "general",
    key: "history",
    label: "SQL History",
    desc: "Executed statements are kept for quick recall.",
    controls: [
      { key: "keepHistory", label: "Keep SQL history", type: "toggle" },
      { key: "historyLimit", label: "History limit", type: "number", min: 10, max: 100000, unit: "entries" },
    ],
  },
  {
    tab: "general",
    key: "ai",
    label: "AI Assistant",
    desc: "Model and credentials for the built-in assistant.",
    controls: [
      {
        key: "aiModel",
        label: "Model",
        type: "select",
        options: [
          { value: "claude-opus-4-8", label: "Claude Opus 4.8" },
          { value: "claude-sonnet-5", label: "Claude Sonnet 5" },
          { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
        ],
      },
      { key: "aiApiKey", label: "Anthropic API key", type: "password", placeholder: "sk-ant-…", help: "Stored locally, used only for assistant requests." },
    ],
  },
  {
    tab: "general",
    key: "telemetry",
    label: "Telemetry",
    desc: "Anonymous usage statistics.",
    controls: [{ key: "telemetry", label: "Send anonymous telemetry", type: "toggle" }],
  },
  // ── Database (Exasol) ──────────────────────────────────────────────────
  {
    tab: "database",
    key: "authentication",
    label: "Authentication",
    desc: "Default session context for new connections.",
    controls: [{ key: "defaultSchema", label: "Default schema", type: "text", placeholder: "(none)" }],
  },
  {
    tab: "database",
    key: "delimitedIdentifiers",
    label: "Delimited Identifiers",
    desc: "How object names are quoted in generated SQL.",
    controls: [
      {
        key: "quoteIdentifiers",
        label: "Quote identifiers",
        type: "select",
        options: [
          { value: "asNeeded", label: "As needed" },
          { value: "always", label: "Always" },
          { value: "never", label: "Never" },
        ],
      },
    ],
  },
  {
    tab: "database",
    key: "physicalConnection",
    label: "Physical Connection",
    desc: "Transport, timeouts and encryption for the Exasol WebSocket connection.",
    controls: [
      { key: "connectTimeoutMs", label: "Connect timeout", type: "number", min: 1000, max: 120000, unit: "ms" },
      { key: "queryTimeoutMs", label: "Query timeout (0 = none)", type: "number", min: 0, max: 3600000, unit: "ms" },
      { key: "compression", label: "Enable compression", type: "toggle" },
      {
        key: "tls",
        label: "TLS / encryption",
        type: "select",
        options: [
          { value: "preferred", label: "Preferred" },
          { value: "required", label: "Required" },
          { value: "disabled", label: "Disabled" },
        ],
      },
    ],
  },
  {
    tab: "database",
    key: "transaction",
    label: "Transaction",
    desc: "Transaction handling for the connection.",
    controls: [
      { key: "dbAutoCommit", label: "Auto-commit", type: "toggle" },
      {
        key: "isolation",
        label: "Isolation level",
        type: "select",
        options: [{ value: "serializable", label: "Serializable (Exasol default)" }],
      },
    ],
  },
  {
    tab: "database",
    key: "encoding",
    label: "Encoding",
    desc: "Character set for results.",
    controls: [
      {
        key: "charset",
        label: "Character set",
        type: "select",
        options: [
          { value: "UTF8", label: "UTF-8" },
          { value: "Latin1", label: "Latin-1 (ISO-8859-1)" },
        ],
      },
    ],
  },
  {
    tab: "database",
    key: "sqlStatements",
    label: "SQL Statements",
    desc: "Fetching behavior for statements.",
    controls: [{ key: "fetchSize", label: "Fetch size", type: "number", min: 100, max: 1000000, unit: "rows" }],
  },
  {
    tab: "database",
    key: "queryBuilder",
    label: "Query Builder",
    desc: "Defaults for the visual query builder.",
    controls: [{ key: "qbDefaultLimit", label: "Default LIMIT", type: "number", min: 0, max: 100000, unit: "rows" }],
  },
];

const DEFAULTS: Record<string, SettingValue> = {
  theme: "system",
  uiFontSize: 13,
  uiDensity: "comfortable",
  showSystemSchemas: false,
  autoExpandFirstSchema: true,
  metadataCache: "persistent",
  metadataStaleDays: 60,
  editorFontSize: 13,
  wordWrap: false,
  autoComplete: true,
  statementDelimiter: ";",
  maxRows: 5000,
  nullText: "null",
  gridFontSize: 12,
  zebraStripes: true,
  splitStatements: true,
  stopOnError: true,
  autoCommit: true,
  stripComments: false,
  keepHistory: true,
  historyLimit: 1000,
  aiModel: "claude-opus-4-8",
  aiApiKey: "",
  telemetry: false,
  defaultSchema: "",
  quoteIdentifiers: "asNeeded",
  connectTimeoutMs: 15000,
  queryTimeoutMs: 0,
  compression: true,
  tls: "preferred",
  dbAutoCommit: true,
  isolation: "serializable",
  charset: "UTF8",
  fetchSize: 5000,
  qbDefaultLimit: 100,
};

export function SettingsWindow() {
  const [tab, setTab] = useState<"general" | "database">("general");
  const [query, setQuery] = useState("");
  const [values, setValues] = useState<Record<string, SettingValue>>(DEFAULTS);
  const [selected, setSelected] = useState<string>("appearance");

  useEffect(() => {
    ipc
      .getAppSettings()
      .then((s) => setValues((v) => ({ ...v, ...(s as Record<string, SettingValue>) })))
      .catch(() => undefined);
    ipc
      .getAssistantSettings()
      .then((a) => setValues((v) => ({ ...v, aiModel: a.model || v.aiModel, aiApiKey: a.apiKey || "" })))
      .catch(() => undefined);
  }, []);

  // Apply the chosen theme to THIS (settings) window live, so the appearance
  // updates the moment you pick it — not only after closing and reopening.
  useEffect(() => {
    const raw = String(values.theme ?? "system");
    const dark =
      raw === "dark" || (raw === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
  }, [values.theme]);

  const q = query.trim().toLowerCase();
  const cats = useMemo(
    () =>
      CATEGORIES.filter((c) => c.tab === tab).filter(
        (c) =>
          !q ||
          c.label.toLowerCase().includes(q) ||
          c.controls.some((ct) => ct.label.toLowerCase().includes(q)),
      ),
    [tab, q],
  );

  // Keep a valid selection for the active tab.
  useEffect(() => {
    if (!cats.some((c) => c.key === selected) && cats.length) setSelected(cats[0].key);
  }, [cats, selected]);

  const current = CATEGORIES.find((c) => c.key === selected) ?? cats[0];

  function update(key: string, value: SettingValue) {
    setValues((v) => ({ ...v, [key]: value }));
    if (key === "aiModel" || key === "aiApiKey") {
      const model = key === "aiModel" ? String(value) : String(values.aiModel);
      const apiKey = key === "aiApiKey" ? String(value) : String(values.aiApiKey);
      ipc.setAssistantSettings(apiKey, model).catch(() => undefined);
    }
    ipc.setAppSettings({ [key]: value }).catch(() => undefined);
  }

  function resetDefaults() {
    setValues(DEFAULTS);
    ipc.setAppSettings(DEFAULTS).catch(() => undefined);
  }

  return (
    <div className="flex h-screen flex-col bg-editor text-foreground">
      {/* Title bar (draggable) */}
      <div data-tauri-drag-region className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
        <Settings2 className="h-4 w-4 text-primary" />
        <span className="text-[13px] font-semibold">Settings</span>
        {isTauri() ? (
          <button
            onClick={() => import("@tauri-apps/api/webviewWindow").then((m) => m.getCurrentWebviewWindow().close())}
            className="ml-auto flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {/* Search + tabs */}
      <div className="shrink-0 border-b border-border px-3 py-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search settings…"
            className="h-8 w-full rounded-md border border-border bg-panel/70 pl-8 pr-3 text-[12.5px] outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
          />
        </div>
        <div className="mt-2 flex items-center gap-4 text-[13px]">
          {(["general", "database"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "border-b-2 pb-1 font-medium capitalize transition-colors",
                tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t === "database" ? "Database (Exasol)" : "General"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Category tree */}
        <div className="w-60 shrink-0 overflow-auto border-r border-border p-2 [scrollbar-width:thin]">
          {cats.map((c) => (
            <button
              key={c.key}
              onClick={() => setSelected(c.key)}
              className={cn(
                "flex w-full items-center rounded-md px-2.5 py-1.5 text-left text-[12.5px] transition-colors",
                selected === c.key ? "bg-primary/12 text-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              {c.label}
            </button>
          ))}
          {cats.length === 0 ? <p className="px-2 py-4 text-[12px] text-muted-foreground">No matches.</p> : null}
        </div>

        {/* Detail pane */}
        <div className="min-w-0 flex-1 overflow-auto p-6 [scrollbar-width:thin]">
          {current ? (
            <div className="mx-auto max-w-xl">
              <h2 className="text-[15px] font-bold">{current.label}</h2>
              <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">{current.desc}</p>
              <div className="mt-5 space-y-5">
                {current.controls.map((ct) => (
                  <ControlRow key={ct.key} ctrl={ct} value={values[ct.key]} onChange={(v) => update(ct.key, v)} />
                ))}
              </div>
              <SettingPreview catKey={current.key} values={values} />
            </div>
          ) : null}
        </div>
      </div>

      {/* Footer */}
      <div className="flex h-11 shrink-0 items-center border-t border-border px-3">
        <button
          onClick={resetDefaults}
          className="h-7 rounded-md border border-border px-3 text-[12px] text-muted-foreground hover:text-foreground"
        >
          Restore defaults
        </button>
        <span className="ml-auto text-[11px] text-muted-foreground">Changes save automatically</span>
      </div>
    </div>
  );
}

/**
 * Live preview that reacts instantly to the controls above it (the values are
 * component state, so every keystroke/toggle re-renders this). Shown only for
 * the categories with a visible effect: appearance, SQL editor, result grid.
 */
function SettingPreview({ catKey, values }: { catKey: string; values: Record<string, SettingValue> }) {
  if (catKey !== "appearance" && catKey !== "sqlEditor" && catKey !== "grid") return null;

  const Frame = ({ children }: { children: React.ReactNode }) => (
    <div className="mt-7">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Live preview</div>
      <div className="overflow-hidden rounded-lg border border-border bg-panel/60">{children}</div>
    </div>
  );

  if (catKey === "sqlEditor") {
    const fs = Number(values.editorFontSize) || 14;
    const wrap = Boolean(values.wordWrap);
    return (
      <Frame>
        <pre
          className={cn(
            "m-0 p-3 font-mono text-foreground",
            wrap ? "whitespace-pre-wrap break-words" : "overflow-x-auto whitespace-pre",
          )}
          style={{ fontSize: fs, lineHeight: 1.5 }}
        >
          <span className="text-syntax-function">SELECT</span> customer_name, SUM(o.amount) <span className="text-syntax-function">AS</span> revenue{"\n"}
          <span className="text-syntax-function">FROM</span> sales.orders o <span className="text-syntax-function">JOIN</span> sales.customers c <span className="text-syntax-function">ON</span> c.id = o.customer_id{"\n"}
          <span className="text-syntax-function">WHERE</span> o.created_at &gt;= <span className="text-teal">'2026-01-01'</span> <span className="text-syntax-function">GROUP BY</span> customer_name <span className="text-syntax-function">ORDER BY</span> revenue <span className="text-syntax-function">DESC</span>;
        </pre>
      </Frame>
    );
  }

  if (catKey === "grid") {
    const fs = Number(values.gridFontSize) || 12;
    const zebra = Boolean(values.zebraStripes);
    const nullText = String(values.nullText ?? "null");
    const rows = [
      ["1", "Acme Corp", "48,200"],
      ["2", "Globex", nullText],
      ["3", "Initech", "12,750"],
      ["4", "Umbrella", "9,010"],
    ];
    return (
      <Frame>
        <table className="w-full border-collapse" style={{ fontSize: fs }}>
          <thead>
            <tr className="bg-secondary/70 text-left text-muted-foreground">
              <th className="px-2.5 py-1.5 font-medium">ID</th>
              <th className="px-2.5 py-1.5 font-medium">CUSTOMER</th>
              <th className="px-2.5 py-1.5 font-medium">REVENUE</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {rows.map((r, i) => (
              <tr key={r[0]} className={cn(zebra && i % 2 === 1 && "bg-secondary/30")}>
                <td className="px-2.5 py-1 text-muted-foreground">{r[0]}</td>
                <td className="px-2.5 py-1 text-foreground">{r[1]}</td>
                <td className={cn("px-2.5 py-1", r[2] === nullText ? "italic text-muted-foreground/60" : "text-foreground")}>{r[2]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Frame>
    );
  }

  // appearance
  const theme = String(values.theme ?? "system");
  return (
    <Frame>
      <div className="flex items-center gap-3 p-3">
        {(["light", "dark"] as const).map((t) => (
          <div
            key={t}
            className={cn(
              "flex-1 rounded-md border p-2",
              t === "dark" ? "bg-[#14161a] text-white" : "bg-white text-[#14161a]",
              theme === t ? "border-primary ring-2 ring-primary/30" : "border-border",
            )}
          >
            <div className="mb-1.5 flex gap-1">
              <span className="h-2 w-2 rounded-full bg-primary" />
              <span className="h-2 w-6 rounded-full bg-current opacity-30" />
            </div>
            <div className="h-1.5 w-full rounded bg-current opacity-20" />
            <div className="mt-1 h-1.5 w-2/3 rounded bg-current opacity-20" />
            <div className="mt-2 text-[10px] font-medium capitalize opacity-70">{t}</div>
          </div>
        ))}
      </div>
    </Frame>
  );
}

function ControlRow({ ctrl, value, onChange }: { ctrl: Ctrl; value: SettingValue; onChange: (v: SettingValue) => void }) {
  return (
    <div className={cn("flex gap-4", ctrl.type === "radio" ? "flex-col" : "items-start justify-between")}>
      <div className={ctrl.type === "radio" ? "" : "min-w-0 flex-1"}>
        <div className="text-[13px] text-foreground">{ctrl.label}</div>
        {ctrl.help ? <div className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{ctrl.help}</div> : null}
      </div>
      <div className={ctrl.type === "radio" ? "flex flex-col gap-1.5" : "shrink-0"}>
        {ctrl.type === "toggle" ? (
          <button
            role="switch"
            aria-checked={Boolean(value)}
            onClick={() => onChange(!value)}
            className={cn(
              "relative h-5 w-9 rounded-full transition-colors",
              value ? "bg-primary" : "bg-secondary",
            )}
          >
            <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all", value ? "left-[18px]" : "left-0.5")} />
          </button>
        ) : ctrl.type === "number" ? (
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              value={Number(value)}
              min={ctrl.min}
              max={ctrl.max}
              onChange={(e) => onChange(Number(e.target.value))}
              className="h-8 w-28 rounded-md border border-border bg-panel px-2 text-right font-mono text-[12px] outline-none focus:border-primary/50"
            />
            {ctrl.unit ? <span className="text-[11px] text-muted-foreground">{ctrl.unit}</span> : null}
          </div>
        ) : ctrl.type === "text" || ctrl.type === "password" ? (
          <input
            type={ctrl.type}
            value={String(value ?? "")}
            placeholder={ctrl.placeholder}
            onChange={(e) => onChange(e.target.value)}
            className="h-8 w-52 rounded-md border border-border bg-panel px-2 font-mono text-[12px] outline-none focus:border-primary/50"
          />
        ) : ctrl.type === "select" ? (
          <select
            value={String(value)}
            onChange={(e) => onChange(e.target.value)}
            className="h-8 w-52 rounded-md border border-border bg-panel px-2 text-[12px] outline-none focus:border-primary/50"
          >
            {ctrl.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ) : ctrl.type === "radio" ? (
          ctrl.options.map((o) => (
            <label key={o.value} className="flex cursor-pointer items-center gap-2 text-[12.5px]">
              <input type="radio" checked={String(value) === o.value} onChange={() => onChange(o.value)} className="accent-[color:hsl(var(--primary))]" />
              {o.label}
            </label>
          ))
        ) : null}
      </div>
    </div>
  );
}

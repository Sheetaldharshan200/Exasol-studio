import { useEffect, useMemo, useState } from "react";
import {
  Braces,
  Database,
  FileClock,
  Fingerprint,
  Grid3x3,
  History as HistoryIcon,
  KeyRound,
  ListTree,
  Maximize2,
  Minimize2,
  Palette,
  Play,
  Quote,
  Radio,
  Search,
  Settings2,
  UserRound,
  Timer,
  Type as TypeIcon,
  Workflow,
  X,
  type LucideIcon,
} from "lucide-react";
import { AiPersonalization } from "./AiPersonalization";
import { Icon } from "@/components/ui/icon";
import { fuzzyRank } from "@/lib/fuzzy";
import { AppSelect } from "@/components/ui/app-select";
import { Icon as BxIcon } from "@/components/ui/icon";
import { ipc, isTauri } from "@/lib/ipc";
import { cn } from "@/lib/utils";
import { ThemePresetPicker } from "@/components/studio/ThemeCustomizer";
import { SYNTAX_DEFAULTS, SYNTAX_ROLES, sanitizeHex, syntaxSettingKey, type SyntaxRoleKey } from "@/components/studio/monaco-theme";
import { ColorPicker } from "@/components/ui/color-picker";
import { NumberInput } from "@/components/ui/number-input";

type SettingValue = string | number | boolean;

type Ctrl =
  | { key: string; label: string; type: "toggle"; help?: string }
  | { key: string; label: string; type: "number"; help?: string; min?: number; max?: number; unit?: string }
  | { key: string; label: string; type: "text" | "password"; help?: string; placeholder?: string }
  | { key: string; label: string; type: "select" | "radio"; options: { value: string; label: string }[]; help?: string };

type Category = { tab: "general" | "database" | "ai"; key: string; label: string; desc: string; icon?: LucideIcon; controls: Ctrl[] };

// Curated, DBVisualizer-informed settings that map to real Exasol Studio behavior.
const CATEGORIES: Category[] = [
  {
    tab: "ai",
    key: "personalization",
    icon: UserRound,
    label: "Personalization",
    desc: "How the assistant answers you — persona, depth, output format, tone, and standing instructions. Applies to the next message and survives restarts.",
    controls: [],
  },
  {
    tab: "general",
    key: "appearance",
    icon: Palette,
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
    icon: ListTree,
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
    icon: FileClock,
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
    icon: Braces,
    label: "SQL Editor",
    desc: "Editing behavior and syntax colors for the SQL editor.",
    controls: [
      { key: "editorFontSize", label: "Editor font size", type: "number", min: 11, max: 22, unit: "px" },
      { key: "wordWrap", label: "Word wrap", type: "toggle" },
      {
        key: "stmtNumbers",
        label: "Statement numbers in the margin",
        type: "toggle",
        help: "Shows 1], 2], … next to each statement of a multi-statement buffer, matching the result tabs.",
      },
      { key: "autoComplete", label: "Auto-completion", type: "toggle" },
      { key: "statementDelimiter", label: "Statement delimiter", type: "text", placeholder: ";" },
    ],
  },
  {
    tab: "general",
    key: "grid",
    icon: Grid3x3,
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
    icon: Play,
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
    icon: HistoryIcon,
    label: "SQL History",
    desc: "Executed statements are kept for quick recall.",
    controls: [
      { key: "keepHistory", label: "Keep SQL history", type: "toggle" },
      { key: "historyLimit", label: "History limit", type: "number", min: 10, max: 100000, unit: "entries" },
    ],
  },
  // ── Database (Exasol) ──────────────────────────────────────────────────
  {
    tab: "database",
    key: "authentication",
    icon: KeyRound,
    label: "Authentication",
    desc: "Default session context for new connections.",
    controls: [{ key: "defaultSchema", label: "Default schema", type: "text", placeholder: "(none)" }],
  },
  {
    tab: "database",
    key: "delimitedIdentifiers",
    icon: Quote,
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
    icon: Workflow,
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
    icon: Fingerprint,
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
    icon: TypeIcon,
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
    icon: Database,
    label: "SQL Statements",
    desc: "Fetching behavior for statements.",
    controls: [{ key: "fetchSize", label: "Fetch size", type: "number", min: 100, max: 1000000, unit: "rows" }],
  },
  {
    tab: "database",
    key: "queryBuilder",
    icon: Timer,
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
  stmtNumbers: true,
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
  // Per-token editor colors ("synDark_keyword": "#82dd4b", …) so "Restore
  // defaults" also resets any recolored syntax.
  ...Object.fromEntries(
    (["dark", "light"] as const).flatMap((t) => SYNTAX_ROLES.map((r) => [syntaxSettingKey(t, r.key), SYNTAX_DEFAULTS[t][r.key]])),
  ),
};

/** Embedded mode: rendered inside the web app's settings modal instead of a
 * native window — fills its container and gets expand/close controls. */
export type SettingsEmbed = {
  onClose: () => void;
  category?: string;
  expanded?: boolean;
  onToggleExpand?: () => void;
};

export function SettingsWindow({ embedded }: { embedded?: SettingsEmbed } = {}) {
  // Deep link: ?cat=<category key> opens straight to that page (the status
  // bar's Spaces/UTF-8 chips use this).
  const requested =
    embedded?.category ?? (typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("cat") : null);
  const requestedCat = CATEGORIES.find((c) => c.key === requested);
  const [tab, setTab] = useState<"general" | "database" | "ai">(requestedCat?.tab ?? "general");
  const [query, setQuery] = useState("");
  const [values, setValues] = useState<Record<string, SettingValue>>(DEFAULTS);
  const [selected, setSelected] = useState<string>(requestedCat?.key ?? "appearance");

  useEffect(() => {
    ipc
      .getAppSettings()
      .then((s) => setValues((v) => ({ ...v, ...(s as Record<string, SettingValue>) })))
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

  const q = query.trim();
  // Search reaches EVERY tab (fuzzy over label, description, control labels,
  // help text and option labels); picking a result jumps to its tab.
  const cats = useMemo(() => {
    if (!q) return CATEGORIES.filter((c) => c.tab === tab);
    const text = (c: Category) =>
      [
        c.label,
        c.desc,
        ...c.controls.flatMap((ct) => [ct.label, "help" in ct ? (ct.help ?? "") : "", ...("options" in ct ? ct.options.map((o) => o.label) : [])]),
      ].join(" ");
    return fuzzyRank(q, CATEGORIES, text).map((r) => r.item);
  }, [tab, q]);

  // Keep a valid selection for the active tab.
  useEffect(() => {
    if (!cats.some((c) => c.key === selected) && cats.length) setSelected(cats[0].key);
  }, [cats, selected]);

  const current = CATEGORIES.find((c) => c.key === selected) ?? cats[0];

  function update(key: string, value: SettingValue) {
    setValues((v) => ({ ...v, [key]: value }));
    ipc.setAppSettings({ [key]: value }).catch(() => undefined);
  }

  function updateMany(patch: Record<string, SettingValue>) {
    setValues((v) => ({ ...v, ...patch }));
    ipc.setAppSettings(patch).catch(() => undefined);
  }

  function resetDefaults() {
    setValues(DEFAULTS);
    ipc.setAppSettings(DEFAULTS).catch(() => undefined);
  }

  return (
    <div className={cn("flex flex-col bg-editor text-foreground", embedded ? "h-full" : "h-screen")}>
      {/* Title bar (draggable) */}
      <div data-tauri-drag-region className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
        <Icon name="settings" className="h-4 w-4 text-primary" />
        <span className="text-[13px] font-semibold">Settings</span>
        {embedded ? (
          <span className="ml-auto flex items-center gap-0.5">
            {embedded.onToggleExpand ? (
              <button
                onClick={embedded.onToggleExpand}
                title={embedded.expanded ? "Restore size" : "Expand"}
                className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                {embedded.expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              </button>
            ) : null}
            <button
              onClick={embedded.onClose}
              title="Close settings"
              className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </span>
        ) : isTauri() ? (
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
          {(["general", "database", "ai"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "border-b-2 pb-1 font-medium capitalize transition-colors",
                tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t === "database" ? "Database (Exasol)" : t === "ai" ? "AI" : "General"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Category tree */}
        <div className="w-60 shrink-0 overflow-auto border-r border-border p-2 [scrollbar-width:thin]">
          {cats.map((c) => {
            const RowIcon = c.icon ?? Settings2;
            return (
              <button
                key={c.key}
                onClick={() => {
                  if (c.tab !== tab) setTab(c.tab);
                  setSelected(c.key);
                }}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12.5px] transition-colors",
                  selected === c.key ? "bg-secondary font-medium text-foreground" : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                )}
              >
                <RowIcon className={cn("h-4 w-4 shrink-0", selected === c.key ? "text-primary" : "opacity-70")} />
                {c.label}
              </button>
            );
          })}
          {cats.length === 0 ? <p className="px-2 py-4 text-[12px] text-muted-foreground">No matches.</p> : null}
        </div>

        {/* Detail pane */}
        <div className="min-w-0 flex-1 overflow-auto p-6 [scrollbar-width:thin]">
          {current ? (
            <div className="mx-auto max-w-xl">
              <h2 className="text-[15px] font-bold">{current.label}</h2>
              <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">{current.desc}</p>
              {current.key === "personalization" ? (
                <div className="mt-4">
                  <AiPersonalization />
                </div>
              ) : (
                <>
                  <div className="mt-5 space-y-5">
                    {current.controls.map((ct) => (
                      <ControlRow key={ct.key} ctrl={ct} value={values[ct.key]} onChange={(v) => update(ct.key, v)} />
                    ))}
                  </div>
                  <SettingPreview catKey={current.key} values={values} />
                  {current.key === "sqlEditor" ? (
                    <div className="mt-7">
                      <div className="text-[13px] font-semibold text-foreground">Syntax colors</div>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                        Recolor each token — keywords, strings, numbers, comments, functions, operators, punctuation, identifiers — separately for the dark and light editor themes. Applies to open editors immediately.
                      </p>
                      <SyntaxColorsEditor values={values} onChange={updateMany} />
                    </div>
                  ) : null}
                  {current.key === "appearance" ? (
                    <div className="mt-5">
                      <div className="text-[13px] text-foreground">Color theme</div>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                        Preset palettes and corner radius — applies to light and dark mode. Also available from the palette button in the title bar.
                      </p>
                      <div className="mt-2 overflow-hidden rounded-xl border border-border">
                        <ThemePresetPicker />
                      </div>
                    </div>
                  ) : null}
                </>
              )}
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

/**
 * Per-token syntax color editor for the Monaco SQL editor: one row per syntax
 * role, a swatch + hex field for each theme, and a live preview on both the
 * dark and light editor backgrounds. Changes broadcast via settings:changed,
 * so open editors recolor immediately.
 */
function SyntaxColorsEditor({
  values,
  onChange,
}: {
  values: Record<string, SettingValue>;
  onChange: (patch: Record<string, SettingValue>) => void;
}) {
  const themes = ["dark", "light"] as const;
  const colorOf = (t: "dark" | "light", role: SyntaxRoleKey) =>
    sanitizeHex(values[syntaxSettingKey(t, role)]) ?? SYNTAX_DEFAULTS[t][role];

  function resetColors() {
    onChange(
      Object.fromEntries(
        themes.flatMap((t) => SYNTAX_ROLES.map((r) => [syntaxSettingKey(t, r.key), SYNTAX_DEFAULTS[t][r.key]])),
      ),
    );
  }

  return (
    <div className="mt-5">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-6 gap-y-2">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Token</div>
        {themes.map((t) => (
          <div key={t} className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t === "dark" ? "Dark" : "Light"}
          </div>
        ))}
        {SYNTAX_ROLES.map((role) => (
          <div key={role.key} className="contents">
            <div className="text-[13px] text-foreground">{role.label}</div>
            {themes.map((t) => {
              const key = syntaxSettingKey(t, role.key);
              const raw = String(values[key] ?? SYNTAX_DEFAULTS[t][role.key]);
              const hex = sanitizeHex(raw) ?? SYNTAX_DEFAULTS[t][role.key];
              return (
                <div key={t} className="flex items-center gap-1.5">
                  <ColorPicker label={`${role.label} — ${t} theme`} value={hex} onChange={(next) => onChange({ [key]: next })} />
                  <input
                    value={raw}
                    onChange={(e) => onChange({ [key]: e.target.value })}
                    spellCheck={false}
                    className={cn(
                      "h-7 w-[4.8rem] rounded-md border bg-panel px-1.5 font-mono text-[11px] outline-none focus:border-primary/50",
                      sanitizeHex(raw) ? "border-border" : "border-red-500/60",
                    )}
                  />
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <button
        onClick={resetColors}
        className="mt-4 h-7 rounded-md border border-border px-3 text-[12px] text-muted-foreground hover:text-foreground"
      >
        Reset colors to defaults
      </button>

      <div className="mt-6">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Live preview</div>
        <div className="grid grid-cols-2 gap-3">
          {themes.map((t) => {
            const c = (role: SyntaxRoleKey) => colorOf(t, role);
            return (
              <div
                key={t}
                className="overflow-x-auto rounded-lg border border-border p-3"
                style={{ background: t === "dark" ? "#0a0a0b" : "#ffffff" }}
              >
                <pre className="m-0 font-mono text-[11px] leading-relaxed">
                  <span style={{ color: c("comment"), fontStyle: "italic" }}>-- top customers</span>
                  {"\n"}
                  <span style={{ color: c("keyword"), fontWeight: 700 }}>SELECT</span>{" "}
                  <span style={{ color: c("identifier") }}>"Name"</span>
                  <span style={{ color: c("punctuation") }}>,</span> <span style={{ color: c("function") }}>ROUND</span>
                  <span style={{ color: c("punctuation") }}>(</span>
                  <span style={{ color: c("identifier") }}>revenue</span>
                  <span style={{ color: c("punctuation") }}>,</span> <span style={{ color: c("number") }}>2</span>
                  <span style={{ color: c("punctuation") }}>)</span>
                  {"\n"}
                  <span style={{ color: c("keyword"), fontWeight: 700 }}>FROM</span>{" "}
                  <span style={{ color: c("identifier") }}>customers</span>{" "}
                  <span style={{ color: c("keyword"), fontWeight: 700 }}>WHERE</span>{" "}
                  <span style={{ color: c("identifier") }}>tier</span> <span style={{ color: c("operator") }}>=</span>{" "}
                  <span style={{ color: c("string") }}>'gold'</span>
                  <span style={{ color: c("punctuation") }}>;</span>
                </pre>
                <div className="mt-2 text-[10px] font-medium capitalize" style={{ color: t === "dark" ? "#8a8a90" : "#64748b" }}>
                  {t}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
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
            <NumberInput
              value={Number(value)}
              min={ctrl.min}
              max={ctrl.max}
              onCommit={onChange}
              className="h-8 w-28 text-[12px]"
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
          <AppSelect value={String(value)} onChange={onChange} options={ctrl.options} className="h-8 w-52" ariaLabel={ctrl.label} />
        ) : ctrl.type === "radio" ? (
          ctrl.options.map((o) => (
            <label key={o.value} className="flex cursor-pointer items-center gap-2 text-[12.5px]">
              <input type="radio" checked={String(value) === o.value} onChange={() => onChange(o.value)} className="accent-[color:var(--primary)]" />
              {o.label}
            </label>
          ))
        ) : null}
      </div>
    </div>
  );
}

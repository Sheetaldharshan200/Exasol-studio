import { useEffect, useMemo, useState } from "react";
import { Copy, ExternalLink, Loader2, Waypoints, X } from "lucide-react";
import { CopyButton } from "@/components/ui/copy-button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { errorMessage, ipc, type VsPrereqs } from "@/lib/ipc";
import { VS_SOURCES, VS_DRIVER_BUCKET_PATH } from "@/features/connection/virtual-schema-sources";
import { SourceLogo } from "@/features/connection/SourceLogo";
import { cn } from "@/lib/utils";

const q = (s: string) => s.replace(/'/g, "''");

/**
 * Guided flow to create an Exasol virtual schema against an existing adapter
 * script — optionally creating the JDBC connection first. Generates and runs
 * the CREATE CONNECTION / CREATE VIRTUAL SCHEMA DDL.
 */
export function NewVirtualSchema({
  profileId,
  connectionName,
  onClose,
  onCreated,
  variant = "modal",
}: {
  profileId: string;
  connectionName: string;
  onClose: () => void;
  onCreated: () => void;
  variant?: "modal" | "page";
}) {
  const [prereqs, setPrereqs] = useState<VsPrereqs | null>(null);
  const [vsName, setVsName] = useState("");
  const [source, setSource] = useState<string>("");
  const [adapter, setAdapter] = useState("");
  const [connMode, setConnMode] = useState<"existing" | "new">("existing");
  const [existingConn, setExistingConn] = useState("");
  const [connName, setConnName] = useState("");
  const [jdbcUrl, setJdbcUrl] = useState("jdbc:postgresql://host:5432/database");
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [remoteSchema, setRemoteSchema] = useState("");
  const [catalog, setCatalog] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ipc
      .listVsPrereqs(profileId)
      .then((p) => {
        setPrereqs(p);
        if (p.adapters[0]) setAdapter(`${p.adapters[0].schema}.${p.adapters[0].name}`);
        if (p.connections[0]) setExistingConn(p.connections[0]);
        else setConnMode("new");
      })
      .catch((e) => setError(errorMessage(e)));
  }, [profileId]);

  const conn = connMode === "existing" ? existingConn : connName;
  const selected = useMemo(() => VS_SOURCES.find((s) => s.id === source), [source]);

  // Per-provider one-time driver + adapter install script (settings.cfg + the
  // two BucketFS uploads + the adapter script). Grounded in the dialect's own
  // driver identity — nothing generic.
  const installScript = useMemo(() => {
    if (!selected?.driverClass) return "";
    const db = selected.driverName ?? selected.id.toUpperCase();
    const adapterSchema = "ADAPTER";
    const scriptName = `${selected.id.toUpperCase()}_ADAPTER_SCRIPT`;
    return [
      `-- 1) Upload to BucketFS (from a shell): the ${selected.name} adapter JAR`,
      `--    (from github.com/${selected.repo.split(" ")[0]}/releases) and the JDBC`,
      `--    driver JAR${selected.driverMaven ? ` (Maven: ${selected.driverMaven})` : ""} into:`,
      `--    ${VS_DRIVER_BUCKET_PATH}/${db}/`,
      `-- 2) settings.cfg next to the driver JAR:`,
      `--    ${db}=driver_name=${db};jar=<driver>.jar;driverMain=${selected.driverClass};fetchSize=100000;insertSize=-1;prepared=1`,
      `-- 3) Register the adapter script:`,
      `CREATE SCHEMA IF NOT EXISTS ${adapterSchema};`,
      `CREATE OR REPLACE JAVA ADAPTER SCRIPT ${adapterSchema}.${scriptName} AS`,
      `  %scriptclass com.exasol.adapter.RequestDispatcher;`,
      `  %jar /buckets/bfsdefault/default/<adapter-dist>.jar;`,
      `  %jar ${VS_DRIVER_BUCKET_PATH}/${db}/<driver>.jar;`,
      `/`,
    ].join("\n");
  }, [selected]);

  const ddl = useMemo(() => {
    const stmts: string[] = [];
    if (connMode === "new" && connName.trim()) {
      stmts.push(
        `CREATE OR REPLACE CONNECTION ${connName.trim()} TO '${q(jdbcUrl)}' USER '${q(user)}' IDENTIFIED BY '${q(password)}';`,
      );
    }
    const props = [`CONNECTION_NAME = '${q(conn)}'`];
    if (remoteSchema.trim()) props.push(`SCHEMA_NAME = '${q(remoteSchema.trim())}'`);
    if (catalog.trim()) props.push(`CATALOG_NAME = '${q(catalog.trim())}'`);
    stmts.push(
      `CREATE VIRTUAL SCHEMA ${vsName.trim() || "<name>"} USING ${adapter || "<adapter>"}\n  WITH ${props.join("\n       ")};`,
    );
    return stmts.join("\n\n");
  }, [connMode, connName, jdbcUrl, user, password, conn, remoteSchema, catalog, vsName, adapter]);

  const canCreate = Boolean(vsName.trim() && adapter && conn && !busy);

  async function create() {
    if (!canCreate) return;
    setBusy(true);
    setError(null);
    try {
      const result = await ipc.executeSql(profileId, connectionName, ddl, 1, true);
      if (!result.success) {
        setError(result.results.find((r) => r.error)?.error ?? "Failed to create the virtual schema.");
        return;
      }
      onCreated();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const page = variant === "page";
  return (
    <div
      className={
        page
          ? "flex h-screen w-full flex-col bg-popover"
          : "absolute inset-0 z-50 flex items-center justify-center bg-black/55 p-6 backdrop-blur-sm"
      }
      onClick={page ? undefined : onClose}
    >
      <div
        className={
          page
            ? "flex h-full w-full flex-col overflow-hidden"
            : "flex max-h-[86vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-popover shadow-2xl"
        }
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-4"
          data-tauri-drag-region={page ? "" : undefined}
        >
          <Waypoints className="h-4 w-4 text-teal" />
          <span className="font-heading text-[14px] font-bold text-foreground">New virtual schema</span>
          <span className="text-xs text-muted-foreground">{connectionName}</span>
          <button
            onClick={onClose}
            aria-label="Close"
            className="ml-auto flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-2">
          <div className="min-h-0 overflow-auto border-r border-border p-4">
            <div className="grid gap-3">
              <p className="rounded-md border border-warning/40 bg-warning/10 px-2.5 py-1.5 text-[11px] leading-relaxed text-muted-foreground">
                Virtual schemas require a full or cloud Exasol deployment. They are not available on Exasol Personal{" "}
                <span className="font-medium">local</span> (macOS) yet — use an Exasol Personal <span className="font-medium">cloud</span>{" "}
                deployment, or a Docker/Podman Exasol (<span className="font-mono">exasol/docker-db</span>, or{" "}
                <span className="font-mono">exasol/nano</span> after <span className="font-mono">init slc install=all</span>).
              </p>
              <Field label="Source database">
                {(["jdbc", "document"] as const).map((group) => {
                  const items = VS_SOURCES.filter((s) => s.kind === group);
                  return (
                    <div key={group} className="mb-2">
                      <p className="mb-1 text-[9.5px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                        {group === "jdbc" ? "Databases" : "Document sources (advanced)"}
                      </p>
                      <div className="grid grid-cols-3 gap-1.5">
                        {items.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            title={s.note ?? s.name}
                            onClick={() => {
                              setSource(s.id);
                              if (s.jdbc) {
                                setJdbcUrl(s.jdbc);
                                setConnMode("new");
                              }
                            }}
                            className={cn(
                              "flex flex-col items-center gap-1 rounded-lg border px-1.5 py-2 text-center transition-colors",
                              source === s.id ? "border-primary/50 bg-primary/5" : "border-border hover:border-primary/30 hover:bg-secondary/40",
                            )}
                          >
                            <SourceLogo logo={s.logo} className="h-7 w-7" />
                            <span className="w-full truncate text-[10px] text-muted-foreground">{s.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
                <p className="mt-1.5 text-[10.5px] text-muted-foreground">
                  {selected
                    ? `Uses the ${selected.repo.split(" ")[0]} adapter.`
                    : "Pick a source to prefill the JDBC URL. Any JDBC database works via Generic JDBC."}
                </p>
              </Field>

              {/* Dynamic, per-provider driver + adapter install (one-time). */}
              {selected?.driverClass ? (
                <div className="rounded-lg border border-border bg-secondary/20 p-2.5">
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <SourceLogo logo={selected.logo} className="h-4 w-4" />
                    <span className="text-[11.5px] font-semibold text-foreground">{selected.name} driver &amp; adapter</span>
                    <span className="ml-auto rounded bg-primary/15 px-1.5 py-0.5 text-[9px] font-medium uppercase text-primary">one-time</span>
                  </div>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 font-mono text-[10.5px] text-muted-foreground">
                    <dt>Driver class</dt><dd className="truncate text-foreground/90" title={selected.driverClass}>{selected.driverClass}</dd>
                    {selected.driverMaven ? (<><dt>JDBC driver</dt><dd className="truncate text-foreground/90">{selected.driverMaven}</dd></>) : null}
                    <dt>BucketFS</dt><dd className="truncate text-foreground/90">{VS_DRIVER_BUCKET_PATH}/{selected.driverName}/</dd>
                  </dl>
                  <div className="mt-1.5 flex items-center gap-2">
                    <CopyButton
                      text={installScript}
                      label="Copy install steps"
                      iconClassName="h-3 w-3"
                      className="h-6 rounded-md border border-border px-1.5 text-[10.5px]"
                    >
                      Copy install steps
                    </CopyButton>
                    {selected.docs ? (
                      <a href={selected.docs} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[10.5px] text-primary hover:underline">
                        User guide <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : null}
                    {selected.driverMaven ? (
                      <a href={`https://central.sonatype.com/artifact/${selected.driverMaven.replace(":", "/")}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[10.5px] text-primary hover:underline">
                        Get driver JAR <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : null}
                  </div>
                </div>
              ) : null}
              <Field label="Virtual schema name">
                <Input value={vsName} onChange={(e) => setVsName(e.target.value)} placeholder="MY_PG" />
              </Field>
              <Field label="Adapter script">
                <Select value={adapter} onValueChange={setAdapter} disabled={!prereqs?.adapters.length}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={prereqs?.adapters.length ? "Select adapter" : "No adapter scripts found"} />
                  </SelectTrigger>
                  <SelectContent>
                    {prereqs?.adapters.map((a) => (
                      <SelectItem key={`${a.schema}.${a.name}`} value={`${a.schema}.${a.name}`}>
                        {a.schema}.{a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <div className="flex items-center gap-1 rounded-md border border-border p-0.5 text-[12px]">
                {(["existing", "new"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setConnMode(m)}
                    className={cn(
                      "flex-1 rounded px-2 py-1 font-medium capitalize transition-colors",
                      connMode === m ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {m} connection
                  </button>
                ))}
              </div>

              {connMode === "existing" ? (
                <Field label="Connection">
                  <Select value={existingConn} onValueChange={setExistingConn} disabled={!prereqs?.connections.length}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={prereqs?.connections.length ? "Select connection" : "No connections"} />
                    </SelectTrigger>
                    <SelectContent>
                      {prereqs?.connections.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              ) : (
                <>
                  <Field label="Connection name">
                    <Input value={connName} onChange={(e) => setConnName(e.target.value)} placeholder="PG_CONNECTION" />
                  </Field>
                  <Field label="JDBC URL">
                    <Input value={jdbcUrl} onChange={(e) => setJdbcUrl(e.target.value)} />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="User">
                      <Input value={user} onChange={(e) => setUser(e.target.value)} />
                    </Field>
                    <Field label="Password">
                      <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
                    </Field>
                  </div>
                </>
              )}

              <div className="grid grid-cols-2 gap-3">
                <Field label="Remote schema" optional>
                  <Input value={remoteSchema} onChange={(e) => setRemoteSchema(e.target.value)} placeholder="public" />
                </Field>
                <Field label="Catalog" optional>
                  <Input value={catalog} onChange={(e) => setCatalog(e.target.value)} placeholder="database" />
                </Field>
              </div>
            </div>
          </div>

          <div className="flex min-h-0 flex-col bg-editor">
            <div className="border-b border-border px-3 py-1.5">
              <span className="eyebrow-muted">Generated DDL</span>
            </div>
            <pre className="min-h-0 flex-1 overflow-auto p-3 font-mono text-[11.5px] whitespace-pre-wrap text-foreground/90">
              {ddl}
            </pre>
            {error ? (
              <div className="border-t border-destructive/40 bg-destructive/10 p-3 font-mono text-[11px] whitespace-pre-wrap text-destructive">
                {error}
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex h-12 shrink-0 items-center justify-end gap-2 border-t border-border px-4">
          <button
            onClick={onClose}
            className="h-8 rounded-md border border-border px-3 text-[13px] text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={create}
            disabled={!canCreate}
            className="cta-glow flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground hover:bg-primary/85 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Waypoints className="h-3.5 w-3.5" />}
            Create virtual schema
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  optional,
  children,
}: {
  label: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {label}
        {optional ? <span className="text-[10px] text-muted-foreground/60">optional</span> : null}
      </span>
      {children}
    </label>
  );
}

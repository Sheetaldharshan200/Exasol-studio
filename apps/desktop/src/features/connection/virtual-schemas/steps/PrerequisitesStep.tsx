import { useEffect, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { errorMessage, ipc, isTauri, type VsStageResult } from "@/lib/ipc";
import { cn } from "@/lib/utils";
import type { VsAdapter } from "../types.ts";
import type { Prerequisite } from "../prereqs.ts";
import { driverFileName } from "../prereqs.ts";
import { jdbcPrefix, jdbcSettingsCfg } from "../ddl.ts";

/**
 * Step 4: what is missing, and Studio installing it. On the managed local
 * Exasol the install writes into the deployment's /exa (the 2.3 guide's
 * mechanism); elsewhere the files must be uploaded to BucketFS by hand and
 * the user confirms the names.
 */
export function PrerequisitesStep({
  adapter,
  missing,
  managedLocal,
  jdbcUrl,
  userJarPath,
  onUserJarPath,
  adapterFile,
  onAdapterFile,
  staged,
  onStaged,
}: {
  adapter: VsAdapter;
  missing: Prerequisite[];
  managedLocal: boolean;
  /** The JDBC URL the connection will use — settings.cfg wants its prefix. */
  jdbcUrl?: string;
  userJarPath: string;
  onUserJarPath: (p: string) => void;
  /** Remote database only: the adapter file the user uploaded under vs/. */
  adapterFile: string;
  onAdapterFile: (name: string) => void;
  staged: VsStageResult | null;
  onStaged: (r: VsStageResult) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<{ line: string; level: string }[]>([]);
  const jobId = useRef(`vs-stage-${adapter.id}-${Date.now()}`);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isTauri()) return;
    let un: UnlistenFn | undefined;
    void listen<{ id: string; line: string; level: string }>("market:log", (e) => {
      if (e.payload.id === jobId.current) setLog((l) => [...l, { line: e.payload.line, level: e.payload.level }]);
    }).then((u) => (un = u));
    return () => un?.();
  }, []);
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [log]);

  const needsUserJar = adapter.driver?.source.manualUrl && missing.some((m) => m.kind === "driverJar");
  // A Lua adapter's source is fetched and inlined — nothing is written
  // anywhere, so Studio can fetch it for any database. Its JDBC driver (the
  // Databricks case) is another matter: on a remote database the user
  // registers that themselves, like every Java adapter's files.
  const isLua = adapter.runtime === "lua";
  const canInstall = managedLocal || isLua;
  const manualFiles = !managedLocal && (!isLua || Boolean(adapter.driver));

  async function install() {
    setBusy(true);
    setError(null);
    setLog([]);
    try {
      // Remote database: only the Lua source is fetched; nothing is staged.
      const driver = adapter.driver && managedLocal
        ? {
            name: adapter.driver.name,
            maven: adapter.driver.source.maven,
            userJarPath: adapter.driver.source.manualUrl ? userJarPath.trim() || undefined : undefined,
            settingsCfgTemplate: jdbcSettingsCfg({
              driverName: adapter.driver.name,
              prefix: jdbcUrl ? jdbcPrefix(jdbcUrl) : "jdbc:",
              mainClass: adapter.driver.class,
              jar: driverFileName(adapter) ?? "driver.jar",
            }),
          }
        : null;
      const result = await ipc.vsStageAdapter({
        jobId: jobId.current,
        repo: adapter.repo,
        assetPattern: adapter.release.asset,
        runtime: adapter.runtime,
        driver,
      });
      onStaged(result);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (missing.length === 0 || staged) {
    return (
      <div className="grid gap-2">
        <p className="flex items-center gap-2 text-[12px] text-foreground">
          <Check className="h-4 w-4 text-primary" /> Everything this source needs is in place.
        </p>
        {staged ? (
          <p className="text-[11px] text-muted-foreground">
            Adapter {staged.releaseTag} staged
            {staged.driverFile ? `, driver ${staged.driverFile} registered` : ""}
            {staged.javaSlcInstalled ? ", Java runtime installed" : ""}
            {staged.restarted ? " — the database was restarted once to apply it." : "."}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      <div>
        <p className="text-[12px] text-foreground">Before this source can be attached, Studio will {managedLocal ? "install" : "need"}:</p>
        <ul className="mt-1.5 grid gap-1">
          {missing.map((m) => (
            <li key={m.kind + m.label} className="flex items-start gap-2 text-[11.5px] text-muted-foreground">
              <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70" />
              <span>
                {m.label}
                {m.kind === "driverJar" && m.source === "user" && m.manualUrl ? (
                  <>
                    {" — "}
                    <a href={m.manualUrl} target="_blank" rel="noreferrer" className="text-primary underline">
                      download it from the vendor
                    </a>
                    , then give Studio the JAR:
                  </>
                ) : null}
                {m.kind === "javaSlc" ? " — the database restarts once to activate it." : null}
              </span>
            </li>
          ))}
        </ul>
      </div>
      {needsUserJar ? (
        <label className="grid gap-1 text-[11px] text-muted-foreground">
          <span>Path to the downloaded driver JAR on this computer</span>
          <input
            value={userJarPath}
            onChange={(e) => onUserJarPath(e.target.value)}
            placeholder="/Users/you/Downloads/SimbaJDBC42.jar"
            spellCheck={false}
            className="h-8 rounded-md border border-border bg-editor px-2 font-mono text-[12px] text-foreground"
          />
        </label>
      ) : null}
      {manualFiles ? (
        <div className="grid gap-2 rounded-md border border-border bg-panel/50 px-2.5 py-2 text-[11px] leading-relaxed text-muted-foreground">
          {isLua ? (
            <p>
              This Exasol is not the local one Studio manages. The adapter itself is fetched and inlined, but its {adapter.driver?.name} JDBC
              driver must be registered on that database by hand (upload the JAR under <span className="font-mono">/buckets/bfsdefault/default/vs/</span> and
              register it as a JDBC driver for IMPORT), then tell Studio the file name.
            </p>
          ) : (
            <p>
              This Exasol is not the local one Studio manages, so Studio cannot write into its BucketFS. Upload the adapter
              {adapter.driver ? " and driver JARs" : " JAR"} under <span className="font-mono">/buckets/bfsdefault/default/vs/</span> with the
              BucketFS panel (release <a href={`https://github.com/${adapter.repo}/releases`} target="_blank" rel="noreferrer" className="text-primary underline">{adapter.repo}</a>),
              make sure the Java script language is available, then tell Studio the file names so the adapter script points at them.
            </p>
          )}
          {!isLua ? (
            <label className="grid gap-1">
              <span>Adapter file name as uploaded</span>
              <input value={adapterFile} onChange={(e) => onAdapterFile(e.target.value)} placeholder="virtual-schema-dist-14.0.5-postgresql-4.0.2.jar" spellCheck={false}
                className="h-8 rounded-md border border-border bg-editor px-2 font-mono text-[12px] text-foreground" />
            </label>
          ) : null}
          {adapter.driver ? (
            <label className="grid gap-1">
              <span>Driver file name as uploaded</span>
              <input value={userJarPath} onChange={(e) => onUserJarPath(e.target.value)} placeholder="postgresql-42.7.4.jar" spellCheck={false}
                className="h-8 rounded-md border border-border bg-editor px-2 font-mono text-[12px] text-foreground" />
            </label>
          ) : null}
        </div>
      ) : null}
      {canInstall ? (
        <button
          type="button"
          data-agent-id="add-source.install"
          onClick={() => void install()}
          disabled={busy || (Boolean(needsUserJar) && !userJarPath.trim())}
          className="cta-glow inline-flex h-8 w-fit items-center gap-2 rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground hover:bg-primary/85 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {busy ? (managedLocal ? "Installing…" : "Fetching…") : managedLocal ? "Install and continue" : "Fetch the adapter and continue"}
        </button>
      ) : null}
      {log.length > 0 ? (
        <div ref={logRef} className="max-h-48 overflow-auto rounded-md border border-border bg-editor p-2 font-mono text-[11px] leading-relaxed">
          {log.map((l, i) => (
            <div key={i} className={cn("whitespace-pre-wrap", l.level === "err" && "text-destructive", l.level === "success" && "text-primary", (l.level === "info" || l.level === "out") && "text-foreground/80")}>
              {l.line}
            </div>
          ))}
        </div>
      ) : null}
      {error ? <p className="rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-1.5 text-[11.5px] text-destructive">{error}</p> : null}
    </div>
  );
}

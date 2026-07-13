import { useEffect, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { Check, FolderOpen, HardDriveUpload, Loader2, RefreshCcw, X } from "lucide-react";
import { errorMessage, ipc, isTauri, type ConnectionProfile } from "@/lib/ipc";
import { cn } from "@/lib/utils";

/**
 * Upload a virtual-schema driver (e.g. a JDBC jar or adapter archive) into
 * BucketFS, then optionally create the adapter script that references it.
 */
export function BucketFsPanel({
  profile,
  onClose,
}: {
  profile: ConnectionProfile;
  onClose: () => void;
}) {
  const [port, setPort] = useState(2580);
  const [tls, setTls] = useState(false);
  const [bucket, setBucket] = useState("default");
  const [writePassword, setWritePassword] = useState("");
  const [localPath, setLocalPath] = useState("");
  const [remotePath, setRemotePath] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadedPath, setUploadedPath] = useState<string | null>(null);

  // Adapter-script helper
  const [showAdapter, setShowAdapter] = useState(false);
  const [adapterSchema, setAdapterSchema] = useState("ADAPTER_SCHEMA");
  const [adapterName, setAdapterName] = useState("JDBC_ADAPTER");
  const [adapterSql, setAdapterSql] = useState("");
  const [adapterDone, setAdapterDone] = useState(false);

  const refreshList = async () => {
    setError(null);
    try {
      const list = await ipc.bucketfsList(profile.host, port, tls, bucket, undefined);
      setFiles(list);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  useEffect(() => {
    void refreshList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function pickFile() {
    if (!isTauri()) {
      setLocalPath("/path/to/driver.jar");
      if (!remotePath) setRemotePath("drivers/driver.jar");
      return;
    }
    const picked = await openDialog({
      multiple: false,
      filters: [{ name: "Driver / archive", extensions: ["jar", "zip", "tar", "gz", "so", "py"] }],
    });
    if (typeof picked === "string") {
      setLocalPath(picked);
      const base = picked.split("/").pop() ?? "driver.jar";
      if (!remotePath) setRemotePath(`drivers/${base}`);
    }
  }

  async function upload() {
    setBusy(true);
    setError(null);
    setUploadedPath(null);
    try {
      const path = await ipc.bucketfsUpload({
        host: profile.host,
        port,
        tls,
        bucket,
        remotePath,
        localPath,
        writePassword,
      });
      setUploadedPath(path);
      // Seed a sensible JDBC adapter script referencing the uploaded jar.
      setAdapterSql(
        `CREATE OR REPLACE JAVA ADAPTER SCRIPT ${adapterSchema}.${adapterName} AS\n` +
          `  %scriptclass com.exasol.adapter.RequestDispatcher;\n` +
          `  %jar ${path};\n/`,
      );
      await refreshList();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function createAdapter() {
    setBusy(true);
    setError(null);
    setAdapterDone(false);
    try {
      await ipc.executeSql(profile.id, profile.name, `CREATE SCHEMA IF NOT EXISTS ${adapterSchema};`, 1, false);
      await ipc.executeSql(profile.id, profile.name, adapterSql, 1, false);
      setAdapterDone(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const canUpload = Boolean(localPath && remotePath && writePassword) && !busy;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="max-h-[85vh] w-[560px] overflow-auto rounded-xl border border-border bg-popover shadow-2xl [scrollbar-width:thin]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <HardDriveUpload className="h-4 w-4 text-primary" />
          <span className="flex-1 text-[13px] font-semibold text-foreground">
            BucketFS — driver upload
            <span className="ml-1.5 font-mono text-[11px] text-muted-foreground">{profile.host}</span>
          </span>
          <button
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 p-4">
          <p className="rounded-md border border-warning/40 bg-warning/10 px-2.5 py-1.5 text-[11px] leading-relaxed text-muted-foreground">
            BucketFS &amp; virtual-schema adapters require a full or cloud Exasol deployment. Exasol Personal
            <span className="font-medium"> local</span> (macOS) does not support virtual schemas yet — use an Exasol Personal
            <span className="font-medium"> cloud</span> deployment, or a Docker/Podman Exasol (<span className="font-mono">exasol/docker-db</span>,
            or <span className="font-mono">exasol/nano</span> after <span className="font-mono">init slc install=all</span> — both have full BucketFS).
          </p>
          <div className="grid grid-cols-3 gap-2">
            <label className="text-[11px] text-muted-foreground">
              Port
              <input
                type="number"
                value={port}
                onChange={(e) => setPort(Number(e.target.value))}
                className="mt-0.5 h-8 w-full rounded-md border border-border bg-editor px-2 text-[13px] text-foreground"
              />
            </label>
            <label className="text-[11px] text-muted-foreground">
              Bucket
              <input
                value={bucket}
                onChange={(e) => setBucket(e.target.value)}
                className="mt-0.5 h-8 w-full rounded-md border border-border bg-editor px-2 text-[13px] text-foreground"
              />
            </label>
            <label className="flex items-end gap-1.5 pb-1.5 text-[11px] text-muted-foreground">
              <input type="checkbox" checked={tls} onChange={(e) => setTls(e.target.checked)} />
              HTTPS
            </label>
          </div>

          <label className="block text-[11px] text-muted-foreground">
            Bucket write password
            <input
              type="password"
              value={writePassword}
              onChange={(e) => setWritePassword(e.target.value)}
              placeholder="required to upload"
              className="mt-0.5 h-8 w-full rounded-md border border-border bg-editor px-2 text-[13px] text-foreground"
            />
          </label>

          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <span className="text-[11px] text-muted-foreground">Local file</span>
              <div className="mt-0.5 flex items-center gap-1.5">
                <input
                  value={localPath}
                  onChange={(e) => setLocalPath(e.target.value)}
                  placeholder="pick a .jar…"
                  className="h-8 min-w-0 flex-1 rounded-md border border-border bg-editor px-2 font-mono text-[12px] text-foreground"
                />
                <button
                  onClick={pickFile}
                  className="flex h-8 items-center gap-1 rounded-md border border-border px-2 text-[12px] text-muted-foreground hover:text-foreground"
                >
                  <FolderOpen className="h-3.5 w-3.5" /> Browse
                </button>
              </div>
            </div>
          </div>

          <label className="block text-[11px] text-muted-foreground">
            BucketFS path
            <input
              value={remotePath}
              onChange={(e) => setRemotePath(e.target.value)}
              placeholder="drivers/my-driver.jar"
              className="mt-0.5 h-8 w-full rounded-md border border-border bg-editor px-2 font-mono text-[12px] text-foreground"
            />
          </label>

          <div className="flex items-center gap-2">
            <button
              onClick={upload}
              disabled={!canUpload}
              className="cta-glow flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-[12px] font-medium text-primary-foreground hover:bg-primary/85 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <HardDriveUpload className="h-3.5 w-3.5" />}
              Upload to BucketFS
            </button>
            <button
              onClick={refreshList}
              className="flex h-8 items-center gap-1 rounded-md border border-border px-2 text-[12px] text-muted-foreground hover:text-foreground"
            >
              <RefreshCcw className="h-3.5 w-3.5" /> List
            </button>
          </div>

          {uploadedPath ? (
            <p className="flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-2 py-1.5 text-[11.5px] text-primary">
              <Check className="h-3.5 w-3.5" /> Uploaded — <span className="font-mono">{uploadedPath}</span>
            </p>
          ) : null}

          {files.length ? (
            <div className="rounded-md border border-border bg-editor p-2">
              <p className="mb-1 text-[10px] uppercase text-muted-foreground">In bucket “{bucket}”</p>
              <ul className="max-h-28 overflow-auto font-mono text-[11px] text-foreground/80 [scrollbar-width:thin]">
                {files.map((f) => (
                  <li key={f} className="truncate">
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* Adapter script */}
          <div className="border-t border-border pt-3">
            <button
              onClick={() => setShowAdapter((s) => !s)}
              className="text-[12px] font-medium text-foreground hover:text-primary"
            >
              {showAdapter ? "▾" : "▸"} Create adapter script (for virtual schemas)
            </button>
            {showAdapter ? (
              <div className="mt-2 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-[11px] text-muted-foreground">
                    Schema
                    <input
                      value={adapterSchema}
                      onChange={(e) => setAdapterSchema(e.target.value)}
                      className="mt-0.5 h-8 w-full rounded-md border border-border bg-editor px-2 font-mono text-[12px] text-foreground"
                    />
                  </label>
                  <label className="text-[11px] text-muted-foreground">
                    Adapter name
                    <input
                      value={adapterName}
                      onChange={(e) => setAdapterName(e.target.value)}
                      className="mt-0.5 h-8 w-full rounded-md border border-border bg-editor px-2 font-mono text-[12px] text-foreground"
                    />
                  </label>
                </div>
                <textarea
                  value={adapterSql}
                  onChange={(e) => setAdapterSql(e.target.value)}
                  rows={6}
                  placeholder="CREATE OR REPLACE JAVA ADAPTER SCRIPT …"
                  className="w-full rounded-md border border-border bg-editor p-2 font-mono text-[11.5px] text-foreground [scrollbar-width:thin]"
                />
                <button
                  onClick={createAdapter}
                  disabled={busy || !adapterSql.trim()}
                  className="flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-[12px] text-foreground hover:bg-secondary disabled:opacity-50"
                >
                  {adapterDone ? <Check className="h-3.5 w-3.5 text-primary" /> : null}
                  {adapterDone ? "Adapter created" : "Run CREATE ADAPTER SCRIPT"}
                </button>
              </div>
            ) : null}
          </div>

          {error ? <p className="text-[11.5px] text-destructive">{error}</p> : null}
        </div>
      </div>
    </div>
  );
}

// The connection's address as Studio really uses it, for the Properties
// header. For the native driver this mirrors connection.rs
// `build_connect_options` parameter for parameter; the password never shows.

export type UrlSource = {
  host: string;
  port: number | string;
  username?: string;
  schema?: string | null;
  sslMode?: string;
  compression?: boolean;
  driverId?: string;
  /** TLS certificate fingerprint, pinned as host/FINGERPRINT:port. */
  fingerprint?: string | null;
};

const DRIVER_LABEL: Record<string, string> = {
  jdbc: "Exasol JDBC",
  odbc: "Exasol ODBC",
  pyexasol: "PyExasol",
  sqlalchemy: "SQLAlchemy",
  "ts-js": "Exasol TS driver",
  "exarrow-rs": "exarrow (Arrow)",
  go: "Exasol Go driver",
};

const enc = (s: string) => encodeURIComponent(s);

export function connectionUrl(p: UrlSource): { url: string; driver: string } {
  const fp = p.fingerprint?.trim();
  const hostPart = `${p.host.trim()}${fp ? `/${fp}` : ""}:${p.port}`;
  const label = p.driverId ? DRIVER_LABEL[p.driverId] : undefined;
  if (label) {
    // Another driver builds its own URL; show what it connects to.
    const schema = p.schema?.trim();
    return { url: `${hostPart}${schema ? ` · schema ${schema}` : ""}`, driver: label };
  }
  const user = p.username?.trim() ? `${enc(p.username.trim())}:••••@` : "";
  const params: string[] = [];
  const ssl = p.sslMode ?? "preferred";
  if (ssl !== "preferred") params.push(`ssl-mode=${ssl}`);
  params.push(`compression=${p.compression ? "required" : "disabled"}`);
  const schema = p.schema?.trim();
  if (schema) params.push(`schema=${enc(schema)}`);
  return { url: `exa://${user}${hostPart}?${params.join("&")}`, driver: "Native websocket" };
}

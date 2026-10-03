// The address part of a connection: host ranges, the port, and filling the
// form from a pasted JDBC URL, pyexasol DSN or exa:// URL. Pure and tested.

export type HostCheck = { ok: true; hosts: string[] } | { ok: false; error: string };

const MAX_RANGE = 64;

/**
 * An Exasol host or host range, as the native driver reads it: `db1..4.example.com`
 * is db1 … db4 (the last ".." between digits, ascending). Lists with commas are
 * not something the driver accepts, so they are refused with the range form.
 */
export function checkHost(input: string): HostCheck {
  const host = input.trim().split("/")[0].trim();
  if (!host) return { ok: false, error: "Enter the host name or IP address of the database." };
  if (host.includes(",")) return { ok: false, error: "Separate hosts are not supported; write consecutive nodes as a range, like db1..4.example.com." };
  if (/\s/.test(host)) return { ok: false, error: "A host name has no spaces." };
  const i = host.lastIndexOf("..");
  if (i > 0 && /\d/.test(host[i - 1]) && /\d/.test(host[i + 2] ?? "")) {
    const prefix = host.slice(0, i).match(/^(.*?)(\d+)$/)!;
    const suffix = host.slice(i + 2).match(/^(\d+)(.*)$/)!;
    const start = Number(prefix[2]);
    const end = Number(suffix[1]);
    if (!(start < end)) return { ok: false, error: `A host range counts up: ${prefix[1]}${start}..${start + 1}…, not ${start}..${end}.` };
    if (end - start + 1 > MAX_RANGE) return { ok: false, error: `A host range of more than ${MAX_RANGE} nodes is almost certainly a typo.` };
    const width = prefix[2].length > String(start).length ? prefix[2].length : 0;
    const hosts = Array.from({ length: end - start + 1 }, (_, k) => `${prefix[1]}${String(start + k).padStart(width, "0")}${suffix[2]}`);
    return { ok: true, hosts };
  }
  return { ok: true, hosts: [host] };
}

export type PortCheck = { ok: true; port: number } | { ok: false; error: string };

export function checkPort(input: string | number): PortCheck {
  const s = String(input).trim();
  if (!/^\d+$/.test(s)) return { ok: false, error: "The port is a number (Exasol's default is 8563)." };
  const port = Number(s);
  if (port < 1 || port > 65535) return { ok: false, error: "The port must be between 1 and 65535 (Exasol's default is 8563)." };
  return { ok: true, port };
}

export type DsnFields = {
  host: string;
  port?: string;
  username?: string;
  schema?: string;
  fingerprint?: string;
  sslMode?: string;
};

/** host[/FINGERPRINT][:port], or [IPv6][:port] */
function hostPart(s: string): DsnFields {
  const v6 = /^\[([0-9A-Fa-f:.]+)\](?::(\d+))?$/.exec(s.trim());
  if (v6) return { host: v6[1], ...(v6[2] ? { port: v6[2] } : {}) };
  // A pin is plain hex or 32 colon-separated byte pairs; then ":port".
  const m = /^([^/:]+)(?:\/((?:[0-9A-Fa-f]{2}:){31}[0-9A-Fa-f]{2}|[0-9A-Fa-f]+))?(?::(\d+))?$/.exec(s.trim());
  if (!m) return { host: s.trim() };
  return { host: m[1], ...(m[2] ? { fingerprint: m[2].replace(/:/g, "").toUpperCase() } : {}), ...(m[3] ? { port: m[3] } : {}) };
}

/**
 * Fill the form from a pasted address: a JDBC URL (`jdbc:exa:host:8563;schema=S;user=U`),
 * an exa:// URL, or a pyexasol DSN (`host/FP:8563`). Passwords are never read
 * from a paste. Null when the text is none of these.
 */
export function parseDsn(text: string): DsnFields | null {
  const t = text.trim();
  if (!t) return null;
  const jdbc = /^jdbc:exa:([^;]+)(;.*)?$/i.exec(t);
  if (jdbc) {
    const out = hostPart(jdbc[1]);
    for (const kv of (jdbc[2] ?? "").split(";").filter(Boolean)) {
      const [k, ...rest] = kv.split("=");
      const v = rest.join("=").trim();
      const key = k.trim().toLowerCase();
      if (key === "schema" && v) out.schema = v;
      else if (key === "user" && v) out.username = v;
      else if (key === "fingerprint" && v) out.fingerprint = v.replace(/:/g, "").toUpperCase();
      else if (key === "validateservercertificate" && v === "0") out.sslMode = "required";
    }
    return out;
  }
  if (/^exa:\/\//i.test(t)) {
    try {
      const u = new URL(t.replace(/^exa:/i, "http:"));
      const out: DsnFields = { host: decodeURIComponent(u.hostname) };
      if (u.port) out.port = u.port;
      if (u.username) out.username = decodeURIComponent(u.username);
      const path = decodeURIComponent(u.pathname.replace(/^\//, ""));
      const schema = u.searchParams.get("schema") ?? path;
      if (schema) out.schema = schema;
      const ssl = u.searchParams.get("ssl-mode");
      if (ssl) out.sslMode = ssl;
      return out;
    } catch {
      return null;
    }
  }
  // pyexasol DSN: one host (or range), an optional pin, and a port.
  if (/[:/]/.test(t)) {
    const out = hostPart(t);
    if ((/^[\w.-]+$/.test(out.host) || t.startsWith("[")) && (out.port || out.fingerprint)) return out;
  }
  return null;
}

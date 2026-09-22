/**
 * TS driver bridge — runs statements through @exasol/exasol-driver-ts, the
 * official Exasol TypeScript driver, and answers on stdout in exactly the
 * JSON shape the Python bridge uses (driver_exec.rs parses both).
 *
 * Native by construction: the app already bundles a Node runtime AND this
 * driver, so choosing the TS driver for a connection installs nothing and
 * shells out to nothing the user has to provide.
 *
 * Reads one JSON request on stdin, writes one JSON response on stdout:
 *   in : { host, port, user, password, schema?, tls?, verify?, maxRows?, statements[] }
 *   out: { results: [{ statement, kind, columns, rows, rowCount, truncated, elapsedMs, error }] }
 *   or : { fatal: "<message>" }
 */

import { ExasolDriver, type ExaWebsocket } from "@exasol/exasol-driver-ts";
import { WebSocket } from "ws";

type Cell = string | number | boolean | null;

type Request = {
  host: string;
  port: number;
  user: string;
  password: string;
  schema?: string;
  tls?: boolean;
  verify?: boolean;
  maxRows?: number;
  statements?: string[];
};

type Entry = {
  statement: string;
  kind: "resultSet" | "rowCount";
  columns: { name: string; typeName: string }[];
  rows: Cell[][];
  rowCount: number;
  truncated: boolean;
  elapsedMs: number;
  error: string | null;
};

/**
 * The driver rejects with PLAIN OBJECTS from the websocket protocol, not
 * Error instances — `String(e)` on those yields "[object Object]" and throws
 * away the database's actual message. Pure so it is tested.
 */
export function errorText(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === "string") return e;
  if (e && typeof e === "object") {
    const o = e as Record<string, unknown>;
    const text = [o.message, o.text, o.error, o.exception].find((v) => typeof v === "string" && v) as string | undefined;
    const code = [o.sqlCode, o.code, o.errorCode].find((v) => typeof v === "string" || typeof v === "number");
    if (text) return code ? `${code}: ${text}` : text;
    try {
      return JSON.stringify(e);
    } catch {
      /* circular — fall through */
    }
  }
  return String(e);
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let buf = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (buf += c));
    process.stdin.on("end", () => resolve(buf));
    process.stdin.on("error", reject);
  });
}

/**
 * Exasol's websocket protocol returns result-set data COLUMN-major
 * (`data[column][row]`); the results grid wants rows. Pure so it is tested.
 */
export function toRows(data: Cell[][] | undefined, numColumns: number, rowsInMessage: number): Cell[][] {
  const rows: Cell[][] = [];
  for (let r = 0; r < rowsInMessage; r++) {
    const row: Cell[] = [];
    for (let c = 0; c < numColumns; c++) row.push(data?.[c]?.[r] ?? null);
    rows.push(row);
  }
  return rows;
}

/** One statement's outcome, derived from the driver's RAW protocol response. */
export type Mapped = {
  kind: "resultSet" | "rowCount";
  columns: { name: string; typeName: string }[];
  rows: Cell[][];
  rowCount: number;
  truncated: boolean;
  error: string | null;
};

/**
 * Map the raw protocol response. The envelope carries `status` and
 * `exception` — ignoring them made a failed statement (a SELECT on a missing
 * table) report SUCCESS with 0 rows, which a live run caught. Pure so every
 * branch is tested.
 */
export function mapRawResult(raw: unknown, maxRows: number): Mapped {
  const base: Mapped = { kind: "rowCount", columns: [], rows: [], rowCount: 0, truncated: false, error: null };
  const env = raw as
    | { status?: string; exception?: unknown; responseData?: { results?: unknown[] } }
    | undefined;
  if (!env) return { ...base, error: "the driver returned no response" };
  if (env.status === "error" || env.exception) {
    return { ...base, error: errorText(env.exception ?? { message: "the database rejected the statement" }) };
  }
  const first = env.responseData?.results?.[0] as
    | { resultType?: string; rowCount?: number; resultSet?: { columns?: { name: string; dataType?: { type?: string } }[]; data?: Cell[][]; numColumns?: number; numRows?: number; numRowsInMessage?: number } }
    | undefined;
  if (!first) return { ...base, error: "the driver returned no result for this statement" };
  if (first.resultType === "resultSet" && first.resultSet) {
    const rs = first.resultSet;
    const columns = (rs.columns ?? []).map((c) => ({ name: c.name, typeName: c.dataType?.type ?? "" }));
    const rows = toRows(rs.data, rs.numColumns ?? columns.length, Math.min(rs.numRowsInMessage ?? 0, maxRows));
    return {
      kind: "resultSet",
      columns,
      rows,
      rowCount: rows.length,
      // Rows beyond this message are not fetched — say so rather than
      // silently returning a short result.
      truncated: (rs.numRows ?? rows.length) > rows.length,
      error: null,
    };
  }
  return { ...base, rowCount: first.rowCount ?? 0 };
}

async function main(): Promise<void> {
  let req: Request;
  try {
    req = JSON.parse(await readStdin()) as Request;
  } catch (e) {
    process.stdout.write(JSON.stringify({ fatal: `bad request: ${errorText(e)}` }));
    return;
  }

  const maxRows = Math.max(1, Number(req.maxRows ?? 1000));
  const verify = req.verify === true;
  const driver = new ExasolDriver(
    (url) => new WebSocket(url, { rejectUnauthorized: verify }) as unknown as ExaWebsocket,
    {
      host: req.host,
      port: req.port,
      user: req.user,
      password: req.password,
      encryption: req.tls !== false,
      autocommit: true,
      clientName: "Exasol Studio (TS driver)",
      // Cap server-side so a runaway SELECT cannot stream unbounded rows.
      resultSetMaxRows: maxRows,
      schema: req.schema || undefined,
    },
  );

  const results: Entry[] = [];
  try {
    await driver.connect();
    for (const statement of req.statements ?? []) {
      const started = Date.now();
      const entry: Entry = {
        statement,
        kind: "rowCount",
        columns: [],
        rows: [],
        rowCount: 0,
        truncated: false,
        elapsedMs: 0,
        error: null,
      };
      try {
        // RAW mode: the protocol itself says resultSet vs rowCount, so the
        // bridge never has to guess from the statement text.
        const raw = await driver.query(statement, undefined, undefined, "raw");
        Object.assign(entry, mapRawResult(raw, maxRows));
      } catch (e) {
        entry.error = errorText(e);
      }
      entry.elapsedMs = Date.now() - started;
      results.push(entry);
      if (entry.error) break;
    }
  } catch (e) {
    process.stdout.write(JSON.stringify({ fatal: errorText(e) }));
    return;
  } finally {
    await driver.close().catch(() => undefined);
  }
  process.stdout.write(JSON.stringify({ results }));
}

// Only run when executed as the bridge — importing it for tests must not
// block on stdin.
if (process.env.EXA_DRIVER_BRIDGE_TEST !== "1") {
  void main();
}

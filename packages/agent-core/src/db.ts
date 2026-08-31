import { ExasolDriver, type ExaWebsocket } from "@exasol/exasol-driver-ts";
import { WebSocket } from "ws";
import { log } from "./log.ts";

/**
 * Registered database connections, held IN MEMORY ONLY. The desktop app's
 * Rust side decrypts profiles and registers them server-to-server; secrets
 * never touch the webview and are never written to disk here.
 */
export type DbConnectionInfo = {
  id: string;
  name: string;
  host: string;
  port: number;
  user: string;
  password: string;
  encryption?: boolean;
  schema?: string;
};

export type QueryOutput = {
  columns: string[];
  rows: unknown[][];
  rowCount: number;
  truncated: boolean;
};

/** Rows returned to the model are capped hard — context is precious. */
const MODEL_ROW_CAP = 50;
/** Driver-level ceiling — protects memory on runaway SELECTs. */
const FETCH_ROW_CAP = 200_000;

export class DbRegistry {
  private conns = new Map<string, DbConnectionInfo>();
  private drivers = new Map<string, ExasolDriver>();

  register(info: DbConnectionInfo) {
    this.conns.set(info.id, info);
    // Drop any cached driver for this id so new credentials take effect.
    const old = this.drivers.get(info.id);
    if (old) {
      this.drivers.delete(info.id);
      void old.close().catch(() => undefined);
    }
    log.info("connection registered", { id: info.id, name: info.name, host: info.host });
  }

  get(id: string): DbConnectionInfo | undefined {
    return this.conns.get(id);
  }

  list(): { id: string; name: string }[] {
    return [...this.conns.values()].map((c) => ({ id: c.id, name: c.name }));
  }

  private makeDriver(info: DbConnectionInfo, opts?: { autocommit?: boolean }): ExasolDriver {
    return new ExasolDriver(
      (url) =>
        // Local/self-signed deployments (Exasol Personal) need TLS
        // verification off; the connection never leaves this machine
        // unless the user pointed it elsewhere on purpose.
        new WebSocket(url, { rejectUnauthorized: false }) as unknown as ExaWebsocket,
      {
        host: info.host,
        port: info.port,
        user: info.user,
        password: info.password,
        encryption: info.encryption ?? true,
        autocommit: opts?.autocommit ?? true,
        clientName: "Exasol Studio Agent",
        fetchSize: 128 * 1024,
        resultSetMaxRows: FETCH_ROW_CAP,
        schema: info.schema || undefined,
      },
    );
  }

  /**
   * Run a bulk load on a DEDICATED autocommit-off connection: every statement
   * joins ONE transaction, committed once at the end (far fewer commit fsyncs
   * than per-batch autocommit) and rolled back atomically on failure. The
   * connection is closed either way — the shared pool driver is untouched.
   */
  async bulkLoad<T>(id: string, work: (execute: (sql: string) => Promise<number>) => Promise<T>): Promise<T> {
    const info = this.conns.get(id);
    if (!info) throw new Error(`No connection "${id}" registered with the agent`);
    const driver = this.makeDriver(info, { autocommit: false });
    await driver.connect();
    const execute = (sql: string): Promise<number> => driver.execute(sql);
    try {
      const out = await work(execute);
      await driver.execute("COMMIT");
      return out;
    } catch (e) {
      await driver.execute("ROLLBACK").catch(() => undefined);
      throw e;
    } finally {
      void driver.close().catch(() => undefined);
    }
  }

  /** Get (or lazily open) the shared driver for a connection. */
  async driver(id: string): Promise<ExasolDriver> {
    const info = this.conns.get(id);
    if (!info) throw new Error(`No connection "${id}" registered with the agent`);
    const cached = this.drivers.get(id);
    if (cached) return cached;
    const driver = this.makeDriver(info);
    await driver.connect();
    this.drivers.set(id, driver);
    return driver;
  }

  /** Run a read query and shape the result for the model. */
  async query(id: string, sql: string): Promise<QueryOutput> {
    const run = async () => {
      const d = await this.driver(id);
      return d.query(sql);
    };
    let result;
    try {
      result = await run();
    } catch (e) {
      // One retry on a fresh connection — sessions die (idle timeout, DB
      // restart) and the model shouldn't see transient plumbing errors.
      if (isConnectionError(e)) {
        this.dropDriver(id);
        result = await run();
      } else {
        throw e;
      }
    }
    const columns = result.getColumns().map((c) => c.name);
    const all = result.getRows();
    const rows = all.slice(0, MODEL_ROW_CAP).map((r) => columns.map((c) => r[c] ?? null));
    return {
      columns,
      rows,
      rowCount: all.length,
      truncated: all.length > MODEL_ROW_CAP || all.length === FETCH_ROW_CAP,
    };
  }

  /** Full-result query for internal consumers (KB crawler) — no model cap. */
  async queryAll(id: string, sql: string): Promise<QueryOutput> {
    const d = await this.driver(id);
    const result = await d.query(sql);
    const columns = result.getColumns().map((c) => c.name);
    const all = result.getRows();
    return {
      columns,
      rows: all.map((r) => columns.map((c) => r[c] ?? null)),
      rowCount: all.length,
      truncated: all.length === FETCH_ROW_CAP,
    };
  }

  /** Run DDL/DML; returns affected row count. */
  async execute(id: string, sql: string): Promise<number> {
    try {
      const d = await this.driver(id);
      return await d.execute(sql);
    } catch (e) {
      if (isConnectionError(e)) {
        this.dropDriver(id);
        const d = await this.driver(id);
        return d.execute(sql);
      }
      throw e;
    }
  }

  /**
   * Run a statement sequence on ONE session (the driver holds a single
   * connection) — used for profiling, which spans ALTER SESSION + query +
   * statistics reads.
   */
  async sameSession<T>(id: string, fn: (d: ExasolDriver) => Promise<T>): Promise<T> {
    const d = await this.driver(id);
    return fn(d);
  }

  private dropDriver(id: string) {
    const d = this.drivers.get(id);
    this.drivers.delete(id);
    if (d) void d.close().catch(() => undefined);
  }
}

function isConnectionError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /closed|socket|connection|ECONNREFUSED|EPIPE|timeout/i.test(msg);
}

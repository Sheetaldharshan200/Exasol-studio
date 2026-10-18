/**
 * Exasol administration DDL builders — users, roles, privileges, sessions.
 * Verified against docs.exasol.com (CREATE USER / ALTER USER / GRANT):
 *   - passwords are double-quoted identifiers (`IDENTIFIED BY "pw"`)
 *   - GRANT <sys priv> TO g · GRANT <priv> ON <obj> TO g · GRANT role TO g
 *     [WITH ADMIN OPTION] — REVOKE mirrors with FROM
 * Every builder returns the exact SQL that will run, so the UI can show it
 * to the user before executing (inspect-before-run).
 */

/** Quote an identifier: simple ALL-CAPS names stay bare, anything else is
 *  double-quoted with internal quotes doubled. */
export function ident(name: string): string {
  const trimmed = name.trim();
  if (/^[A-Za-z][A-Za-z0-9_]*$/.test(trimmed)) return trimmed.toUpperCase();
  return `"${trimmed.replace(/"/g, '""')}"`;
}

/** Passwords are delimited identifiers in Exasol — always double-quoted. */
export function pwd(secret: string): string {
  return `"${secret.replace(/"/g, '""')}"`;
}

/** String literal (comments). */
export function lit(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

export const dbaSql = {
  createUser: (name: string, password: string) => `CREATE USER ${ident(name)} IDENTIFIED BY ${pwd(password)}`,
  grantCreateSession: (name: string) => `GRANT CREATE SESSION TO ${ident(name)}`,
  changePassword: (name: string, password: string) => `ALTER USER ${ident(name)} IDENTIFIED BY ${pwd(password)}`,
  renameUser: (from: string, to: string) => `RENAME USER ${ident(from)} TO ${ident(to)}`,
  commentUser: (name: string, comment: string) =>
    comment.trim() ? `COMMENT ON USER ${ident(name)} IS ${lit(comment)}` : `COMMENT ON USER ${ident(name)} IS ''`,
  dropUser: (name: string, cascade: boolean) => `DROP USER ${ident(name)}${cascade ? " CASCADE" : ""}`,

  createRole: (name: string) => `CREATE ROLE ${ident(name)}`,
  dropRole: (name: string, cascade: boolean) => `DROP ROLE ${ident(name)}${cascade ? " CASCADE" : ""}`,

  grantRole: (role: string, grantee: string, admin: boolean) =>
    `GRANT ${ident(role)} TO ${ident(grantee)}${admin ? " WITH ADMIN OPTION" : ""}`,
  revokeRole: (role: string, grantee: string) => `REVOKE ${ident(role)} FROM ${ident(grantee)}`,

  // System privileges are keywords, not identifiers — validated against the
  // curated list below before splicing.
  grantSysPriv: (priv: string, grantee: string) => `GRANT ${priv} TO ${ident(grantee)}`,
  revokeSysPriv: (priv: string, grantee: string) => `REVOKE ${priv} FROM ${ident(grantee)}`,

  grantObjPriv: (priv: string, schema: string, object: string | null, grantee: string) =>
    `GRANT ${priv} ON ${object ? `${ident(schema)}.${ident(object)}` : `SCHEMA ${ident(schema)}`} TO ${ident(grantee)}`,
  revokeObjPriv: (priv: string, objectRef: string, grantee: string) =>
    `REVOKE ${priv} ON ${objectRef} FROM ${ident(grantee)}`,

  killSession: (sessionId: string) => `KILL SESSION ${sessionId.replace(/[^0-9]/g, "")}`,
  /** Cancels the running statement only: the session and its transaction stay. */
  killStatement: (sessionId: string) => `KILL STATEMENT IN SESSION ${sessionId.replace(/[^0-9]/g, "")}`,
};

/** Statements running now, longest first (DURATION is h:mm:ss text, so
 *  the order is by the parsed seconds). */
export const RUNNING_SQL = `SELECT SESSION_ID, USER_NAME, COMMAND_NAME, DURATION, ACTIVITY, SQL_TEXT
FROM SYS.EXA_DBA_SESSIONS
WHERE STATUS = 'EXECUTE SQL' AND SESSION_ID <> CURRENT_SESSION
ORDER BY TO_NUMBER(REGEXP_SUBSTR(DURATION, '^[0-9]+')) * 3600
       + TO_NUMBER(REGEXP_SUBSTR(DURATION, '[0-9]+', 1, 2)) * 60
       + TO_NUMBER(REGEXP_SUBSTR(DURATION, '[0-9]+', 1, 3)) DESC`;

/** Transaction conflicts still waiting (no stop time), oldest first. */
export const LOCKS_SQL = `SELECT SESSION_ID, CONFLICT_SESSION_ID, START_TIME, CONFLICT_TYPE, CONFLICT_OBJECTS, CONFLICT_INFO
FROM EXA_STATISTICS.EXA_DBA_TRANSACTION_CONFLICTS
WHERE STOP_TIME IS NULL
ORDER BY START_TIME`;

/** Curated system privileges (docs.exasol.com/database_concepts/privileges),
 *  grouped for the picker. */
export const SYS_PRIVS: { group: string; privs: string[] }[] = [
  { group: "Session", privs: ["CREATE SESSION", "KILL ANY SESSION"] },
  {
    group: "Schemas & objects",
    privs: [
      "CREATE SCHEMA", "ALTER ANY SCHEMA", "DROP ANY SCHEMA", "USE ANY SCHEMA",
      "CREATE TABLE", "CREATE ANY TABLE", "ALTER ANY TABLE", "DROP ANY TABLE",
      "SELECT ANY TABLE", "INSERT ANY TABLE", "UPDATE ANY TABLE", "DELETE ANY TABLE",
      "CREATE VIEW", "CREATE ANY VIEW", "DROP ANY VIEW",
      "CREATE FUNCTION", "CREATE ANY FUNCTION", "DROP ANY FUNCTION", "EXECUTE ANY FUNCTION",
      "CREATE SCRIPT", "CREATE ANY SCRIPT", "DROP ANY SCRIPT", "EXECUTE ANY SCRIPT",
    ],
  },
  {
    group: "Users, roles & security",
    privs: [
      "CREATE USER", "ALTER USER", "DROP USER",
      "CREATE ROLE", "DROP ANY ROLE", "GRANT ANY ROLE",
      "GRANT ANY PRIVILEGE", "GRANT ANY OBJECT PRIVILEGE",
      "IMPERSONATE ANY USER",
    ],
  },
  {
    group: "Connections & data movement",
    privs: ["CREATE CONNECTION", "ALTER ANY CONNECTION", "DROP ANY CONNECTION", "USE ANY CONNECTION", "IMPORT", "EXPORT"],
  },
];

export const ALL_SYS_PRIVS = new Set(SYS_PRIVS.flatMap((g) => g.privs));

/** Object privileges by target kind (docs: GRANT object privilege table). */
export const OBJ_PRIVS_SCHEMA = ["USAGE", "SELECT", "INSERT", "UPDATE", "DELETE", "ALTER", "EXECUTE"] as const;
export const OBJ_PRIVS_TABLE = ["SELECT", "INSERT", "UPDATE", "DELETE", "REFERENCES"] as const;

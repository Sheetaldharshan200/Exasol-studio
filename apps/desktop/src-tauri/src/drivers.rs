use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DriverInfo {
    pub id: &'static str,
    pub name: &'static str,
    pub protocol: &'static str,
    pub description: &'static str,
    pub default_port: u16,
    /// "native" drivers connect from inside Exasol Studio; "external" entries
    /// document drivers Exasol ships for other runtimes.
    pub kind: &'static str,
    pub is_default: bool,
    pub docs_url: &'static str,
}

/// Connectivity options Exasol provides. `sqlx-exasol` is the native driver used
/// by Exasol Studio; the rest are listed for completeness and external tooling.
pub const DRIVERS: &[DriverInfo] = &[
    DriverInfo {
        id: "sqlx-exasol",
        name: "Native (WebSocket)",
        protocol: "Exasol WebSocket protocol",
        description: "Built-in Rust driver — powers browsing, metadata and queries. Recommended.",
        default_port: 8563,
        kind: "native",
        is_default: true,
        docs_url: "https://github.com/bobozaur/sqlx-exasol",
    },
    DriverInfo {
        id: "pyexasol",
        name: "PyExasol",
        protocol: "Python (HTTP transport)",
        description: "Official Python driver — fast HTTP transport & compression. Great for bulk.",
        default_port: 8563,
        kind: "external",
        is_default: false,
        docs_url: "https://github.com/exasol/pyexasol",
    },
    DriverInfo {
        id: "sqlalchemy",
        name: "SQLAlchemy",
        protocol: "exa+websocket:// (SQLAlchemy dialect)",
        description: "Official SQLAlchemy dialect for Python tools and pandas.",
        default_port: 8563,
        kind: "external",
        is_default: false,
        docs_url: "https://github.com/exasol/sqlalchemy-exasol",
    },
    DriverInfo {
        id: "jdbc",
        name: "JDBC",
        protocol: "jdbc:exa:<host>:<port>",
        description: "Official Exasol JDBC driver (runs via a managed JRE). Good for bulk/ETL.",
        default_port: 8563,
        kind: "external",
        is_default: false,
        docs_url: "https://docs.exasol.com/db/latest/connect_exasol/drivers/jdbc.htm",
    },
    DriverInfo {
        id: "odbc",
        name: "ODBC",
        protocol: "DSN (EXAHOST/EXAUID/EXAPWD)",
        description: "Exasol ODBC driver (requires the OS ODBC driver installed).",
        default_port: 8563,
        kind: "external",
        is_default: false,
        docs_url: "https://docs.exasol.com/db/latest/connect_exasol/drivers/odbc.htm",
    },
];

#[tauri::command]
pub fn list_drivers() -> Vec<DriverInfo> {
    DRIVERS.to_vec()
}

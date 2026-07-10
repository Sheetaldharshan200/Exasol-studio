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
        name: "sqlx-exasol",
        protocol: "WebSocket API (native)",
        description: "Rust SQLx driver over Exasol's native WebSocket protocol. Built in — recommended.",
        default_port: 8563,
        kind: "native",
        is_default: true,
        docs_url: "https://github.com/bobozaur/sqlx-exasol",
    },
    DriverInfo {
        id: "websocket-api",
        name: "WebSocket API",
        protocol: "JSON over WebSocket",
        description: "Exasol's native wire protocol (wss:// on 8563). Basis of sqlx-exasol and pyexasol.",
        default_port: 8563,
        kind: "external",
        is_default: false,
        docs_url: "https://github.com/exasol/websocket-api",
    },
    DriverInfo {
        id: "jdbc",
        name: "JDBC",
        protocol: "jdbc:exa:<host>:<port>",
        description: "com.exasol.jdbc.EXADriver — for Java tools (DbVisualizer, DBeaver).",
        default_port: 8563,
        kind: "external",
        is_default: false,
        docs_url: "https://docs.exasol.com/db/latest/connect_exasol/drivers/jdbc.htm",
    },
    DriverInfo {
        id: "odbc",
        name: "ODBC",
        protocol: "DSN (EXAHOST/EXAUID/EXAPWD)",
        description: "Exasol ODBC driver for Windows, Linux, and macOS clients.",
        default_port: 8563,
        kind: "external",
        is_default: false,
        docs_url: "https://docs.exasol.com/db/latest/connect_exasol/drivers/odbc.htm",
    },
    DriverInfo {
        id: "ado-net",
        name: "ADO.NET",
        protocol: ".NET Data Provider",
        description: "Exasol data provider for the .NET ecosystem.",
        default_port: 8563,
        kind: "external",
        is_default: false,
        docs_url: "https://docs.exasol.com/db/latest/connect_exasol/drivers/ado_net.htm",
    },
];

#[tauri::command]
pub fn list_drivers() -> Vec<DriverInfo> {
    DRIVERS.to_vec()
}

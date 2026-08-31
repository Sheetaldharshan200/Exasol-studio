use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("{0}")]
    Database(String),
    #[error("connection `{0}` is not open")]
    NotConnected(String),
    #[error("invalid connection settings: {0}")]
    InvalidSettings(String),
    #[error("storage error: {0}")]
    Storage(String),
    #[error("assistant error: {0}")]
    Assistant(String),
}

/// Turn a low-level driver / OS error into a message an end user can act on.
/// Returns the original string when nothing recognizable matches, so genuine
/// Exasol SQL errors (syntax, missing object) still pass through verbatim.
pub fn humanize_db_error(raw: &str) -> String {
    let lower = raw.to_lowercase();

    let matches = |needles: &[&str]| needles.iter().any(|n| lower.contains(n));

    if matches(&["connection reset by peer", "os error 54", "reset by peer", "connection closed"]) {
        return "The database closed the connection while setting up. \
This almost always means the encryption (TLS) setting doesn't match the server. \
Exasol 8 requires encryption — try setting it to “Required”, and double-check the port (the default is 8563)."
            .to_string();
    }

    if matches(&["connection refused", "os error 61", "os error 111", "actively refused"]) {
        return "Couldn't reach the database — nothing is listening at that address. \
Check that the host and port are correct (the default port is 8563) and that the database is running."
            .to_string();
    }

    if matches(&[
        "failed to lookup",
        "nodename nor servname",
        "name or service not known",
        "dns error",
        "no such host",
        "name resolution",
    ]) {
        return "Couldn't find that host. Check the hostname is spelled correctly, \
or use an IP address if the name can't be resolved from this machine."
            .to_string();
    }

    if matches(&["timed out", "timeout", "os error 60"]) {
        return "The connection timed out. The database didn't respond in time — \
check the host and port, and make sure it's reachable from this machine (a firewall or VPN may be blocking it)."
            .to_string();
    }

    if matches(&[
        "certificate",
        "self-signed",
        "self signed",
        "unknownissuer",
        "invalidcertificate",
        "certificate verify failed",
    ]) {
        return "The server's TLS certificate couldn't be verified. \
If you trust this server, lower the encryption mode to “Preferred” or “Required”, \
or add the server's CA certificate."
            .to_string();
    }

    if matches(&["handshake", "tls", "ssl", "protocol error", "unexpected end of file"]) {
        return "The secure connection couldn't be established. \
The encryption setting likely doesn't match the server — try “Required”, or “Disabled” only for a local test database."
            .to_string();
    }

    if matches(&[
        "authentication",
        "credentials",
        "password",
        "access denied",
        "login failed",
        "user ",
        "not allowed",
    ]) {
        return "The username or password was rejected. Check your credentials and that the user is allowed to log in."
            .to_string();
    }

    if matches(&["network is unreachable", "os error 51", "no route to host", "os error 65"]) {
        return "The database's network can't be reached from this machine. \
Check your network connection, VPN, or firewall settings."
            .to_string();
    }

    // Unknown → return the original, trimmed of noisy driver prefixes.
    raw.trim()
        .trim_start_matches("error communicating with database:")
        .trim()
        .to_string()
}

impl From<sqlx_exasol::Error> for AppError {
    fn from(err: sqlx_exasol::Error) -> Self {
        match err {
            sqlx_exasol::Error::Database(db) => AppError::Database(humanize_db_error(db.message())),
            other => AppError::Database(humanize_db_error(&other.to_string())),
        }
    }
}

impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        AppError::Storage(err.to_string())
    }
}

impl From<serde_json::Error> for AppError {
    fn from(err: serde_json::Error) -> Self {
        AppError::Storage(err.to_string())
    }
}

/// Serialized to the frontend as `{ kind, message }`.
impl Serialize for AppError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeStruct;
        let kind = match self {
            AppError::Database(_) => "database",
            AppError::NotConnected(_) => "not-connected",
            AppError::InvalidSettings(_) => "invalid-settings",
            AppError::Storage(_) => "storage",
            AppError::Assistant(_) => "assistant",
        };
        let mut state = serializer.serialize_struct("AppError", 2)?;
        state.serialize_field("kind", kind)?;
        state.serialize_field("message", &self.to_string())?;
        state.end()
    }
}

pub type AppResult<T> = Result<T, AppError>;

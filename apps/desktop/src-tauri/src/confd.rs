//! ConfD (Exasol Admin API) client — admin-api-parity spec.
//!
//! ConfD is the daemon behind Exasol's Admin UI: XML-RPC over HTTPS on port
//! 20003, basic auth, one method that matters: `job_exec(job, {params})`.
//! The XML-RPC codec below is deliberately hand-rolled and PURE (unit-tested)
//! — one method, six value kinds, no new dependencies. Admin credentials are
//! held only in AppState memory and are never returned to the frontend.

use serde::Serialize;
use serde_json::{json, Value};
use tauri::State;

use crate::error::{AppError, AppResult};
use crate::state::AppState;

#[derive(Debug, Clone)]
pub struct AdminSession {
    pub host: String,
    pub port: u16,
    pub user: String,
    pub pass: String,
}

/// What the frontend may know about a session. No password, ever.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminStatus {
    pub connected: bool,
    pub host: Option<String>,
    pub port: Option<u16>,
    pub user: Option<String>,
}

/// The only jobs the generic runner will execute — everything the
/// native-backups + database-control specs need, nothing else. A compromised
/// renderer must not get an arbitrary-admin RPC.
const JOB_ALLOWLIST: &[&str] = &[
    "db_list",
    "db_state",
    "db_start",
    "db_stop",
    "db_info",
    "db_backup_list",
    "db_backup_start",
    "db_backup_progress",
    "db_backup_abort",
    "db_backup_add_schedule",
    "db_backup_modify_schedule",
    "db_backup_remove_schedule",
    "db_backups_delete",
    "db_restore",
    "st_volume_list",
];

pub fn job_allowed(job: &str) -> bool {
    JOB_ALLOWLIST.contains(&job)
}

// ── XML-RPC codec (pure) ───────────────────────────────────────────────────

fn xml_escape(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;")
}

fn encode_value(v: &Value, out: &mut String) {
    out.push_str("<value>");
    match v {
        Value::Null => out.push_str("<nil/>"),
        Value::Bool(b) => out.push_str(&format!("<boolean>{}</boolean>", if *b { 1 } else { 0 })),
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                out.push_str(&format!("<int>{i}</int>"));
            } else {
                out.push_str(&format!("<double>{}</double>", n.as_f64().unwrap_or(0.0)));
            }
        }
        Value::String(s) => out.push_str(&format!("<string>{}</string>", xml_escape(s))),
        Value::Array(items) => {
            out.push_str("<array><data>");
            for item in items {
                encode_value(item, out);
            }
            out.push_str("</data></array>");
        }
        Value::Object(map) => {
            out.push_str("<struct>");
            for (k, val) in map {
                out.push_str(&format!("<member><name>{}</name>", xml_escape(k)));
                encode_value(val, out);
                out.push_str("</member>");
            }
            out.push_str("</struct>");
        }
    }
    out.push_str("</value>");
}

/// `job_exec(job, {"params": {...}})` as an XML-RPC methodCall document.
pub fn encode_call(method: &str, args: &[Value]) -> String {
    let mut out = String::from("<?xml version=\"1.0\"?><methodCall><methodName>");
    out.push_str(&xml_escape(method));
    out.push_str("</methodName><params>");
    for a in args {
        out.push_str("<param>");
        encode_value(a, &mut out);
        out.push_str("</param>");
    }
    out.push_str("</params></methodCall>");
    out
}

/// Minimal well-formed-XML cursor: ConfD's responses are machine-generated.
struct Cursor<'a> {
    s: &'a str,
    pos: usize,
}

impl<'a> Cursor<'a> {
    fn new(s: &'a str) -> Self {
        Self { s, pos: 0 }
    }
    fn skip_ws(&mut self) {
        while self.pos < self.s.len() && self.s.as_bytes()[self.pos].is_ascii_whitespace() {
            self.pos += 1;
        }
    }
    fn rest(&self) -> &'a str {
        &self.s[self.pos..]
    }
    fn eat(&mut self, tag: &str) -> bool {
        self.skip_ws();
        if self.rest().starts_with(tag) {
            self.pos += tag.len();
            true
        } else {
            false
        }
    }
    fn until(&mut self, close: &str) -> AppResult<&'a str> {
        let rest = self.rest();
        let idx = rest
            .find(close)
            .ok_or_else(|| AppError::Storage(format!("XML-RPC parse: missing {close}")))?;
        let text = &rest[..idx];
        self.pos += idx + close.len();
        Ok(text)
    }
}

fn xml_unescape(s: &str) -> String {
    s.replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replace("&apos;", "'").replace("&amp;", "&")
}

fn parse_value(c: &mut Cursor) -> AppResult<Value> {
    if !c.eat("<value>") {
        return Err(AppError::Storage("XML-RPC parse: expected <value>".into()));
    }
    c.skip_ws();
    let v = if c.eat("<nil/>") {
        Value::Null
    } else if c.eat("<boolean>") {
        let t = c.until("</boolean>")?;
        Value::Bool(t.trim() == "1" || t.trim().eq_ignore_ascii_case("true"))
    } else if c.eat("<int>") {
        Value::from(c.until("</int>")?.trim().parse::<i64>().unwrap_or(0))
    } else if c.eat("<i4>") {
        Value::from(c.until("</i4>")?.trim().parse::<i64>().unwrap_or(0))
    } else if c.eat("<i8>") {
        Value::from(c.until("</i8>")?.trim().parse::<i64>().unwrap_or(0))
    } else if c.eat("<double>") {
        json!(c.until("</double>")?.trim().parse::<f64>().unwrap_or(0.0))
    } else if c.eat("<string>") {
        Value::String(xml_unescape(c.until("</string>")?))
    } else if c.eat("<string/>") {
        Value::String(String::new())
    } else if c.eat("<dateTime.iso8601>") {
        Value::String(c.until("</dateTime.iso8601>")?.trim().to_string())
    } else if c.eat("<base64>") {
        Value::String(c.until("</base64>")?.trim().to_string())
    } else if c.eat("<array>") {
        let mut items = Vec::new();
        if c.eat("<data/>") {
            // empty
        } else {
            if !c.eat("<data>") {
                return Err(AppError::Storage("XML-RPC parse: expected <data>".into()));
            }
            loop {
                c.skip_ws();
                if c.eat("</data>") {
                    break;
                }
                items.push(parse_value(c)?);
            }
        }
        if !c.eat("</array>") {
            return Err(AppError::Storage("XML-RPC parse: expected </array>".into()));
        }
        return finish_value(c, Value::Array(items));
    } else if c.eat("<struct/>") {
        Value::Object(Default::default())
    } else if c.eat("<struct>") {
        let mut map = serde_json::Map::new();
        loop {
            c.skip_ws();
            if c.eat("</struct>") {
                break;
            }
            if !c.eat("<member>") {
                return Err(AppError::Storage("XML-RPC parse: expected <member>".into()));
            }
            c.skip_ws();
            if !c.eat("<name>") {
                return Err(AppError::Storage("XML-RPC parse: expected <name>".into()));
            }
            let name = xml_unescape(c.until("</name>")?);
            let val = parse_value(c)?;
            c.skip_ws();
            if !c.eat("</member>") {
                return Err(AppError::Storage("XML-RPC parse: expected </member>".into()));
            }
            map.insert(name, val);
        }
        return finish_value(c, Value::Object(map));
    } else {
        // Untyped <value>text</value> is a string per the XML-RPC spec.
        Value::String(xml_unescape(c.until("</value>")?.trim()))
    };
    finish_value(c, v)
}

fn finish_value(c: &mut Cursor, v: Value) -> AppResult<Value> {
    // Typed branches (and the bare-string branch, which already consumed it)
    // may or may not still have the closing </value> pending.
    c.skip_ws();
    let _ = c.eat("</value>");
    Ok(v)
}

/// Parse a methodResponse. Faults become Err with the server's faultString.
pub fn parse_response(xml: &str) -> AppResult<Value> {
    let mut c = Cursor::new(xml);
    // Skip the XML declaration and find the response element.
    if let Some(idx) = c.rest().find("<methodResponse>") {
        c.pos += idx + "<methodResponse>".len();
    } else {
        return Err(AppError::Storage("XML-RPC parse: not a methodResponse".into()));
    }
    c.skip_ws();
    if c.eat("<fault>") {
        let v = parse_value(&mut c)?;
        let code = v.get("faultCode").cloned().unwrap_or(Value::Null);
        let msg = v
            .get("faultString")
            .and_then(|m| m.as_str())
            .unwrap_or("unknown ConfD fault")
            .to_string();
        return Err(AppError::Storage(format!("ConfD fault {code}: {msg}")));
    }
    if !c.eat("<params>") || !c.eat("<param>") {
        return Err(AppError::Storage("XML-RPC parse: expected <params><param>".into()));
    }
    parse_value(&mut c)
}

// ── Transport ──────────────────────────────────────────────────────────────

/// Run one XML-RPC call against ConfD. Blocking reqwest inside spawn_blocking
/// (same pattern as driver_exec); self-signed TLS accepted for THIS client
/// only — the admin ports of on-prem clusters ship self-signed certs.
async fn call(session: &AdminSession, method: &str, args: Vec<Value>) -> AppResult<Value> {
    let body = encode_call(method, &args);
    let url = format!("https://{}:{}/", session.host, session.port);
    let user = session.user.clone();
    let pass = session.pass.clone();
    let text = tokio::task::spawn_blocking(move || -> AppResult<String> {
        let client = reqwest::blocking::Client::builder()
            .danger_accept_invalid_certs(true)
            .timeout(std::time::Duration::from_secs(120))
            .build()
            .map_err(|e| AppError::Storage(e.to_string()))?;
        let resp = client
            .post(&url)
            .basic_auth(&user, Some(&pass))
            .header("Content-Type", "text/xml")
            .body(body)
            .send()
            .map_err(|e| AppError::Storage(format!("Admin API unreachable: {e}")))?;
        if resp.status() == reqwest::StatusCode::UNAUTHORIZED {
            return Err(AppError::Storage("Admin API rejected the credentials (401).".into()));
        }
        resp.text().map_err(|e| AppError::Storage(e.to_string()))
    })
    .await
    .map_err(|e| AppError::Storage(e.to_string()))??;
    parse_response(&text)
}

fn session_for(state: &State<'_, AppState>, profile_id: &str) -> AppResult<AdminSession> {
    state
        .admin_sessions
        .lock()
        .map_err(|_| AppError::Storage("admin session lock poisoned".into()))?
        .get(profile_id)
        .cloned()
        .ok_or_else(|| AppError::Storage("Admin API is not connected for this connection.".into()))
}

// ── Commands ───────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn confd_connect(
    state: State<'_, AppState>,
    profile_id: String,
    host: String,
    port: u16,
    user: String,
    password: String,
) -> AppResult<AdminStatus> {
    let session = AdminSession { host: host.clone(), port, user: user.clone(), pass: password };
    // Verify with a harmless job BEFORE storing (spec: successful connect is verified).
    call(&session, "job_exec", vec![Value::String("db_list".into()), json!({ "params": {} })]).await?;
    state
        .admin_sessions
        .lock()
        .map_err(|_| AppError::Storage("admin session lock poisoned".into()))?
        .insert(profile_id, session);
    Ok(AdminStatus { connected: true, host: Some(host), port: Some(port), user: Some(user) })
}

#[tauri::command]
pub fn confd_status(state: State<'_, AppState>, profile_id: String) -> AppResult<AdminStatus> {
    let sessions = state
        .admin_sessions
        .lock()
        .map_err(|_| AppError::Storage("admin session lock poisoned".into()))?;
    Ok(match sessions.get(&profile_id) {
        Some(s) => AdminStatus {
            connected: true,
            host: Some(s.host.clone()),
            port: Some(s.port),
            user: Some(s.user.clone()),
        },
        None => AdminStatus { connected: false, host: None, port: None, user: None },
    })
}

#[tauri::command]
pub fn confd_disconnect(state: State<'_, AppState>, profile_id: String) -> AppResult<()> {
    state
        .admin_sessions
        .lock()
        .map_err(|_| AppError::Storage("admin session lock poisoned".into()))?
        .remove(&profile_id);
    Ok(())
}

#[tauri::command]
pub async fn confd_job(
    state: State<'_, AppState>,
    profile_id: String,
    job: String,
    params: Value,
) -> AppResult<Value> {
    if !job_allowed(&job) {
        return Err(AppError::Storage(format!("ConfD job '{job}' is not allowed from the UI.")));
    }
    let session = session_for(&state, &profile_id)?;
    call(&session, "job_exec", vec![Value::String(job), json!({ "params": params })]).await
}

// ── Tests ──────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encodes_job_exec_call() {
        let xml = encode_call(
            "job_exec",
            &[Value::String("db_backup_start".into()), json!({"params": {"db_name": "exa_db", "level": 0, "expire": "1w"}})],
        );
        assert!(xml.contains("<methodName>job_exec</methodName>"));
        assert!(xml.contains("<string>db_backup_start</string>"));
        assert!(xml.contains("<name>db_name</name><value><string>exa_db</string></value>"));
        assert!(xml.contains("<name>level</name><value><int>0</int></value>"));
    }

    #[test]
    fn encodes_all_value_kinds_and_escapes() {
        let xml = encode_call(
            "m",
            &[json!({"s": "a<b&c", "b": true, "f": 1.5, "n": null, "arr": [1, "two"]})],
        );
        assert!(xml.contains("<string>a&lt;b&amp;c</string>"));
        assert!(xml.contains("<boolean>1</boolean>"));
        assert!(xml.contains("<double>1.5</double>"));
        assert!(xml.contains("<nil/>"));
        assert!(xml.contains("<array><data><value><int>1</int></value><value><string>two</string></value></data></array>"));
    }

    #[test]
    fn parses_nested_struct_response() {
        let xml = r#"<?xml version="1.0"?><methodResponse><params><param>
          <value><struct>
            <member><name>result_name</name><value><string>OK</string></value></member>
            <member><name>backups</name><value><array><data>
              <value><struct>
                <member><name>id</name><value><int>12</int></value></member>
                <member><name>usable</name><value><boolean>1</boolean></value></member>
              </struct></value>
            </data></array></value></member>
          </struct></value>
        </param></params></methodResponse>"#;
        let v = parse_response(xml).unwrap();
        assert_eq!(v["result_name"], "OK");
        assert_eq!(v["backups"][0]["id"], 12);
        assert_eq!(v["backups"][0]["usable"], true);
    }

    #[test]
    fn parses_fault_into_error_with_server_text() {
        let xml = r#"<?xml version="1.0"?><methodResponse><fault><value><struct>
          <member><name>faultCode</name><value><int>1</int></value></member>
          <member><name>faultString</name><value><string>no such volume</string></value></member>
        </struct></value></fault></methodResponse>"#;
        let err = parse_response(xml).unwrap_err();
        assert!(err.to_string().contains("no such volume"));
    }

    #[test]
    fn parses_untyped_value_as_string_and_unescapes() {
        let xml = "<methodResponse><params><param><value>a &amp; b</value></param></params></methodResponse>";
        assert_eq!(parse_response(xml).unwrap(), Value::String("a & b".into()));
    }

    #[test]
    fn parses_empty_array_and_non_ascii() {
        let xml = "<methodResponse><params><param><value><struct><member><name>dbs</name><value><array><data></data></array></value></member><member><name>note</name><value><string>Grüße</string></value></member></struct></value></param></params></methodResponse>";
        let v = parse_response(xml).unwrap();
        assert_eq!(v["dbs"], json!([]));
        assert_eq!(v["note"], "Grüße");
    }

    #[test]
    fn allowlist_gates_jobs() {
        assert!(job_allowed("db_backup_start"));
        assert!(job_allowed("st_volume_list"));
        assert!(!job_allowed("node_remove"));
        assert!(!job_allowed("user_create"));
        assert!(!job_allowed(""));
    }
}

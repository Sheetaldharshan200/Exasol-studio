//! Typed decisions over rows through Ollaya — a local decision-model daemon
//! the Marketplace installs. Studio starts `ollaya serve` when nothing answers
//! on its port, pulls models through Ollaya's own CLI, and sends each row as
//! the state of one `/api/decide` call. Nothing here generates text, and no
//! row leaves the machine.

use crate::error::{AppError, AppResult};
use serde::Serialize;
use serde_json::{json, Value};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

const PORT: u16 = 11435;
/// The marketplace log job the pull streams under; the tab listens for it.
pub const JOB_ID: &str = "anomaly";
const MAX_ROWS: usize = 5000;
const IN_FLIGHT: usize = 4;

/// The daemon Studio started, so it is stopped when Studio exits. Empty when
/// the daemon was adopted from outside.
#[derive(Default)]
pub struct DecisionEngine {
    child: Mutex<Option<Child>>,
}

impl DecisionEngine {
    pub fn kill(&self) {
        if let Ok(mut guard) = self.child.lock() {
            if let Some(mut child) = guard.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}

fn base() -> String {
    format!("http://127.0.0.1:{PORT}")
}

/// A model reference Ollaya accepts: `name` or `name:tag`, lowercase.
pub fn valid_model_name(name: &str) -> bool {
    let part = |p: &str| {
        !p.is_empty()
            && p.len() <= 64
            && p.chars().next().is_some_and(|c| c.is_ascii_lowercase() || c.is_ascii_digit())
            && p.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || matches!(c, '.' | '-' | '_'))
    };
    match name.split_once(':') {
        Some((n, t)) => part(n) && part(t),
        None => part(name),
    }
}

/// The `/api/decide` body for one row. `keep_alive` keeps the model loaded
/// between rows of the same run.
pub fn decide_body(model: &str, state: &Value, questions: &Value) -> Value {
    json!({ "model": model, "state": state, "questions": questions, "keep_alive": "10m" })
}

/// The answers of a `/api/decide` reply, keyed by question id. The wire
/// format nests them under `answers`; a flat reply (older builds) is taken
/// as is, minus the request echo.
pub fn answers_of(reply: &Value) -> Value {
    if let Some(a) = reply.get("answers") {
        return a.clone();
    }
    match reply.as_object() {
        Some(map) => Value::Object(
            map.iter()
                .filter(|(k, _)| !matches!(k.as_str(), "model" | "usage" | "timings" | "routing" | "state_truncated" | "id" | "object" | "created"))
                .map(|(k, v)| (k.clone(), v.clone()))
                .collect(),
        ),
        None => Value::Null,
    }
}

/// Questions as the wire wants them: an object of 1–256 typed entries.
pub fn check_questions(questions: &Value) -> AppResult<()> {
    let map = questions.as_object().ok_or_else(|| AppError::Storage("Questions must be an object keyed by id.".into()))?;
    if map.is_empty() || map.len() > 256 {
        return Err(AppError::Storage("Between 1 and 256 questions are needed.".into()));
    }
    for (id, q) in map {
        let kind = q.get("type").and_then(Value::as_str).unwrap_or("");
        let options = q.get("criteria").and_then(Value::as_array).map(Vec::len).unwrap_or(0);
        let ok = match kind {
            "noul" => true,
            "choice" => (2..=255).contains(&options),
            "score" => (2..=10).contains(&options),
            _ => false,
        };
        if !ok {
            return Err(AppError::Storage(format!("Question {id:?}: a {kind} question needs the right number of criteria (choice 2–255, score 2–10).")));
        }
    }
    Ok(())
}

/// The Ollaya binary: the one the Marketplace installed into Studio's bin
/// directory, else one on PATH (installed by hand counts).
fn ollaya_bin(app: &AppHandle) -> Option<PathBuf> {
    let name = if cfg!(windows) { "ollaya.exe" } else { "ollaya" };
    let ours = crate::market::studio_bin_dir(app).join(name);
    if ours.is_file() {
        return Some(ours);
    }
    crate::market::resolve_bin("ollaya")
}

/// Whatever answers on the port is used only when it answers like Ollaya —
/// a `models` array on `/api/tags`. Rows are never posted to a stranger that
/// merely speaks JSON there.
async fn serving(client: &reqwest::Client) -> Option<Value> {
    let tags: Value = client.get(format!("{}/api/tags", base())).timeout(Duration::from_millis(1500)).send().await.ok()?.json().await.ok()?;
    looks_like_ollaya(&tags).then_some(tags)
}

pub fn looks_like_ollaya(tags: &Value) -> bool {
    tags.get("models").is_some_and(Value::is_array)
}

fn model_names(tags: &Value) -> Vec<String> {
    tags.get("models")
        .and_then(Value::as_array)
        .map(|m| m.iter().filter_map(|x| x.get("name").or_else(|| x.get("model")).and_then(Value::as_str).map(str::to_string)).collect())
        .unwrap_or_default()
}

/// Make sure something answers on the port: adopt a running daemon, else
/// start `ollaya serve` and wait for it.
pub async fn ensure_serving(app: &AppHandle, client: &reqwest::Client) -> AppResult<()> {
    if serving(client).await.is_some() {
        return Ok(());
    }
    let bin = ollaya_bin(app).ok_or_else(|| AppError::Storage("Ollaya is not installed. Install it from the Marketplace first.".into()))?;
    let child = Command::new(&bin)
        .arg("serve")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| AppError::Storage(format!("Could not start `ollaya serve`: {e}")))?;
    {
        let engine = app.state::<DecisionEngine>();
        let mut guard = engine.child.lock().map_err(|_| AppError::Storage("engine state poisoned".into()))?;
        if let Some(mut old) = guard.replace(child) {
            let _ = old.kill();
        }
    }
    let deadline = Instant::now() + Duration::from_secs(20);
    while Instant::now() < deadline {
        if serving(client).await.is_some() {
            return Ok(());
        }
        tokio::time::sleep(Duration::from_millis(400)).await;
    }
    app.state::<DecisionEngine>().kill();
    Err(AppError::Storage("`ollaya serve` did not answer within 20 seconds.".into()))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DecisionStatus {
    pub installed: bool,
    pub serving: bool,
    pub models: Vec<String>,
}

/// Installed? Serving? Which models — without starting anything.
#[tauri::command]
pub async fn decisions_status(app: AppHandle) -> AppResult<DecisionStatus> {
    let installed = ollaya_bin(&app).is_some();
    let tags = serving(&reqwest::Client::new()).await;
    Ok(DecisionStatus { installed, serving: tags.is_some(), models: tags.as_ref().map(model_names).unwrap_or_default() })
}

/// `ollaya pull <model>`, streamed to the marketplace log under `anomaly`.
#[tauri::command]
pub async fn decisions_pull(app: AppHandle, model: String) -> AppResult<()> {
    if !valid_model_name(&model) {
        return Err(AppError::Storage(format!("{model:?} is not a model name Studio will pass to Ollaya.")));
    }
    let bin = ollaya_bin(&app).ok_or_else(|| AppError::Storage("Ollaya is not installed. Install it from the Marketplace first.".into()))?;
    let bin_s = bin.to_string_lossy().into_owned();
    let app2 = app.clone();
    let code = tauri::async_runtime::spawn_blocking(move || crate::market::run_streamed(&app2, JOB_ID, &bin_s, &["pull", &model]))
        .await
        .map_err(|e| AppError::Storage(e.to_string()))??;
    if code != 0 {
        return Err(AppError::Storage(format!("`ollaya pull` exited with code {code}. See the log.")));
    }
    Ok(())
}

/// What a run produced: an answer per row (null where none), and the first
/// failure — its row and why — when one stopped the run.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DecideOutcome {
    pub answers: Vec<Value>,
    pub failed_row: Option<usize>,
    pub error: Option<String>,
}

/// Answer the questions for every row. Four rows in flight; progress per row;
/// a failure names the row and keeps what was answered before it.
#[tauri::command]
pub async fn decisions_decide(app: AppHandle, model: String, states: Vec<Value>, questions: Value) -> AppResult<DecideOutcome> {
    use futures_util::StreamExt;
    if !valid_model_name(&model) {
        return Err(AppError::Storage(format!("{model:?} is not a model name Studio will pass to Ollaya.")));
    }
    check_questions(&questions)?;
    if states.is_empty() || states.len() > MAX_ROWS {
        return Err(AppError::Storage(format!("Between 1 and {MAX_ROWS} rows can be decided in one run.")));
    }
    let client = reqwest::Client::new();
    ensure_serving(&app, &client).await?;
    let total = states.len();
    let url = format!("{}/api/decide", base());
    let mut results: Vec<Option<Value>> = vec![None; total];
    let mut stream = futures_util::stream::iter(states.into_iter().enumerate().map(|(i, state)| {
        let client = client.clone();
        let url = url.clone();
        let body = decide_body(&model, &state, &questions);
        async move {
            let reply = client.post(&url).json(&body).timeout(Duration::from_secs(120)).send().await.map_err(|e| e.to_string());
            let out: Result<Value, String> = match reply {
                Ok(r) if r.status().is_success() => r.json::<Value>().await.map(|v| answers_of(&v)).map_err(|e| e.to_string()),
                Ok(r) => {
                    let status = r.status();
                    let text = r.text().await.unwrap_or_default();
                    Err(format!("HTTP {status}: {}", text.chars().take(300).collect::<String>()))
                }
                Err(e) => Err(e),
            };
            (i, out)
        }
    }))
    .buffer_unordered(IN_FLIGHT);
    let mut done = 0usize;
    let mut failure: Option<(usize, String)> = None;
    while let Some((i, out)) = stream.next().await {
        match out {
            Ok(v) => results[i] = Some(v),
            Err(e) => {
                failure = Some((i, e));
                break;
            }
        }
        done += 1;
        let _ = app.emit("anomaly:progress", json!({ "done": done, "total": total }));
    }
    Ok(DecideOutcome {
        answers: results.into_iter().map(|r| r.unwrap_or(Value::Null)).collect(),
        failed_row: failure.as_ref().map(|(i, _)| *i),
        error: failure.map(|(i, e)| format!("Row {} could not be decided: {e}", i + 1)),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn model_names_are_lowercase_name_and_optional_tag() {
        for ok in ["laya", "laya:en", "laya:typed-decisions", "winnow:e4b", "kev:0.8b", "my_model.v2:fp16"] {
            assert!(valid_model_name(ok), "{ok}");
        }
        for bad in ["", "Laya", "laya:", ":en", "laya en", "../laya", "laya:en:x", "laya;rm", "l\"aya", "-laya"] {
            assert!(!valid_model_name(bad), "{bad:?} must be refused");
        }
    }

    #[test]
    fn the_body_carries_row_and_questions_and_keeps_the_model_loaded() {
        let body = decide_body("laya", &json!({"AMOUNT": 12.5, "VENDOR": "ACME"}), &json!({"fraud": {"type": "noul", "instructions": "x"}}));
        assert_eq!(body["model"], "laya");
        assert_eq!(body["state"]["VENDOR"], "ACME");
        assert_eq!(body["questions"]["fraud"]["type"], "noul");
        assert_eq!(body["keep_alive"], "10m");
    }

    #[test]
    fn answers_are_read_nested_or_flat() {
        let nested = json!({"model": "laya:en", "answers": {"fraud": {"type": "noul", "noul": 0.91}}, "timings": {}});
        assert_eq!(answers_of(&nested)["fraud"]["noul"], 0.91);
        let flat = json!({"model": "laya:en", "fraud": {"type": "noul", "noul": 0.2}, "usage": {}});
        let a = answers_of(&flat);
        assert_eq!(a["fraud"]["noul"], 0.2);
        assert!(a.get("model").is_none() && a.get("usage").is_none());
        assert_eq!(answers_of(&json!("nope")), Value::Null);
    }

    #[test]
    fn questions_are_checked_by_type_and_criteria_count() {
        assert!(check_questions(&json!({"a": {"type": "noul", "instructions": "?"}})).is_ok());
        assert!(check_questions(&json!({"a": {"type": "choice", "criteria": ["x", "y"]}})).is_ok());
        assert!(check_questions(&json!({"a": {"type": "choice", "criteria": ["x"]}})).is_err(), "a choice needs two options");
        assert!(check_questions(&json!({"a": {"type": "score", "criteria": ["0"]}})).is_err(), "a score needs two levels");
        assert!(check_questions(&json!({"a": {"type": "essay"}})).is_err(), "unknown type");
        assert!(check_questions(&json!({})).is_err() && check_questions(&json!([])).is_err());
    }

    #[test]
    fn only_something_that_answers_like_ollaya_is_adopted() {
        assert!(looks_like_ollaya(&json!({"models": []})));
        assert!(!looks_like_ollaya(&json!({"status": "ok"})));
        assert!(!looks_like_ollaya(&json!({"models": "yes"})));
        assert!(!looks_like_ollaya(&json!("html")));
    }

    #[test]
    fn model_names_come_from_the_tags_listing() {
        let tags = json!({"models": [{"name": "laya:en"}, {"model": "winnow:e4b"}, {"size": 1}]});
        assert_eq!(model_names(&tags), vec!["laya:en", "winnow:e4b"]);
        assert!(model_names(&json!({})).is_empty());
    }
}

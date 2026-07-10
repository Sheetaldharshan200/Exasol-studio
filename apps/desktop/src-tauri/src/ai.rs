use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::State;

use crate::error::{AppError, AppResult};
use crate::state::AppState;
use crate::storage::{read_json, write_json};

const ANTHROPIC_API_URL: &str = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION: &str = "2023-06-01";
const DEFAULT_MODEL: &str = "claude-opus-4-8";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssistantSettings {
    #[serde(default)]
    pub api_key: String,
    #[serde(default = "default_model")]
    pub model: String,
}

fn default_model() -> String {
    DEFAULT_MODEL.to_string()
}

impl Default for AssistantSettings {
    fn default() -> Self {
        Self {
            api_key: String::new(),
            model: default_model(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String, // "user" | "assistant"
    pub content: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatReply {
    pub text: String,
    pub model: String,
    pub stop_reason: Option<String>,
}

fn settings_path(state: &AppState) -> std::path::PathBuf {
    state.data_dir.join("assistant-settings.json")
}

#[tauri::command]
pub fn get_assistant_settings(state: State<'_, AppState>) -> AppResult<AssistantSettings> {
    let mut settings: AssistantSettings =
        read_json(&settings_path(&state), AssistantSettings::default())?;
    // Never ship the full key back to the UI; mask all but the tail.
    if settings.api_key.len() > 8 {
        settings.api_key = format!("…{}", &settings.api_key[settings.api_key.len() - 4..]);
    }
    Ok(settings)
}

#[tauri::command]
pub fn set_assistant_settings(
    state: State<'_, AppState>,
    api_key: Option<String>,
    model: Option<String>,
) -> AppResult<AssistantSettings> {
    let mut settings: AssistantSettings =
        read_json(&settings_path(&state), AssistantSettings::default())?;
    if let Some(key) = api_key {
        // Ignore the masked placeholder round-tripping back from the UI.
        if !key.starts_with('…') {
            settings.api_key = key.trim().to_string();
        }
    }
    if let Some(model) = model {
        if !model.trim().is_empty() {
            settings.model = model.trim().to_string();
        }
    }
    write_json(&settings_path(&state), &settings)?;
    get_assistant_settings(state)
}

/// Chat with the assistant. `context` carries workspace context (current schema,
/// editor SQL, selected object) that is folded into the system prompt.
#[tauri::command]
pub async fn ai_chat(
    state: State<'_, AppState>,
    messages: Vec<ChatMessage>,
    context: Option<String>,
) -> AppResult<ChatReply> {
    let settings: AssistantSettings =
        read_json(&settings_path(&state), AssistantSettings::default())?;
    if settings.api_key.is_empty() {
        return Err(AppError::Assistant(
            "No Anthropic API key configured. Add one in the assistant settings.".into(),
        ));
    }
    if messages.is_empty() {
        return Err(AppError::Assistant("empty conversation".into()));
    }

    let mut system = String::from(
        "You are the Exasol Studio assistant, embedded in a desktop SQL workbench \
         for the Exasol analytics database. Help with writing and explaining Exasol SQL, \
         Lua scripts, UDFs, virtual schemas, and performance tuning. Exasol specifics: \
         unquoted identifiers fold to UPPERCASE; constraints are PRIMARY KEY, FOREIGN KEY, \
         and NOT NULL only; system metadata lives in SYS (EXA_ALL_* views) and statistics \
         in EXA_STATISTICS. Prefer runnable SQL in fenced code blocks. Be concise.",
    );
    if let Some(context) = context.filter(|c| !c.trim().is_empty()) {
        system.push_str("\n\nCurrent workspace context:\n");
        system.push_str(&context);
    }

    let api_messages: Vec<Value> = messages
        .iter()
        .map(|m| json!({ "role": m.role, "content": m.content }))
        .collect();

    let body = json!({
        "model": settings.model,
        "max_tokens": 4096,
        "thinking": { "type": "adaptive" },
        "system": system,
        "messages": api_messages,
    });

    let client = reqwest::Client::new();
    let response = client
        .post(ANTHROPIC_API_URL)
        .header("x-api-key", &settings.api_key)
        .header("anthropic-version", ANTHROPIC_VERSION)
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|err| AppError::Assistant(format!("request failed: {err}")))?;

    let status = response.status();
    let payload: Value = response
        .json()
        .await
        .map_err(|err| AppError::Assistant(format!("invalid response: {err}")))?;

    if !status.is_success() {
        let message = payload
            .pointer("/error/message")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown API error");
        return Err(AppError::Assistant(format!("{status}: {message}")));
    }

    let stop_reason = payload
        .get("stop_reason")
        .and_then(|v| v.as_str())
        .map(str::to_string);

    if stop_reason.as_deref() == Some("refusal") {
        return Err(AppError::Assistant(
            "The assistant declined this request.".into(),
        ));
    }

    let text = payload
        .get("content")
        .and_then(|v| v.as_array())
        .map(|blocks| {
            blocks
                .iter()
                .filter(|b| b.get("type").and_then(|t| t.as_str()) == Some("text"))
                .filter_map(|b| b.get("text").and_then(|t| t.as_str()))
                .collect::<Vec<_>>()
                .join("")
        })
        .unwrap_or_default();

    Ok(ChatReply {
        text,
        model: settings.model,
        stop_reason,
    })
}

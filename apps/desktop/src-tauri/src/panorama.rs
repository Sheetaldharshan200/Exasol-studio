//! Studio as Panorama's shell.
//!
//! Panorama's web build runs in any frame, except that a browser refuses a
//! `wss://` handshake to a self-signed certificate — the local Exasol Personal
//! — and never offers an exception. Panorama's own desktop application gets
//! around that with a shell: a loopback WebSocket proxy that decides about
//! certificates, handed to the page by a command. This module is that shell:
//!
//! - it serves the installed build on the `panorama` scheme, with a bridge
//!   script prepended to `index.html` so the page sees a shell and sends its
//!   commands to the hosting tab by `postMessage`;
//! - it runs the proxy — loopback only, this run's token only, the tab's
//!   origin only, and only to the address of a saved Studio connection, with
//!   the certificate verified exactly when that connection's TLS mode says so;
//! - it answers the two commands worth answering from what Studio knows: the
//!   saved connections as Panorama's "deployments", and one connection's
//!   credential at the moment of connecting.
//!
//! Frames are copied, never decoded: the page encrypts the credential to the
//! database's key, as it would in a browser.

use crate::error::{AppError, AppResult};
use futures_util::{SinkExt, StreamExt};
use serde::Serialize;
use std::path::{Component, Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Manager};
use tokio::net::{TcpListener, TcpStream};

pub const SCHEME: &str = "panorama";
const SHIM: &str = include_str!("panorama-shim.js");

// ── Serving the build ─────────────────────────────────────────────────────────

/// Where the Marketplace unpacked Panorama's web build.
fn build_dir(app: &AppHandle) -> Option<PathBuf> {
    let dir = crate::market::market_dir(app).ok()?.join("panorama").join("unpacked");
    dir.join("index.html").is_file().then_some(dir)
}

/// The file a request path names inside the build — `index.html` for the
/// root and for any path without an extension (the app routes itself) — or
/// None for a path that tries to leave the directory.
pub fn safe_path(request_path: &str) -> Option<PathBuf> {
    let trimmed = request_path.trim_start_matches('/');
    let trimmed = trimmed.split(['?', '#']).next().unwrap_or("");
    let decoded = percent_decode(trimmed);
    let mut out = PathBuf::new();
    for part in Path::new(&decoded).components() {
        match part {
            Component::Normal(p) => out.push(p),
            Component::CurDir => {}
            _ => return None,
        }
    }
    let has_extension = out.extension().is_some();
    if out.as_os_str().is_empty() || !has_extension {
        return Some(PathBuf::from("index.html"));
    }
    Some(out)
}

/// Percent-decoding over bytes, so a stray `%` before multibyte text cannot
/// split a character and panic the scheme handler.
pub fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hex = |b: u8| (b as char).to_digit(16);
            if let (Some(h), Some(l)) = (hex(bytes[i + 1]), hex(bytes[i + 2])) {
                out.push((h * 16 + l) as u8);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// The media type for a file in the build, by extension.
pub fn mime_for(path: &Path) -> &'static str {
    match path.extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase().as_str() {
        "html" => "text/html; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "json" | "map" => "application/json; charset=utf-8",
        "webmanifest" => "application/manifest+json",
        "wasm" => "application/wasm",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "ico" => "image/x-icon",
        "woff2" => "font/woff2",
        "woff" => "font/woff",
        "txt" | "md" => "text/plain; charset=utf-8",
        _ => "application/octet-stream",
    }
}

/// `index.html` with the bridge script inserted before its first `<script>`
/// (or before `</head>`), so the shell exists before any application code runs.
pub fn inject_shim(html: &str) -> String {
    let tag = format!("<script>{SHIM}</script>");
    if let Some(i) = html.find("<script") {
        format!("{}{tag}{}", &html[..i], &html[i..])
    } else if let Some(i) = html.find("</head>") {
        format!("{}{tag}{}", &html[..i], &html[i..])
    } else {
        format!("{tag}{html}")
    }
}

/// Answer one request on the `panorama` scheme.
pub fn respond(app: &AppHandle, request_path: &str) -> tauri::http::Response<Vec<u8>> {
    let not_found = |why: &str| {
        tauri::http::Response::builder()
            .status(404)
            .header("Content-Type", "text/plain; charset=utf-8")
            .body(why.as_bytes().to_vec())
            .unwrap_or_default()
    };
    let Some(dir) = build_dir(app) else {
        return not_found("Panorama is not installed. Install it from the Marketplace.");
    };
    let Some(rel) = safe_path(request_path) else {
        return not_found("Not a path inside Panorama.");
    };
    let file = dir.join(&rel);
    let Ok(bytes) = std::fs::read(&file) else {
        return not_found("No such file in Panorama's build.");
    };
    let body = if rel == Path::new("index.html") { inject_shim(&String::from_utf8_lossy(&bytes)).into_bytes() } else { bytes };
    tauri::http::Response::builder()
        .status(200)
        .header("Content-Type", mime_for(&rel))
        .header("Cache-Control", if rel == Path::new("index.html") { "no-store" } else { "public, max-age=31536000, immutable" })
        .body(body)
        .unwrap_or_default()
}

// ── The proxy ─────────────────────────────────────────────────────────────────

/// The proxy Studio runs for this app run: its port and the token the page is given.
pub struct Proxy {
    pub port: u16,
    pub token: String,
}

impl Proxy {
    pub fn url(&self) -> String {
        format!("ws://127.0.0.1:{}/database?token={}", self.port, self.token)
    }
}

static PROXY: tokio::sync::OnceCell<Arc<Proxy>> = tokio::sync::OnceCell::const_new();
/// How many page sockets may be open at once, and how long a handshake may take.
const MAX_SOCKETS: usize = 32;
const HANDSHAKE: Duration = Duration::from_secs(15);

/// Origins the proxy answers: the tab's frame (the `panorama` scheme as each
/// platform spells it) and Studio's own page.
pub fn origin_allowed(origin: Option<&str>) -> bool {
    match origin {
        None => false,
        Some(o) => matches!(o, "panorama://localhost" | "http://panorama.localhost" | "tauri://localhost" | "http://tauri.localhost"),
    }
}

/// What a handshake asked for: the token and the database it wants.
#[derive(Debug, PartialEq, Eq)]
pub struct Asked {
    pub token: String,
    pub target: String,
}

pub fn parse_asked(request_uri: &str) -> Option<Asked> {
    let query = request_uri.split_once('?')?.1;
    let mut token = None;
    let mut target = None;
    for pair in query.split('&') {
        let (k, v) = pair.split_once('=').unwrap_or((pair, ""));
        match k {
            "token" => token = Some(percent_decode(v)),
            "target" => target = Some(percent_decode(v)),
            _ => {}
        }
    }
    Some(Asked { token: token?, target: target? })
}

/// Where a target says to connect: `(tls, host, port)`; only `ws://` and `wss://`.
pub fn parse_target(target: &str) -> Option<(bool, String, u16)> {
    let (scheme, rest) = target.split_once("://")?;
    let tls = match scheme {
        "wss" => true,
        "ws" => false,
        _ => return None,
    };
    let authority = rest.split(['/', '?', '#']).next()?;
    let (host, port) = match authority.rsplit_once(':') {
        Some((h, p)) => (h.trim_matches(['[', ']']), p.parse::<u16>().ok()?),
        None => (authority, if tls { 443 } else { 80 }),
    };
    (!host.is_empty()).then(|| (tls, host.to_string(), port))
}

/// How a saved connection at this address wants its transport: `None` when
/// no saved connection has the address (the proxy connects nowhere else),
/// else whether TLS is on (`disabled` mode is the only plain one) and, when
/// on, whether the certificate is verified. The frame does not get to pick:
/// asking for `ws://` where the connection encrypts is refused.
#[derive(Debug, PartialEq, Eq, Clone)]
pub struct Transport {
    pub tls: bool,
    pub verify: bool,
    /// A pinned certificate: checked on the upstream connection itself.
    pub pin: Option<String>,
}

pub fn known_connection(profiles: &[(String, u16, String, Option<String>)], host: &str, port: u16) -> Option<Transport> {
    let same_host = |a: &str, b: &str| {
        let norm = |h: &str| match h {
            "localhost" => "127.0.0.1".to_string(),
            other => other.to_ascii_lowercase(),
        };
        norm(a) == norm(b)
    };
    profiles.iter().find(|(h, p, _, _)| *p == port && same_host(h, host)).map(|(_, _, mode, pin)| Transport {
        tls: mode != "disabled" || pin.is_some(),
        verify: pin.is_none() && mode.starts_with("verify"),
        pin: pin.clone(),
    })
}

fn saved_addresses(app: &AppHandle) -> Vec<(String, u16, String, Option<String>)> {
    let state = app.state::<crate::state::AppState>();
    crate::profiles::load_profiles(&state)
        .map(|list| list.into_iter().map(|p| (p.host, p.port, p.ssl_mode, p.fingerprint)).collect())
        .unwrap_or_default()
}

fn tls_config(verify: bool) -> Result<Arc<rustls::ClientConfig>, String> {
    let provider = rustls::crypto::ring::default_provider();
    let builder = rustls::ClientConfig::builder_with_provider(Arc::new(provider.clone()))
        .with_safe_default_protocol_versions()
        .map_err(|e| e.to_string())?;
    let config = if verify {
        let mut roots = rustls::RootCertStore::empty();
        for cert in rustls_native_certs::load_native_certs().certs {
            let _ = roots.add(cert);
        }
        builder.with_root_certificates(roots).with_no_client_auth()
    } else {
        builder.dangerous().with_custom_certificate_verifier(Arc::new(crate::tls_trust::AcceptAny(provider))).with_no_client_auth()
    };
    Ok(Arc::new(config))
}

type Upstream = async_tungstenite::WebSocketStream<async_tungstenite::tokio::TokioAdapter<Box<dyn AsyncStream>>>;
trait AsyncStream: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + Send {}
impl<T: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + Send> AsyncStream for T {}

async fn open_upstream(target: &str, tls: bool, host: &str, port: u16, verify: bool, pin: Option<&str>) -> Result<Upstream, String> {
    let tcp = TcpStream::connect((host, port)).await.map_err(|e| format!("could not reach {host}:{port}: {e}"))?;
    let stream: Box<dyn AsyncStream> = if tls {
        let config = tls_config(verify)?;
        let name = rustls::pki_types::ServerName::try_from(host.to_string()).map_err(|_| format!("{host} is not a valid server name"))?;
        let connected = tokio_rustls::TlsConnector::from(config).connect(name, tcp).await.map_err(|e| format!("TLS to {host}:{port} failed: {e}"))?;
        // A pin is checked on this very connection, before anything is relayed.
        if let Some(pin) = pin {
            let leaf = connected.get_ref().1.peer_certificates().and_then(|c| c.first().map(|d| d.as_ref().to_vec()));
            if leaf.map(|d| crate::tls_trust::fingerprint_of(&d)).as_deref() != Some(pin) {
                return Err(format!("{host}:{port} presents a certificate other than the pinned one"));
            }
        }
        Box::new(connected)
    } else {
        Box::new(tcp)
    };
    let (socket, _) = async_tungstenite::client_async(target, async_tungstenite::tokio::TokioAdapter::new(stream))
        .await
        .map_err(|e| format!("{host}:{port} refused a WebSocket connection: {e}"))?;
    Ok(socket)
}

async fn serve_one(app: AppHandle, stream: TcpStream, token: String) {
    use async_tungstenite::tungstenite::handshake::server::{ErrorResponse, Request, Response};
    let asked: Arc<std::sync::Mutex<Option<Asked>>> = Arc::new(std::sync::Mutex::new(None));
    let seen = Arc::clone(&asked);
    let accepted = tokio::time::timeout(HANDSHAKE, async_tungstenite::tokio::accept_hdr_async(stream, move |request: &Request, response: Response| -> Result<Response, ErrorResponse> {
        let origin = request.headers().get("origin").and_then(|v| v.to_str().ok());
        if !origin_allowed(origin) {
            let mut refusal = ErrorResponse::new(Some("This endpoint does not answer other origins.".to_string()));
            *refusal.status_mut() = async_tungstenite::tungstenite::http::StatusCode::FORBIDDEN;
            return Err(refusal);
        }
        *seen.lock().expect("asked") = parse_asked(&request.uri().to_string());
        Ok(response)
    }))
    .await;
    let Ok(Ok(page)) = accepted else { return };
    let close = |mut page: async_tungstenite::WebSocketStream<async_tungstenite::tokio::TokioAdapter<TcpStream>>, reason: String| async move {
        let _ = page
            .send(async_tungstenite::tungstenite::Message::Close(Some(async_tungstenite::tungstenite::protocol::CloseFrame {
                code: async_tungstenite::tungstenite::protocol::frame::coding::CloseCode::Policy,
                reason: reason.into(),
            })))
            .await;
    };
    let Some(asked) = asked.lock().expect("asked").take() else {
        close(page, "Ask for /database?token=…&target=wss://host:port.".into()).await;
        return;
    };
    if asked.token != token {
        close(page, "That is not this session's token.".into()).await;
        return;
    }
    let Some((tls, host, port)) = parse_target(&asked.target) else {
        close(page, "A database URL has to be ws:// or wss:// with a host and port.".into()).await;
        return;
    };
    let Some(transport) = known_connection(&saved_addresses(&app), &host, port) else {
        close(page, format!("{host}:{port} is not one of Studio's saved connections; add it there first.")).await;
        return;
    };
    if tls != transport.tls {
        close(page, format!("{host}:{port} is reached over {} in Studio; the requested scheme does not match.", if transport.tls { "wss" } else { "ws" })).await;
        return;
    }
    let upstream = match tokio::time::timeout(HANDSHAKE, open_upstream(&asked.target, tls, &host, port, transport.verify, transport.pin.as_deref())).await {
        Ok(Ok(s)) => s,
        Ok(Err(why)) => {
            close(page, why).await;
            return;
        }
        Err(_) => {
            close(page, format!("{host}:{port} did not complete the handshake in time.")).await;
            return;
        }
    };
    let (mut to_page, mut from_page) = page.split();
    let (mut to_db, mut from_db) = upstream.split();
    let outward = async {
        while let Some(Ok(m)) = from_page.next().await {
            if to_db.send(m).await.is_err() {
                break;
            }
        }
    };
    let inward = async {
        while let Some(Ok(m)) = from_db.next().await {
            if to_page.send(m).await.is_err() {
                break;
            }
        }
    };
    tokio::select! { _ = outward => {}, _ = inward => {} }
}

/// The proxy for this run — started on first use, exactly once: concurrent
/// first callers wait for the one initialisation rather than each binding a
/// listener of their own.
async fn ensure_proxy(app: &AppHandle) -> AppResult<Arc<Proxy>> {
    let app = app.clone();
    PROXY
        .get_or_try_init(|| async move {
            let listener = TcpListener::bind(("127.0.0.1", 0)).await.map_err(|e| AppError::Storage(format!("Could not open the database proxy: {e}")))?;
            let port = listener.local_addr().map_err(|e| AppError::Storage(e.to_string()))?.port();
            let token: String = {
                use rand::Rng;
                rand::thread_rng().sample_iter(rand::distributions::Alphanumeric).take(40).map(char::from).collect()
            };
            let proxy = Arc::new(Proxy { port, token: token.clone() });
            let sockets = Arc::new(tokio::sync::Semaphore::new(MAX_SOCKETS));
            tauri::async_runtime::spawn(async move {
                loop {
                    let Ok((stream, _)) = listener.accept().await else { break };
                    // Over the limit, the connection is dropped at once rather
                    // than queued: a page that wants more sockets is not one.
                    let Ok(permit) = Arc::clone(&sockets).try_acquire_owned() else { continue };
                    let app = app.clone();
                    let token = token.clone();
                    tauri::async_runtime::spawn(async move {
                        serve_one(app, stream, token).await;
                        drop(permit);
                    });
                }
            });
            Ok::<Arc<Proxy>, AppError>(proxy)
        })
        .await
        .map(Arc::clone)
}

// ── Commands ─────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PanoramaStatus {
    pub installed: bool,
    pub proxy_url: String,
}

#[tauri::command]
pub async fn panorama_status(app: AppHandle) -> AppResult<PanoramaStatus> {
    let installed = build_dir(&app).is_some();
    let proxy = ensure_proxy(&app).await?;
    Ok(PanoramaStatus { installed, proxy_url: proxy.url() })
}

/// One saved connection as Panorama's connection panel lists a deployment.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Deployment {
    pub name: String,
    pub status: String,
    pub infrastructure: String,
    pub url: String,
    pub username: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Deployments {
    pub installed: bool,
    pub deployments: Vec<Deployment>,
}

/// One saved connection as the shell sees it: id, display name, address,
/// user and TLS mode. Studio's internal identities are not connections a
/// person opens and are left out.
#[derive(Debug, Clone, PartialEq)]
pub struct Saved {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub ssl_mode: String,
}

const INTERNAL_PREFIX: &str = "STUDIO_MCP_";

pub fn person_connections(profiles: impl IntoIterator<Item = Saved>) -> Vec<Saved> {
    profiles.into_iter().filter(|p| !p.username.starts_with(INTERNAL_PREFIX) && !p.name.starts_with(INTERNAL_PREFIX)).collect()
}

/// The name Panorama lists a connection under: its display name, made unique
/// when two connections share one, since Panorama hands the name back to ask
/// for credentials.
pub fn listed_names(saved: &[Saved]) -> Vec<String> {
    let mut seen = std::collections::HashMap::<String, usize>::new();
    saved
        .iter()
        .map(|p| {
            let n = seen.entry(p.name.clone()).or_insert(0);
            *n += 1;
            if *n == 1 { p.name.clone() } else { format!("{} ({})", p.name, n) }
        })
        .collect()
}

/// Studio's connections in Panorama's shape: every saved connection is a
/// deployment Panorama can open, at its address over the transport Studio
/// itself uses for it.
pub fn deployments_from(saved: &[Saved]) -> Deployments {
    let names = listed_names(saved);
    Deployments {
        installed: true,
        deployments: saved
            .iter()
            .zip(names)
            .map(|(p, name)| Deployment {
                name,
                status: "saved in Studio".into(),
                infrastructure: if p.host == "localhost" || p.host == "127.0.0.1" { "local".into() } else { "remote".into() },
                url: format!("{}://{}:{}", if p.ssl_mode == "disabled" { "ws" } else { "wss" }, p.host, p.port),
                username: p.username.clone(),
            })
            .collect(),
    }
}

fn saved_connections(app: &AppHandle) -> AppResult<Vec<Saved>> {
    let state = app.state::<crate::state::AppState>();
    Ok(person_connections(crate::profiles::load_profiles(&state)?.into_iter().map(|p| Saved {
        id: p.id,
        name: p.name,
        host: p.host,
        port: p.port,
        username: p.username,
        ssl_mode: p.ssl_mode,
    })))
}

#[tauri::command]
pub async fn panorama_deployments(app: AppHandle) -> AppResult<Deployments> {
    Ok(deployments_from(&saved_connections(&app)?))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Credentials {
    pub url: String,
    pub username: String,
    pub password: String,
}

/// The credential for one listed connection, read at the click and handed to
/// the page, which encrypts it to the database and never shows it. The listed
/// name maps back to the connection id; `find_profile` decrypts the stored
/// password (a raw profile carries it encrypted).
#[tauri::command]
pub async fn panorama_credentials(app: AppHandle, name: String) -> AppResult<Credentials> {
    let saved = saved_connections(&app)?;
    let id = listed_names(&saved)
        .into_iter()
        .zip(&saved)
        .find(|(listed, _)| *listed == name)
        .map(|(_, p)| p.id.clone())
        .ok_or_else(|| AppError::Storage(format!("No saved connection named {name:?}.")))?;
    let state = app.state::<crate::state::AppState>();
    let profile = crate::profiles::find_profile(&state, &id)?;
    let password = if profile.password.is_empty() { crate::shared_registry::read_credential(&profile.id).unwrap_or_default() } else { profile.password.clone() };
    if password.is_empty() {
        return Err(AppError::Storage(format!("No stored password for \"{}\" — open the connection once so its credential is saved.", profile.name)));
    }
    let scheme = if profile.ssl_mode == "disabled" { "ws" } else { "wss" };
    Ok(Credentials { url: format!("{scheme}://{}:{}", profile.host, profile.port), username: profile.username, password })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn paths_stay_inside_the_build_and_route_to_index() {
        assert_eq!(safe_path("/"), Some(PathBuf::from("index.html")));
        assert_eq!(safe_path("/index.html"), Some(PathBuf::from("index.html")));
        assert_eq!(safe_path("/assets/app-abc.js?v=1"), Some(PathBuf::from("assets/app-abc.js")));
        assert_eq!(safe_path("/some/route"), Some(PathBuf::from("index.html")), "an app route serves the shell");
        assert_eq!(safe_path("/../secrets.json"), None);
        assert_eq!(safe_path("/assets/%2e%2e/x.js"), None);
        assert_eq!(safe_path("/icons/icon%20192.png"), Some(PathBuf::from("icons/icon 192.png")));
    }

    #[test]
    fn media_types_follow_the_extension() {
        assert_eq!(mime_for(Path::new("a.webmanifest")), "application/manifest+json");
        assert_eq!(mime_for(Path::new("a.js")), "text/javascript; charset=utf-8");
        assert_eq!(mime_for(Path::new("a.wasm")), "application/wasm");
        assert_eq!(mime_for(Path::new("a.bin")), "application/octet-stream");
    }

    #[test]
    fn the_shim_runs_before_the_first_script() {
        let html = "<!doctype html><html><head><title>x</title></head><body><div id=\"root\"></div><script type=\"module\" src=\"/assets/a.js\"></script></body></html>";
        let out = inject_shim(html);
        let shim_at = out.find("__TAURI_INTERNALS__").unwrap();
        let app_at = out.find("/assets/a.js").unwrap();
        assert!(shim_at < app_at);
        assert!(inject_shim("<html><head></head></html>").contains("__TAURI__"));
    }

    #[test]
    fn the_proxy_answers_only_the_tabs_origin_with_this_runs_token_for_a_saved_database() {
        assert!(origin_allowed(Some("panorama://localhost")) && origin_allowed(Some("http://panorama.localhost")) && origin_allowed(Some("tauri://localhost")));
        assert!(!origin_allowed(Some("https://evil.example")) && !origin_allowed(None) && !origin_allowed(Some("http://localhost:5173")));
        assert_eq!(
            parse_asked("/database?token=abc&target=wss%3A%2F%2Flocalhost%3A8563"),
            Some(Asked { token: "abc".into(), target: "wss://localhost:8563".into() })
        );
        assert_eq!(parse_asked("/database?token=abc"), None);
        assert_eq!(parse_target("wss://localhost:8563"), Some((true, "localhost".into(), 8563)));
        assert_eq!(parse_target("ws://127.0.0.1:8565/x"), Some((false, "127.0.0.1".into(), 8565)));
        assert_eq!(parse_target("https://x:1"), None);
        assert_eq!(parse_target("wss://:1"), None);
        let saved = vec![
            ("127.0.0.1".to_string(), 8563u16, "preferred".to_string(), None),
            ("db.internal".to_string(), 8563, "verify_ca".to_string(), None),
            ("plain.internal".to_string(), 8563, "disabled".to_string(), None),
            ("pinned.internal".to_string(), 8563, "verify_identity".to_string(), Some("AB".repeat(32))),
        ];
        assert_eq!(
            known_connection(&saved, "pinned.internal", 8563),
            Some(Transport { tls: true, verify: false, pin: Some("AB".repeat(32)) }),
            "a pin is checked by fingerprint on the upstream connection"
        );
        assert_eq!(known_connection(&saved, "localhost", 8563), Some(Transport { tls: true, verify: false, pin: None }), "localhost is this machine; a preferred mode encrypts without verifying");
        assert_eq!(known_connection(&saved, "DB.internal", 8563), Some(Transport { tls: true, verify: true, pin: None }), "a verifying mode verifies");
        assert_eq!(known_connection(&saved, "plain.internal", 8563), Some(Transport { tls: false, verify: false, pin: None }), "only a disabled mode is plain — a ws:// request anywhere else is refused");
        assert_eq!(known_connection(&saved, "127.0.0.1", 8565), None, "another port is another database");
        assert_eq!(known_connection(&saved, "evil.example", 8563), None);
        assert_eq!(percent_decode("/%aé.js"), "/%aé.js", "a stray percent before multibyte text is left alone, never sliced");
        assert_eq!(percent_decode("a%20b%2Fc"), "a b/c");
    }

    fn saved(id: &str, name: &str, host: &str, user: &str, mode: &str) -> Saved {
        Saved { id: id.into(), name: name.into(), host: host.into(), port: 8563, username: user.into(), ssl_mode: mode.into() }
    }

    #[test]
    fn saved_connections_become_deployments_with_unique_names_and_studios_transport() {
        let list = person_connections(vec![
            saved("a", "Local", "127.0.0.1", "sys", "preferred"),
            saved("b", "Prod", "db.internal", "analyst", "verify_ca"),
            saved("c", "Prod", "db2.internal", "analyst", "disabled"),
            saved("d", "STUDIO_MCP_x", "127.0.0.1", "STUDIO_MCP_x", "preferred"),
        ]);
        assert_eq!(list.len(), 3, "internal identities are not connections a person opens");
        assert_eq!(listed_names(&list), vec!["Local", "Prod", "Prod (2)"]);
        let d = deployments_from(&list);
        assert!(d.installed);
        assert_eq!(d.deployments[0].url, "wss://127.0.0.1:8563");
        assert_eq!(d.deployments[0].infrastructure, "local");
        assert_eq!(d.deployments[1].infrastructure, "remote");
        assert_eq!(d.deployments[1].username, "analyst");
        assert_eq!(d.deployments[2].url, "ws://db2.internal:8563", "a disabled TLS mode is advertised as plain, as Studio itself connects");
        assert_eq!(d.deployments[2].name, "Prod (2)");
    }
}

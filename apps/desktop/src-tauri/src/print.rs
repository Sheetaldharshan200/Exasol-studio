//! Native print / "Save as PDF" for exported documents (notebooks, dashboards).
//!
//! `window.print()` is a silent no-op inside WKWebView — macOS gives the
//! webview's own JS no print hook — so the frontend hands us the finished HTML
//! and we open it in its own window, served over a private `print://` scheme,
//! then run the platform print dialog on THAT window once it has loaded. The
//! user sees exactly what will print and picks "Save as PDF" in the dialog.
//!
//! The document is a report, not an application: the response carries a CSP
//! that blocks scripts and every network fetch. A notebook can embed raw HTML
//! (the exporter keeps it on purpose), and that HTML must not be able to run
//! or phone home just because we opened it in a trusted window. Dashboard
//! charts print from their captured image, which is what the interactive
//! script would otherwise replace.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use tauri::webview::PageLoadEvent;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

use crate::error::{AppError, AppResult};

/// Rendered documents waiting to be served to their print window, by job id.
#[derive(Default)]
pub struct PrintJobs(Mutex<HashMap<String, String>>);

pub const SCHEME: &str = "print";
/// A report renders itself; nothing in it may execute or reach the network.
const CSP: &str = "default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; font-src data:; script-src 'none'; connect-src 'none'; base-uri 'none'; form-action 'none'";
/// Images decode after load; give the page a beat before the dialog snapshots it.
const SETTLE: Duration = Duration::from_millis(600);
/// How long we wait for the dialog before telling the user to print it themselves.
const DIALOG_WAIT: Duration = Duration::from_secs(12);

/// The job id a `print://localhost/<id>` request asks for; None for anything else
/// (a nested path, an empty path, or characters we never put in an id).
pub fn job_id(path: &str) -> Option<&str> {
    let id = path.trim_start_matches('/');
    let ok = !id.is_empty() && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-');
    ok.then_some(id)
}

/// Serve the stored HTML for a job (the URI-scheme handler's whole body).
pub fn respond(app: &tauri::AppHandle, path: &str) -> tauri::http::Response<Vec<u8>> {
    let html = job_id(path).and_then(|id| app.state::<PrintJobs>().0.lock().ok()?.get(id).cloned());
    match html {
        Some(body) => tauri::http::Response::builder()
            .header("Content-Type", "text/html; charset=utf-8")
            .header("Content-Security-Policy", CSP)
            .body(body.into_bytes())
            .expect("static response"),
        None => tauri::http::Response::builder()
            .status(404)
            .header("Content-Security-Policy", CSP)
            .body(b"no such print job".to_vec())
            .expect("static response"),
    }
}

fn job_url(id: &str) -> String {
    // Custom schemes are rewritten to an http host on Windows (WebView2 has no
    // scheme registration); macOS and Linux keep the bare scheme.
    if cfg!(windows) {
        format!("http://{SCHEME}.localhost/{id}")
    } else {
        format!("{SCHEME}://localhost/{id}")
    }
}

/// Is this URL the job document itself? Scheme, host and path must all match:
/// a print window shows exactly one document and goes nowhere else. Exported
/// HTML is user content (a notebook keeps raw markdown HTML on purpose), so a
/// link or a meta refresh must neither navigate the window nor get printed —
/// a suffix test would have accepted `https://elsewhere.example/<id>`.
pub fn is_job_url(url: &tauri::Url, expected: &tauri::Url) -> bool {
    url.scheme() == expected.scheme()
        && url.host_str() == expected.host_str()
        && url.path().trim_end_matches('/') == expected.path().trim_end_matches('/')
}

fn is_job_url_str(url: &str, expected: &tauri::Url) -> bool {
    tauri::Url::parse(url).map(|u| is_job_url(&u, expected)).unwrap_or(false)
}

/// Open `html` in a print window titled `title` and run the print dialog on it.
/// `true` = the dialog opened; `false` = the document is on screen but the user
/// has to press the print shortcut themselves.
#[tauri::command]
pub async fn print_html(app: tauri::AppHandle, title: String, html: String) -> AppResult<bool> {
    let id = format!("{}-{:08x}", chrono::Utc::now().timestamp_millis(), rand::random::<u32>());
    let jobs = app.state::<PrintJobs>();
    jobs.0
        .lock()
        .map_err(|_| AppError::Storage("print queue is poisoned".into()))?
        .insert(id.clone(), html);
    // Anything that fails from here on must not leave the document in the map.
    let drop_job = || {
        if let Ok(mut map) = app.state::<PrintJobs>().0.lock() {
            map.remove(&id);
        }
    };

    let url = match tauri::Url::parse(&job_url(&id)) {
        Ok(u) => u,
        Err(e) => {
            drop_job();
            return Err(AppError::Storage(e.to_string()));
        }
    };

    // The print attempt happens on page load; the command waits for its result
    // so the toast can tell the truth about whether a dialog appeared.
    let (tx, rx) = tokio::sync::oneshot::channel::<bool>();
    let once = Arc::new(Mutex::new(Some(tx)));
    let page_url = url.clone();
    let nav_url = url.clone();
    let built = WebviewWindowBuilder::new(&app, format!("print-{id}"), WebviewUrl::CustomProtocol(url))
        // The window loads its document and nothing else, ever.
        .on_navigation(move |to| is_job_url(to, &nav_url))
        .title(format!("{title} — Print"))
        .inner_size(900.0, 1000.0)
        .center()
        .on_page_load(move |webview, payload| {
            if !matches!(payload.event(), PageLoadEvent::Finished) {
                return;
            }
            if !is_job_url_str(payload.url().as_str(), &page_url) {
                return;
            }
            // Take the sender: the dialog runs for the first load of this
            // document and never again in this window.
            let Some(tx) = once.lock().ok().and_then(|mut slot| slot.take()) else {
                return;
            };
            std::thread::spawn(move || {
                std::thread::sleep(SETTLE);
                // wry implements the native dialog on macOS; elsewhere the
                // page's own window.print() works.
                let ok = webview.print().is_ok() || webview.eval("window.print()").is_ok();
                let _ = tx.send(ok);
            });
        })
        .build();
    let window = match built {
        Ok(w) => w,
        Err(e) => {
            drop_job();
            return Err(AppError::Storage(e.to_string()));
        }
    };

    // The job lives exactly as long as its window.
    let handle = app.clone();
    let job = id.clone();
    window.on_window_event(move |ev| {
        if matches!(ev, tauri::WindowEvent::Destroyed) {
            if let Ok(mut jobs) = handle.state::<PrintJobs>().0.lock() {
                jobs.remove(&job);
            }
        }
    });

    // A window that never finishes loading still shows the document, so a
    // timeout is "no dialog", not a failure.
    Ok(matches!(tokio::time::timeout(DIALOG_WAIT, rx).await, Ok(Ok(true))))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn job_id_accepts_the_ids_we_mint() {
        assert_eq!(job_id("/1758540000000-0000abcd"), Some("1758540000000-0000abcd"));
        assert_eq!(job_id("abc"), Some("abc"));
    }

    #[test]
    fn job_id_rejects_empty_nested_or_odd_paths() {
        assert_eq!(job_id("/"), None);
        assert_eq!(job_id(""), None);
        assert_eq!(job_id("/a/b"), None);
        assert_eq!(job_id("/../etc/passwd"), None);
        assert_eq!(job_id("/a b"), None);
    }

    #[test]
    fn job_url_targets_the_registered_scheme() {
        let u = job_url("x-1");
        assert!(u.ends_with("/x-1"));
        assert!(u.contains("print"));
    }

    fn expected() -> tauri::Url {
        tauri::Url::parse(&job_url("job-1")).unwrap()
    }

    #[test]
    fn the_job_document_is_the_job_document() {
        let e = expected();
        assert!(is_job_url_str(&job_url("job-1"), &e));
        assert!(is_job_url_str(&format!("{}/", job_url("job-1")), &e));
        assert!(is_job_url_str(&format!("{}?x=1", job_url("job-1")), &e));
    }

    #[test]
    fn nothing_else_loads_or_prints_in_a_print_window() {
        let e = expected();
        // The suffix trap: a link in exported HTML pointing at another host.
        assert!(!is_job_url_str("https://attacker.example/job-1", &e));
        assert!(!is_job_url_str("https://attacker.example/x/job-1", &e));
        assert!(!is_job_url_str("http://localhost/job-1", &e));
        assert!(!is_job_url_str(&job_url("job-2"), &e));
        assert!(!is_job_url_str("about:blank", &e));
        assert!(!is_job_url_str("not a url", &e));
    }

    #[test]
    fn the_served_document_can_neither_execute_nor_reach_the_network() {
        assert!(CSP.contains("script-src 'none'"));
        assert!(CSP.contains("connect-src 'none'"));
        assert!(CSP.contains("default-src 'none'"));
        assert!(CSP.contains("form-action 'none'"));
    }
}

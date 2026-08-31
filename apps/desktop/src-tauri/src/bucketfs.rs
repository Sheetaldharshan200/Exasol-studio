//! BucketFS support: upload virtual-schema driver files (e.g. JDBC jars,
//! adapter script archives) into an Exasol BucketFS bucket over HTTP, and list
//! existing bucket contents. Adapter scripts themselves are created via SQL
//! (`execute_sql`) from the frontend, referencing the uploaded file.

use crate::error::{AppError, AppResult};

fn base_url(host: &str, port: u16, tls: bool, bucket: &str) -> String {
    let scheme = if tls { "https" } else { "http" };
    format!("{scheme}://{host}:{port}/{bucket}")
}

/// List the files in a BucketFS bucket. Public buckets need no password;
/// private buckets use the read password (user `r`).
#[tauri::command]
pub async fn bucketfs_list(
    host: String,
    port: u16,
    tls: bool,
    bucket: String,
    read_password: Option<String>,
) -> AppResult<Vec<String>> {
    let url = format!("{}/", base_url(&host, port, tls, &bucket));
    let client = reqwest::Client::builder()
        .danger_accept_invalid_certs(tls)
        .build()
        .map_err(|e| AppError::Storage(e.to_string()))?;
    let mut req = client.get(&url).header("User-Agent", "exasol-studio");
    if let Some(pw) = read_password.filter(|p| !p.is_empty()) {
        req = req.basic_auth("r", Some(pw));
    }
    let resp = req.send().await.map_err(|e| AppError::Storage(e.to_string()))?;
    if !resp.status().is_success() {
        return Err(AppError::Storage(format!("BucketFS list failed (HTTP {}).", resp.status())));
    }
    let body = resp.text().await.map_err(|e| AppError::Storage(e.to_string()))?;
    // BucketFS returns object paths separated by whitespace/newlines.
    Ok(body
        .split_whitespace()
        .filter(|s| !s.is_empty())
        .map(|s| s.trim_start_matches('/').to_string())
        .collect())
}

/// Download a file from a BucketFS bucket to a local path.
#[tauri::command]
pub async fn bucketfs_download(
    host: String,
    port: u16,
    tls: bool,
    bucket: String,
    remote_path: String,
    dest_path: String,
    read_password: Option<String>,
) -> AppResult<String> {
    let remote = remote_path.trim_start_matches('/');
    let url = format!("{}/{remote}", base_url(&host, port, tls, &bucket));
    let client = reqwest::Client::builder()
        .danger_accept_invalid_certs(tls)
        .build()
        .map_err(|e| AppError::Storage(e.to_string()))?;
    let mut req = client.get(&url).header("User-Agent", "exasol-studio");
    if let Some(pw) = read_password.filter(|p| !p.is_empty()) {
        req = req.basic_auth("r", Some(pw));
    }
    let resp = req.send().await.map_err(|e| AppError::Storage(e.to_string()))?;
    if !resp.status().is_success() {
        return Err(AppError::Storage(format!("BucketFS download failed (HTTP {}).", resp.status())));
    }
    let bytes = resp.bytes().await.map_err(|e| AppError::Storage(e.to_string()))?;
    std::fs::write(&dest_path, &bytes)?;
    Ok(dest_path)
}

/// Upload a local file into a BucketFS bucket via HTTP PUT (user `w`).
/// Returns the BucketFS path usable in `CREATE ... SCRIPT` / adapter definitions.
#[tauri::command]
pub async fn bucketfs_upload(
    host: String,
    port: u16,
    tls: bool,
    bucket: String,
    remote_path: String,
    local_path: String,
    write_password: String,
) -> AppResult<String> {
    let bytes = std::fs::read(&local_path)
        .map_err(|e| AppError::Storage(format!("Could not read {local_path}: {e}")))?;
    let remote = remote_path.trim_start_matches('/');
    let url = format!("{}/{remote}", base_url(&host, port, tls, &bucket));
    let client = reqwest::Client::builder()
        .danger_accept_invalid_certs(tls)
        .build()
        .map_err(|e| AppError::Storage(e.to_string()))?;
    let resp = client
        .put(&url)
        .basic_auth("w", Some(write_password))
        .header("User-Agent", "exasol-studio")
        .body(bytes)
        .send()
        .await
        .map_err(|e| AppError::Storage(e.to_string()))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let msg = resp.text().await.unwrap_or_default();
        return Err(AppError::Storage(format!("BucketFS upload failed (HTTP {status}). {msg}")));
    }
    // The path a UDF/adapter references inside the DB.
    Ok(format!("/buckets/{}/{}/{}", "bfsdefault", bucket, remote))
}

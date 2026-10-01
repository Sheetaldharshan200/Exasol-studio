//! An SSH tunnel to a database the machine cannot reach directly, run by the
//! system's OpenSSH client (`ssh -N -L`): so ~/.ssh/config aliases, ProxyJump,
//! the agent and known_hosts behave exactly as in a terminal. A password or
//! key passphrase is handed over by an askpass helper through the child's
//! environment — never on the command line.

use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Child, Stdio};
use std::time::Duration;

use crate::error::{AppError, AppResult};
use crate::network::SshSettings;

/// A running tunnel: the database is at 127.0.0.1:`port`. Dropping it ends ssh.
pub struct SshTunnel {
    child: Child,
    pub port: u16,
}

impl Drop for SshTunnel {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

/// Studio's own known_hosts (keys trusted from the app), read with the user's.
pub fn known_hosts_file(data_dir: &Path) -> PathBuf {
    data_dir.join("ssh").join("known_hosts")
}

fn quote(p: &Path) -> String {
    format!("\"{}\"", p.to_string_lossy().replace('"', ""))
}

/// The ssh command line for a tunnel (without the program name).
pub fn ssh_args(s: &SshSettings, local_port: u16, target_host: &str, target_port: u16, timeout_secs: u64, known_hosts: &Path, has_secret: bool) -> Vec<String> {
    let target = if target_host.contains(':') { format!("[{target_host}]") } else { target_host.to_string() };
    let mut a: Vec<String> = vec![
        "-N".into(),
        "-T".into(),
        "-L".into(),
        format!("127.0.0.1:{local_port}:{target}:{target_port}"),
        "-o".into(),
        "ExitOnForwardFailure=yes".into(),
        "-o".into(),
        format!("ConnectTimeout={}", timeout_secs.max(1)),
        "-o".into(),
        format!("StrictHostKeyChecking={}", if s.host_key == "accept_new" { "accept-new" } else { "yes" }),
        "-o".into(),
        format!("UserKnownHostsFile={} ~/.ssh/known_hosts", quote(known_hosts)),
    ];
    if s.keepalive_secs > 0 {
        a.extend(["-o".into(), format!("ServerAliveInterval={}", s.keepalive_secs), "-o".into(), "ServerAliveCountMax=3".into()]);
    }
    match s.auth.as_str() {
        "password" => a.extend(
            ["-o", "PreferredAuthentications=password,keyboard-interactive", "-o", "PubkeyAuthentication=no", "-o", "NumberOfPasswordPrompts=1"]
                .map(String::from),
        ),
        "key" => {
            if let Some(k) = &s.key_path {
                a.extend(["-i".into(), k.clone(), "-o".into(), "IdentitiesOnly=yes".into()]);
            }
        }
        _ => {}
    }
    // Without a secret to give, ssh must fail rather than wait for a prompt.
    a.extend(["-o".into(), format!("BatchMode={}", if has_secret { "no" } else { "yes" })]);
    if let Some(p) = s.port {
        a.extend(["-p".into(), p.to_string()]);
    }
    if let Some(u) = &s.user {
        a.extend(["-l".into(), u.clone()]);
    }
    if let Some(j) = &s.jump {
        a.extend(["-J".into(), j.clone()]);
    }
    a.push("--".into());
    a.push(s.host.clone());
    a
}

/// What ssh's stderr means for the person.
pub fn humanize_ssh_error(stderr: &str, host: &str) -> String {
    let e = stderr.to_ascii_lowercase();
    let has = |p: &str| e.contains(p);
    if has("administratively prohibited") {
        return format!("The SSH server {host} does not allow port forwarding (AllowTcpForwarding). Ask its administrator to allow it for this user.");
    }
    if has("remote host identification has changed") {
        return format!("The SSH host key of {host} has CHANGED since it was trusted. This can mean someone is intercepting the connection; check with the server's administrator before trusting the new key.");
    }
    if has("host key verification failed") {
        return format!("The SSH host key of {host} is not trusted yet. Choose \"Ask\" or \"Accept new\" for host keys, or add it to ~/.ssh/known_hosts.");
    }
    if has("permission denied") || has("too many authentication failures") {
        return format!("SSH sign-in to {host} was refused. Check the user and the key, password or agent.");
    }
    if has("could not resolve hostname") {
        return format!("The SSH server name {host} could not be resolved.");
    }
    if has("connection refused") {
        return format!("Nothing answers SSH on {host} (connection refused). Check the host and port.");
    }
    if has("timed out") {
        return format!("The SSH server {host} did not answer in time.");
    }
    if has("open failed") || has("connect failed") {
        return "The SSH server could not reach the database. Check the database host and port as the SSH server sees them.".into();
    }
    if has("bad passphrase") || has("incorrect passphrase") {
        return "The passphrase of the SSH key is wrong.".into();
    }
    stderr.lines().rev().find(|l| !l.trim().is_empty()).map(str::trim).unwrap_or("The SSH tunnel could not be opened.").to_string()
}

/// The askpass helper: prints the secret the parent put in its environment.
fn askpass_helper(data_dir: &Path) -> std::io::Result<PathBuf> {
    let dir = data_dir.join("ssh");
    std::fs::create_dir_all(&dir)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let p = dir.join("askpass.sh");
        std::fs::write(&p, "#!/bin/sh\nprintf '%s\\n' \"$STUDIO_SSH_SECRET\"\n")?;
        std::fs::set_permissions(&p, std::fs::Permissions::from_mode(0o700))?;
        Ok(p)
    }
    #[cfg(not(unix))]
    {
        let p = dir.join("askpass.cmd");
        std::fs::write(&p, "@echo off\r\nsetlocal EnableDelayedExpansion\r\necho(!STUDIO_SSH_SECRET!\r\n")?;
        Ok(p)
    }
}

fn free_port() -> std::io::Result<u16> {
    Ok(std::net::TcpListener::bind(("127.0.0.1", 0))?.local_addr()?.port())
}

/// Start the tunnel and wait until it forwards (or say why it cannot).
pub async fn open(s: &SshSettings, secret: &str, target_host: &str, target_port: u16, timeout: Duration, data_dir: &Path) -> AppResult<SshTunnel> {
    let port = free_port()?;
    let known = known_hosts_file(data_dir);
    std::fs::create_dir_all(known.parent().expect("ssh dir"))?;
    let has_secret = !secret.is_empty() && s.auth != "agent";
    let args = ssh_args(s, port, target_host, target_port, timeout.as_secs(), &known, has_secret);
    let mut cmd = crate::process::command("ssh");
    cmd.args(&args).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::piped());
    if has_secret {
        cmd.env("SSH_ASKPASS", askpass_helper(data_dir)?)
            .env("SSH_ASKPASS_REQUIRE", "force")
            .env("DISPLAY", ":0")
            .env("STUDIO_SSH_SECRET", secret);
    }
    let mut child = cmd.spawn().map_err(|e| AppError::Database(format!("Could not run ssh ({e}). Install the OpenSSH client.")))?;
    // ssh's messages, collected as they come: a refused forward shows here
    // only when the first connection is tried, while ssh keeps running.
    let said = std::sync::Arc::new(std::sync::Mutex::new(String::new()));
    if let Some(mut err) = child.stderr.take() {
        let said = std::sync::Arc::clone(&said);
        std::thread::spawn(move || {
            let mut buf = [0u8; 1024];
            while let Ok(n) = err.read(&mut buf) {
                if n == 0 {
                    break;
                }
                if let Ok(mut s) = said.lock() {
                    s.push_str(&String::from_utf8_lossy(&buf[..n]));
                }
            }
        });
    }
    let said_now = |said: &std::sync::Arc<std::sync::Mutex<String>>| said.lock().map(|s| s.clone()).unwrap_or_default();
    let mut tunnel = SshTunnel { child, port };
    let started = std::time::Instant::now();
    loop {
        if let Some(status) = tunnel.child.try_wait()? {
            tokio::time::sleep(Duration::from_millis(100)).await;
            let err = said_now(&said);
            return Err(AppError::Database(if err.trim().is_empty() { format!("ssh ended ({status}).") } else { humanize_ssh_error(&err, &s.host) }));
        }
        if let Ok(mut probe) = tokio::net::TcpStream::connect(("127.0.0.1", port)).await {
            // The database waits for the client to speak: a working forward
            // stays silent; one the server refuses closes at once.
            use tokio::io::AsyncReadExt;
            let mut b = [0u8; 1];
            match tokio::time::timeout(Duration::from_millis(800), probe.read(&mut b)).await {
                Ok(Ok(0)) | Ok(Err(_)) => {
                    tokio::time::sleep(Duration::from_millis(100)).await;
                    let err = said_now(&said);
                    return Err(AppError::Database(if err.trim().is_empty() { "The SSH tunnel closed the connection to the database.".into() } else { humanize_ssh_error(&err, &s.host) }));
                }
                _ => return Ok(tunnel),
            }
        }
        if started.elapsed() > timeout + Duration::from_secs(2) {
            return Err(AppError::Database(format!("The SSH tunnel through {} did not open in time.", s.host)));
        }
        tokio::time::sleep(Duration::from_millis(150)).await;
    }
}

// ── Host keys ("ask") ───────────────────────────────────────────────────────

/// `hostname` and `port` from `ssh -G` output (the effective config).
pub fn effective_target(ssh_g: &str) -> Option<(String, u16)> {
    let mut host = None;
    let mut port = None;
    for line in ssh_g.lines() {
        let mut parts = line.splitn(2, ' ');
        match (parts.next(), parts.next()) {
            (Some("hostname"), Some(h)) => host = Some(h.trim().to_string()),
            (Some("port"), Some(p)) => port = p.trim().parse().ok(),
            _ => {}
        }
    }
    Some((host?, port.unwrap_or(22)))
}

/// The known_hosts name of a host: `host`, or `[host]:port` off port 22.
pub fn known_hosts_name(host: &str, port: u16) -> String {
    if port == 22 { host.to_string() } else { format!("[{host}]:{port}") }
}

fn run(program: &str, args: &[String], input: Option<&str>) -> std::io::Result<std::process::Output> {
    use std::io::Write;
    let mut cmd = crate::process::command(program);
    cmd.args(args).stdin(if input.is_some() { Stdio::piped() } else { Stdio::null() }).stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = cmd.spawn()?;
    if let (Some(text), Some(mut stdin)) = (input, child.stdin.take()) {
        let _ = stdin.write_all(text.as_bytes());
    }
    child.wait_with_output()
}

fn resolve(s: &SshSettings) -> AppResult<(String, u16)> {
    let mut args: Vec<String> = vec!["-G".into()];
    if let Some(p) = s.port {
        args.extend(["-p".into(), p.to_string()]);
    }
    args.extend(["--".into(), s.host.clone()]);
    let out = run("ssh", &args, None).map_err(|e| AppError::Database(format!("Could not run ssh ({e}).")))?;
    effective_target(&String::from_utf8_lossy(&out.stdout)).ok_or_else(|| AppError::Database(format!("ssh could not read the settings for {}.", s.host)))
}

fn is_known(name: &str, data_dir: &Path) -> bool {
    let home = std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")).map(PathBuf::from);
    let files = [Some(known_hosts_file(data_dir)), home.map(|h| h.join(".ssh").join("known_hosts"))];
    files.into_iter().flatten().filter(|f| f.exists()).any(|f| {
        run("ssh-keygen", &["-F".into(), name.to_string(), "-f".into(), f.to_string_lossy().into_owned()], None).is_ok_and(|o| o.status.success() && !o.stdout.is_empty())
    })
}

/// The server's host keys (known_hosts lines) and their SHA256 fingerprints.
fn scan(host: &str, port: u16, timeout: Duration) -> AppResult<(String, String)> {
    let args = vec!["-T".into(), timeout.as_secs().max(1).to_string(), "-p".into(), port.to_string(), "--".into(), host.to_string()];
    let out = run("ssh-keyscan", &args, None).map_err(|e| AppError::Database(format!("Could not run ssh-keyscan ({e}).")))?;
    let lines = String::from_utf8_lossy(&out.stdout).into_owned();
    if lines.trim().is_empty() {
        return Err(AppError::Database(format!("{host} did not present an SSH host key.")));
    }
    let fp = run("ssh-keygen", &["-lf".into(), "-".into()], Some(&lines)).map_err(|e| AppError::Database(e.to_string()))?;
    Ok((lines, fingerprints(&String::from_utf8_lossy(&fp.stdout))))
}

/// The SHA256 fingerprints of `ssh-keygen -lf` output, joined for display.
pub fn fingerprints(keygen: &str) -> String {
    let mut fps: Vec<String> = keygen
        .lines()
        .filter_map(|l| {
            let fp = l.split_whitespace().find(|w| w.starts_with("SHA256:"))?;
            let kind = l.rsplit('(').next().map(|k| k.trim_end_matches(')').trim()).unwrap_or("");
            Some(format!("{kind} {fp}"))
        })
        .collect();
    fps.sort();
    fps.dedup();
    fps.join("\n")
}

/// For host_key = "ask": Ok when the host key is already known; otherwise
/// `UnknownHostKey` with its fingerprints, for the person to decide.
pub fn check_host_key(s: &SshSettings, data_dir: &Path, timeout: Duration) -> AppResult<()> {
    if s.host_key != "ask" {
        return Ok(());
    }
    let (host, port) = resolve(s)?;
    if is_known(&known_hosts_name(&host, port), data_dir) {
        return Ok(());
    }
    if s.jump.is_some() {
        return Err(AppError::InvalidSettings(format!(
            "The SSH host key of {host} is not known, and through a jump host it cannot be shown here. Choose \"Accept new\", or connect once with ssh in a terminal."
        )));
    }
    let (_, fingerprint) = scan(&host, port, timeout)?;
    Err(AppError::UnknownHostKey { host, fingerprint })
}

/// Trust the host key the person was shown: scanned again, and stored only
/// if it still has exactly the fingerprints they saw.
pub fn trust_host_key(s: &SshSettings, data_dir: &Path, shown: &str, timeout: Duration) -> AppResult<()> {
    let (host, port) = resolve(s)?;
    let (lines, fingerprint) = scan(&host, port, timeout)?;
    if fingerprint != shown {
        return Err(AppError::InvalidSettings("The SSH host key changed while you were deciding. Nothing was trusted; try again.".into()));
    }
    let name = known_hosts_name(&host, port);
    let entries: String = lines
        .lines()
        .filter(|l| !l.starts_with('#') && !l.trim().is_empty())
        .map(|l| {
            // ssh-keyscan names the host without the port off 22.
            let rest = l.split_once(' ').map(|(_, r)| r).unwrap_or(l);
            format!("{name} {rest}\n")
        })
        .collect();
    let file = known_hosts_file(data_dir);
    std::fs::create_dir_all(file.parent().expect("ssh dir"))?;
    let mut all = std::fs::read_to_string(&file).unwrap_or_default();
    all.push_str(&entries);
    crate::storage::write_private(&file, all.as_bytes())?;
    Ok(())
}

/// The person trusts the SSH host key they were shown (from the connect window).
#[tauri::command]
pub async fn ssh_trust_host_key(state: tauri::State<'_, crate::state::AppState>, ssh: SshSettings, fingerprint: String) -> AppResult<()> {
    let timeout = crate::connection::connect_timeout(&state);
    let dir = state.data_dir.clone();
    tauri::async_runtime::spawn_blocking(move || trust_host_key(&ssh, &dir, &fingerprint, timeout))
        .await
        .map_err(|e| AppError::Storage(e.to_string()))?
}

#[cfg(test)]
mod tests {
    use super::*;

    fn s() -> SshSettings {
        SshSettings {
            host: "bastion".into(),
            port: Some(2222),
            user: Some("ops".into()),
            auth: "key".into(),
            key_path: Some("/k/id_ed25519".into()),
            jump: Some("jump@gw".into()),
            host_key: "accept_new".into(),
            keepalive_secs: 20,
            secret: String::new(),
        }
    }

    #[test]
    fn the_command_line_forwards_only_to_the_database_and_checks_host_keys() {
        let a = ssh_args(&s(), 50001, "db.internal", 8563, 15, Path::new("/data/ssh/known hosts"), false);
        let j = a.join(" ");
        assert!(j.starts_with("-N -T -L 127.0.0.1:50001:db.internal:8563 "), "{j}");
        assert!(j.contains("StrictHostKeyChecking=accept-new"));
        assert!(j.contains("UserKnownHostsFile=\"/data/ssh/known hosts\" ~/.ssh/known_hosts"), "spaces quoted: {j}");
        assert!(j.contains("ConnectTimeout=15") && j.contains("ServerAliveInterval=20"));
        assert!(j.contains("-i /k/id_ed25519 -o IdentitiesOnly=yes"));
        assert!(j.contains("BatchMode=yes"), "no prompt to hang on without a secret");
        assert!(j.ends_with("-p 2222 -l ops -J jump@gw -- bastion"), "the host after -- can never be an option: {j}");
    }

    #[test]
    fn strict_and_ask_never_accept_an_unknown_key_by_themselves() {
        for mode in ["strict", "ask"] {
            let a = ssh_args(&SshSettings { host_key: mode.into(), ..s() }, 1, "d", 8563, 5, Path::new("/k"), false).join(" ");
            assert!(a.contains("StrictHostKeyChecking=yes"), "{mode}");
        }
    }

    #[test]
    fn a_password_turns_off_keys_and_batch_mode() {
        let a = ssh_args(&SshSettings { auth: "password".into(), key_path: None, ..s() }, 1, "::1", 8563, 5, Path::new("/k"), true).join(" ");
        assert!(a.contains("PubkeyAuthentication=no") && a.contains("BatchMode=no"));
        assert!(a.contains("127.0.0.1:1:[::1]:8563"), "an IPv6 target in brackets");
        let agent = ssh_args(&SshSettings { auth: "agent".into(), key_path: None, keepalive_secs: 0, port: None, user: None, jump: None, ..s() }, 1, "d", 1, 5, Path::new("/k"), false).join(" ");
        assert!(!agent.contains("-i ") && !agent.contains("ServerAlive") && !agent.contains("-p ") && agent.ends_with("-- bastion"));
    }

    #[test]
    fn ssh_errors_say_what_to_do() {
        assert!(humanize_ssh_error("@@@ WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED! @@@", "b").contains("CHANGED"));
        assert!(humanize_ssh_error("Host key verification failed.", "b").contains("not trusted"));
        assert!(humanize_ssh_error("ops@b: Permission denied (publickey).", "b").contains("refused"));
        assert!(humanize_ssh_error("channel 1: open failed: administratively prohibited: open failed", "b").contains("does not allow port forwarding"));
        assert!(humanize_ssh_error("ssh: Could not resolve hostname nope", "nope").contains("could not be resolved"));
        assert!(humanize_ssh_error("channel 2: open failed: connect failed: Connection refused", "b").contains("refused") || humanize_ssh_error("channel 2: open failed", "b").contains("database"));
        assert_eq!(humanize_ssh_error("debug1: x\nsomething odd\n", "b"), "something odd");
    }

    #[test]
    fn the_effective_target_and_known_hosts_name() {
        assert_eq!(effective_target("user ops\nhostname 10.0.0.5\nport 2222\n"), Some(("10.0.0.5".into(), 2222)));
        assert_eq!(effective_target("hostname bastion\n"), Some(("bastion".into(), 22)));
        assert_eq!(effective_target("port 22\n"), None);
        assert_eq!(known_hosts_name("h", 22), "h");
        assert_eq!(known_hosts_name("h", 2222), "[h]:2222");
    }

    #[tokio::test]
    async fn an_ssh_server_that_does_not_exist_is_reported_plainly() {
        if std::process::Command::new("ssh").arg("-V").output().is_err() {
            return; // no OpenSSH client on this machine
        }
        let dir = std::env::temp_dir().join(format!("studio-ssh-{}", std::process::id()));
        let s = SshSettings { host: "no-such-host.invalid".into(), port: None, user: None, auth: "agent".into(), key_path: None, jump: None, host_key: "accept_new".into(), keepalive_secs: 0, secret: String::new() };
        let err = match open(&s, "", "db", 8563, Duration::from_secs(5), &dir).await {
            Err(e) => e.to_string(),
            Ok(_) => panic!("a tunnel to nowhere opened"),
        };
        assert!(err.contains("could not be resolved") || err.contains("did not"), "{err}");
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn fingerprints_are_listed_once_with_their_kind() {
        let out = "256 SHA256:abc h (ED25519)\n3072 SHA256:def h (RSA)\n256 SHA256:abc h (ED25519)\n";
        assert_eq!(fingerprints(out), "ED25519 SHA256:abc\nRSA SHA256:def");
        assert_eq!(fingerprints(""), "");
    }
}

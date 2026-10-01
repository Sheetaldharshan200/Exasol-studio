//! An SSH tunnel to a database the machine cannot reach directly, run by the
//! system's OpenSSH client: so ~/.ssh/config aliases, ProxyJump, the agent and
//! known_hosts behave exactly as in a terminal. Studio holds the loopback
//! port itself, and every database connection to it gets its own
//! `ssh -W host:port` (stdin/stdout relay) — no port is ever handed to ssh,
//! so no other process can slip in between choosing and binding one. A
//! password or key passphrase is handed over by an askpass helper through
//! the child's environment — never on the command line.

use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Arc;
use std::time::Duration;

use crate::error::{AppError, AppResult};
use crate::network::SshSettings;

/// A running tunnel: the database is at 127.0.0.1:`port`. Dropping it stops
/// accepting and ends every ssh it started.
pub struct SshTunnel {
    pub port: u16,
    task: tokio::task::JoinHandle<()>,
}

impl Drop for SshTunnel {
    fn drop(&mut self) {
        self.task.abort();
    }
}

/// Studio's own known_hosts (keys trusted from the app), read with the user's.
pub fn known_hosts_file(data_dir: &Path) -> PathBuf {
    data_dir.join("ssh").join("known_hosts")
}

fn quote(p: &Path) -> String {
    format!("\"{}\"", p.to_string_lossy().replace('"', ""))
}

/// The ssh command line for one relayed connection (without the program
/// name): stdin/stdout become the database connection (`-W`).
pub fn ssh_args(s: &SshSettings, target_host: &str, target_port: u16, timeout_secs: u64, known_hosts: &Path, has_secret: bool) -> Vec<String> {
    let target = if target_host.contains(':') { format!("[{target_host}]") } else { target_host.to_string() };
    let mut a: Vec<String> = vec![
        "-T".into(),
        "-W".into(),
        format!("{target}:{target_port}"),
        // "Authenticated to …" tells when the session is up.
        "-o".into(),
        "LogLevel=VERBOSE".into(),
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

/// How to start one ssh for this tunnel: its arguments and environment.
struct Plan {
    args: Vec<String>,
    env: Vec<(&'static str, std::ffi::OsString)>,
}

fn spawn(plan: &Plan) -> std::io::Result<tokio::process::Child> {
    let mut cmd = tokio::process::Command::from(crate::process::command("ssh"));
    cmd.args(&plan.args).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped()).kill_on_drop(true);
    for (k, v) in &plan.env {
        cmd.env(k, v);
    }
    cmd.spawn()
}

/// Start one ssh and wait until it signed in and opened the channel — or
/// say why not. The first connection's check; nothing is relayed through it.
async fn probe(plan: &Plan, host: &str, timeout: Duration) -> AppResult<()> {
    use tokio::io::AsyncBufReadExt;
    let mut child = spawn(plan).map_err(|e| AppError::Database(format!("Could not run ssh ({e}). Install the OpenSSH client.")))?;
    let mut lines = tokio::io::BufReader::new(child.stderr.take().expect("stderr piped")).lines();
    let mut said = String::new();
    let deadline = tokio::time::Instant::now() + timeout + Duration::from_secs(2);
    let mut authed_at: Option<tokio::time::Instant> = None;
    loop {
        // After sign-in, a moment for a refused channel to show.
        let until = authed_at.map(|t| t + Duration::from_millis(700)).unwrap_or(deadline).min(deadline);
        match tokio::time::timeout_at(until, lines.next_line()).await {
            Ok(Ok(Some(line))) => {
                said.push_str(&line);
                said.push('\n');
                let l = line.to_ascii_lowercase();
                if l.contains("open failed") || l.contains("administratively prohibited") {
                    return Err(AppError::Database(humanize_ssh_error(&said, host)));
                }
                if l.contains("authenticated to") {
                    authed_at.get_or_insert_with(tokio::time::Instant::now);
                }
            }
            // ssh ended (stderr closed) before or after signing in.
            Ok(_) => {
                let _ = child.wait().await;
                return Err(AppError::Database(if said.trim().is_empty() { "ssh ended without a message.".into() } else { humanize_ssh_error(&said, host) }));
            }
            Err(_) if authed_at.is_some() => return Ok(()),
            Err(_) => return Err(AppError::Database(format!("The SSH server {host} did not answer in time."))),
        }
    }
}

async fn relay(mut local: tokio::net::TcpStream, plan: Arc<Plan>) {
    let Ok(mut child) = spawn(&plan) else { return };
    let (Some(mut stdin), Some(mut stdout), Some(mut stderr)) = (child.stdin.take(), child.stdout.take(), child.stderr.take()) else { return };
    // ssh's messages are drained so it never blocks writing them.
    tokio::spawn(async move {
        let _ = tokio::io::copy(&mut stderr, &mut tokio::io::sink()).await;
    });
    let (mut rd, mut wr) = local.split();
    let up = async {
        let _ = tokio::io::copy(&mut rd, &mut stdin).await;
        drop(stdin);
    };
    let down = async {
        let _ = tokio::io::copy(&mut stdout, &mut wr).await;
    };
    tokio::join!(up, down);
    let _ = child.kill().await;
}

/// Start the tunnel: sign in once to check, then serve a loopback port whose
/// every connection runs through its own `ssh -W`.
pub async fn open(s: &SshSettings, secret: &str, target_host: &str, target_port: u16, timeout: Duration, data_dir: &Path) -> AppResult<SshTunnel> {
    let known = known_hosts_file(data_dir);
    std::fs::create_dir_all(known.parent().expect("ssh dir"))?;
    let has_secret = !secret.is_empty() && s.auth != "agent";
    let mut env: Vec<(&'static str, std::ffi::OsString)> = Vec::new();
    if has_secret {
        env.push(("SSH_ASKPASS", askpass_helper(data_dir)?.into_os_string()));
        env.push(("SSH_ASKPASS_REQUIRE", "force".into()));
        env.push(("DISPLAY", ":0".into()));
        env.push(("STUDIO_SSH_SECRET", secret.into()));
    }
    let plan = Arc::new(Plan { args: ssh_args(s, target_host, target_port, timeout.as_secs(), &known, has_secret), env });
    probe(&plan, &s.host, timeout).await?;
    let listener = tokio::net::TcpListener::bind(("127.0.0.1", 0)).await?;
    let port = listener.local_addr()?.port();
    let task = tokio::spawn(async move {
        let mut relays = tokio::task::JoinSet::new();
        loop {
            tokio::select! {
                accepted = listener.accept() => {
                    let Ok((local, _)) = accepted else { break };
                    if relays.len() >= 256 { continue; }
                    relays.spawn(relay(local, Arc::clone(&plan)));
                }
                Some(_) = relays.join_next(), if !relays.is_empty() => {}
            }
        }
    });
    Ok(SshTunnel { port, task })
}

// ── Host keys ("ask") ───────────────────────────────────────────────────────

/// What `ssh -G` (the effective config) says about the server: where to
/// scan it, and the name its key is checked under in known_hosts.
#[derive(Debug, PartialEq)]
pub struct Target {
    pub host: String,
    pub port: u16,
    /// `HostKeyAlias` when set: ssh checks the key under this name.
    pub alias: Option<String>,
}

pub fn effective_target(ssh_g: &str) -> Option<Target> {
    let mut host = None;
    let mut port = None;
    let mut alias = None;
    for line in ssh_g.lines() {
        let mut parts = line.splitn(2, ' ');
        match (parts.next(), parts.next()) {
            (Some("hostname"), Some(h)) => host = Some(h.trim().to_string()),
            (Some("port"), Some(p)) => port = p.trim().parse().ok(),
            (Some("hostkeyalias"), Some(a)) if !a.trim().is_empty() && a.trim() != "none" => alias = Some(a.trim().to_string()),
            _ => {}
        }
    }
    Some(Target { host: host?, port: port.unwrap_or(22), alias })
}

impl Target {
    /// The known_hosts name ssh looks the key up by.
    pub fn known_name(&self) -> String {
        self.alias.clone().unwrap_or_else(|| known_hosts_name(&self.host, self.port))
    }
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

fn resolve(s: &SshSettings) -> AppResult<Target> {
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
    let target = resolve(s)?;
    let (host, port) = (target.host.clone(), target.port);
    if is_known(&target.known_name(), data_dir) {
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
    let target = resolve(s)?;
    let (lines, fingerprint) = scan(&target.host, target.port, timeout)?;
    if fingerprint != shown {
        return Err(AppError::InvalidSettings("The SSH host key changed while you were deciding. Nothing was trusted; try again.".into()));
    }
    let name = target.known_name();
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
        let a = ssh_args(&s(), "db.internal", 8563, 15, Path::new("/data/ssh/known hosts"), false);
        let j = a.join(" ");
        assert!(j.starts_with("-T -W db.internal:8563 "), "only a channel to the database: {j}");
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
            let a = ssh_args(&SshSettings { host_key: mode.into(), ..s() }, "d", 8563, 5, Path::new("/k"), false).join(" ");
            assert!(a.contains("StrictHostKeyChecking=yes"), "{mode}");
        }
    }

    #[test]
    fn a_password_turns_off_keys_and_batch_mode() {
        let a = ssh_args(&SshSettings { auth: "password".into(), key_path: None, ..s() }, "::1", 8563, 5, Path::new("/k"), true).join(" ");
        assert!(a.contains("PubkeyAuthentication=no") && a.contains("BatchMode=no"));
        assert!(a.contains("-W [::1]:8563"), "an IPv6 target in brackets");
        let agent = ssh_args(&SshSettings { auth: "agent".into(), key_path: None, keepalive_secs: 0, port: None, user: None, jump: None, ..s() }, "d", 1, 5, Path::new("/k"), false).join(" ");
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
        let t = effective_target("user ops\nhostname 10.0.0.5\nport 2222\n").unwrap();
        assert_eq!((t.host.as_str(), t.port, t.known_name()), ("10.0.0.5", 2222, "[10.0.0.5]:2222".to_string()));
        assert_eq!(effective_target("hostname bastion\n").unwrap().known_name(), "bastion");
        assert_eq!(effective_target("hostname 10.0.0.5\nport 2222\nhostkeyalias prod-bastion\n").unwrap().known_name(), "prod-bastion", "checked under the alias, as ssh does");
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

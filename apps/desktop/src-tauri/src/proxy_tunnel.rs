//! A connection through an HTTP (CONNECT) or SOCKS5 proxy. The driver cannot
//! use a proxy, so it connects to a loopback port and each connection is
//! relayed through the proxy to the database. TLS to the database is end to
//! end: the proxy only ever sees encrypted bytes.

use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;

use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};

use crate::network::ProxySettings;

/// A running relay; dropping it ends it and every connection through it.
pub struct ProxyTunnel {
    pub addr: SocketAddr,
    task: tokio::task::JoinHandle<()>,
}

impl Drop for ProxyTunnel {
    fn drop(&mut self) {
        self.task.abort();
    }
}

// ── The protocols, pure ─────────────────────────────────────────────────────

/// The SOCKS5 greeting: no authentication, or user/password when given.
pub fn socks5_greeting(with_password: bool) -> Vec<u8> {
    if with_password { vec![5, 2, 0, 2] } else { vec![5, 1, 0] }
}

/// RFC 1929 user/password sub-negotiation.
pub fn socks5_auth(user: &str, password: &str) -> Option<Vec<u8>> {
    if user.len() > 255 || password.len() > 255 {
        return None;
    }
    let mut v = vec![1, user.len() as u8];
    v.extend_from_slice(user.as_bytes());
    v.push(password.len() as u8);
    v.extend_from_slice(password.as_bytes());
    Some(v)
}

/// CONNECT to a host name (the proxy resolves it) and port.
pub fn socks5_connect(host: &str, port: u16) -> Option<Vec<u8>> {
    if host.is_empty() || host.len() > 255 {
        return None;
    }
    let mut v = vec![5, 1, 0, 3, host.len() as u8];
    v.extend_from_slice(host.as_bytes());
    v.extend_from_slice(&port.to_be_bytes());
    Some(v)
}

pub fn socks5_reply_error(code: u8) -> &'static str {
    match code {
        1 => "general failure",
        2 => "not allowed by the proxy's rules",
        3 => "network unreachable",
        4 => "host unreachable",
        5 => "connection refused",
        6 => "TTL expired",
        7 => "command not supported",
        8 => "address type not supported",
        _ => "unknown error",
    }
}

/// The HTTP CONNECT request, with Basic authentication when given.
pub fn http_connect(host: &str, port: u16, auth: Option<(&str, &str)>) -> String {
    use base64::Engine;
    let target = if host.contains(':') { format!("[{host}]:{port}") } else { format!("{host}:{port}") };
    let mut req = format!("CONNECT {target} HTTP/1.1\r\nHost: {target}\r\n");
    if let Some((u, p)) = auth {
        let token = base64::engine::general_purpose::STANDARD.encode(format!("{u}:{p}"));
        req.push_str(&format!("Proxy-Authorization: Basic {token}\r\n"));
    }
    req.push_str("\r\n");
    req
}

/// The status of an HTTP proxy's reply head: Ok for 2xx, else why not.
pub fn http_connect_status(head: &str) -> Result<(), String> {
    let line = head.lines().next().unwrap_or_default();
    let code: u16 = line.split_whitespace().nth(1).and_then(|c| c.parse().ok()).unwrap_or(0);
    match code {
        200..=299 => Ok(()),
        407 => Err("the proxy needs a user and password (407)".into()),
        0 => Err("the proxy did not answer in HTTP".into()),
        c => Err(format!("the proxy refused the connection ({c})")),
    }
}

// ── Running it ──────────────────────────────────────────────────────────────

async fn through(p: &ProxySettings, secret: &str, host: &str, port: u16) -> std::io::Result<TcpStream> {
    let err = |m: String| std::io::Error::other(format!("Proxy {}:{}: {m}", p.host, p.port));
    let mut s = TcpStream::connect((p.host.as_str(), p.port)).await?;
    let auth = p.user.as_deref().map(|u| (u, secret));
    if p.kind == "http" {
        s.write_all(http_connect(host, port, auth).as_bytes()).await?;
        let mut head = Vec::new();
        let mut b = [0u8; 1];
        while !head.ends_with(b"\r\n\r\n") {
            if s.read(&mut b).await? == 0 || head.len() > 16 * 1024 {
                return Err(err("the reply ended early".into()));
            }
            head.push(b[0]);
        }
        http_connect_status(&String::from_utf8_lossy(&head)).map_err(err)?;
        return Ok(s);
    }
    s.write_all(&socks5_greeting(auth.is_some())).await?;
    let mut r = [0u8; 2];
    s.read_exact(&mut r).await?;
    match (r[0], r[1]) {
        (5, 0) => {}
        (5, 2) => {
            let (u, pw) = auth.ok_or_else(|| err("it asks for a user and password".into()))?;
            s.write_all(&socks5_auth(u, pw).ok_or_else(|| err("user or password too long".into()))?).await?;
            s.read_exact(&mut r).await?;
            if r[1] != 0 {
                return Err(err("the user or password was refused".into()));
            }
        }
        (5, 0xFF) => return Err(err("no acceptable sign-in method".into())),
        _ => return Err(err("not a SOCKS5 proxy".into())),
    }
    s.write_all(&socks5_connect(host, port).ok_or_else(|| err("host name too long".into()))?).await?;
    let mut head = [0u8; 4];
    s.read_exact(&mut head).await?;
    if head[1] != 0 {
        return Err(err(socks5_reply_error(head[1]).into()));
    }
    // Skip the bound address in the reply.
    let skip = match head[3] {
        1 => 4,
        4 => 16,
        3 => {
            let mut n = [0u8; 1];
            s.read_exact(&mut n).await?;
            n[0] as usize
        }
        _ => return Err(err("a reply this client does not read".into())),
    };
    let mut rest = vec![0u8; skip + 2];
    s.read_exact(&mut rest).await?;
    Ok(s)
}

/// Check the proxy reaches the database once (for a clear error), then
/// serve a loopback port that relays every connection through it.
pub async fn open(p: ProxySettings, secret: String, host: String, port: u16, timeout: Duration) -> crate::error::AppResult<ProxyTunnel> {
    tokio::time::timeout(timeout, through(&p, &secret, &host, port))
        .await
        .map_err(|_| crate::error::AppError::Database(format!("The proxy {}:{} did not answer in time.", p.host, p.port)))?
        .map_err(|e| crate::error::AppError::Database(e.to_string()))?;
    let listener = TcpListener::bind(("127.0.0.1", 0)).await?;
    let addr = listener.local_addr()?;
    let shared = Arc::new((p, secret, host));
    let task = tokio::spawn(async move {
        let mut relays = tokio::task::JoinSet::new();
        loop {
            tokio::select! {
                accepted = listener.accept() => {
                    let Ok((mut local, _)) = accepted else { break };
                    if relays.len() >= 256 { continue; }
                    let shared = Arc::clone(&shared);
                    relays.spawn(async move {
                        let (p, secret, host) = &*shared;
                        if let Ok(Ok(mut remote)) = tokio::time::timeout(timeout, through(p, secret, host, port)).await {
                            let _ = tokio::io::copy_bidirectional(&mut local, &mut remote).await;
                        }
                    });
                }
                Some(_) = relays.join_next(), if !relays.is_empty() => {}
            }
        }
    });
    Ok(ProxyTunnel { addr, task })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn socks5_bytes_follow_the_rfcs() {
        assert_eq!(socks5_greeting(false), vec![5, 1, 0]);
        assert_eq!(socks5_greeting(true), vec![5, 2, 0, 2]);
        assert_eq!(socks5_auth("u", "pw").unwrap(), vec![1, 1, b'u', 2, b'p', b'w']);
        assert!(socks5_auth(&"x".repeat(256), "p").is_none());
        assert_eq!(socks5_connect("db", 8563).unwrap(), vec![5, 1, 0, 3, 2, b'd', b'b', 0x21, 0x73]);
        assert!(socks5_connect("", 1).is_none());
        assert_eq!(socks5_reply_error(5), "connection refused");
    }

    #[test]
    fn http_connect_asks_and_reads_the_reply() {
        assert_eq!(http_connect("db", 8563, None), "CONNECT db:8563 HTTP/1.1\r\nHost: db:8563\r\n\r\n");
        assert!(http_connect("db", 1, Some(("u", "p"))).contains("Proxy-Authorization: Basic dTpw\r\n"));
        assert!(http_connect("::1", 1, None).starts_with("CONNECT [::1]:1 "));
        assert!(http_connect_status("HTTP/1.1 200 Connection established\r\n\r\n").is_ok());
        assert!(http_connect_status("HTTP/1.0 407 Proxy Authentication Required\r\n").unwrap_err().contains("407"));
        assert!(http_connect_status("HTTP/1.1 403 Forbidden\r\n").unwrap_err().contains("403"));
        assert!(http_connect_status("garbage").is_err());
    }

    /// A tiny SOCKS5 proxy in front of an echo server, for the end-to-end test.
    async fn socks_proxy_to(echo: SocketAddr) -> u16 {
        let l = TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
        let port = l.local_addr().unwrap().port();
        tokio::spawn(async move {
            while let Ok((mut c, _)) = l.accept().await {
                tokio::spawn(async move {
                    let mut g = [0u8; 3];
                    c.read_exact(&mut g).await.unwrap();
                    c.write_all(&[5, 0]).await.unwrap();
                    let mut h = [0u8; 5];
                    c.read_exact(&mut h).await.unwrap();
                    let mut name = vec![0u8; h[4] as usize + 2];
                    c.read_exact(&mut name).await.unwrap();
                    c.write_all(&[5, 0, 0, 1, 127, 0, 0, 1, 0, 0]).await.unwrap();
                    let mut up = TcpStream::connect(echo).await.unwrap();
                    let _ = tokio::io::copy_bidirectional(&mut c, &mut up).await;
                });
            }
        });
        port
    }

    #[tokio::test]
    async fn a_connection_is_relayed_through_a_socks5_proxy() {
        let echo = TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
        let echo_addr = echo.local_addr().unwrap();
        tokio::spawn(async move {
            while let Ok((mut c, _)) = echo.accept().await {
                tokio::spawn(async move {
                    let mut b = [0u8; 4];
                    if c.read_exact(&mut b).await.is_ok() {
                        let _ = c.write_all(&b).await;
                    }
                });
            }
        });
        let proxy_port = socks_proxy_to(echo_addr).await;
        let p = ProxySettings { kind: "socks5".into(), host: "127.0.0.1".into(), port: proxy_port, user: None, secret: String::new() };
        let t = open(p, String::new(), "db.internal".into(), 8563, Duration::from_secs(5)).await.unwrap();
        let mut c = TcpStream::connect(t.addr).await.unwrap();
        c.write_all(b"ping").await.unwrap();
        let mut back = [0u8; 4];
        c.read_exact(&mut back).await.unwrap();
        assert_eq!(&back, b"ping");
    }

    #[tokio::test]
    async fn an_unreachable_proxy_is_reported_before_any_relay() {
        let free = TcpListener::bind(("127.0.0.1", 0)).await.unwrap().local_addr().unwrap().port();
        let p = ProxySettings { kind: "http".into(), host: "127.0.0.1".into(), port: free, user: None, secret: String::new() };
        assert!(open(p, String::new(), "db".into(), 8563, Duration::from_secs(2)).await.is_err());
    }
}

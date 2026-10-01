//! A pinned connection's transport. The driver connects, unencrypted, to a
//! port on 127.0.0.1; each such connection is relayed over Studio's own TLS
//! to the server, which only completes when the server presents exactly the
//! pinned certificate (`tls_trust::PinVerifier`). So everything that leaves
//! the machine is encrypted and pinned — on the connection that signs in,
//! not on a separate check before it.

use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;

use tokio::net::{TcpListener, TcpStream};

/// A running tunnel; dropping it stops it, and every relay with it.
pub struct PinTunnel {
    pub addr: SocketAddr,
    task: tokio::task::JoinHandle<()>,
}

impl Drop for PinTunnel {
    fn drop(&mut self) {
        self.task.abort();
    }
}

/// More relays than a pool and its tab sessions ever need at once.
const MAX_RELAYS: usize = 256;

/// Listen on a free loopback port and relay every connection to the first
/// node of `hosts` that completes a pinned TLS handshake.
pub async fn open(hosts: Vec<String>, port: u16, pin: &str, timeout: Duration) -> std::io::Result<PinTunnel> {
    let config = crate::tls_trust::pinned_client(pin).map_err(std::io::Error::other)?;
    let listener = TcpListener::bind(("127.0.0.1", 0)).await?;
    let addr = listener.local_addr()?;
    let hosts = Arc::new(hosts);
    let task = tokio::spawn(async move {
        // Relays belong to this task: aborting it drops the set, which ends
        // them all. Bounded, so a local process cannot open unlimited
        // connections to the server through it.
        let mut relays = tokio::task::JoinSet::new();
        loop {
            tokio::select! {
                accepted = listener.accept() => {
                    let Ok((local, _)) = accepted else { break };
                    if relays.len() >= MAX_RELAYS {
                        drop(local);
                        continue;
                    }
                    let (hosts, config) = (Arc::clone(&hosts), Arc::clone(&config));
                    relays.spawn(async move {
                        let _ = relay(local, &hosts, port, config, timeout).await;
                    });
                }
                Some(_) = relays.join_next(), if !relays.is_empty() => {}
            }
        }
    });
    Ok(PinTunnel { addr, task })
}

async fn relay(mut local: TcpStream, hosts: &[String], port: u16, config: Arc<rustls::ClientConfig>, timeout: Duration) -> std::io::Result<()> {
    let mut last = std::io::Error::other("no host to connect to");
    for host in hosts {
        match tokio::time::timeout(timeout, pinned_stream(host, port, Arc::clone(&config))).await {
            Ok(Ok(mut remote)) => {
                tokio::io::copy_bidirectional(&mut local, &mut remote).await?;
                return Ok(());
            }
            Ok(Err(e)) => last = e,
            Err(_) => last = std::io::Error::new(std::io::ErrorKind::TimedOut, format!("{host}:{port} did not answer in time")),
        }
    }
    Err(last)
}

async fn pinned_stream(host: &str, port: u16, config: Arc<rustls::ClientConfig>) -> std::io::Result<tokio_rustls::client::TlsStream<TcpStream>> {
    let name = rustls::pki_types::ServerName::try_from(host.to_string()).map_err(std::io::Error::other)?;
    let tcp = TcpStream::connect((host, port)).await?;
    tokio_rustls::TlsConnector::from(config).connect(name, tcp).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    /// A TLS echo server with a fresh self-signed certificate; its fingerprint.
    async fn echo_server() -> (u16, String) {
        let cert = rcgen::generate_simple_self_signed(vec!["localhost".into()]).unwrap();
        let der = cert.cert.der().to_vec();
        let key = rustls::pki_types::PrivateKeyDer::Pkcs8(cert.key_pair.serialize_der().into());
        let config = rustls::ServerConfig::builder_with_provider(Arc::new(rustls::crypto::ring::default_provider()))
            .with_safe_default_protocol_versions()
            .unwrap()
            .with_no_client_auth()
            .with_single_cert(vec![der.clone().into()], key)
            .unwrap();
        let acceptor = tokio_rustls::TlsAcceptor::from(Arc::new(config));
        let listener = TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
        let port = listener.local_addr().unwrap().port();
        tokio::spawn(async move {
            while let Ok((tcp, _)) = listener.accept().await {
                let acceptor = acceptor.clone();
                tokio::spawn(async move {
                    if let Ok(mut tls) = acceptor.accept(tcp).await {
                        let mut buf = [0u8; 5];
                        if tls.read_exact(&mut buf).await.is_ok() {
                            let _ = tls.write_all(&buf).await;
                            let _ = tls.flush().await;
                        }
                    }
                });
            }
        });
        (port, crate::tls_trust::fingerprint_of(&der))
    }

    #[tokio::test]
    async fn the_pinned_server_is_reached_and_any_other_is_not() {
        let (port, fp) = echo_server().await;
        let t = Duration::from_secs(5);
        let tunnel = open(vec!["127.0.0.1".into()], port, &fp, t).await.unwrap();
        let mut c = TcpStream::connect(tunnel.addr).await.unwrap();
        c.write_all(b"hello").await.unwrap();
        let mut back = [0u8; 5];
        c.read_exact(&mut back).await.unwrap();
        assert_eq!(&back, b"hello", "relayed over the pinned TLS");

        // The same server under a different pin: the handshake fails and the
        // driver's side is closed without a byte reaching the server.
        let wrong = open(vec!["127.0.0.1".into()], port, &"00".repeat(32), t).await.unwrap();
        let mut c = TcpStream::connect(wrong.addr).await.unwrap();
        let _ = c.write_all(b"hello").await;
        let mut buf = [0u8; 5];
        assert!(c.read_exact(&mut buf).await.is_err(), "nothing comes back from an unpinned server");
    }

    #[tokio::test]
    async fn a_node_that_does_not_answer_is_skipped() {
        let (port, fp) = echo_server().await;
        let dead = TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
        let dead_port = dead.local_addr().unwrap().port();
        drop(dead);
        // Same port for all nodes in a range; here the first "node" is an
        // address with nothing listening on that port.
        let tunnel = open(vec!["127.0.0.2".into(), "127.0.0.1".into()], port, &fp, Duration::from_secs(2)).await.unwrap();
        let mut c = TcpStream::connect(tunnel.addr).await.unwrap();
        c.write_all(b"hello").await.unwrap();
        let mut back = [0u8; 5];
        c.read_exact(&mut back).await.unwrap();
        assert_eq!(&back, b"hello");
        let _ = dead_port;
    }

    #[tokio::test]
    async fn closing_the_tunnel_ends_its_open_relays() {
        let (port, fp) = echo_server().await;
        let tunnel = open(vec!["127.0.0.1".into()], port, &fp, Duration::from_secs(5)).await.unwrap();
        let mut c = TcpStream::connect(tunnel.addr).await.unwrap();
        // The relay is up (a round trip works) before the tunnel goes.
        c.write_all(b"hello").await.unwrap();
        let mut back = [0u8; 5];
        c.read_exact(&mut back).await.unwrap();
        drop(tunnel);
        let mut rest = Vec::new();
        let n = tokio::time::timeout(Duration::from_secs(2), c.read_to_end(&mut rest)).await.expect("the relay ends").unwrap_or(0);
        assert_eq!(n, 0, "closed, nothing more relayed");
    }
}

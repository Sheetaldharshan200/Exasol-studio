//! What carries a connection beyond the driver (connection.rs): an SSH
//! tunnel or a proxy relay to reach the database, and the pin tunnel over
//! it — and the profile the driver gets to use them.

use std::time::Duration;

use crate::error::AppResult;
use crate::profiles::ConnectionProfile;

/// What carries a connection beyond the driver: an SSH tunnel or a proxy
/// relay to reach the database, and the pin tunnel over it. They live as
/// long as the pool; fields drop in order (pin first, then the route).
#[derive(Default)]
pub struct Carrier {
    pub(crate) pin: Option<crate::pin_tunnel::PinTunnel>,
    pub(crate) ssh: Option<crate::ssh_tunnel::SshTunnel>,
    pub(crate) proxy: Option<crate::proxy_tunnel::ProxyTunnel>,
}

impl Carrier {
    /// The loopback port of the SSH tunnel or proxy relay, if routed.
    pub fn route_port(&self) -> Option<u16> {
        self.ssh.as_ref().map(|t| t.port).or(self.proxy.as_ref().map(|t| t.addr.port()))
    }

    pub(crate) fn is_empty(&self) -> bool {
        self.pin.is_none() && self.ssh.is_none() && self.proxy.is_none()
    }
}


/// Open the route (SSH or proxy) and the pin tunnel the profile asks for.
/// Returns them, the profile the driver connects with, and where the
/// database is reached (for reading its certificate the same way).
pub async fn prepare(data_dir: &std::path::Path, profile: &ConnectionProfile, timeout: Duration) -> AppResult<(Carrier, ConnectionProfile, String, u16)> {
    let mut carrier = Carrier::default();
    // How the database is reached: directly, or through an SSH tunnel or a
    // proxy relay on a loopback port (one node of a range: the first).
    let (reach_host, reach_port) = match profile.network.as_ref() {
        Some(crate::network::NetworkSettings { ssh: Some(s), .. }) => {
            crate::ssh_tunnel::check_host_key(s, data_dir, timeout)?;
            let t = crate::ssh_tunnel::open(s, &s.secret, &crate::tls_trust::first_host(profile.host.trim()), profile.port, timeout, data_dir).await?;
            let port = t.port;
            carrier.ssh = Some(t);
            ("127.0.0.1".to_string(), port)
        }
        Some(crate::network::NetworkSettings { proxy: Some(p), .. }) => {
            let t = crate::proxy_tunnel::open(p.clone(), p.secret.clone(), crate::tls_trust::first_host(profile.host.trim()), profile.port, timeout).await?;
            let port = t.addr.port();
            carrier.proxy = Some(t);
            ("127.0.0.1".to_string(), port)
        }
        _ => (profile.host.trim().to_string(), profile.port),
    };
    let routed = carrier.ssh.is_some() || carrier.proxy.is_some();
    let mut target = profile.clone();
    target.network = None;
    if let Some(pin) = profile.fingerprint.as_deref() {
        // A clear "certificate changed" before anything else.
        crate::tls_trust::check_pin(&reach_host, reach_port, pin, timeout).await?;
        let hosts = if routed { vec![reach_host.clone()] } else { crate::tls_trust::expand_hosts(&reach_host) };
        let t = crate::pin_tunnel::open(hosts, reach_port, pin, timeout).await?;
        target.host = t.addr.ip().to_string();
        target.port = t.addr.port();
        target.ssl_mode = crate::tls_trust::LOOPBACK_TUNNEL.into();
        target.ssl_ca = None;
        target.fingerprint = None;
        carrier.pin = Some(t);
    } else if routed {
        target.host = reach_host.clone();
        target.port = reach_port;
    }
    Ok((carrier, target, reach_host, reach_port))
}

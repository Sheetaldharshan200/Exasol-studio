//! Live tests of connection.rs against a real Exasol (and a real sshd).
//! Ignored by default; each module says how to run it.

mod live_trust {
    //! EXASOL_LIVE_PORT=8565 EXASOL_LIVE_PASSWORD=… cargo test --lib connection::live_trust -- --ignored
    use crate::error::AppError;
    use std::time::Duration;

    #[tokio::test]
    #[ignore = "needs a live database (EXASOL_LIVE_* env)"]
    async fn a_self_signed_server_is_offered_for_trust_then_pinned() {
        let port: u16 = std::env::var("EXASOL_LIVE_PORT").ok().and_then(|v| v.parse().ok()).unwrap_or(8563);
        let mut p = crate::profiles::ConnectionProfile {
            id: "live".into(),
            name: "live".into(),
            host: "127.0.0.1".into(),
            port,
            username: "sys".into(),
            password: std::env::var("EXASOL_LIVE_PASSWORD").expect("EXASOL_LIVE_PASSWORD"),
            schema: None,
            notes: None,
            ssl_mode: "verify_identity".into(),
            compression: false,
            driver_id: "sqlx-exasol".into(),
            created_at: None,
            last_used_at: None,
            fingerprint: None,
            ssl_ca: None,
            auth_method: "password".into(),
            network: None,
        };
        let t = Duration::from_secs(15);
        // Verify, nothing pinned: a self-signed local database is offered for trust.
        let fp = match crate::connection::open_checked(&std::env::temp_dir(), &p, 1, Vec::new(), t).await {
            Err(AppError::UntrustedCertificate { fingerprint }) => fingerprint,
            other => panic!("expected an untrusted certificate, got {:?}", other.map(|_| ())),
        };
        assert_eq!(fp.len(), 64);
        assert_eq!(crate::tls_trust::server_fingerprint("127.0.0.1", port, t).await.unwrap(), fp, "stable");
        // Trusted: pinned, it connects.
        p.fingerprint = Some(fp.clone());
        let (pool, info, tunnel) = crate::connection::open_checked(&std::env::temp_dir(), &p, 1, Vec::new(), t).await.expect("pinned connect");
        assert!(tunnel.pin.is_some(), "a pinned connection goes through the pin tunnel");
        assert!(info.version.is_some());
        pool.close().await;
        // A different pin: the change is reported, nothing connects.
        p.fingerprint = Some("00".repeat(32));
        match crate::connection::open_checked(&std::env::temp_dir(), &p, 1, Vec::new(), t).await {
            Err(AppError::CertificateChanged { actual, .. }) => assert_eq!(actual, fp),
            other => panic!("expected a changed certificate, got {:?}", other.map(|_| ())),
        }
    }
}

mod live_ssh {
    //! A real SSH server forwarding to a real Exasol:
    //! STUDIO_LIVE_SSH_PORT=2299 STUDIO_LIVE_SSH_PASSWORD=… STUDIO_LIVE_DB_HOST=host.docker.internal \
    //! EXASOL_LIVE_PORT=8565 EXASOL_LIVE_PASSWORD=… cargo test --lib connection::live_ssh -- --ignored
    use crate::error::AppError;
    use std::time::Duration;

    #[tokio::test]
    #[ignore = "needs an SSH server and a live database (STUDIO_LIVE_SSH_* / EXASOL_LIVE_* env)"]
    async fn a_database_behind_ssh_is_trusted_pinned_and_queried() {
        let env = |k: &str| std::env::var(k).unwrap_or_else(|_| panic!("{k}"));
        let dir = std::env::temp_dir().join(format!("studio-live-ssh-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let mut p = crate::profiles::ConnectionProfile {
            id: "ssh-live".into(),
            name: "behind ssh".into(),
            host: env("STUDIO_LIVE_DB_HOST"),
            port: env("EXASOL_LIVE_PORT").parse().unwrap(),
            username: "sys".into(),
            password: env("EXASOL_LIVE_PASSWORD"),
            schema: None,
            notes: None,
            ssl_mode: "verify_identity".into(),
            compression: false,
            driver_id: "sqlx-exasol".into(),
            created_at: None,
            last_used_at: None,
            fingerprint: None,
            ssl_ca: None,
            auth_method: "password".into(),
            network: Some(crate::network::NetworkSettings {
                ssh: Some(crate::network::SshSettings {
                    host: "127.0.0.1".into(),
                    port: Some(env("STUDIO_LIVE_SSH_PORT").parse().unwrap()),
                    user: Some("root".into()),
                    auth: "password".into(),
                    key_path: None,
                    jump: None,
                    host_key: "accept_new".into(),
                    keepalive_secs: 15,
                    secret: env("STUDIO_LIVE_SSH_PASSWORD"),
                }),
                proxy: None,
            }),
        };
        let t = Duration::from_secs(20);
        // Through the tunnel the certificate does not name 127.0.0.1: trust is offered.
        let fp = match crate::connection::open_checked(&dir, &p, 1, Vec::new(), t).await {
            Err(AppError::UntrustedCertificate { fingerprint }) => fingerprint,
            Err(e) => panic!("expected a trust offer, got {e}"),
            Ok(_) => panic!("connected without a trust decision"),
        };
        assert!(dir.join("ssh").join("known_hosts").exists(), "accept-new stored the host key in Studio's own file");
        p.fingerprint = Some(fp);
        let (pool, info, carrier) = crate::connection::open_checked(&dir, &p, 1, Vec::new(), t).await.expect("pinned connect through ssh");
        assert!(carrier.ssh.is_some() && carrier.pin.is_some());
        assert_eq!(info.current_user, "SYS");
        let rows = crate::query::fetch_all_rows(&pool, "SELECT 1 FROM DUAL").await.unwrap();
        assert_eq!(rows.len(), 1);
        pool.close().await;
        drop(carrier);
        // A wrong password is refused with a readable reason.
        p.network.as_mut().unwrap().ssh.as_mut().unwrap().secret = "wrong".into();
        match crate::connection::open_checked(&dir, &p, 1, Vec::new(), t).await {
            Err(e) => assert!(e.to_string().contains("refused"), "{e}"),
            Ok(_) => panic!("signed in with a wrong password"),
        }
        let _ = std::fs::remove_dir_all(dir);
    }

    #[tokio::test]
    #[ignore = "needs an SSH server and a live database (STUDIO_LIVE_SSH_* / EXASOL_LIVE_* env)"]
    async fn ask_mode_shows_an_unknown_host_key_and_trusts_only_what_was_shown() {
        let env = |k: &str| std::env::var(k).unwrap_or_else(|_| panic!("{k}"));
        let dir = std::env::temp_dir().join(format!("studio-live-ssh-ask-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let ssh = crate::network::SshSettings {
            host: "127.0.0.1".into(),
            port: Some(env("STUDIO_LIVE_SSH_PORT").parse().unwrap()),
            user: Some("root".into()),
            auth: "password".into(),
            key_path: None,
            jump: None,
            host_key: "ask".into(),
            keepalive_secs: 0,
            secret: env("STUDIO_LIVE_SSH_PASSWORD"),
        };
        let t = Duration::from_secs(10);
        let shown = match crate::ssh_tunnel::check_host_key(&ssh, &dir, t) {
            Err(AppError::UnknownHostKey { fingerprint, .. }) => fingerprint,
            other => panic!("expected an unknown host key, got {:?}", other.err().map(|e| e.to_string())),
        };
        assert!(shown.contains("SHA256:"), "{shown}");
        assert!(crate::ssh_tunnel::trust_host_key(&ssh, &dir, "ED25519 SHA256:not-it", t).is_err(), "a different fingerprint is not trusted");
        crate::ssh_tunnel::trust_host_key(&ssh, &dir, &shown, t).expect("trust what was shown");
        crate::ssh_tunnel::check_host_key(&ssh, &dir, t).expect("now known");
        let tunnel = crate::ssh_tunnel::open(&ssh, &ssh.secret, &env("STUDIO_LIVE_DB_HOST"), env("EXASOL_LIVE_PORT").parse().unwrap(), t, &dir).await.expect("strict mode with the trusted key");
        drop(tunnel);
        let _ = std::fs::remove_dir_all(dir);
    }
}

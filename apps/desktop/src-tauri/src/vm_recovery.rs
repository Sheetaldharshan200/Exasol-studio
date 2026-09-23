//! Taking a stranded Exasol Personal VM down.
//!
//! The launcher's `stop` removes the database container by talking to the VM's
//! guest. A VM left running from an earlier session can outlive its database:
//! the host process is alive and still holding the forwarded port, but the
//! guest no longer answers, so `stop` fails and can never succeed. Studio's
//! recovery is "stop, then start", which then deadlocks — every retry reports
//! the same storage error while the port stays occupied by a VM with nothing
//! behind it.
//!
//! When that happens the VM has to be taken down from the host side. The
//! launcher records which process that is; the decisions about whether it is
//! ours to end live here, where they can be tested without a VM.

/// The VM host process the launcher recorded, from `local/runtime/vm-state.json`.
/// The launcher writes the pid as a string today; a number is accepted too so
/// a future launcher does not silently disable recovery. Anything else is a
/// file we do not understand, and then we touch nothing.
pub fn vm_pid_from_state(json: &str) -> Option<u32> {
    let state: serde_json::Value = serde_json::from_str(json).ok()?;
    let pid = state.get("pid")?;
    let parsed = match pid {
        serde_json::Value::String(s) => s.trim().parse::<u32>().ok()?,
        serde_json::Value::Number(n) => u32::try_from(n.as_u64()?).ok()?,
        _ => return None,
    };
    // pid 0 and 1 are never a VM we started; refusing them keeps a malformed
    // state file from turning into a signal at init.
    (parsed > 1).then_some(parsed)
}

/// Is the process at a recorded pid still the local runner?
///
/// A pid recorded hours ago may have been recycled by the OS onto something
/// else entirely, so the recorded number alone is never enough. The launcher
/// runs its unpacked artifact directly, so the command line must BEGIN with
/// that artifact path — a substring match anywhere would also accept a shell
/// that merely mentions it, or an unrelated tool with the name in an argument.
pub fn is_local_runner(cmdline: &str) -> bool {
    let argv0 = cmdline.split_whitespace().next().unwrap_or("");
    argv0.contains("/exasol-local-runner/") && !argv0.ends_with(".sh")
}

/// The guest endpoint the launcher forwards the database from, taken from its
/// own `vm-runtime.json` (the guest IP) and `vm-state.json` (the guest port).
/// Recovery asks this endpoint whether a database is actually there.
pub fn guest_db_endpoint(state_json: &str, runtime_json: &str) -> Option<(String, u16)> {
    let state: serde_json::Value = serde_json::from_str(state_json).ok()?;
    let runtime: serde_json::Value = serde_json::from_str(runtime_json).ok()?;
    let ip = runtime.get("vm_ip")?.as_str()?.trim().to_string();
    let port = state.get("forwards")?.get("db")?.get("guest_port")?.as_u64()?;
    let port = u16::try_from(port).ok()?;
    (!ip.is_empty() && port > 0).then_some((ip, port))
}

/// What recovery should do after the launcher's `stop` came back non-zero.
#[derive(Debug, PartialEq, Eq)]
pub enum StopFallback {
    /// Take this VM host process down ourselves, then carry on to `start`.
    ForceDown(u32),
    /// Nothing we may safely end: report the launcher's own failure.
    Report,
}

/// Everything recovery knows about the process it is considering ending.
#[derive(Debug, Clone, Copy)]
pub struct StrandedCheck<'a> {
    /// The pid the launcher recorded for this deployment's VM.
    pub vm_pid: Option<u32>,
    /// That process's command line, or None if it is no longer running.
    pub cmdline: Option<&'a str>,
    /// Is that same process the one holding this deployment's forwarded port?
    pub owns_forwarded_port: bool,
    /// Did the guest answer on the database port just now?
    pub guest_db_reachable: bool,
}

/// `stop` failed — may we end the VM ourselves?
///
/// Only when all of it lines up: the launcher recorded a pid, that pid is
/// still the runner, it is the process holding THIS deployment's forwarded
/// port, and the guest is not serving a database behind it. The last condition
/// is the one that matters most: `stop` can fail for reasons that have nothing
/// to do with a stranded VM — a bad credential, a launcher bug, a transient
/// error — and ending a VM that still has a live database inside it would pull
/// the power on a running database. When anything is unproven we report the
/// launcher's error and change nothing.
pub fn stop_fallback(check: StrandedCheck<'_>) -> StopFallback {
    if check.guest_db_reachable || !check.owns_forwarded_port {
        return StopFallback::Report;
    }
    match (check.vm_pid, check.cmdline) {
        (Some(pid), Some(line)) if is_local_runner(line) => StopFallback::ForceDown(pid),
        _ => StopFallback::Report,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const STATE: &str = r#"{
      "cpu_count": "2",
      "forwards": { "db": { "guest_port": 8563, "host_port": 8565 } },
      "pid": "76029",
      "ram_size": "12288",
      "shared_dir": "./vm-shared",
      "vm_name": "exasol-local-vm"
    }"#;
    const RUNTIME: &str = r#"{ "vm_ip": "192.168.64.169" }"#;
    const RUNNER: &str =
        "/Users/x/Library/Caches/.exasol/personal/runtime-artifacts/artifacts/exasol-local-runner/darwin/arm64/abc/unpack/launcher run";

    /// The case this exists for: a VM stranded with no database behind it.
    fn stranded<'a>(cmdline: Option<&'a str>) -> StrandedCheck<'a> {
        StrandedCheck { vm_pid: Some(76029), cmdline, owns_forwarded_port: true, guest_db_reachable: false }
    }

    #[test]
    fn the_recorded_pid_is_read_from_the_launchers_own_state() {
        assert_eq!(vm_pid_from_state(STATE), Some(76029));
        assert_eq!(vm_pid_from_state(r#"{"pid": 4242}"#), Some(4242));
    }

    #[test]
    fn a_state_file_we_do_not_understand_yields_nothing_to_signal() {
        for bad in ["not json", "{}", r#"{"pid": ""}"#, r#"{"pid": "nope"}"#, r#"{"pid": null}"#, r#"{"pid": -5}"#] {
            assert_eq!(vm_pid_from_state(bad), None, "{bad}");
        }
    }

    #[test]
    fn init_and_pid_zero_are_never_ours() {
        assert_eq!(vm_pid_from_state(r#"{"pid": "0"}"#), None);
        assert_eq!(vm_pid_from_state(r#"{"pid": "1"}"#), None);
    }

    #[test]
    fn the_guest_endpoint_comes_from_the_launchers_own_files() {
        assert_eq!(guest_db_endpoint(STATE, RUNTIME), Some(("192.168.64.169".into(), 8563)));
    }

    #[test]
    fn without_a_guest_endpoint_there_is_nothing_to_probe() {
        assert_eq!(guest_db_endpoint(STATE, "{}"), None);
        assert_eq!(guest_db_endpoint("{}", RUNTIME), None);
        assert_eq!(guest_db_endpoint(STATE, r#"{"vm_ip": ""}"#), None);
        assert_eq!(guest_db_endpoint(r#"{"forwards":{"db":{"guest_port":0}}}"#, RUNTIME), None);
    }

    #[test]
    fn the_runner_is_recognised_by_what_is_actually_executing() {
        assert!(is_local_runner(RUNNER));
        // A shell that merely mentions it, or a tool carrying the name as an
        // argument, is not the runner.
        assert!(!is_local_runner("/bin/sh -c 'ls .../exasol-local-runner/darwin'"));
        assert!(!is_local_runner("/usr/bin/tail -f /tmp/exasol-local-runner/vm.log"));
        assert!(!is_local_runner("/opt/pkg/exasol-local-runner-helper.sh --watch"));
        assert!(!is_local_runner("/Applications/Safari.app/Contents/MacOS/Safari"));
        assert!(!is_local_runner(""));
    }

    #[test]
    fn a_stranded_runner_is_taken_down_so_recovery_can_continue() {
        assert_eq!(stop_fallback(stranded(Some(RUNNER))), StopFallback::ForceDown(76029));
    }

    #[test]
    fn a_live_database_is_never_signalled_however_stop_failed() {
        // The whole point of the guard: `stop` can fail for reasons that have
        // nothing to do with a stranded VM, and a running database must not be
        // pulled out from under the user.
        let live = StrandedCheck { guest_db_reachable: true, ..stranded(Some(RUNNER)) };
        assert_eq!(stop_fallback(live), StopFallback::Report);
    }

    #[test]
    fn a_process_that_does_not_hold_our_port_is_not_ours() {
        // Another deployment, another Studio, or a recycled pid.
        let other = StrandedCheck { owns_forwarded_port: false, ..stranded(Some(RUNNER)) };
        assert_eq!(stop_fallback(other), StopFallback::Report);
    }

    #[test]
    fn without_a_process_we_can_identify_the_original_failure_stands() {
        assert_eq!(stop_fallback(StrandedCheck { vm_pid: None, ..stranded(Some(RUNNER)) }), StopFallback::Report);
        assert_eq!(stop_fallback(stranded(None)), StopFallback::Report);
        assert_eq!(stop_fallback(stranded(Some("/usr/sbin/cupsd"))), StopFallback::Report);
    }
}

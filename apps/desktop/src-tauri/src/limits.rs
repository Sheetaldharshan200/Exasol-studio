//! Process limits Studio raises for itself at startup.
//!
//! macOS launches a GUI app with a soft limit of 256 open files, which is
//! nothing for a program that pools HTTPS connections, streams downloads,
//! talks to sidecars over pipes and hosts a database proxy. Running out does
//! not degrade gracefully: the next socket, pipe or event queue simply fails.
//! Raising the soft limit towards the hard one, as every browser and editor
//! does, is the fix at the root; the fetch paths stay frugal on top of it.

/// The soft limit Studio asks for, capped by the hard limit.
pub const WANTED_OPEN_FILES: u64 = 8192;

/// The new soft limit to set, or None when the current one is already enough.
pub fn target_soft(soft: u64, hard: u64) -> Option<u64> {
    let want = WANTED_OPEN_FILES.min(hard);
    (want > soft).then_some(want)
}

#[cfg(unix)]
pub fn raise_open_files() {
    let mut rl = libc::rlimit { rlim_cur: 0, rlim_max: 0 };
    // SAFETY: a valid, writable rlimit struct is passed for the current process.
    if unsafe { libc::getrlimit(libc::RLIMIT_NOFILE, &mut rl) } != 0 {
        return;
    }
    if let Some(target) = target_soft(rl.rlim_cur as u64, rl.rlim_max as u64) {
        rl.rlim_cur = target as libc::rlim_t;
        // SAFETY: same struct, soft never above hard. Failure leaves the old limit.
        let _ = unsafe { libc::setrlimit(libc::RLIMIT_NOFILE, &rl) };
    }
}

#[cfg(not(unix))]
pub fn raise_open_files() {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_soft_limit_rises_to_the_wanted_value_but_never_past_the_hard_one() {
        assert_eq!(target_soft(256, u64::MAX), Some(WANTED_OPEN_FILES), "launchd default, unlimited hard");
        assert_eq!(target_soft(256, 4096), Some(4096), "capped by a lower hard limit");
        assert_eq!(target_soft(8192, u64::MAX), None, "already there");
        assert_eq!(target_soft(1_048_576, u64::MAX), None, "a generous shell limit is left alone");
        assert_eq!(target_soft(256, 256), None, "nothing to gain when soft equals hard");
    }
}

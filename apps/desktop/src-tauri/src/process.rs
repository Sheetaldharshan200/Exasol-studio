//! Child processes Studio starts: one constructor, so every launcher, probe
//! and sidecar gets the same platform handling.
//!
//! On Windows a GUI application that starts a console program gets a console
//! window flashed on screen for it — for every `VBoxManage list vms`, every
//! `exasol slc list`, every `python -c`, and a lasting one for each sidecar.
//! `CREATE_NO_WINDOW` keeps them off screen; stdio still works as before.

use std::ffi::OsStr;
use std::process::Command;

/// A `Command` for `program` with Studio's platform settings applied.
pub fn command(program: impl AsRef<OsStr>) -> Command {
    let mut cmd = Command::new(program);
    quiet(&mut cmd);
    cmd
}

#[cfg(windows)]
fn quiet(cmd: &mut Command) {
    use std::os::windows::process::CommandExt;
    /// Windows `CREATE_NO_WINDOW`: the child gets no console window.
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    cmd.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
fn quiet(_cmd: &mut Command) {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_command_runs_the_named_program_and_takes_arguments_like_any_other() {
        let mut cmd = command("echo");
        cmd.arg("hello");
        assert_eq!(cmd.get_program(), "echo");
        assert_eq!(cmd.get_args().collect::<Vec<_>>(), vec![OsStr::new("hello")]);
    }
}

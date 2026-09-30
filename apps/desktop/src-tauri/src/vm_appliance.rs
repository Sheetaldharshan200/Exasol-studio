//! A database image (Exasol Community Edition) imported into the hypervisor
//! on this machine. The publisher fixes the bounds: x86-64 hosts only, the
//! image is the person's own download from a sign-up page, and no digest is
//! published. VirtualBox is driven through `VBoxManage`; VMware is handed the
//! file and owns the machine from there.

use crate::error::{AppError, AppResult};
use crate::market::{emit_log, run_streamed};
use serde_json::{json, Value};
use tauri::AppHandle;

/// A database image into the hypervisor on this machine. The image is the
/// person's download (the page is sign-up gated), so Studio finds it in
/// Downloads or opens the page and stops. VirtualBox is driven through
/// `VBoxManage`; VMware is handed the file and owns the machine from there.
pub(crate) fn install(
    app: &AppHandle,
    id: &str,
    image_pattern: &str,
    download_page: &str,
    vm_name: &str,
    repo: Option<&str>,
) -> AppResult<(String, String, Value)> {
    use crate::installers::{find_hypervisors, pick_image, valid_vm_name, vbox_import_args, vm_registered, Hypervisor};
    if std::env::consts::ARCH != "x86_64" {
        return Err(AppError::Storage(format!(
            "This image runs on x86-64 hosts only; this machine is {}. Apple Silicon and ARM are not supported by the publisher yet.",
            std::env::consts::ARCH
        )));
    }
    if !valid_vm_name(vm_name) {
        return Err(AppError::Storage(format!("{vm_name:?} is not a machine name Studio will hand to a hypervisor.")));
    }
    let os = std::env::consts::OS;
    let found = find_hypervisors(os, |p| std::path::Path::new(p).exists());
    if found.is_empty() {
        return Err(AppError::Storage(format!(
            "No hypervisor found. Install VirtualBox ({}) — or VMware ({}) — then Install again.",
            Hypervisor::Virtualbox.download_page(),
            Hypervisor::Vmware.download_page()
        )));
    }
    let downloads = dirs::download_dir().ok_or_else(|| AppError::Storage("Could not resolve the Downloads folder.".into()))?;
    let files: Vec<String> = std::fs::read_dir(&downloads)
        .map(|rd| rd.flatten().filter_map(|e| e.file_name().to_str().map(str::to_string)).collect())
        .unwrap_or_default();
    let pattern = regex::Regex::new(image_pattern).map_err(|e| AppError::Storage(format!("Bad image pattern: {e}")))?;
    let hypervisors: Vec<Hypervisor> = found.iter().map(|(h, _)| *h).collect();
    let Some((hv, file)) = pick_image(&files, &pattern, &hypervisors) else {
        use tauri_plugin_opener::OpenerExt;
        let _ = app.opener().open_url(download_page, None::<&str>);
        let flavors = hypervisors.iter().map(|h| format!("{} ({})", h.flavor(), h.label())).collect::<Vec<_>>().join(" or ");
        return Err(AppError::Storage(format!(
            "The download page opened. Download the {flavors} image into {} (about 10 GB), then press Install again. Nothing was recorded.",
            downloads.display()
        )));
    };
    let ova = downloads.join(&file);
    let ova_s = ova.to_string_lossy().into_owned();
    emit_log(app, id, format!("Found {file} in Downloads. No checksum is published for this image; it is imported as downloaded."), "info");
    let version = repo.and_then(crate::upstream::latest).map(|r| r.tag).unwrap_or_else(|| "latest".into());
    let tool = found.iter().find(|(h, _)| *h == hv).map(|(_, p)| p.clone()).unwrap_or_default();
    let note = match hv {
        Hypervisor::Virtualbox => {
            let listed = crate::process::command(&tool).args(["list", "vms"]).output().map(|o| String::from_utf8_lossy(&o.stdout).into_owned()).unwrap_or_default();
            if vm_registered(&listed, vm_name) {
                return Err(AppError::Storage(format!(
                    "VirtualBox already has a machine named {vm_name}. Start it there, or remove it first, instead of importing a second one."
                )));
            }
            emit_log(app, id, format!("Importing {file} into VirtualBox as \"{vm_name}\" — a few minutes…"), "info");
            let args = vbox_import_args(&ova_s, vm_name);
            let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
            let code = run_streamed(app, id, &tool, &arg_refs)?;
            if code != 0 {
                return Err(AppError::Storage(format!("VBoxManage import exited with code {code}. See the log above.")));
            }
            emit_log(app, id, "Starting the machine…", "info");
            let code = run_streamed(app, id, &tool, &["startvm", vm_name])?;
            if code != 0 {
                return Err(AppError::Storage(format!("VBoxManage startvm exited with code {code}. The machine is imported; start it in VirtualBox.")));
            }
            format!("Imported into VirtualBox as \"{vm_name}\" and started. The database is ready when its window shows RUNNING; connect to the address shown there on port 8563. The image stays in Downloads.")
        }
        Hypervisor::Vmware => {
            // Opened through the system's file association, shell-free: the
            // file name never reaches a command line.
            use tauri_plugin_opener::OpenerExt;
            if app.opener().open_path(&ova_s, None::<&str>).is_err() {
                return Err(AppError::Storage(format!("Could not hand {file} to VMware. Open it from {} yourself.", downloads.display())));
            }
            format!("Handed {file} to VMware; finish the import in its window. VMware owns the machine from here — remove it there when you no longer need it.")
        }
    };
    Ok((version, note, json!({ "hypervisor": hv, "name": vm_name, "tool": tool })))
}

/// Undo an appliance import: VirtualBox machines are powered off and deleted
/// with their disks; a VMware machine is the application's to delete.
pub(crate) fn remove(app: &AppHandle, id: &str, vm: &Value) -> AppResult<()> {
    use crate::installers::{valid_vm_name, Hypervisor};
    let name = vm.get("name").and_then(Value::as_str).unwrap_or_default();
    if !valid_vm_name(name) {
        return Err(AppError::Storage("The record names no machine Studio will hand to a hypervisor.".into()));
    }
    let hv: Hypervisor = serde_json::from_value(vm.get("hypervisor").cloned().unwrap_or(Value::Null))
        .map_err(|_| AppError::Storage("The record names no hypervisor.".into()))?;
    match hv {
        Hypervisor::Virtualbox => {
            let tool = vm
                .get("tool")
                .and_then(Value::as_str)
                .filter(|p| std::path::Path::new(p).exists())
                .map(str::to_string)
                .or_else(|| {
                    crate::installers::find_hypervisors(std::env::consts::OS, |p| std::path::Path::new(p).exists())
                        .into_iter()
                        .find(|(h, _)| *h == Hypervisor::Virtualbox)
                        .map(|(_, p)| p)
                })
            ;
            let Some(tool) = tool else {
                emit_log(app, id, "VirtualBox is no longer installed; only Studio's record of the machine is removed.", "info");
                return Ok(());
            };
            emit_log(app, id, format!("Powering off \"{name}\" (if it runs) and deleting it with its disks…"), "info");
            let _ = crate::process::command(&tool).args(["controlvm", name, "poweroff"]).output();
            let code = run_streamed(app, id, &tool, &["unregistervm", name, "--delete"])?;
            if code != 0 {
                return Err(AppError::Storage(format!("VBoxManage unregistervm exited with code {code}. See the log above.")));
            }
        }
        Hypervisor::Vmware => {
            emit_log(app, id, format!("Studio does not reach into VMware: delete \"{name}\" in VMware when you no longer need it. Its record here is removed."), "info");
        }
    }
    Ok(())
}


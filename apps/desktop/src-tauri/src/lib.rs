mod agent;
mod github_auth;
mod installers;
mod limits;
mod semantic_sync;
mod backup;
pub mod confd;
mod engine;
mod ai_clients;
mod terminal;
mod updates;
mod upstream;
mod bucketfs;
mod db_scripts;
mod slc;
mod vm_appliance;
mod catalog;
mod connection;
mod connection_settings;
mod component_lock;
mod components_update;
mod skills_market;
mod verified_lock;
mod vm_recovery;
mod driver_exec;
mod exarrow_exec;
mod virtual_schema_install;
mod drivers;
mod cloudflared;
mod attachments;
mod dash_server;
mod panorama;
mod error;
mod exapump;
mod files;
mod fs;
mod git;
mod grid_edits;
mod history;
mod local_database;
mod local_llm;
mod local_network;
mod local_runtime;
mod market;
mod metadata;
mod print;
mod process;
mod profile_secret;
mod profiles;
mod shared_registry;
mod query;
mod security;
mod session;
mod session_cmd;
mod settings;
mod state;
mod storage;

use tauri::{Emitter, Manager};

use crate::state::AppState;

pub fn run() {
    // Before any TLS handshake: with two rustls crypto providers linked in,
    // the automatic process-level lookup exarrow uses would panic instead of
    // picking one. See exarrow_exec::install_crypto_provider.
    crate::exarrow_exec::install_crypto_provider();
    crate::limits::raise_open_files();
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .register_uri_scheme_protocol(print::SCHEME, |ctx, req| print::respond(ctx.app_handle(), req.uri().path()))
        // Panorama's web build, served to its tab with Studio as its shell.
        .register_uri_scheme_protocol(panorama::SCHEME, |ctx, req| panorama::respond(ctx.app_handle(), req.uri().path()))
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .expect("app data directory must resolve");
            std::fs::create_dir_all(&data_dir)?;
            // Resolve the effective verified component lock (signed remote
            // override if valid + newer, else baked) BEFORE anything reads it.
            crate::component_lock::init_effective(&data_dir);
            app.manage(AppState::new(data_dir));
            app.manage(crate::agent::AgentSidecar::default());
            app.manage(crate::local_llm::LlmEngine::default());
            app.manage(crate::dash_server::DashServer::default());
            app.manage(crate::terminal::TermRegistry::default());
            app.manage(crate::print::PrintJobs::default());
            app.manage(crate::cloudflared::CloudflaredProc::default());
            crate::updates::start(app.handle().clone());
            crate::verified_lock::start(app.handle().clone());
            crate::session_cmd::start_keepalive(app.handle().clone());
            app.manage(crate::local_database::LocalBootstrap::default());
            crate::local_llm::auto_start_if_enabled(app.handle());
            crate::local_database::auto_start_if_installed(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            backup::backup_now,
            confd::confd_connect,
            confd::confd_status,
            confd::confd_disconnect,
            confd::confd_job,
            engine::engine_status,
            engine::engine_install,
            engine::engine_cli_status,
            engine::engine_install_cli,
            engine::engine_uninstall_cli,
            terminal::term_create,
            terminal::term_write,
            terminal::term_resize,
            terminal::term_kill,
            drivers::list_drivers,
            driver_exec::driver_status,
            driver_exec::driver_overrides_get,
            driver_exec::driver_override_set,
            driver_exec::driver_setup,
            security::vault_status,
            security::vault_setup,
            security::vault_unlock,
            security::vault_lock,
            security::vault_recover,
            security::vault_change_password,
            security::vault_regenerate_recovery,
            profiles::list_connection_profiles,
            profiles::save_connection_profile,
            profiles::delete_connection_profile,
            connection::ping_server,
            connection::test_connection,
            connection_settings::connection_settings_get,
            connection_settings::connection_settings_set,
            connection::connect,
            connection::disconnect,
            connection::list_open_connections,
            metadata::get_database_overview,
            metadata::list_schema_objects,
            metadata::get_table_details,
            metadata::list_system_objects,
            metadata::list_system_columns,
            metadata::get_dba_overview,
            metadata::get_user_details,
            metadata::get_object_grants,
            metadata::get_object_size,
            catalog::get_database_info,
            catalog::search_objects,
            catalog::get_schema_graph,
            catalog::list_vs_prereqs,
            virtual_schema_install::vs_stage_adapter,
            virtual_schema_install::vs_unstage_adapter,
            virtual_schema_install::vs_local_state,
            files::write_text_file,
            print::print_html,
            files::save_attachment,
            files::install_cli,
            files::append_app_log,
            dash_server::dash_server_status,
            dash_server::dash_server_start,
            dash_server::dash_server_stop,
            dash_server::dash_server_apps,
            panorama::panorama_status,
            panorama::panorama_deployments,
            panorama::panorama_credentials,
            attachments::attachment_pick,
            cloudflared::cloudflared_ensure,
            cloudflared::cloudflared_start,
            cloudflared::cloudflared_stop,
            fs::fs_list_dir,
            fs::fs_read_text,
            fs::fs_read_table,
            fs::fs_count_rows,
            fs::fs_workspace_dir,
            fs::fs_home_roots,
            fs::fs_search,
            fs::fs_delete,
            market::market_env,
            market::market_catalog,
            github_auth::github_status,
            github_auth::github_connect,
            github_auth::github_disconnect,
            market::market_doc,
            market::market_doc_save,
            market::market_doc_load,
            market::market_doc_forget,
            market::market_release,
            market::market_versions,
            market::market_use_downloaded,
            market::market_installed,
            market::market_detect,
            market::market_install,
            market::market_install_run,
            market::market_uninstall,
            db_scripts::market_db_scripts_plan,
            slc::market_slc_catalog,
            market::market_doc_file,
            market::open_external,
            local_network::open_local_network_settings,
            profiles::set_session_password,
            grid_edits::apply_row_edits,
            files::save_text_as,
            files::open_text_file,
            session_cmd::session_info,
            connection::connection_alive,
            session_cmd::session_set_autocommit,
            session_cmd::session_commit,
            session_cmd::session_rollback,
            session_cmd::session_set_schema,
            session_cmd::session_close,
            session_cmd::sessions_with_changes,
            session_cmd::quit_ack,
            session_cmd::quit_app,
            market::reveal_path,
            ai_clients::list_ai_clients,
            ai_clients::connect_ai_client,
            ai_clients::disconnect_ai_client,
            ai_clients::ai_client_snippet,
            ai_clients::ai_clients_ready,
            market::exasol_local_ctl,
            bucketfs::bucketfs_list,
            bucketfs::bucketfs_upload,
            bucketfs::bucketfs_download,
            git::git_status,
            git::git_init,
            git::git_commit,
            git::git_log,
            git::git_branches,
            git::git_checkout,
            git::git_create_branch,
            git::git_stage,
            git::git_stage_all,
            git::git_unstage,
            git::git_discard,
            git::git_diff,
            git::git_set_remote,
            git::git_fetch,
            git::git_pull,
            git::git_push,
            git::git_graph,
            market::market_repo_meta,
            git::git_log_rich,
            git::git_commit_details,
            git::git_commit_files,
            git::git_commit_file_diff,
            git::git_commit_amend,
            git::git_branch_delete,
            git::git_merge,
            git::git_stash_list,
            git::git_stash_push,
            git::git_stash_pop,
            exapump::exapump_available,
            exapump::exapump_upload,
            settings::get_app_settings,
            settings::set_app_settings,
            market::market_dir_path,
            query::execute_sql,
            query::cancel_query,
            history::sql_history_list,
            history::sql_history_clear,
            agent::agent_api,
            agent::agent_restart,
            agent::agent_grant_connection,
            agent::engine_ops_sync,
            agent::engine_options_get,
            agent::engine_tools_sync,
            agent::agent_stream,
            local_llm::llm_status,
            local_llm::llm_engine_install,
            local_llm::llm_model_install,
            local_llm::llm_embed_install,
            local_llm::llm_start,
            local_llm::llm_stop,
            local_llm::llm_set_auto_start,
            local_database::personal_local_bootstrap,
            local_database::personal_local_status,
            local_database::personal_install_semantic_views,
            local_database::list_components,
            upstream::components_upstream,
            local_database::update_component,
            local_database::revert_component,
            local_database::backup_local_database,
            skills_market::skills_list_targets,
            skills_market::skills_install_target,
            skills_market::skills_install_persona,
            skills_market::skills_install_official,
            skills_market::skills_fetch_official,
            skills_market::skills_installed_official,
        ])
        .build(tauri::generate_context!())
        .expect("error while running Exasol Studio")
        .run(|app, event| {
            // Closing the main window with uncommitted changes in a tab's
            // session asks first (Commit / Roll back / Cancel in the page).
            if let tauri::RunEvent::WindowEvent { label, event: tauri::WindowEvent::CloseRequested { api, .. }, .. } = &event {
                use std::sync::atomic::Ordering;
                if label == "main"
                    && !crate::session_cmd::QUIT_CONFIRMED.load(Ordering::SeqCst)
                    && app.state::<AppState>().sessions.might_have_changes_now()
                {
                    api.prevent_close();
                    crate::session_cmd::QUIT_ACKED.store(false, Ordering::SeqCst);
                    let _ = app.emit("studio:quit-requested", ());
                    // A page that cannot answer must not keep the app open — nor
                    // end the work without the person: ask natively instead.
                    let handle = app.clone();
                    std::thread::spawn(move || {
                        std::thread::sleep(std::time::Duration::from_secs(4));
                        if crate::session_cmd::QUIT_ACKED.load(Ordering::SeqCst) {
                            return;
                        }
                        use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
                        let quit = handle
                            .dialog()
                            .message("A tab has uncommitted changes and the window is not responding. Roll them back and quit, or cancel and keep working?")
                            .title("Uncommitted changes")
                            .kind(MessageDialogKind::Warning)
                            .buttons(MessageDialogButtons::OkCancelCustom("Roll back and quit".into(), "Cancel".into()))
                            .blocking_show();
                        if quit {
                            crate::session_cmd::rollback_all_and_quit(&handle);
                        }
                    });
                }
            }
            if let tauri::RunEvent::Exit = event {
                app.state::<crate::local_llm::LlmEngine>().kill();
                app.state::<crate::dash_server::DashServer>().kill();
            }
        });
}

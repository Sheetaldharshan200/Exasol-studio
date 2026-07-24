mod agent;
mod ai_clients;
mod terminal;
mod updates;
mod bucketfs;
mod catalog;
mod connection;
mod connection_settings;
mod component_lock;
mod driver_exec;
mod drivers;
mod error;
mod exapump;
mod files;
mod fs;
mod git;
mod history;
mod local_database;
mod local_llm;
mod local_runtime;
mod market;
mod metadata;
mod profiles;
mod query;
mod security;
mod settings;
mod state;
mod storage;

use tauri::Manager;

use crate::state::AppState;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .expect("app data directory must resolve");
            std::fs::create_dir_all(&data_dir)?;
            app.manage(AppState::new(data_dir));
            app.manage(crate::agent::AgentSidecar::default());
            app.manage(crate::local_llm::LlmEngine::default());
            app.manage(crate::terminal::TermRegistry::default());
            crate::updates::start(app.handle().clone());
            app.manage(crate::local_database::LocalBootstrap::default());
            crate::local_llm::auto_start_if_enabled(app.handle());
            crate::local_database::auto_start_if_installed(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
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
            files::write_text_file,
            files::save_attachment,
            files::install_cli,
            fs::fs_list_dir,
            fs::fs_read_text,
            fs::fs_read_table,
            fs::fs_workspace_dir,
            fs::fs_home_roots,
            fs::fs_search,
            fs::fs_delete,
            market::market_env,
            market::market_catalog,
            market::market_doc,
            market::market_doc_save,
            market::market_doc_load,
            market::market_doc_forget,
            market::market_release,
            market::market_installed,
            market::market_detect,
            market::market_install,
            market::market_install_run,
            market::market_uninstall,
            market::market_doc_file,
            market::open_external,
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
            exapump::exapump_available,
            exapump::exapump_upload,
            settings::get_app_settings,
            settings::set_app_settings,
            market::market_dir_path,
            query::execute_sql,
            history::sql_history_list,
            history::sql_history_clear,
            agent::agent_api,
            agent::agent_grant_connection,
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
        ])
        .build(tauri::generate_context!())
        .expect("error while running Exasol Studio")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                app.state::<crate::local_llm::LlmEngine>().kill();
            }
        });
}

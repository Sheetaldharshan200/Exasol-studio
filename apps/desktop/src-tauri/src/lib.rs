mod ai;
mod bucketfs;
mod catalog;
mod exapump;
mod connection;
mod drivers;
mod error;
mod files;
mod fs;
mod history;
mod market;
mod metadata;
mod settings;
mod profiles;
mod query;
mod state;
mod storage;

use tauri::Manager;

use crate::state::AppState;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .expect("app data directory must resolve");
            std::fs::create_dir_all(&data_dir)?;
            app.manage(AppState::new(data_dir));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            drivers::list_drivers,
            profiles::list_connection_profiles,
            profiles::save_connection_profile,
            profiles::delete_connection_profile,
            connection::ping_server,
            connection::test_connection,
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
            catalog::get_database_info,
            catalog::list_data_types,
            catalog::search_objects,
            catalog::get_schema_graph,
            catalog::list_vs_prereqs,
            files::write_text_file,
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
            market::bi_installed,
            market::bi_launch,
            bucketfs::bucketfs_list,
            bucketfs::bucketfs_upload,
            exapump::exapump_available,
            exapump::exapump_upload,
            settings::get_app_settings,
            settings::set_app_settings,
            market::market_dir_path,
            query::execute_sql,
            history::sql_history_list,
            history::sql_history_clear,
            ai::get_assistant_settings,
            ai::set_assistant_settings,
            ai::ai_chat,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Exasol Studio");
}

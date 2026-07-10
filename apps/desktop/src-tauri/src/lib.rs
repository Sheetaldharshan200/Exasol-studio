mod ai;
mod catalog;
mod connection;
mod drivers;
mod error;
mod files;
mod history;
mod metadata;
mod profiles;
mod query;
mod state;
mod storage;

use tauri::Manager;

use crate::state::AppState;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
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
            catalog::get_database_info,
            catalog::list_data_types,
            catalog::search_objects,
            files::write_text_file,
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

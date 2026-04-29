pub mod commands;
pub mod error;
pub mod models;
pub mod profile_store;
pub mod pty;
pub mod workspace_watcher;

use std::sync::Arc;

use profile_store::ProfileStore;
use pty::PtyManager;
use tauri::Manager;
use workspace_watcher::WorkspaceWatcherManager;

pub use error::{AppError, AppResult};

pub struct AppState {
    pub pty_manager: Arc<PtyManager>,
    pub profile_store: Arc<ProfileStore>,
    pub workspace_watcher: Arc<WorkspaceWatcherManager>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let handle = app.handle().clone();
            let app_state = AppState {
                pty_manager: Arc::new(PtyManager::new(handle.clone())),
                profile_store: Arc::new(ProfileStore::new(&handle)?),
                workspace_watcher: Arc::new(WorkspaceWatcherManager::new(handle.clone())),
            };
            app.manage(app_state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::create_session,
            commands::write_session_input,
            commands::resize_session,
            commands::kill_session,
            commands::restart_session,
            commands::load_profiles,
            commands::save_profiles,
            commands::read_text_file,
            commands::read_text_preview_file,
            commands::read_file_as_data_url,
            commands::write_text_file,
            commands::list_directory,
            commands::list_markdown_directory,
            commands::list_skill_files,
            commands::import_skill_file,
            commands::import_skill_items,
            commands::get_default_knowledge_base_path,
            commands::count_markdown_files,
            commands::watch_workspace_directory,
            commands::unwatch_workspace_directory
        ])
        .run(tauri::generate_context!())
        .expect("failed to run tauri application");
}

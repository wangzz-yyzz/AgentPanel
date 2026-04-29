use std::{
    path::PathBuf,
    sync::{
        mpsc::{self, RecvTimeoutError},
        Mutex,
    },
    thread,
    time::Duration,
};

use notify::{Config, Event, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter};

use crate::{
    error::{AppError, AppResult},
    models::WorkspaceFsChangePayload,
};

pub struct WorkspaceWatcherManager {
    app: AppHandle,
    state: Mutex<WatchState>,
}

struct WatchState {
    root_path: Option<PathBuf>,
    watcher: Option<RecommendedWatcher>,
}

impl WorkspaceWatcherManager {
    pub fn new(app: AppHandle) -> Self {
        Self {
            app,
            state: Mutex::new(WatchState {
                root_path: None,
                watcher: None,
            }),
        }
    }

    pub fn watch(&self, path: String) -> AppResult<()> {
        let root_path = PathBuf::from(path);
        if !root_path.exists() {
            return Err(AppError::message(format!(
                "Directory does not exist: {}",
                root_path.display()
            )));
        }
        if !root_path.is_dir() {
            return Err(AppError::message(format!(
                "Path is not a directory: {}",
                root_path.display()
            )));
        }

        let mut state = self
            .state
            .lock()
            .map_err(|_| AppError::message("Failed to acquire workspace watcher lock"))?;

        if state.root_path.as_ref() == Some(&root_path) && state.watcher.is_some() {
            return Ok(());
        }

        state.watcher = None;
        state.root_path = None;

        let app = self.app.clone();
        let event_root = root_path.clone();
        let (tx, rx) = mpsc::channel::<notify::Result<Event>>();
        let mut watcher = RecommendedWatcher::new(
            move |result| {
                let _ = tx.send(result);
            },
            Config::default(),
        )
        .map_err(|error| AppError::message(error.to_string()))?;

        watcher
            .watch(&root_path, RecursiveMode::Recursive)
            .map_err(|error| AppError::message(error.to_string()))?;

        thread::spawn(move || {
            let mut pending_paths: Vec<String> = Vec::new();
            loop {
                match rx.recv_timeout(Duration::from_millis(200)) {
                    Ok(Ok(event)) => {
                        pending_paths.extend(
                            event
                                .paths
                                .into_iter()
                                .map(|path| path.to_string_lossy().to_string()),
                        );
                    }
                    Ok(Err(_)) => {}
                    Err(RecvTimeoutError::Timeout) => {
                        if pending_paths.is_empty() {
                            continue;
                        }

                        pending_paths.sort();
                        pending_paths.dedup();
                        let payload = WorkspaceFsChangePayload {
                            root_path: event_root.to_string_lossy().to_string(),
                            paths: std::mem::take(&mut pending_paths),
                        };
                        let _ = app.emit("workspace://fs-changed", payload);
                    }
                    Err(RecvTimeoutError::Disconnected) => break,
                }
            }
        });

        state.root_path = Some(root_path);
        state.watcher = Some(watcher);
        Ok(())
    }

    pub fn unwatch(&self) -> AppResult<()> {
        let mut state = self
            .state
            .lock()
            .map_err(|_| AppError::message("Failed to acquire workspace watcher lock"))?;
        state.watcher = None;
        state.root_path = None;
        Ok(())
    }
}

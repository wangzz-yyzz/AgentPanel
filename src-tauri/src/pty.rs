use std::{
    collections::HashMap,
    env,
    ffi::{OsStr, OsString},
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    thread,
};

use portable_pty::{native_pty_system, Child, ChildKiller, CommandBuilder, MasterPty, PtySize};
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

use crate::{
    error::{AppError, AppResult},
    models::{CreateSessionInput, SessionExitPayload, SessionOutputPayload},
};

type SharedWriter = Arc<Mutex<Box<dyn Write + Send>>>;

pub struct PtyManager {
    app: AppHandle,
    sessions: Mutex<HashMap<String, SessionHandle>>,
}

struct SessionHandle {
    input: CreateSessionInput,
    writer: SharedWriter,
    master: Box<dyn MasterPty + Send>,
    killer: Box<dyn ChildKiller + Send + Sync>,
}

impl PtyManager {
    pub fn new(app: AppHandle) -> Self {
        Self {
            app,
            sessions: Mutex::new(HashMap::new()),
        }
    }

    pub fn create_session(&self, input: CreateSessionInput) -> AppResult<String> {
        let system = native_pty_system();
        let pair = system
            .openpty(PtySize {
                rows: input.rows,
                cols: input.cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|error| AppError::message(error.to_string()))?;

        let command = build_command(&input)?;

        let child = pair
            .slave
            .spawn_command(command)
            .map_err(|error| AppError::message(error.to_string()))?;
        drop(pair.slave);

        let writer = Arc::new(Mutex::new(
            pair.master
                .take_writer()
                .map_err(|error| AppError::message(error.to_string()))?,
        ));

        let session_id = Uuid::new_v4().to_string();
        let output_reader = pair
            .master
            .try_clone_reader()
            .map_err(|error| AppError::message(error.to_string()))?;

        self.spawn_output_task(session_id.clone(), output_reader);

        let killer = child.clone_killer();
        self.spawn_exit_task(session_id.clone(), child);

        let session = SessionHandle {
            input,
            writer,
            master: pair.master,
            killer,
        };

        self.sessions
            .lock()
            .map_err(|_| AppError::message("Failed to acquire session lock"))?
            .insert(session_id.clone(), session);

        Ok(session_id)
    }

    pub fn write_input(&self, session_id: &str, data: &str) -> AppResult<()> {
        let sessions = self
            .sessions
            .lock()
            .map_err(|_| AppError::message("Failed to acquire session lock"))?;
        let session = sessions
            .get(session_id)
            .ok_or_else(|| AppError::message(format!("Unknown session: {session_id}")))?;
        let mut writer = session
            .writer
            .lock()
            .map_err(|_| AppError::message("Failed to acquire writer lock"))?;
        writer.write_all(data.as_bytes())?;
        writer.flush()?;
        Ok(())
    }

    pub fn resize_session(&self, session_id: &str, cols: u16, rows: u16) -> AppResult<()> {
        let sessions = self
            .sessions
            .lock()
            .map_err(|_| AppError::message("Failed to acquire session lock"))?;
        let session = sessions
            .get(session_id)
            .ok_or_else(|| AppError::message(format!("Unknown session: {session_id}")))?;
        session
            .master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|error| AppError::message(error.to_string()))
    }

    pub fn kill_session(&self, session_id: &str) -> AppResult<()> {
        let mut sessions = self
            .sessions
            .lock()
            .map_err(|_| AppError::message("Failed to acquire session lock"))?;
        {
            let session = sessions
                .get_mut(session_id)
                .ok_or_else(|| AppError::message(format!("Unknown session: {session_id}")))?;
            session
                .killer
                .kill()
                .map_err(|error| AppError::message(error.to_string()))?;
        }
        sessions.remove(session_id);
        Ok(())
    }

    pub fn restart_session(&self, session_id: &str) -> AppResult<String> {
        let input = {
            let mut sessions = self
                .sessions
                .lock()
                .map_err(|_| AppError::message("Failed to acquire session lock"))?;
            let session = sessions
                .get_mut(session_id)
                .ok_or_else(|| AppError::message(format!("Unknown session: {session_id}")))?;
            let input = session.input.clone();
            let _ = session.killer.kill();
            input
        };

        let new_session_id = self.create_session(input)?;
        self.sessions
            .lock()
            .map_err(|_| AppError::message("Failed to acquire session lock"))?
            .remove(session_id);
        Ok(new_session_id)
    }

    fn spawn_output_task(&self, session_id: String, mut reader: Box<dyn Read + Send>) {
        let app = self.app.clone();
        thread::spawn(move || {
            let mut buffer = [0_u8; 8192];
            loop {
                match reader.read(&mut buffer) {
                    Ok(0) => break,
                    Ok(size) => {
                        let chunk = String::from_utf8_lossy(&buffer[..size]).to_string();
                        let payload = SessionOutputPayload {
                            session_id: session_id.clone(),
                            chunk,
                        };
                        let _ = app.emit("pty://output", payload);
                    }
                    Err(_) => break,
                }
            }
        });
    }

    fn spawn_exit_task(&self, session_id: String, mut child: Box<dyn Child + Send>) {
        let app = self.app.clone();
        thread::spawn(move || {
            let exit_code = child
                .wait()
                .ok()
                .and_then(|status| i32::try_from(status.exit_code()).ok());
            let payload = SessionExitPayload {
                session_id,
                exit_code,
            };
            let _ = app.emit("pty://exit", payload);
        });
    }
}

fn apply_launch_options(command: &mut CommandBuilder, input: &CreateSessionInput) -> AppResult<()> {
    for arg in &input.profile.args {
        command.arg(arg);
    }

    let cwd = input
        .cwd
        .clone()
        .or_else(|| input.profile.cwd.clone())
        .filter(|value| !value.trim().is_empty());
    if let Some(cwd) = cwd {
        let cwd_path = PathBuf::from(&cwd);
        if !cwd_path.exists() {
            return Err(AppError::message(format!(
                "Working directory does not exist: {}",
                cwd_path.display()
            )));
        }
        if !cwd_path.is_dir() {
            return Err(AppError::message(format!(
                "Working directory is not a folder: {}",
                cwd_path.display()
            )));
        }
        command.cwd(cwd);
    }

    for (key, value) in input.profile.env.clone().unwrap_or_default() {
        command.env(key, value);
    }
    for (key, value) in input.env.clone().unwrap_or_default() {
        command.env(key, value);
    }

    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn build_command(input: &CreateSessionInput) -> AppResult<CommandBuilder> {
    let mut command = CommandBuilder::new(&input.profile.command);
    apply_launch_options(&mut command, input)?;
    Ok(command)
}

#[cfg(target_os = "windows")]
fn build_command(input: &CreateSessionInput) -> AppResult<CommandBuilder> {
    let mut command = CommandBuilder::new(&input.profile.command);
    apply_launch_options(&mut command, input)?;
    normalize_windows_command(&mut command)?;
    Ok(command)
}

#[cfg(target_os = "windows")]
fn normalize_windows_command(command: &mut CommandBuilder) -> AppResult<()> {
    let argv = command.get_argv();
    let Some(program) = argv.first().cloned() else {
        return Err(AppError::message("Command is required"));
    };
    let args: Vec<OsString> = argv.iter().skip(1).cloned().collect();
    let resolved = resolve_windows_command(command, &program).ok_or_else(|| {
        AppError::message(format!(
            "Command not found on PATH or filesystem: {}",
            program.to_string_lossy()
        ))
    })?;
    if is_cmd_wrapper(&resolved) {
        let shell = windows_command_shell(command);
        let argv = command.get_argv_mut();
        argv.clear();
        argv.push(shell);
        argv.push("/D".into());
        argv.push("/C".into());
        argv.push(resolved.into_os_string());
        argv.extend(args);
        return Ok(());
    }

    if resolved.as_os_str() != program {
        command.get_argv_mut()[0] = resolved.into_os_string();
    }

    Ok(())
}

#[cfg(target_os = "windows")]
fn resolve_windows_command(command: &CommandBuilder, program: &OsStr) -> Option<PathBuf> {
    if program.is_empty() {
        return None;
    }

    let input_path = Path::new(program);
    if looks_like_path(input_path) {
        return resolve_path_candidate(command, input_path);
    }

    command.get_env("PATH").and_then(|path_value| {
        env::split_paths(path_value)
            .find_map(|directory| resolve_path_candidate(command, &directory.join(program)))
    })
}

#[cfg(target_os = "windows")]
fn looks_like_path(command: &Path) -> bool {
    command.has_root() || command.components().count() > 1
}

#[cfg(target_os = "windows")]
fn resolve_path_candidate(command: &CommandBuilder, candidate: &Path) -> Option<PathBuf> {
    let candidate = if candidate.is_absolute() {
        candidate.to_path_buf()
    } else {
        resolve_working_dir(command).join(candidate)
    };

    if candidate.extension().is_none() {
        for extension in windows_pathexts(command) {
            let resolved = candidate.with_extension(extension.trim_start_matches('.'));
            if resolved.is_file() {
                return Some(resolved);
            }
        }
    }

    if candidate.is_file() {
        return Some(candidate);
    }

    None
}

#[cfg(target_os = "windows")]
fn resolve_working_dir(command: &CommandBuilder) -> PathBuf {
    command
        .get_cwd()
        .filter(|cwd| !cwd.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| env::current_dir().unwrap_or_else(|_| PathBuf::from(".")))
}

#[cfg(target_os = "windows")]
fn windows_pathexts(command: &CommandBuilder) -> Vec<String> {
    command
        .get_env("PATHEXT")
        .and_then(OsStr::to_str)
        .map(|value| {
            value
                .split(';')
                .map(str::trim)
                .filter(|item| item.starts_with('.') && item.len() > 1)
                .map(|item| item.to_ascii_lowercase())
                .collect::<Vec<_>>()
        })
        .filter(|items| !items.is_empty())
        .unwrap_or_else(|| vec![".com".into(), ".exe".into(), ".bat".into(), ".cmd".into()])
}

#[cfg(target_os = "windows")]
fn is_cmd_wrapper(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| matches!(extension.to_ascii_lowercase().as_str(), "cmd" | "bat"))
        .unwrap_or(false)
}

#[cfg(target_os = "windows")]
fn windows_command_shell(command: &CommandBuilder) -> OsString {
    command
        .get_env("ComSpec")
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| OsStr::new("cmd.exe"))
        .to_owned()
}

#[cfg(all(test, target_os = "windows"))]
mod tests {
    use super::{normalize_windows_command, resolve_windows_command, windows_command_shell};
    use portable_pty::CommandBuilder;
    use std::{
        ffi::OsString,
        fs,
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };

    fn temp_test_dir(prefix: &str) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time before unix epoch")
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("agent-panel-{prefix}-{unique}"));
        fs::create_dir_all(&dir).expect("create temp dir");
        dir
    }

    #[test]
    fn resolves_pathext_before_extensionless_shims() {
        let temp_dir = temp_test_dir("shim");
        let bare = temp_dir.join("claude");
        let shim = temp_dir.join("claude.cmd");
        fs::write(&bare, "#!/bin/sh\n").expect("write bare shim");
        fs::write(&shim, "@echo off\r\n").expect("write cmd shim");

        let mut command = CommandBuilder::new("claude");
        command.env("PATH", temp_dir.as_os_str());
        command.env("PATHEXT", ".CMD;.EXE");

        let resolved = resolve_windows_command(&command, &OsString::from("claude"));
        assert_eq!(resolved, Some(shim.clone()));

        let _ = fs::remove_dir_all(temp_dir);
    }

    #[test]
    fn wraps_cmd_wrappers_with_cmd_exe() {
        let temp_dir = temp_test_dir("wrap");
        let script = temp_dir.join("claude.cmd");
        fs::write(&script, "@echo off\r\n").expect("write cmd shim");

        let mut command = CommandBuilder::new(script.as_os_str());
        command.arg("--profile");
        command.arg("foo bar");

        normalize_windows_command(&mut command).expect("normalize command");

        let argv = command.get_argv();
        assert_eq!(argv[0], windows_command_shell(&command));
        assert_eq!(argv[1], OsString::from("/D"));
        assert_eq!(argv[2], OsString::from("/C"));
        assert_eq!(argv[3], script.as_os_str());
        assert_eq!(argv[4], OsString::from("--profile"));
        assert_eq!(argv[5], OsString::from("foo bar"));

        let _ = fs::remove_dir_all(temp_dir);
    }

    #[test]
    fn bare_cmd_wrappers_keep_original_command_name() {
        let temp_dir = temp_test_dir("bare");
        let script = temp_dir.join("claude.cmd");
        fs::write(&script, "@echo off\r\n").expect("write cmd shim");

        let mut command = CommandBuilder::new("claude");
        command.arg("--dangerously-skip-permissions");
        command.env("PATH", temp_dir.as_os_str());
        command.env("PATHEXT", ".CMD;.EXE");

        normalize_windows_command(&mut command).expect("normalize command");

        let argv = command.get_argv();
        assert_eq!(argv[0], windows_command_shell(&command));
        assert_eq!(argv[1], OsString::from("/D"));
        assert_eq!(argv[2], OsString::from("/C"));
        assert_eq!(argv[3], script.as_os_str());
        assert_eq!(argv[4], OsString::from("--dangerously-skip-permissions"));

        let _ = fs::remove_dir_all(temp_dir);
    }
}

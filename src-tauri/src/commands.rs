use base64::{engine::general_purpose::STANDARD, Engine as _};
use std::{
    fs,
    path::{Path, PathBuf},
};
use tauri::State;

use crate::{
    error::AppError,
    models::{
        AgentHistoryEntry, AgentProfile, CreateSessionInput, DirectoryEntry, PresentationPreviewSlide,
        SkillFileEntry, SpreadsheetPreviewPayload,
    },
    preview,
    AppState,
};

use serde::Deserialize;
use std::{
    collections::{BTreeMap, HashSet},
    io::{BufRead, BufReader},
};

#[tauri::command]
pub fn create_session(
    state: State<'_, AppState>,
    input: CreateSessionInput,
) -> Result<String, AppError> {
    state.pty_manager.create_session(input)
}

#[tauri::command]
pub fn write_session_input(
    state: State<'_, AppState>,
    session_id: String,
    data: String,
) -> Result<(), AppError> {
    state.pty_manager.write_input(&session_id, &data)
}

#[tauri::command]
pub fn resize_session(
    state: State<'_, AppState>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), AppError> {
    state.pty_manager.resize_session(&session_id, cols, rows)
}

#[tauri::command]
pub fn kill_session(state: State<'_, AppState>, session_id: String) -> Result<(), AppError> {
    state.pty_manager.kill_session(&session_id)
}

#[tauri::command]
pub fn restart_session(state: State<'_, AppState>, session_id: String) -> Result<String, AppError> {
    state.pty_manager.restart_session(&session_id)
}

#[tauri::command]
pub fn load_profiles(state: State<'_, AppState>) -> Result<Vec<AgentProfile>, AppError> {
    state.profile_store.load_profiles()
}

#[tauri::command]
pub fn save_profiles(
    state: State<'_, AppState>,
    profiles: Vec<AgentProfile>,
) -> Result<(), AppError> {
    state.profile_store.save_profiles(&profiles)
}

#[tauri::command]
pub fn read_text_file(path: String) -> Result<String, AppError> {
    fs::read_to_string(PathBuf::from(path)).map_err(Into::into)
}

fn decode_utf16_bytes(bytes: &[u8], little_endian: bool, skip_bom: bool) -> String {
    let start_index = if skip_bom { 2 } else { 0 };
    let mut units = Vec::with_capacity((bytes.len().saturating_sub(start_index) + 1) / 2);
    let mut index = start_index;
    while index + 1 < bytes.len() {
        let pair = [bytes[index], bytes[index + 1]];
        units.push(if little_endian {
            u16::from_le_bytes(pair)
        } else {
            u16::from_be_bytes(pair)
        });
        index += 2;
    }

    String::from_utf16_lossy(&units)
}

fn looks_like_utf16(bytes: &[u8]) -> Option<bool> {
    let sample_len = bytes.len().min(512);
    if sample_len < 4 {
        return None;
    }

    let mut even_zeroes = 0usize;
    let mut odd_zeroes = 0usize;
    for (index, byte) in bytes[..sample_len].iter().enumerate() {
        if *byte != 0 {
            continue;
        }
        if index % 2 == 0 {
            even_zeroes += 1;
        } else {
            odd_zeroes += 1;
        }
    }

    let threshold = sample_len / 8;
    if odd_zeroes >= threshold && odd_zeroes > even_zeroes * 2 {
        return Some(true);
    }
    if even_zeroes >= threshold && even_zeroes > odd_zeroes * 2 {
        return Some(false);
    }

    None
}

fn decode_text_preview_bytes(bytes: &[u8]) -> String {
    if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
        return String::from_utf8_lossy(&bytes[3..]).into_owned();
    }
    if bytes.starts_with(&[0xFF, 0xFE]) {
        return decode_utf16_bytes(bytes, true, true);
    }
    if bytes.starts_with(&[0xFE, 0xFF]) {
        return decode_utf16_bytes(bytes, false, true);
    }
    if let Ok(text) = String::from_utf8(bytes.to_vec()) {
        return text;
    }
    if let Some(little_endian) = looks_like_utf16(bytes) {
        return decode_utf16_bytes(bytes, little_endian, false);
    }

    String::from_utf8_lossy(bytes).into_owned()
}

#[tauri::command]
pub fn read_text_preview_file(path: String) -> Result<String, AppError> {
    let path = PathBuf::from(path);
    if !path.exists() {
        return Err(AppError::message(format!(
            "File does not exist: {}",
            path.display()
        )));
    }
    if !path.is_file() {
        return Err(AppError::message(format!(
            "Path is not a file: {}",
            path.display()
        )));
    }

    let bytes = fs::read(path)?;
    Ok(decode_text_preview_bytes(&bytes))
}

fn mime_type_for_path(path: &Path) -> Option<&'static str> {
    let extension = path.extension()?.to_str()?.to_ascii_lowercase();
    match extension.as_str() {
        "png" => Some("image/png"),
        "jpg" | "jpeg" | "jfif" => Some("image/jpeg"),
        "gif" => Some("image/gif"),
        "webp" => Some("image/webp"),
        "svg" => Some("image/svg+xml"),
        "bmp" => Some("image/bmp"),
        "ico" => Some("image/x-icon"),
        "avif" => Some("image/avif"),
        "pdf" => Some("application/pdf"),
        _ => None,
    }
}

#[tauri::command]
pub fn read_file_as_data_url(path: String) -> Result<String, AppError> {
    let path = PathBuf::from(path);
    if !path.exists() {
        return Err(AppError::message(format!(
            "File does not exist: {}",
            path.display()
        )));
    }
    if !path.is_file() {
        return Err(AppError::message(format!(
            "Path is not a file: {}",
            path.display()
        )));
    }

    let mime_type = mime_type_for_path(&path).ok_or_else(|| {
        AppError::message(format!(
            "Unable to preview this file in the current viewer: {}",
            path.display()
        ))
    })?;
    let bytes = fs::read(&path)?;
    let encoded = STANDARD.encode(bytes);
    Ok(format!("data:{mime_type};base64,{encoded}"))
}

#[tauri::command]
pub fn read_binary_file(path: String) -> Result<Vec<u8>, AppError> {
    let path = PathBuf::from(path);
    if !path.exists() {
        return Err(AppError::message(format!(
            "File does not exist: {}",
            path.display()
        )));
    }
    if !path.is_file() {
        return Err(AppError::message(format!(
            "Path is not a file: {}",
            path.display()
        )));
    }

    Ok(fs::read(path)?)
}

#[tauri::command]
pub fn read_docx_preview(path: String) -> Result<String, AppError> {
    preview::read_docx_preview(Path::new(&path))
}

#[tauri::command]
pub fn read_spreadsheet_preview(path: String) -> Result<SpreadsheetPreviewPayload, AppError> {
    preview::read_spreadsheet_preview(Path::new(&path))
}

#[tauri::command]
pub fn read_presentation_preview(path: String) -> Result<Vec<PresentationPreviewSlide>, AppError> {
    preview::read_presentation_preview(Path::new(&path))
}

#[tauri::command]
pub fn write_text_file(path: String, contents: String) -> Result<(), AppError> {
    let path = PathBuf::from(path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, contents)?;
    Ok(())
}

fn user_home_dir() -> Result<PathBuf, AppError> {
    std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(PathBuf::from)
        .ok_or_else(|| AppError::message("Unable to determine the user home directory."))
}

fn normalize_history_path(path: &Path) -> String {
    let raw = path.to_string_lossy().replace('\\', "/");
    if cfg!(target_os = "windows") {
        raw.to_ascii_lowercase()
    } else {
        raw
    }
}

fn workspace_matches(candidate: &str, workspace_path: &str) -> bool {
    normalize_history_path(Path::new(candidate)) == normalize_history_path(Path::new(workspace_path))
}

#[derive(Debug, Deserialize)]
struct CodexSessionIndexRecord {
    id: String,
    #[serde(default)]
    thread_name: Option<String>,
    updated_at: String,
}

#[derive(Debug, Deserialize)]
struct CodexSessionMetaEnvelope {
    #[serde(rename = "type")]
    entry_type: String,
    payload: Option<CodexSessionMetaPayload>,
}

#[derive(Debug, Deserialize)]
struct CodexSessionMetaPayload {
    id: String,
    cwd: String,
}

#[derive(Debug, Deserialize)]
struct CodexHistoryRecord {
    session_id: String,
    ts: i64,
    text: String,
}

#[derive(Debug, Deserialize)]
struct ClaudeHistoryRecord {
    #[serde(default)]
    display: Option<String>,
    timestamp: i64,
    project: String,
    #[serde(rename = "sessionId")]
    session_id: String,
}

fn parse_jsonl_lines<T>(path: &Path) -> Result<Vec<T>, AppError>
where
    T: for<'de> Deserialize<'de>,
{
    if !path.is_file() {
        return Ok(Vec::new());
    }

    let file = fs::File::open(path)?;
    let reader = BufReader::new(file);
    let mut records = Vec::new();
    for line in reader.lines() {
        let line = line?;
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        if let Ok(record) = serde_json::from_str::<T>(trimmed) {
            records.push(record);
        }
    }
    Ok(records)
}

fn visit_jsonl_files(root: &Path, files: &mut Vec<PathBuf>) -> Result<(), AppError> {
    if !root.exists() {
        return Ok(());
    }

    for entry in fs::read_dir(root)? {
        let entry = entry?;
        let path = entry.path();
        let metadata = entry.metadata()?;
        if metadata.is_dir() {
            visit_jsonl_files(&path, files)?;
            continue;
        }
        let is_jsonl = path
            .extension()
            .and_then(|value| value.to_str())
            .map(|value| value.eq_ignore_ascii_case("jsonl"))
            .unwrap_or(false);
        if is_jsonl {
            files.push(path);
        }
    }

    Ok(())
}

fn load_codex_history(workspace_path: &str) -> Result<Vec<AgentHistoryEntry>, AppError> {
    let codex_root = user_home_dir()?.join(".codex");
    let index_path = codex_root.join("session_index.jsonl");
    let session_records = parse_jsonl_lines::<CodexSessionIndexRecord>(&index_path)?;
    let history_path = codex_root.join("history.jsonl");
    let history_records = parse_jsonl_lines::<CodexHistoryRecord>(&history_path)?;

    let mut workspace_session_ids = HashSet::new();
    let mut session_files = Vec::new();
    visit_jsonl_files(&codex_root.join("sessions"), &mut session_files)?;
    for path in session_files {
        let file = fs::File::open(&path)?;
        let reader = BufReader::new(file);
        for line in reader.lines() {
            let line = line?;
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }
            let Ok(record) = serde_json::from_str::<CodexSessionMetaEnvelope>(trimmed) else {
                continue;
            };
            if record.entry_type != "session_meta" {
                continue;
            }
            let Some(payload) = record.payload else {
                continue;
            };
            if workspace_matches(&payload.cwd, workspace_path) {
                workspace_session_ids.insert(payload.id);
            }
            break;
        }
    }

    let indexed_by_id = session_records
        .into_iter()
        .map(|record| (record.id.clone(), record))
        .collect::<BTreeMap<_, _>>();
    let mut history_by_id = BTreeMap::<String, AgentHistoryEntry>::new();

    for record in indexed_by_id
        .values()
        .filter(|record| workspace_session_ids.contains(&record.id))
    {
        history_by_id.insert(
            record.id.clone(),
            AgentHistoryEntry {
                agent_kind: "codex".to_string(),
                session_id: record.id.clone(),
                title: record
                    .thread_name
                    .clone()
                    .filter(|value| !value.trim().is_empty())
                    .unwrap_or_else(|| "Untitled session".to_string()),
                updated_at: record.updated_at.clone(),
            },
        );
    }

    for record in history_records {
        if !workspace_session_ids.contains(&record.session_id) {
            continue;
        }
        if record.text.trim().is_empty() {
            continue;
        }

        let updated_at = record.ts.to_string();
        history_by_id
            .entry(record.session_id.clone())
            .and_modify(|entry| {
                if entry.title.trim().is_empty() || entry.title == "Untitled session" {
                    entry.title = record.text.trim().to_string();
                }
                let existing_ts = entry.updated_at.parse::<i64>().ok();
                let next_ts = updated_at.parse::<i64>().ok();
                if let (Some(existing), Some(next)) = (existing_ts, next_ts) {
                    if next > existing {
                        entry.updated_at = updated_at.clone();
                    }
                }
            })
            .or_insert_with(|| AgentHistoryEntry {
                agent_kind: "codex".to_string(),
                session_id: record.session_id.clone(),
                title: record.text.trim().to_string(),
                updated_at: updated_at.clone(),
            });
    }

    let mut history = history_by_id
        .into_values()
        .map(|entry| AgentHistoryEntry {
            agent_kind: "codex".to_string(),
            session_id: entry.session_id,
            title: entry.title,
            updated_at: entry.updated_at,
        })
        .collect::<Vec<_>>();
    history.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
    Ok(history)
}

fn timestamp_millis_to_string(timestamp_ms: i64) -> String {
    timestamp_ms.to_string()
}

fn load_claude_history(workspace_path: &str) -> Result<Vec<AgentHistoryEntry>, AppError> {
    let claude_root = user_home_dir()?.join(".claude");
    let history_path = claude_root.join("history.jsonl");
    let history_records = parse_jsonl_lines::<ClaudeHistoryRecord>(&history_path)?;
    if history_records.is_empty() {
        return Ok(Vec::new());
    }

    let mut latest_by_session = BTreeMap::<String, AgentHistoryEntry>::new();
    for record in history_records {
        if !workspace_matches(&record.project, workspace_path) {
            continue;
        }

        let title = record
            .display
            .unwrap_or_default()
            .trim()
            .to_string();
        if title.is_empty() {
            continue;
        }

        latest_by_session.insert(
            record.session_id.clone(),
            AgentHistoryEntry {
                agent_kind: "claude".to_string(),
                session_id: record.session_id,
                title,
                updated_at: timestamp_millis_to_string(record.timestamp),
            },
        );
    }

    let mut history = latest_by_session.into_values().collect::<Vec<_>>();
    history.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
    Ok(history)
}

#[tauri::command]
pub fn list_agent_history(workspace_path: String, agent_kinds: Vec<String>) -> Result<Vec<AgentHistoryEntry>, AppError> {
    let mut history = Vec::new();
    let wants_codex = agent_kinds.iter().any(|kind| kind.eq_ignore_ascii_case("codex"));
    let wants_claude = agent_kinds.iter().any(|kind| kind.eq_ignore_ascii_case("claude"));

    if wants_codex {
        history.extend(load_codex_history(&workspace_path)?);
    }
    if wants_claude {
        history.extend(load_claude_history(&workspace_path)?);
    }

    history.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
    Ok(history)
}

#[tauri::command]
pub fn list_directory(path: String) -> Result<Vec<DirectoryEntry>, AppError> {
    let path = PathBuf::from(path);
    if !path.exists() {
        return Err(AppError::message(format!(
            "Directory does not exist: {}",
            path.display()
        )));
    }
    if !path.is_dir() {
        return Err(AppError::message(format!(
            "Path is not a directory: {}",
            path.display()
        )));
    }

    let mut entries = fs::read_dir(&path)?
        .filter_map(|entry| entry.ok())
        .filter_map(|entry| {
            let entry_path = entry.path();
            let metadata = entry.metadata().ok()?;
            let file_name = entry.file_name();
            let name = file_name.to_string_lossy().to_string();
            let extension = if metadata.is_file() {
                entry_path
                    .extension()
                    .map(|value| value.to_string_lossy().to_ascii_lowercase())
            } else {
                None
            };

            Some(DirectoryEntry {
                name,
                path: entry_path.to_string_lossy().to_string(),
                is_directory: metadata.is_dir(),
                extension,
            })
        })
        .collect::<Vec<_>>();

    entries.sort_by(
        |left, right| match (left.is_directory, right.is_directory) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => left
                .name
                .to_ascii_lowercase()
                .cmp(&right.name.to_ascii_lowercase()),
        },
    );

    Ok(entries)
}

fn directory_entry_from_path(path: &Path, metadata: &fs::Metadata, name: String) -> DirectoryEntry {
    let extension = if metadata.is_file() {
        path.extension()
            .map(|value| value.to_string_lossy().to_ascii_lowercase())
    } else {
        None
    };

    DirectoryEntry {
        name,
        path: path.to_string_lossy().to_string(),
        is_directory: metadata.is_dir(),
        extension,
    }
}

fn sort_directory_entries(entries: &mut [DirectoryEntry]) {
    entries.sort_by(
        |left, right| match (left.is_directory, right.is_directory) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => left
                .name
                .to_ascii_lowercase()
                .cmp(&right.name.to_ascii_lowercase()),
        },
    );
}

fn directory_contains_markdown(current: &Path) -> Result<bool, AppError> {
    for entry in fs::read_dir(current)? {
        let entry = entry?;
        let path = entry.path();
        let metadata = entry.metadata()?;

        if metadata.is_dir() {
            if directory_contains_markdown(&path)? {
                return Ok(true);
            }
            continue;
        }

        if is_markdown_file(&path) {
            return Ok(true);
        }
    }

    Ok(false)
}

#[tauri::command]
pub fn list_markdown_directory(path: String) -> Result<Vec<DirectoryEntry>, AppError> {
    let path = PathBuf::from(path);
    if !path.exists() {
        return Err(AppError::message(format!(
            "Directory does not exist: {}",
            path.display()
        )));
    }
    if !path.is_dir() {
        return Err(AppError::message(format!(
            "Path is not a directory: {}",
            path.display()
        )));
    }

    let mut entries = Vec::new();
    for entry in fs::read_dir(&path)? {
        let entry = entry?;
        let entry_path = entry.path();
        let metadata = entry.metadata()?;

        if metadata.is_dir() {
            if !directory_contains_markdown(&entry_path)? {
                continue;
            }
        } else if !is_markdown_file(&entry_path) {
            continue;
        }

        let name = entry.file_name().to_string_lossy().to_string();
        entries.push(directory_entry_from_path(&entry_path, &metadata, name));
    }

    sort_directory_entries(&mut entries);
    Ok(entries)
}

#[tauri::command]
pub fn watch_workspace_directory(state: State<'_, AppState>, path: String) -> Result<(), AppError> {
    state.workspace_watcher.watch(path)
}

#[tauri::command]
pub fn unwatch_workspace_directory(state: State<'_, AppState>) -> Result<(), AppError> {
    state.workspace_watcher.unwatch()
}

fn preferred_skill_preview_path(current: &Path) -> Result<Option<PathBuf>, AppError> {
    for entry in fs::read_dir(current)? {
        let entry = entry?;
        let path = entry.path();
        let metadata = entry.metadata()?;

        if metadata.is_dir() {
            continue;
        }

        let file_name = entry.file_name().to_string_lossy().to_string();
        if file_name.eq_ignore_ascii_case("SKILL.md") {
            return Ok(Some(path));
        }
    }

    for entry in fs::read_dir(current)? {
        let entry = entry?;
        let path = entry.path();
        let metadata = entry.metadata()?;

        if metadata.is_dir() {
            continue;
        }

        let file_name = entry.file_name().to_string_lossy().to_string();
        if file_name.eq_ignore_ascii_case("README.md") {
            return Ok(Some(path));
        }
    }

    let mut first_markdown: Option<PathBuf> = None;
    let mut child_directories = Vec::new();

    for entry in fs::read_dir(current)? {
        let entry = entry?;
        let path = entry.path();
        let metadata = entry.metadata()?;

        if metadata.is_dir() {
            child_directories.push(path);
            continue;
        }

        if is_markdown_file(&path) && first_markdown.is_none() {
            first_markdown = Some(path);
        }
    }

    if first_markdown.is_some() {
        return Ok(first_markdown);
    }

    child_directories.sort_by(|left, right| {
        left.file_name()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .to_ascii_lowercase()
            .cmp(
                &right
                    .file_name()
                    .and_then(|value| value.to_str())
                    .unwrap_or_default()
                    .to_ascii_lowercase(),
            )
    });

    for directory in child_directories {
        if let Some(preview_path) = preferred_skill_preview_path(&directory)? {
            return Ok(Some(preview_path));
        }
    }

    Ok(None)
}

fn is_markdown_file(path: &Path) -> bool {
    path.extension()
        .and_then(|value| value.to_str())
        .map(|value| value.eq_ignore_ascii_case("md"))
        .unwrap_or(false)
}

fn unique_skill_target_path(target_dir: &Path, source_name: &str) -> PathBuf {
    let source_path = Path::new(source_name);
    let stem = source_path
        .file_stem()
        .and_then(|value| value.to_str())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("skill");
    let extension = source_path
        .extension()
        .and_then(|value| value.to_str())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("md");

    let mut candidate = target_dir.join(format!("{stem}.{extension}"));
    let mut suffix = 2;
    while candidate.exists() {
        candidate = target_dir.join(format!("{stem}-{suffix}.{extension}"));
        suffix += 1;
    }
    candidate
}

fn unique_skill_target_directory(target_dir: &Path, source_name: &str) -> PathBuf {
    let stem = Path::new(source_name)
        .file_name()
        .and_then(|value| value.to_str())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("skill");

    let mut candidate = target_dir.join(stem);
    let mut suffix = 2;
    while candidate.exists() {
        candidate = target_dir.join(format!("{stem}-{suffix}"));
        suffix += 1;
    }
    candidate
}

fn copy_directory_recursive(source_dir: &Path, target_dir: &Path) -> Result<(), AppError> {
    fs::create_dir_all(target_dir)?;

    for entry in fs::read_dir(source_dir)? {
        let entry = entry?;
        let source_path = entry.path();
        let target_path = target_dir.join(entry.file_name());
        let metadata = entry.metadata()?;

        if metadata.is_dir() {
            copy_directory_recursive(&source_path, &target_path)?;
            continue;
        }

        if let Some(parent) = target_path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::copy(&source_path, &target_path)?;
    }

    Ok(())
}

fn import_skill_item_into_workspace(
    target_dir: &Path,
    source_path: &Path,
) -> Result<SkillFileEntry, AppError> {
    if !source_path.exists() {
        return Err(AppError::message(format!(
            "Skill item does not exist: {}",
            source_path.display()
        )));
    }

    let metadata = source_path.metadata()?;

    if metadata.is_dir() {
        let preview_path = preferred_skill_preview_path(source_path)?.ok_or_else(|| {
            AppError::message(format!(
                "Skill folder must contain at least one Markdown file: {}",
                source_path.display()
            ))
        })?;

        let source_name = source_path
            .file_name()
            .and_then(|value| value.to_str())
            .ok_or_else(|| AppError::message("Unable to determine the selected folder name."))?;
        let target_path = unique_skill_target_directory(target_dir, source_name);
        copy_directory_recursive(source_path, &target_path)?;

        let target_preview_path = target_path.join(
            preview_path
                .strip_prefix(source_path)
                .unwrap_or(&preview_path),
        );
        let name = target_path
            .file_name()
            .and_then(|value| value.to_str())
            .ok_or_else(|| AppError::message("Unable to determine the imported folder name."))?
            .to_string();
        let relative_path = target_path
            .strip_prefix(target_dir)
            .unwrap_or(&target_path)
            .to_string_lossy()
            .replace('\\', "/");

        return Ok(SkillFileEntry {
            name,
            path: target_path.to_string_lossy().to_string(),
            relative_path,
            source_root: "skills".to_string(),
            is_directory: true,
            preview_path: target_preview_path.to_string_lossy().to_string(),
        });
    }

    if !metadata.is_file() {
        return Err(AppError::message(format!(
            "Skill path is not a file or directory: {}",
            source_path.display()
        )));
    }
    if !is_markdown_file(source_path) {
        return Err(AppError::message(format!(
            "Only Markdown skill files (.md) can be imported: {}",
            source_path.display()
        )));
    }

    let source_name = source_path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| AppError::message("Unable to determine the selected file name."))?;
    let target_path = unique_skill_target_path(target_dir, source_name);
    fs::copy(source_path, &target_path)?;

    let name = target_path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| AppError::message("Unable to determine the imported file name."))?
        .to_string();
    let relative_path = target_path
        .strip_prefix(target_dir)
        .unwrap_or(&target_path)
        .to_string_lossy()
        .replace('\\', "/");

    Ok(SkillFileEntry {
        name,
        path: target_path.to_string_lossy().to_string(),
        relative_path,
        source_root: "skills".to_string(),
        is_directory: false,
        preview_path: target_path.to_string_lossy().to_string(),
    })
}

fn default_knowledge_base_path() -> Result<PathBuf, AppError> {
    let home_dir = std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(PathBuf::from)
        .ok_or_else(|| AppError::message("Unable to determine the user home directory."))?;

    Ok(home_dir.join("Documents").join("Obsidian Vault"))
}

fn count_markdown_files_recursive(current: &Path) -> Result<u64, AppError> {
    let mut count = 0_u64;

    for entry in fs::read_dir(current)? {
        let entry = entry?;
        let path = entry.path();
        let metadata = entry.metadata()?;

        if metadata.is_dir() {
            count += count_markdown_files_recursive(&path)?;
            continue;
        }

        if is_markdown_file(&path) {
            count += 1;
        }
    }

    Ok(count)
}

#[tauri::command]
pub fn list_skill_files(workspace_path: String) -> Result<Vec<SkillFileEntry>, AppError> {
    let workspace_root = PathBuf::from(workspace_path);
    if !workspace_root.exists() {
        return Err(AppError::message(format!(
            "Workspace path does not exist: {}",
            workspace_root.display()
        )));
    }
    if !workspace_root.is_dir() {
        return Err(AppError::message(format!(
            "Workspace path is not a directory: {}",
            workspace_root.display()
        )));
    }

    let mut skill_files = Vec::new();
    for source_root in ["skills", ".skills"] {
        let source_path = workspace_root.join(source_root);
        if !source_path.is_dir() {
            continue;
        }

        for entry in fs::read_dir(&source_path)? {
            let entry = entry?;
            let path = entry.path();
            let metadata = entry.metadata()?;
            let name = entry.file_name().to_string_lossy().to_string();
            let relative_path = path
                .strip_prefix(&source_path)
                .unwrap_or(&path)
                .to_string_lossy()
                .replace('\\', "/");

            if metadata.is_dir() {
                let Some(preview_path) = preferred_skill_preview_path(&path)? else {
                    continue;
                };

                skill_files.push(SkillFileEntry {
                    name,
                    path: path.to_string_lossy().to_string(),
                    relative_path,
                    source_root: source_root.to_string(),
                    is_directory: true,
                    preview_path: preview_path.to_string_lossy().to_string(),
                });
                continue;
            }

            if !is_markdown_file(&path) {
                continue;
            }

            skill_files.push(SkillFileEntry {
                name,
                path: path.to_string_lossy().to_string(),
                relative_path,
                source_root: source_root.to_string(),
                is_directory: false,
                preview_path: path.to_string_lossy().to_string(),
            });
        }
    }

    skill_files.sort_by(|left, right| {
        left.source_root.cmp(&right.source_root).then_with(|| {
            left.relative_path
                .to_ascii_lowercase()
                .cmp(&right.relative_path.to_ascii_lowercase())
        })
    });

    Ok(skill_files)
}

#[tauri::command]
pub fn import_skill_file(
    workspace_path: String,
    source_path: String,
) -> Result<SkillFileEntry, AppError> {
    let workspace_root = PathBuf::from(workspace_path);
    if !workspace_root.exists() {
        return Err(AppError::message(format!(
            "Workspace path does not exist: {}",
            workspace_root.display()
        )));
    }
    if !workspace_root.is_dir() {
        return Err(AppError::message(format!(
            "Workspace path is not a directory: {}",
            workspace_root.display()
        )));
    }

    let source_path = PathBuf::from(source_path);
    let target_dir = workspace_root.join("skills");
    fs::create_dir_all(&target_dir)?;
    import_skill_item_into_workspace(&target_dir, &source_path)
}

#[tauri::command]
pub fn import_skill_items(
    workspace_path: String,
    source_paths: Vec<String>,
) -> Result<Vec<SkillFileEntry>, AppError> {
    let workspace_root = PathBuf::from(workspace_path);
    if !workspace_root.exists() {
        return Err(AppError::message(format!(
            "Workspace path does not exist: {}",
            workspace_root.display()
        )));
    }
    if !workspace_root.is_dir() {
        return Err(AppError::message(format!(
            "Workspace path is not a directory: {}",
            workspace_root.display()
        )));
    }
    if source_paths.is_empty() {
        return Ok(Vec::new());
    }

    let target_dir = workspace_root.join("skills");
    fs::create_dir_all(&target_dir)?;

    let mut imported_items = Vec::new();
    for source_path in source_paths {
        let imported = import_skill_item_into_workspace(&target_dir, &PathBuf::from(source_path))?;
        imported_items.push(imported);
    }

    Ok(imported_items)
}

#[tauri::command]
pub fn get_default_knowledge_base_path() -> Result<String, AppError> {
    Ok(default_knowledge_base_path()?.to_string_lossy().to_string())
}

#[tauri::command]
pub fn count_markdown_files(path: String) -> Result<u64, AppError> {
    let path = PathBuf::from(path);
    if !path.exists() {
        return Err(AppError::message(format!(
            "Directory does not exist: {}",
            path.display()
        )));
    }
    if !path.is_dir() {
        return Err(AppError::message(format!(
            "Path is not a directory: {}",
            path.display()
        )));
    }

    count_markdown_files_recursive(&path)
}

use std::{fs, path::PathBuf};

use tauri::{AppHandle, Manager};

use crate::{
    error::{AppError, AppResult},
    models::AgentProfile,
};

pub struct ProfileStore {
    path: PathBuf,
}

impl ProfileStore {
    pub fn new(app: &AppHandle) -> AppResult<Self> {
        let path = app
            .path()
            .app_config_dir()
            .map_err(|error| AppError::message(error.to_string()))?
            .join("agent-profiles.json");

        Ok(Self { path })
    }

    pub fn load_profiles(&self) -> AppResult<Vec<AgentProfile>> {
        if !self.path.exists() {
            let defaults = default_profiles();
            self.save_profiles(&defaults)?;
            return Ok(defaults);
        }

        let raw = fs::read_to_string(&self.path)?;
        let profiles: Vec<AgentProfile> = serde_json::from_str(&raw)?;
        if profiles.is_empty() {
            let defaults = default_profiles();
            self.save_profiles(&defaults)?;
            return Ok(defaults);
        }

        Ok(profiles)
    }

    pub fn save_profiles(&self, profiles: &[AgentProfile]) -> AppResult<()> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent)?;
        }
        let payload = serde_json::to_string_pretty(profiles)?;
        fs::write(&self.path, format!("{payload}\n"))?;
        Ok(())
    }
}

fn default_profiles() -> Vec<AgentProfile> {
    vec![
        AgentProfile {
            id: "codex".into(),
            name: "Codex CLI".into(),
            command: "codex".into(),
            args: vec![],
            cwd: None,
            env: None,
            icon: Some("sparkles".into()),
            description: Some("OpenAI Codex terminal agent".into()),
        },
        AgentProfile {
            id: "claude".into(),
            name: "Claude Code".into(),
            command: "claude".into(),
            args: vec![],
            cwd: None,
            env: None,
            icon: Some("brain".into()),
            description: Some("Anthropic Claude Code CLI".into()),
        },
        AgentProfile {
            id: "shell".into(),
            name: "Shell".into(),
            command: default_shell_command(),
            args: default_shell_args(),
            cwd: None,
            env: None,
            icon: Some("terminal".into()),
            description: Some("Plain system shell".into()),
        },
    ]
}

fn default_shell_command() -> String {
    #[cfg(target_os = "windows")]
    {
        "powershell.exe".into()
    }

    #[cfg(target_os = "macos")]
    {
        "/bin/zsh".into()
    }

    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".into())
    }
}

fn default_shell_args() -> Vec<String> {
    #[cfg(target_os = "windows")]
    {
        vec!["-NoLogo".into()]
    }

    #[cfg(not(target_os = "windows"))]
    {
        vec!["-l".into()]
    }
}

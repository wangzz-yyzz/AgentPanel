import { invoke } from "@tauri-apps/api/core";
import type { AgentProfile } from "../types/agent";
import type { CreateSessionInput } from "../types/terminal";

export async function createSession(input: CreateSessionInput) {
  return invoke<string>("create_session", {
    input
  });
}

export async function writeSessionInput(sessionId: string, data: string) {
  return invoke("write_session_input", { sessionId, data });
}

export async function resizeSession(sessionId: string, cols: number, rows: number) {
  return invoke("resize_session", { sessionId, cols, rows });
}

export async function killSession(sessionId: string) {
  return invoke("kill_session", { sessionId });
}

export async function restartSession(sessionId: string) {
  return invoke<string>("restart_session", { sessionId });
}

export async function loadProfiles() {
  return invoke<AgentProfile[]>("load_profiles");
}

export async function saveProfiles(profiles: AgentProfile[]) {
  return invoke("save_profiles", { profiles });
}

export async function readTextFile(path: string) {
  return invoke<string>("read_text_file", { path });
}

export async function readTextPreviewFile(path: string) {
  return invoke<string>("read_text_preview_file", { path });
}

export async function readFileAsDataUrl(path: string) {
  return invoke<string>("read_file_as_data_url", { path });
}

export async function writeTextFile(path: string, contents: string) {
  return invoke("write_text_file", { path, contents });
}

export type DirectoryEntry = {
  name: string;
  path: string;
  isDirectory: boolean;
  extension?: string | null;
};

export async function listDirectory(path: string) {
  return invoke<DirectoryEntry[]>("list_directory", { path });
}

export async function listMarkdownDirectory(path: string) {
  return invoke<DirectoryEntry[]>("list_markdown_directory", { path });
}

export type SkillFileEntry = {
  name: string;
  path: string;
  relativePath: string;
  sourceRoot: string;
  isDirectory: boolean;
  previewPath: string;
};

export async function listSkillFiles(workspacePath: string) {
  return invoke<SkillFileEntry[]>("list_skill_files", { workspacePath });
}

export async function importSkillFile(workspacePath: string, sourcePath: string) {
  return invoke<SkillFileEntry>("import_skill_file", { workspacePath, sourcePath });
}

export async function importSkillItems(workspacePath: string, sourcePaths: string[]) {
  return invoke<SkillFileEntry[]>("import_skill_items", { workspacePath, sourcePaths });
}

export async function getDefaultKnowledgeBasePath() {
  return invoke<string>("get_default_knowledge_base_path");
}

export async function countMarkdownFiles(path: string) {
  return invoke<number>("count_markdown_files", { path });
}

export type WorkspaceFsChangePayload = {
  rootPath: string;
  paths: string[];
};

export async function watchWorkspaceDirectory(path: string) {
  return invoke("watch_workspace_directory", { path });
}

export async function unwatchWorkspaceDirectory() {
  return invoke("unwatch_workspace_directory");
}

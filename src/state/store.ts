import { create } from "zustand";
import {
  createDefaultWorkspaceSupportPanels,
  createWorkspacePanelsForScopes,
  defaultBuiltinPanelScopes,
  hydrateSupportPanelsState,
  loadSupportPanelsState,
  saveSupportPanelsState,
  syncGlobalBuiltinPanels,
  toRegistryEntry,
  upsertWorkspaceSupportPanels
} from "../lib/support-panels";
import { fileExtensionFromPath, previewKindForPath, type FilePreviewKind } from "../lib/file-preview";
import { createSession, killSession, loadProfiles, readFileAsDataUrl, readTextFile, readTextPreviewFile, restartSession, saveProfiles, writeTextFile } from "../lib/tauri";
import { isBuiltinProfile } from "../types/agent";
import type {
  BuiltinSupportPanelKind,
  CustomPanelRecord,
  SupportPanelRegistryFile,
  SupportPanelsState,
  WorkspaceConfigBundleFile,
  WorkspaceConfigExport,
  WorkspaceSupportPanels
} from "../types/support-panel";
import type { AgentProfile, AgentProfileDraft, WorkspaceDraft, WorkspaceSummary } from "../types/agent";
import type { CreateSessionInput, SessionExitPayload, SessionOutputPayload, SessionRecord } from "../types/terminal";

export type FilePreviewState = {
  path: string;
  title: string;
  kind: FilePreviewKind;
  status: "loading" | "ready" | "error";
  content?: string;
  dataUrl?: string;
  error?: string;
};

export type AppNotificationState = {
  id: string;
  message: string;
};

type AppState = {
  workspaces: WorkspaceSummary[];
  profiles: AgentProfile[];
  sessions: SessionRecord[];
  activeWorkspaceId: string;
  activeSessionId?: string;
  supportPanels: SupportPanelsState;
  filePreview?: FilePreviewState;
  notification?: AppNotificationState;
  loadingProfiles: boolean;
  profileError?: string;
  initialize: () => Promise<void>;
  setActiveWorkspace: (workspaceId: string) => void;
  ensureWorkspacePanels: (workspaceId: string) => void;
  saveWorkspace: (draft: WorkspaceDraft) => WorkspaceSummary;
  deleteWorkspace: (workspaceId: string) => Promise<void>;
  exportWorkspaceBundle: (path: string) => Promise<void>;
  importWorkspaceBundle: (path: string) => Promise<void>;
  toggleWorkspaceProfile: (workspaceId: string, profileId: string) => void;
  setActiveSession: (sessionId: string) => void;
  appendOutput: (payload: SessionOutputPayload) => void;
  markExited: (payload: SessionExitPayload) => void;
  syncSessionSize: (sessionId: string, cols: number, rows: number) => void;
  launchSession: (input: Omit<CreateSessionInput, "cols" | "rows"> & { cols?: number; rows?: number }) => Promise<void>;
  terminateSession: (sessionId: string) => Promise<void>;
  relaunchSession: (sessionId: string) => Promise<void>;
  saveUserProfile: (draft: AgentProfileDraft) => Promise<AgentProfile>;
  updateBuiltinPanel: (workspaceId: string, kind: BuiltinSupportPanelKind, patch: Partial<WorkspaceSupportPanels["builtinPanels"][BuiltinSupportPanelKind]>) => void;
  updateRegistryPath: (workspaceId: string, registryPath: string) => void;
  createCustomPanel: (workspaceId: string, input?: { title?: string; description?: string; content?: string }) => string;
  updateCustomPanel: (workspaceId: string, panelId: string, patch: Partial<Pick<CustomPanelRecord, "title" | "description" | "content">>) => void;
  removeCustomPanel: (workspaceId: string, panelId: string) => void;
  exportCustomPanels: (workspaceId: string) => Promise<string>;
  importCustomPanels: (workspaceId: string) => Promise<void>;
  requestFilePreview: (path: string, title?: string) => Promise<void>;
  closeFilePreview: () => void;
  showNotification: (message: string) => void;
  dismissNotification: () => void;
};

const sampleWorkspaces: WorkspaceSummary[] = [
  {
    id: "workspace-core",
    name: "AgentPanel",
    path: "E:/front/AgentPanel",
    profileIds: ["codex", "claude", "shell"]
  },
  {
    id: "workspace-research",
    name: "Research Sandbox",
    path: "E:/front/research",
    profileIds: ["shell", "codex"]
  }
];

const fallbackProfiles: AgentProfile[] = [
  {
    id: "codex",
    name: "Codex CLI",
    command: "codex",
    args: [],
    icon: "sparkles",
    description: "OpenAI Codex terminal agent"
  },
  {
    id: "claude",
    name: "Claude Code",
    command: "claude",
    args: [],
    icon: "brain",
    description: "Anthropic Claude Code CLI"
  },
  {
    id: "shell",
    name: "Shell",
    command: "powershell.exe",
    args: ["-NoLogo"],
    icon: "terminal",
    description: "Plain system shell"
  }
];

const WORKSPACE_STORAGE_KEY = "agent-panel.workspaces.v1";
const LOCAL_SESSION_PREFIX = "session-";

function createUiItemId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function fileNameFromPath(path: string) {
  const normalized = path.replace(/\\/g, "/").replace(/\/+$/, "");
  const segments = normalized.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? normalized;
}

function previewLabelForKind(kind: FilePreviewKind) {
  switch (kind) {
    case "markdown":
      return "Markdown";
    case "text":
      return "Text";
    case "image":
      return "Image";
    case "pdf":
      return "PDF";
  }
}

function loadWorkspaceOverrides() {
  if (typeof window === "undefined") {
    return sampleWorkspaces;
  }

  try {
    const raw = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
    if (!raw) {
      return sampleWorkspaces;
    }

    const parsed = JSON.parse(raw) as Array<
      Partial<Pick<WorkspaceSummary, "id" | "name" | "path" | "profileIds">>
    >;
    const hasFullWorkspaceShape = parsed.every(
      (item) =>
        typeof item.id === "string" &&
        typeof item.name === "string" &&
        typeof item.path === "string" &&
        Array.isArray(item.profileIds)
    );

    if (hasFullWorkspaceShape) {
      return parsed as WorkspaceSummary[];
    }

    return sampleWorkspaces.map((workspace) => {
      const override = parsed.find((item) => item.id === workspace.id);
      return override ? { ...workspace, profileIds: override.profileIds ?? workspace.profileIds } : workspace;
    });
  } catch {
    return sampleWorkspaces;
  }
}

function saveWorkspaceOverrides(workspaces: WorkspaceSummary[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    WORKSPACE_STORAGE_KEY,
    JSON.stringify(workspaces)
  );
}

function sortProfiles(profiles: AgentProfile[]): AgentProfile[] {
  return [...profiles].sort((left, right) => {
    const leftBuiltin = isBuiltinProfile(left.id);
    const rightBuiltin = isBuiltinProfile(right.id);
    if (leftBuiltin !== rightBuiltin) {
      return leftBuiltin ? -1 : 1;
    }
    return left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
  });
}

function slugifyProfileId(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "profile"
  );
}

function createUniqueProfileId(existing: AgentProfile[], baseName: string): string {
  const baseId = slugifyProfileId(baseName);
  let nextId = baseId;
  let suffix = 2;
  while (existing.some((profile) => profile.id === nextId)) {
    nextId = `${baseId}-${suffix}`;
    suffix += 1;
  }
  return nextId;
}

function createUniqueWorkspaceId(existing: WorkspaceSummary[], baseName: string): string {
  const baseId = slugifyProfileId(baseName);
  let nextId = baseId;
  let suffix = 2;
  while (existing.some((workspace) => workspace.id === nextId)) {
    nextId = `${baseId}-${suffix}`;
    suffix += 1;
  }
  return nextId;
}

function normalizeProfileDraft(existing: AgentProfile[], draft: AgentProfileDraft): AgentProfile {
  const name = draft.name.trim();
  const command = draft.command.trim();
  const args = draft.args.map((item) => item.trim()).filter(Boolean);
  const cwd = draft.cwd?.trim() || undefined;
  const description = draft.description?.trim() || undefined;
  const icon = draft.icon?.trim() || undefined;
  const env =
    draft.env && Object.keys(draft.env).length > 0
      ? Object.fromEntries(
          Object.entries(draft.env)
            .map(([key, value]) => [key.trim(), value.trim()] as const)
            .filter(([key, value]) => key && value)
        )
      : undefined;

  return {
    id: draft.id?.trim() || createUniqueProfileId(existing, name),
    name,
    command,
    args,
    cwd,
    env: env && Object.keys(env).length > 0 ? env : undefined,
    icon,
    description
  };
}

function normalizeWorkspaceDraft(existing: WorkspaceSummary[], draft: WorkspaceDraft): WorkspaceSummary {
  const name = draft.name.trim();
  const path = draft.path.trim();
  const normalizedProfileIds = [...new Set(draft.profileIds.map((item) => item.trim()).filter(Boolean))];
  if (!draft.id && !normalizedProfileIds.includes("shell")) {
    normalizedProfileIds.push("shell");
  }
  const profileIds = normalizedProfileIds.sort((left, right) => left.localeCompare(right));

  return {
    id: draft.id?.trim() || createUniqueWorkspaceId(existing, name),
    name,
    path,
    profileIds
  };
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  if (typeof error === "object" && error !== null) {
    const message =
      "message" in error && typeof error.message === "string"
        ? error.message
        : "error" in error && typeof error.error === "string"
          ? error.error
          : undefined;

    if (message?.trim()) {
      return message;
    }
  }

  return fallback;
}

function updateSessionById(
  sessions: SessionRecord[],
  sessionId: string,
  updater: (session: SessionRecord) => SessionRecord
) {
  return sessions.map((session) => (session.id === sessionId ? updater(session) : session));
}

function updateSessionByBackendId(
  sessions: SessionRecord[],
  backendSessionId: string,
  updater: (session: SessionRecord) => SessionRecord
) {
  return sessions.map((session) => (session.backendSessionId === backendSessionId ? updater(session) : session));
}

function removeSessionState(
  state: Pick<AppState, "sessions" | "activeSessionId">,
  sessionId: string
): Pick<AppState, "sessions" | "activeSessionId"> {
  const removedIndex = state.sessions.findIndex((session) => session.id === sessionId);
  if (removedIndex === -1) {
    return state;
  }

  const sessions = state.sessions.filter((session) => session.id !== sessionId);
  const activeSessionId =
    state.activeSessionId === sessionId
      ? sessions[removedIndex]?.id ?? sessions[removedIndex - 1]?.id ?? sessions[0]?.id
      : state.activeSessionId;

  return {
    sessions,
    activeSessionId
  };
}

function shouldAutoCloseOnExit(session: SessionRecord): boolean {
  return session.profile.id === "codex" || session.profile.id === "claude";
}

function resolveWorkspaceCwd(workspaces: WorkspaceSummary[], workspaceId: string, cwd?: string): string | undefined {
  if (cwd?.trim()) {
    return cwd;
  }

  return workspaces.find((workspace) => workspace.id === workspaceId)?.path;
}

function removeWorkspaceSupportPanels(supportPanels: SupportPanelsState, workspaceId: string): SupportPanelsState {
  const nextState = { ...supportPanels };
  delete nextState[workspaceId];
  return nextState;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTodoPanelData(value: unknown) {
  return (
    isRecord(value) &&
    (value.filter === "all" || value.filter === "open" || value.filter === "done") &&
    Array.isArray(value.tasks) &&
    value.tasks.every(
      (task) =>
        isRecord(task) &&
        typeof task.id === "string" &&
        typeof task.title === "string" &&
        (task.priority === "high" || task.priority === "medium" || task.priority === "low") &&
        typeof task.dueDate === "string" &&
        typeof task.completed === "boolean"
    )
  );
}

function isCalendarPanelData(value: unknown) {
  return (
    isRecord(value) &&
    (value.view === "calendar" || value.view === "list") &&
    Array.isArray(value.notes) &&
    value.notes.every(
      (note) =>
        isRecord(note) &&
        typeof note.id === "string" &&
        typeof note.date === "string" &&
        typeof note.title === "string" &&
        typeof note.content === "string" &&
        typeof note.createdAt === "string" &&
        typeof note.updatedAt === "string"
    )
  );
}

function isKnowledgePanelData(value: unknown) {
  return isRecord(value) && (!("rootPath" in value) || value.rootPath === undefined || typeof value.rootPath === "string");
}

function isBuiltinPanelExport(
  kind: BuiltinSupportPanelKind,
  value: unknown
): value is WorkspaceConfigExport["panels"]["builtinPanels"][BuiltinSupportPanelKind] {
  if (
    !isRecord(value) ||
    typeof value.title !== "string" ||
    typeof value.description !== "string" ||
    typeof value.content !== "string"
  ) {
    return false;
  }

  if (!("data" in value) || value.data === undefined) {
    return true;
  }

  if (kind === "todo") {
    return isTodoPanelData(value.data);
  }

  if (kind === "calendar") {
    return isCalendarPanelData(value.data);
  }

  if (kind === "knowledge") {
    return isKnowledgePanelData(value.data);
  }

  return value.data === undefined;
}

function validateWorkspaceConfig(workspace: unknown, index: number): asserts workspace is WorkspaceConfigExport {
  if (!isRecord(workspace)) {
    throw new Error(`Workspace #${index + 1} is not a valid object.`);
  }

  if (typeof workspace.id !== "string" || !workspace.id.trim()) {
    throw new Error(`Workspace #${index + 1} is missing a valid id.`);
  }
  if (typeof workspace.name !== "string" || !workspace.name.trim()) {
    throw new Error(`Workspace "${workspace.id}" is missing a valid name.`);
  }
  if (typeof workspace.path !== "string" || !workspace.path.trim()) {
    throw new Error(`Workspace "${workspace.id}" is missing a valid path.`);
  }
  if (!Array.isArray(workspace.profileIds) || workspace.profileIds.some((value) => typeof value !== "string")) {
    throw new Error(`Workspace "${workspace.id}" has invalid profileIds.`);
  }
  if (!isRecord(workspace.panels)) {
    throw new Error(`Workspace "${workspace.id}" is missing panel configuration.`);
  }
  if (typeof workspace.panels.registryPath !== "string") {
    throw new Error(`Workspace "${workspace.id}" has an invalid registryPath.`);
  }
  if (!isRecord(workspace.panels.builtinPanels)) {
    throw new Error(`Workspace "${workspace.id}" is missing builtin panel data.`);
  }

  for (const kind of ["todo", "calendar", "skills", "knowledge"] as const) {
    if (!isBuiltinPanelExport(kind, workspace.panels.builtinPanels[kind])) {
      throw new Error(`Workspace "${workspace.id}" has invalid "${kind}" panel data.`);
    }
  }

  if (
    !Array.isArray(workspace.panels.customPanels) ||
    workspace.panels.customPanels.some(
      (panel) =>
        !isRecord(panel) ||
        typeof panel.id !== "string" ||
        typeof panel.title !== "string" ||
        typeof panel.description !== "string" ||
        typeof panel.content !== "string" ||
        typeof panel.createdAt !== "string" ||
        typeof panel.updatedAt !== "string"
    )
  ) {
    throw new Error(`Workspace "${workspace.id}" has invalid custom panel data.`);
  }
}

function validateGlobalPanelConsistency(workspaces: WorkspaceConfigExport[]) {
  const referenceWorkspace = workspaces[0];
  if (!referenceWorkspace) {
    return;
  }

  for (const kind of ["calendar", "knowledge"] as const) {
    const reference = JSON.stringify(referenceWorkspace.panels.builtinPanels[kind]);
    for (const workspace of workspaces.slice(1)) {
      const current = JSON.stringify(workspace.panels.builtinPanels[kind]);
      if (current !== reference) {
        throw new Error(
          `Global panel "${kind}" must be identical in every workspace. ` +
            `Found a mismatch between "${referenceWorkspace.id}" and "${workspace.id}".`
        );
      }
    }
  }
}

function validateWorkspaceBundle(payload: unknown): asserts payload is WorkspaceConfigBundleFile {
  if (!isRecord(payload) || payload.version !== 1 || !Array.isArray(payload.workspaces) || payload.workspaces.length === 0) {
    throw new Error("Invalid workspace bundle file.");
  }

  payload.workspaces.forEach((workspace, index) => validateWorkspaceConfig(workspace, index));
  validateGlobalPanelConsistency(payload.workspaces);
}

function exportWorkspaceConfig(
  workspace: WorkspaceSummary,
  workspacePanels: WorkspaceSupportPanels
): WorkspaceConfigExport {
  return {
    id: workspace.id,
    name: workspace.name,
    path: workspace.path,
    profileIds: workspace.profileIds,
    panels: {
      registryPath: workspacePanels.registryPath,
        builtinPanels: {
          todo: {
            title: workspacePanels.builtinPanels.todo.title,
            description: workspacePanels.builtinPanels.todo.description,
            content: workspacePanels.builtinPanels.todo.content,
            data: workspacePanels.builtinPanels.todo.data
          },
          calendar: {
            title: workspacePanels.builtinPanels.calendar.title,
            description: workspacePanels.builtinPanels.calendar.description,
            content: workspacePanels.builtinPanels.calendar.content,
            data: workspacePanels.builtinPanels.calendar.data
          },
          skills: {
            title: workspacePanels.builtinPanels.skills.title,
            description: workspacePanels.builtinPanels.skills.description,
            content: workspacePanels.builtinPanels.skills.content,
            data: workspacePanels.builtinPanels.skills.data
          },
          knowledge: {
            title: workspacePanels.builtinPanels.knowledge.title,
            description: workspacePanels.builtinPanels.knowledge.description,
            content: workspacePanels.builtinPanels.knowledge.content,
            data: workspacePanels.builtinPanels.knowledge.data
          }
        },
        customPanels: workspacePanels.customPanels.map((panel) => ({
        id: panel.id,
        title: panel.title,
        description: panel.description,
        content: panel.content,
        createdAt: panel.createdAt,
        updatedAt: panel.updatedAt
      }))
    }
  };
}

function importWorkspacePanels(config: WorkspaceConfigExport): WorkspaceSupportPanels {
  const base = createDefaultWorkspaceSupportPanels(config.id);
  const customPanels: CustomPanelRecord[] = (config.panels.customPanels ?? []).map((panel) => ({
    ...panel,
    kind: "custom",
    workspaceId: config.id
  }));

  return {
    builtinPanels: {
      todo: {
        ...base.builtinPanels.todo,
        ...config.panels.builtinPanels.todo,
        data: config.panels.builtinPanels.todo.data ?? base.builtinPanels.todo.data
      },
      calendar: {
        ...base.builtinPanels.calendar,
        ...config.panels.builtinPanels.calendar,
        data: config.panels.builtinPanels.calendar.data ?? base.builtinPanels.calendar.data
      },
      skills: {
        ...base.builtinPanels.skills,
        ...config.panels.builtinPanels.skills,
        data: config.panels.builtinPanels.skills.data ?? base.builtinPanels.skills.data
      },
      knowledge: {
        ...base.builtinPanels.knowledge,
        ...config.panels.builtinPanels.knowledge,
        data: config.panels.builtinPanels.knowledge.data ?? base.builtinPanels.knowledge.data
      }
    },
    customPanels,
    registry: customPanels.map(toRegistryEntry),
    registryPath: config.panels.registryPath || base.registryPath
  };
}

function toCreateSessionInput(
  session: SessionRecord,
  workspaces: WorkspaceSummary[]
): CreateSessionInput {
  return {
    profile: session.profile,
    workspaceId: session.workspaceId,
    title: session.title,
    cwd: resolveWorkspaceCwd(workspaces, session.workspaceId, session.cwd),
    env: session.env,
    cols: session.cols,
    rows: session.rows
  };
}

const initialWorkspaces = loadWorkspaceOverrides();
const initialSupportPanels = hydrateSupportPanelsState(
  initialWorkspaces.map((workspace) => workspace.id),
  loadSupportPanelsState(),
  defaultBuiltinPanelScopes
);
const initialActiveWorkspaceId = initialWorkspaces[0]?.id ?? sampleWorkspaces[0].id;

export const useAppStore = create<AppState>((set, get) => ({
  workspaces: initialWorkspaces,
  profiles: sortProfiles(fallbackProfiles),
  sessions: [],
  activeWorkspaceId: initialActiveWorkspaceId,
  supportPanels: initialSupportPanels,
  filePreview: undefined,
  notification: undefined,
  loadingProfiles: false,
  async initialize() {
    const currentWorkspaces = get().workspaces;
    const syncedSupportPanels = hydrateSupportPanelsState(
      currentWorkspaces.map((workspace) => workspace.id),
      loadSupportPanelsState(),
      defaultBuiltinPanelScopes
    );
    const currentActiveWorkspaceId = get().activeWorkspaceId;
    const activeWorkspaceId = currentWorkspaces.some((workspace) => workspace.id === currentActiveWorkspaceId)
      ? currentActiveWorkspaceId
      : currentWorkspaces[0]?.id ?? currentActiveWorkspaceId;

    set({ loadingProfiles: true, profileError: undefined });
    try {
      const profiles = await loadProfiles();
      set({
        profiles: sortProfiles(profiles.length ? profiles : fallbackProfiles),
        supportPanels: syncedSupportPanels,
        activeWorkspaceId,
        loadingProfiles: false
      });
    } catch (error) {
      set({
        profiles: sortProfiles(fallbackProfiles),
        supportPanels: syncedSupportPanels,
        activeWorkspaceId,
        loadingProfiles: false,
        profileError: error instanceof Error ? error.message : "Unable to load profiles"
      });
    }
  },
  setActiveWorkspace(workspaceId) {
    get().ensureWorkspacePanels(workspaceId);
    set({ activeWorkspaceId: workspaceId });
  },
  ensureWorkspacePanels(workspaceId) {
    const current = get().supportPanels[workspaceId];
    if (current) {
      return;
    }

    const nextState = upsertWorkspaceSupportPanels(get().supportPanels, workspaceId, () =>
      createWorkspacePanelsForScopes(workspaceId, get().supportPanels, defaultBuiltinPanelScopes)
    );
    saveSupportPanelsState(nextState);
    set({ supportPanels: nextState });
  },
  saveWorkspace(draft) {
    const workspaces = [...get().workspaces];
    const workspace = normalizeWorkspaceDraft(workspaces, draft);
    if (!workspace.name) {
      throw new Error("Workspace name is required.");
    }
    if (!workspace.path) {
      throw new Error("Workspace path is required.");
    }

    const duplicatePath = workspaces.find(
      (item) =>
        item.id !== workspace.id &&
        item.path.localeCompare(workspace.path, undefined, { sensitivity: "accent" }) === 0
    );
    if (duplicatePath) {
      throw new Error(`Workspace path is already in use: ${workspace.path}`);
    }

    const index = draft.id ? workspaces.findIndex((item) => item.id === draft.id) : -1;
    let nextWorkspaces: WorkspaceSummary[];
    const currentSupportPanels = get().supportPanels;
    if (index === -1) {
      nextWorkspaces = [...workspaces, workspace];
    } else {
      nextWorkspaces = workspaces.map((item, itemIndex) => (itemIndex === index ? workspace : item));
    }

    saveWorkspaceOverrides(nextWorkspaces);
    const nextSupportPanels =
      index === -1
        ? {
            ...currentSupportPanels,
            [workspace.id]: createWorkspacePanelsForScopes(workspace.id, currentSupportPanels, defaultBuiltinPanelScopes)
          }
        : currentSupportPanels;
    saveSupportPanelsState(nextSupportPanels);
    set({ workspaces: nextWorkspaces, activeWorkspaceId: workspace.id, supportPanels: nextSupportPanels });
    return workspace;
  },
  async deleteWorkspace(workspaceId) {
    const state = get();
    if (state.workspaces.length <= 1) {
      throw new Error("At least one workspace must remain.");
    }

    const workspaces = state.workspaces.filter((workspace) => workspace.id !== workspaceId);
    if (workspaces.length === state.workspaces.length) {
      return;
    }

    await Promise.all(
      state.sessions
        .filter((session) => session.workspaceId === workspaceId && session.backendSessionId)
        .map((session) => killSession(session.backendSessionId!))
    );

    const sessions = state.sessions.filter((session) => session.workspaceId !== workspaceId);
    const activeWorkspaceId =
      state.activeWorkspaceId === workspaceId ? workspaces[0]?.id ?? state.activeWorkspaceId : state.activeWorkspaceId;
    const activeSessionStillExists = state.activeSessionId
      ? sessions.some((session) => session.id === state.activeSessionId)
      : false;
    const activeSessionId = activeSessionStillExists ? state.activeSessionId : sessions[0]?.id;
    const supportPanels = removeWorkspaceSupportPanels(state.supportPanels, workspaceId);

    saveWorkspaceOverrides(workspaces);
    saveSupportPanelsState(supportPanels);

    set({
      workspaces,
      sessions,
      activeWorkspaceId,
      activeSessionId,
      supportPanels
    });
  },
  async exportWorkspaceBundle(path) {
    const state = get();
    const workspaces = state.workspaces.map((workspace) =>
      exportWorkspaceConfig(
        workspace,
        state.supportPanels[workspace.id] ?? createDefaultWorkspaceSupportPanels(workspace.id)
      )
    );
    validateGlobalPanelConsistency(workspaces);

    const payload: WorkspaceConfigBundleFile = {
      version: 1,
      workspaces
    };

    await writeTextFile(path, `${JSON.stringify(payload, null, 2)}\n`);
  },
  async importWorkspaceBundle(path) {
    const raw = await readTextFile(path);
    const payload = JSON.parse(raw) as unknown;
    validateWorkspaceBundle(payload);

    const workspaces = payload.workspaces.map((workspace) => ({
      id: workspace.id,
      name: workspace.name,
      path: workspace.path,
      profileIds: [...new Set(workspace.profileIds)].sort((left, right) => left.localeCompare(right))
    }));

    const supportPanels = payload.workspaces.reduce<SupportPanelsState>((accumulator, workspace) => {
      accumulator[workspace.id] = importWorkspacePanels(workspace);
      return accumulator;
    }, {});
    const syncedSupportPanels = syncGlobalBuiltinPanels(supportPanels, defaultBuiltinPanelScopes, workspaces[0].id);

    const sessionsToKill = get().sessions.filter((session) => session.backendSessionId);
    await Promise.all(sessionsToKill.map((session) => killSession(session.backendSessionId!)));

    saveWorkspaceOverrides(workspaces);
    saveSupportPanelsState(syncedSupportPanels);

    set({
      workspaces,
      supportPanels: syncedSupportPanels,
      activeWorkspaceId: workspaces[0].id,
      sessions: [],
      activeSessionId: undefined
    });
  },
  toggleWorkspaceProfile(workspaceId, profileId) {
    const workspaces = get().workspaces.map((workspace) => {
      if (workspace.id !== workspaceId) {
        return workspace;
      }

      const hasProfile = workspace.profileIds.includes(profileId);
      const profileIds = hasProfile
        ? workspace.profileIds.filter((id) => id !== profileId)
        : [...workspace.profileIds, profileId];

      return {
        ...workspace,
        profileIds: profileIds.sort((left, right) => left.localeCompare(right))
      };
    });

    saveWorkspaceOverrides(workspaces);
    set({ workspaces });
  },
  setActiveSession(sessionId) {
    set({ activeSessionId: sessionId });
  },
  appendOutput(payload) {
    set((state) => ({
      sessions: updateSessionByBackendId(state.sessions, payload.sessionId, (session) => ({
        ...session,
        buffer: `${session.buffer}${payload.chunk}`,
        status: "running",
        error: undefined
      }))
    }));
  },
  markExited(payload) {
    set((state) => {
      const session = state.sessions.find((item) => item.backendSessionId === payload.sessionId);
      if (!session) {
        return state;
      }

      if (shouldAutoCloseOnExit(session)) {
        return removeSessionState(state, session.id);
      }

      return {
        sessions: updateSessionByBackendId(state.sessions, payload.sessionId, (item) => ({
          ...item,
          backendSessionId: undefined,
          status: "exited",
          exitCode: payload.exitCode
        })),
        activeSessionId: state.activeSessionId
      };
    });
  },
  syncSessionSize(sessionId, cols, rows) {
    set((state) => ({
      sessions: updateSessionById(state.sessions, sessionId, (session) =>
        session.cols === cols && session.rows === rows ? session : { ...session, cols, rows }
      )
    }));
  },
  async launchSession(input) {
    const sessionTitle = input.title ?? input.profile.name;
    const sessionCwd = resolveWorkspaceCwd(get().workspaces, input.workspaceId, input.cwd);
    const draftId = `${LOCAL_SESSION_PREFIX}${crypto.randomUUID()}`;
    set((state) => ({
      sessions: [
        ...state.sessions,
        {
          id: draftId,
          title: sessionTitle,
          workspaceId: input.workspaceId,
          profile: input.profile,
          cwd: sessionCwd,
          env: input.env,
          cols: input.cols ?? 120,
          rows: input.rows ?? 36,
          status: "starting",
          buffer: ""
        }
      ],
      activeSessionId: draftId
    }));

    try {
      const sessionId = await createSession({
        ...input,
        cwd: sessionCwd,
        cols: input.cols ?? 120,
        rows: input.rows ?? 36
      });

      set((state) => ({
        sessions: updateSessionById(state.sessions, draftId, (session) => ({
          ...session,
          backendSessionId: sessionId,
          status: "running",
          error: undefined,
          exitCode: undefined
        }))
      }));
    } catch (error) {
      set((state) => ({
        sessions: updateSessionById(state.sessions, draftId, (session) => ({
          ...session,
          status: "error",
          error: getErrorMessage(error, "Failed to launch session")
        }))
      }));
    }
  },
  async terminateSession(sessionId) {
    const session = get().sessions.find((item) => item.id === sessionId);
    if (!session) {
      return;
    }

    if (!session.backendSessionId || session.status === "exited") {
      set((state) => removeSessionState(state, sessionId));
      return;
    }

    try {
      await killSession(session.backendSessionId);
      set((state) => removeSessionState(state, sessionId));
    } catch (error) {
      set((state) => ({
        sessions: updateSessionById(state.sessions, sessionId, (item) => ({
          ...item,
          status: "error",
          error: getErrorMessage(error, "Failed to kill session")
        }))
      }));
    }
  },
  async relaunchSession(sessionId) {
    const session = get().sessions.find((item) => item.id === sessionId);
    if (!session) {
      return;
    }

    try {
      set((state) => ({
        sessions: updateSessionById(state.sessions, sessionId, (item) => ({
          ...item,
          status: "starting",
          error: undefined,
          exitCode: undefined
        }))
      }));

      if (!session.backendSessionId) {
        const newBackendSessionId = await createSession(toCreateSessionInput(session, get().workspaces));
        set((state) => ({
          activeSessionId: sessionId,
          sessions: updateSessionById(state.sessions, sessionId, (item) => ({
            ...item,
            backendSessionId: newBackendSessionId,
            status: "running",
            buffer: "",
            cwd: resolveWorkspaceCwd(state.workspaces, item.workspaceId, item.cwd),
            error: undefined,
            exitCode: undefined
          }))
        }));
        return;
      }

      const newBackendSessionId = await restartSession(session.backendSessionId);
      set((state) => ({
        activeSessionId: sessionId,
        sessions: updateSessionById(state.sessions, sessionId, (item) => ({
          ...item,
          backendSessionId: newBackendSessionId,
          status: "running",
          buffer: "",
          error: undefined,
          exitCode: undefined
        }))
      }));
    } catch (error) {
      set((state) => ({
        sessions: updateSessionById(state.sessions, sessionId, (item) => ({
          ...item,
          status: "error",
          error: getErrorMessage(error, "Failed to restart session")
        }))
      }));
    }
  },
  async saveUserProfile(draft) {
    const profiles = [...get().profiles];
    const profile = normalizeProfileDraft(profiles, draft);
    if (!profile.name) {
      throw new Error("Profile name is required.");
    }
    if (!profile.command) {
      throw new Error("Command is required.");
    }

    const index = draft.id ? profiles.findIndex((item) => item.id === draft.id) : -1;
    if (index === -1) {
      profiles.push(profile);
    } else {
      profiles[index] = profile;
    }

    const nextProfiles = sortProfiles(profiles);
    await saveProfiles(nextProfiles);
    set({ profiles: nextProfiles });
    return profile;
  },
  updateBuiltinPanel(workspaceId, kind, patch) {
    const nextState = defaultBuiltinPanelScopes[kind] === "global"
      ? Object.fromEntries(
          Object.entries(get().supportPanels).map(([id, workspacePanels]) => [
            id,
            {
              ...workspacePanels,
              builtinPanels: {
                ...workspacePanels.builtinPanels,
                [kind]: {
                  ...workspacePanels.builtinPanels[kind],
                  ...patch
                }
              }
            }
          ])
        )
      : upsertWorkspaceSupportPanels(get().supportPanels, workspaceId, (workspacePanels) => ({
          ...workspacePanels,
          builtinPanels: {
            ...workspacePanels.builtinPanels,
            [kind]: {
              ...workspacePanels.builtinPanels[kind],
              ...patch
            }
          }
        }));
    saveSupportPanelsState(nextState);
    set({ supportPanels: nextState as SupportPanelsState });
  },
  updateRegistryPath(workspaceId, registryPath) {
    const nextState = upsertWorkspaceSupportPanels(get().supportPanels, workspaceId, (workspacePanels) => ({
      ...workspacePanels,
      registryPath
    }));
    saveSupportPanelsState(nextState);
    set({ supportPanels: nextState });
  },
  createCustomPanel(workspaceId, input) {
    const timestamp = new Date().toISOString();
    const panel: CustomPanelRecord = {
      id: crypto.randomUUID(),
      kind: "custom",
      title: input?.title?.trim() || "Custom Panel",
      description: input?.description?.trim() || "MVP registry entry for workspace-specific tools or notes.",
      content: input?.content ?? "",
      workspaceId,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    const nextState = upsertWorkspaceSupportPanels(get().supportPanels, workspaceId, (workspacePanels) => ({
      ...workspacePanels,
      customPanels: [...workspacePanels.customPanels, panel],
      registry: [...workspacePanels.registry, toRegistryEntry(panel)]
    }));

    saveSupportPanelsState(nextState);
    set({ supportPanels: nextState });
    return panel.id;
  },
  updateCustomPanel(workspaceId, panelId, patch) {
    const nextState = upsertWorkspaceSupportPanels(get().supportPanels, workspaceId, (workspacePanels) => {
      const customPanels = workspacePanels.customPanels.map((panel) => {
        if (panel.id !== panelId) {
          return panel;
        }

        return {
          ...panel,
          ...patch,
          updatedAt: new Date().toISOString()
        };
      });

      const registry = customPanels.map(toRegistryEntry);

      return {
        ...workspacePanels,
        customPanels,
        registry
      };
    });

    saveSupportPanelsState(nextState);
    set({ supportPanels: nextState });
  },
  removeCustomPanel(workspaceId, panelId) {
    const nextState = upsertWorkspaceSupportPanels(get().supportPanels, workspaceId, (workspacePanels) => {
      const customPanels = workspacePanels.customPanels.filter((panel) => panel.id !== panelId);
      return {
        ...workspacePanels,
        customPanels,
        registry: customPanels.map(toRegistryEntry)
      };
    });

    saveSupportPanelsState(nextState);
    set({ supportPanels: nextState });
  },
  async exportCustomPanels(workspaceId) {
    const workspacePanels = get().supportPanels[workspaceId] ?? createDefaultWorkspaceSupportPanels(workspaceId);
    const payload: SupportPanelRegistryFile = {
      version: 1,
      workspaceId,
      exportedAt: new Date().toISOString(),
      registryPath: workspacePanels.registryPath,
      customPanels: workspacePanels.customPanels,
      registry: workspacePanels.registry
    };

    await writeTextFile(workspacePanels.registryPath, `${JSON.stringify(payload, null, 2)}\n`);
    return workspacePanels.registryPath;
  },
  async importCustomPanels(workspaceId) {
    const workspacePanels = get().supportPanels[workspaceId] ?? createDefaultWorkspaceSupportPanels(workspaceId);
    const raw = await readTextFile(workspacePanels.registryPath);
    const payload = JSON.parse(raw) as SupportPanelRegistryFile;
    const customPanels = Array.isArray(payload.customPanels) ? payload.customPanels : [];
    const nextState = upsertWorkspaceSupportPanels(get().supportPanels, workspaceId, (current) => ({
      ...current,
      registryPath: payload.registryPath || current.registryPath,
      customPanels,
      registry: customPanels.map(toRegistryEntry)
    }));
    saveSupportPanelsState(nextState);
    set({ supportPanels: nextState });
  },
  async requestFilePreview(path, title) {
    const kind = previewKindForPath(path);
    if (!kind) {
      const extension = fileExtensionFromPath(path);
      get().showNotification(
        extension ? `Preview is not available yet for .${extension} files.` : "Preview is not available yet for this file type."
      );
      return;
    }

    const nextTitle = title?.trim() || fileNameFromPath(path);
    set({
      filePreview: {
        path,
        title: nextTitle,
        kind,
        status: "loading"
      }
    });

    try {
      if (kind === "image" || kind === "pdf") {
        const dataUrl = await readFileAsDataUrl(path);
        set((state) =>
          state.filePreview?.path === path
            ? {
                filePreview: {
                  path,
                  title: nextTitle,
                  kind,
                  status: "ready",
                  dataUrl
                }
              }
            : state
        );
        return;
      }

      const content = await readTextPreviewFile(path);
      set((state) =>
        state.filePreview?.path === path
          ? {
              filePreview: {
                path,
                title: nextTitle,
                kind,
                status: "ready",
                content
              }
            }
          : state
      );
    } catch (error) {
      const message = getErrorMessage(error, `Unable to load ${previewLabelForKind(kind).toLowerCase()} preview.`);
      set((state) =>
        state.filePreview?.path === path
          ? {
              filePreview: {
                path,
                title: nextTitle,
                kind,
                status: "error",
                error: message
              }
            }
          : state
      );
    }
  },
  closeFilePreview() {
    set({ filePreview: undefined });
  },
  showNotification(message) {
    set({
      notification: {
        id: createUiItemId("notification"),
        message
      }
    });
  },
  dismissNotification() {
    set({ notification: undefined });
  }
}));

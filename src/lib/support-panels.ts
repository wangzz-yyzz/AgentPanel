import type {
  BuiltinPanelDataMap,
  BuiltinPanelScopes,
  BuiltinSupportPanelKind,
  BuiltinSupportPanelState,
  CalendarNoteRecord,
  CalendarPanelData,
  CustomPanelRecord,
  CustomPanelRegistryEntry,
  KnowledgePanelData,
  SupportPanelsState,
  TodoPanelData,
  TodoTaskRecord,
  WorkspaceSupportPanels
} from "../types/support-panel";

const STORAGE_KEY = "agent-panel.support-panels.v1";
export const defaultBuiltinPanelScopes = {
  todo: "workspace",
  calendar: "global",
  skills: "workspace",
  knowledge: "global"
} as const;

function createPanelItemId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function toLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function nowIsoString() {
  return new Date().toISOString();
}

function createDefaultTodoData(): TodoPanelData {
  return {
    filter: "all",
    tasks: [
      {
        id: "todo-default-1",
        title: "Verify workspace preflight",
        priority: "high",
        dueDate: "",
        completed: false
      },
      {
        id: "todo-default-2",
        title: "Capture blockers during runs",
        priority: "medium",
        dueDate: "",
        completed: false
      },
      {
        id: "todo-default-3",
        title: "Close out follow-up actions",
        priority: "low",
        dueDate: "",
        completed: false
      }
    ]
  };
}

function createDefaultCalendarData(): CalendarPanelData {
  return {
    notes: [],
    view: "calendar"
  };
}

function createDefaultKnowledgeData(): KnowledgePanelData {
  return {};
}

const builtinDefinitions: Array<{
  kind: BuiltinSupportPanelKind;
  title: string;
  description: string;
  content: string;
  accentClassName: string;
  data?: BuiltinPanelDataMap[BuiltinSupportPanelKind];
}> = [
  {
    kind: "todo",
    title: "TODO",
    description: "Track execution tasks beside the active terminal.",
    content: "",
    accentClassName: "from-[#0f6cfe] via-[#2c8dff] to-[#73b4ff]",
    data: createDefaultTodoData()
  },
  {
    kind: "calendar",
    title: "Calendar Notes",
    description: "Keep schedule context in view without leaving the panel.",
    content: "",
    accentClassName: "from-[#ff7a18] via-[#ff9f45] to-[#ffd166]",
    data: createDefaultCalendarData()
  },
  {
    kind: "skills",
    title: "Skills",
    description: "Attach repeatable workflows, prompts, and scripts to this workspace.",
    content: ["- release-checklist", "- bug-triage prompt", "- smoke-test script"].join("\n"),
    accentClassName: "from-[#125b50] via-[#1f8a70] to-[#5fcf80]"
  },
  {
    kind: "knowledge",
    title: "Knowledge Base",
    description: "Store local notes, snippets, and decision logs.",
    content: ["Known good command:", "pnpm build --filter panel-ui", "", "Remember to verify PTY event flow after UI edits."].join(
      "\n"
    ),
    accentClassName: "from-[#5f27cd] via-[#7d47db] to-[#b388ff]",
    data: createDefaultKnowledgeData()
  }
];

function clonePanelData<T>(data: T): T {
  return JSON.parse(JSON.stringify(data)) as T;
}

function defaultDefinitionFor(kind: BuiltinSupportPanelKind) {
  return builtinDefinitions.find((definition) => definition.kind === kind)!;
}

function sanitizeTodoTask(value: unknown, fallbackId: string): TodoTaskRecord | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const priority = record.priority;
  const dueDate = record.dueDate;
  const title = typeof record.title === "string" ? record.title.trim() : "";
  if (!title) {
    return null;
  }

  return {
    id: typeof record.id === "string" && record.id.trim() ? record.id : fallbackId,
    title,
    priority: priority === "high" || priority === "medium" || priority === "low" ? priority : "medium",
    dueDate: typeof dueDate === "string" ? dueDate : "",
    completed: Boolean(record.completed)
  };
}

function migrateTodoDataFromContent(content: string): TodoPanelData {
  const tasks = content
    .split("\n")
    .map((line) => line.trim().replace(/^[-*]\s+/, ""))
    .filter(Boolean)
    .map((title, index) => ({
      id: `todo-migrated-${index + 1}`,
      title,
      priority: "medium" as const,
      dueDate: "",
      completed: false
    }));

  return {
    filter: "all",
    tasks: tasks.length > 0 ? tasks : createDefaultTodoData().tasks
  };
}

function sanitizeTodoData(value: unknown, content: string): TodoPanelData {
  if (typeof value !== "object" || value === null) {
    return migrateTodoDataFromContent(content);
  }

  const record = value as Record<string, unknown>;
  const tasksSource = Array.isArray(record.tasks) ? record.tasks : [];
  const tasks = tasksSource
    .map((task, index) => sanitizeTodoTask(task, `todo-${index + 1}`))
    .filter((task): task is TodoTaskRecord => task !== null);

  return {
    filter: record.filter === "all" || record.filter === "open" || record.filter === "done" ? record.filter : "all",
    tasks: tasks.length > 0 ? tasks : migrateTodoDataFromContent(content).tasks
  };
}

function sanitizeCalendarNote(value: unknown, fallbackId: string): CalendarNoteRecord | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const date = typeof record.date === "string" ? record.date : "";
  const content = typeof record.content === "string" ? record.content : "";
  const title = typeof record.title === "string" ? record.title : "";
  if (!date || (!title.trim() && !content.trim())) {
    return null;
  }

  const timestamp = nowIsoString();
  return {
    id: typeof record.id === "string" && record.id.trim() ? record.id : fallbackId,
    date,
    title,
    content,
    createdAt: typeof record.createdAt === "string" ? record.createdAt : timestamp,
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : timestamp
  };
}

function migrateCalendarDataFromContent(content: string): CalendarPanelData {
  const noteBody = content.trim();
  if (!noteBody) {
    return createDefaultCalendarData();
  }

  const timestamp = nowIsoString();
  return {
    view: "calendar",
    notes: [
      {
        id: createPanelItemId("calendar-note"),
        date: toLocalDateString(),
        title: "Imported note",
        content: noteBody,
        createdAt: timestamp,
        updatedAt: timestamp
      }
    ]
  };
}

function sanitizeCalendarData(value: unknown, content: string): CalendarPanelData {
  if (typeof value !== "object" || value === null) {
    return migrateCalendarDataFromContent(content);
  }

  const record = value as Record<string, unknown>;
  const notesSource = Array.isArray(record.notes) ? record.notes : [];
  const notes = notesSource
    .map((note, index) => sanitizeCalendarNote(note, `calendar-note-${index + 1}`))
    .filter((note): note is CalendarNoteRecord => note !== null)
    .sort((left, right) => {
      if (left.date === right.date) {
        return right.updatedAt.localeCompare(left.updatedAt);
      }
      return left.date.localeCompare(right.date);
    });

  return {
    view: record.view === "calendar" || record.view === "list" ? record.view : "calendar",
    notes: notes.length > 0 ? notes : migrateCalendarDataFromContent(content).notes
  };
}

function sanitizeKnowledgeData(value: unknown): KnowledgePanelData {
  if (typeof value !== "object" || value === null) {
    return createDefaultKnowledgeData();
  }

  const record = value as Record<string, unknown>;
  const rootPath = typeof record.rootPath === "string" ? record.rootPath.trim() : "";
  return rootPath ? { rootPath } : createDefaultKnowledgeData();
}

function normalizeBuiltinPanelState(
  kind: BuiltinSupportPanelKind,
  candidate: Partial<BuiltinSupportPanelState> | undefined
): BuiltinSupportPanelState {
  const definition = defaultDefinitionFor(kind);
  const content = typeof candidate?.content === "string" ? candidate.content : definition.content;

  const data =
    kind === "todo"
      ? sanitizeTodoData(candidate?.data, content)
      : kind === "calendar"
        ? sanitizeCalendarData(candidate?.data, content)
        : kind === "knowledge"
          ? sanitizeKnowledgeData(candidate?.data)
          : undefined;

  return {
    kind,
    title: typeof candidate?.title === "string" && candidate.title.trim() ? candidate.title : definition.title,
    description:
      typeof candidate?.description === "string" && candidate.description.trim()
        ? candidate.description
        : definition.description,
    content,
    accentClassName:
      typeof candidate?.accentClassName === "string" && candidate.accentClassName.trim()
        ? candidate.accentClassName
        : definition.accentClassName,
    data
  };
}

function normalizeWorkspaceSupportPanels(workspaceId: string, candidate: unknown): WorkspaceSupportPanels {
  const base = createDefaultWorkspaceSupportPanels(workspaceId);
  if (typeof candidate !== "object" || candidate === null) {
    return base;
  }

  const record = candidate as Partial<WorkspaceSupportPanels>;
  const customPanels = Array.isArray(record.customPanels) ? record.customPanels : [];
  const registry = Array.isArray(record.registry) ? record.registry : [];

  return {
    builtinPanels: {
      todo: normalizeBuiltinPanelState("todo", record.builtinPanels?.todo),
      calendar: normalizeBuiltinPanelState("calendar", record.builtinPanels?.calendar),
      skills: normalizeBuiltinPanelState("skills", record.builtinPanels?.skills),
      knowledge: normalizeBuiltinPanelState("knowledge", record.builtinPanels?.knowledge)
    },
    customPanels,
    registry,
    registryPath: typeof record.registryPath === "string" && record.registryPath.trim() ? record.registryPath : base.registryPath
  };
}

export function createDefaultWorkspaceSupportPanels(workspaceId: string): WorkspaceSupportPanels {
  const builtinPanels = builtinDefinitions.reduce<WorkspaceSupportPanels["builtinPanels"]>((accumulator, panel) => {
    accumulator[panel.kind] = {
      kind: panel.kind,
      title: panel.title,
      description: panel.description,
      content: panel.content,
      accentClassName: panel.accentClassName,
      data: panel.data ? clonePanelData(panel.data) : undefined
    };
    return accumulator;
  }, {} as WorkspaceSupportPanels["builtinPanels"]);

  return {
    builtinPanels,
    customPanels: [],
    registry: [],
    registryPath: `./extensions/local/${workspaceId}.panels.json`
  };
}

function referenceWorkspacePanels(
  state: SupportPanelsState,
  preferredWorkspaceIds: string[]
): WorkspaceSupportPanels | undefined {
  for (const workspaceId of preferredWorkspaceIds) {
    const preferredPanels = state[workspaceId];
    if (preferredPanels) {
      return preferredPanels;
    }
  }

  return Object.values(state)[0];
}

export function createWorkspacePanelsForScopes(
  workspaceId: string,
  existingPanels: SupportPanelsState,
  scopes: BuiltinPanelScopes,
  preferredWorkspaceIds: string[] = []
): WorkspaceSupportPanels {
  const base = createDefaultWorkspaceSupportPanels(workspaceId);
  const referencePanels = referenceWorkspacePanels(existingPanels, preferredWorkspaceIds);

  if (!referencePanels) {
    return base;
  }

  return {
    ...base,
    builtinPanels: {
      todo: scopes.todo === "global" ? { ...referencePanels.builtinPanels.todo } : base.builtinPanels.todo,
      calendar:
        scopes.calendar === "global" ? { ...referencePanels.builtinPanels.calendar } : base.builtinPanels.calendar,
      skills: scopes.skills === "global" ? { ...referencePanels.builtinPanels.skills } : base.builtinPanels.skills,
      knowledge:
        scopes.knowledge === "global" ? { ...referencePanels.builtinPanels.knowledge } : base.builtinPanels.knowledge
    }
  };
}

export function syncGlobalBuiltinPanels(
  supportPanels: SupportPanelsState,
  scopes: BuiltinPanelScopes,
  sourceWorkspaceId: string
): SupportPanelsState {
  const sourcePanels = supportPanels[sourceWorkspaceId];
  if (!sourcePanels) {
    return supportPanels;
  }

  const nextState = { ...supportPanels };
  for (const workspaceId of Object.keys(nextState)) {
    if (workspaceId === sourceWorkspaceId) {
      continue;
    }

    const workspacePanels = nextState[workspaceId];
    nextState[workspaceId] = {
      ...workspacePanels,
      builtinPanels: {
        ...workspacePanels.builtinPanels,
        todo:
          scopes.todo === "global" ? { ...sourcePanels.builtinPanels.todo } : workspacePanels.builtinPanels.todo,
        calendar:
          scopes.calendar === "global"
            ? { ...sourcePanels.builtinPanels.calendar }
            : workspacePanels.builtinPanels.calendar,
        skills:
          scopes.skills === "global"
            ? { ...sourcePanels.builtinPanels.skills }
            : workspacePanels.builtinPanels.skills,
        knowledge:
          scopes.knowledge === "global"
            ? { ...sourcePanels.builtinPanels.knowledge }
            : workspacePanels.builtinPanels.knowledge
      }
    };
  }

  return nextState;
}

export function hydrateSupportPanelsState(
  workspaceIds: string[],
  state: SupportPanelsState,
  scopes: BuiltinPanelScopes = defaultBuiltinPanelScopes
): SupportPanelsState {
  const normalizedState = Object.fromEntries(
    Object.entries(state).map(([workspaceId, panels]) => [workspaceId, normalizeWorkspaceSupportPanels(workspaceId, panels)])
  ) as SupportPanelsState;

  const hydratedState = workspaceIds.reduce<SupportPanelsState>((accumulator, workspaceId) => {
    accumulator[workspaceId] =
      normalizedState[workspaceId] ?? createWorkspacePanelsForScopes(workspaceId, normalizedState, scopes, workspaceIds);
    return accumulator;
  }, { ...normalizedState });

  const syncSourceWorkspaceId = workspaceIds[0];
  return syncSourceWorkspaceId
    ? syncGlobalBuiltinPanels(hydratedState, scopes, syncSourceWorkspaceId)
    : hydratedState;
}

export function loadSupportPanelsState(): SupportPanelsState {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as SupportPanelsState;
    const normalized = Object.fromEntries(
      Object.entries(parsed ?? {}).map(([workspaceId, panels]) => [workspaceId, normalizeWorkspaceSupportPanels(workspaceId, panels)])
    ) as SupportPanelsState;
    return normalized;
  } catch {
    return {};
  }
}

export function saveSupportPanelsState(state: SupportPanelsState) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function upsertWorkspaceSupportPanels(
  state: SupportPanelsState,
  workspaceId: string,
  updater?: (workspacePanels: WorkspaceSupportPanels) => WorkspaceSupportPanels
) {
  const current = state[workspaceId] ?? createDefaultWorkspaceSupportPanels(workspaceId);
  const next = updater ? updater(current) : current;
  return {
    ...state,
    [workspaceId]: next
  };
}

export function toRegistryEntry(panel: CustomPanelRecord): CustomPanelRegistryEntry {
  return {
    id: panel.id,
    workspaceId: panel.workspaceId,
    title: panel.title,
    description: panel.description,
    createdAt: panel.createdAt,
    updatedAt: panel.updatedAt
  };
}

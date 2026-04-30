export type BuiltinSupportPanelKind = "todo" | "calendar" | "skills" | "knowledge";
export type PanelScope = "global" | "workspace";
export type TodoTaskPriority = "high" | "medium" | "low";
export type TodoTaskFilter = "all" | "open" | "done";
export type CalendarPanelView = "calendar" | "list";

export type TodoTaskRecord = {
  id: string;
  title: string;
  priority: TodoTaskPriority;
  dueDate: string;
  completed: boolean;
};

export type TodoPanelData = {
  tasks: TodoTaskRecord[];
  filter: TodoTaskFilter;
};

export type CalendarNoteRecord = {
  id: string;
  date: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};

export type CalendarPanelData = {
  notes: CalendarNoteRecord[];
  view: CalendarPanelView;
};

export type KnowledgePanelData = {
  rootPath?: string;
};

export type BuiltinPanelDataMap = {
  todo: TodoPanelData;
  calendar: CalendarPanelData;
  skills: undefined;
  knowledge: KnowledgePanelData;
};

export type BuiltinSupportPanelState = {
  kind: BuiltinSupportPanelKind;
  title: string;
  description: string;
  content: string;
  accentClassName: string;
  data?: BuiltinPanelDataMap[BuiltinSupportPanelKind];
};

export type WorkspaceSupportPanels = {
  builtinPanels: Record<BuiltinSupportPanelKind, BuiltinSupportPanelState>;
};

export type BuiltinPanelScopes = Record<BuiltinSupportPanelKind, PanelScope>;

export type SupportPanelsState = Record<string, WorkspaceSupportPanels>;

export type BuiltinSupportPanelExport = {
  title: string;
  description: string;
  content: string;
  data?: BuiltinPanelDataMap[BuiltinSupportPanelKind];
};

export type WorkspacePanelsExport = {
  builtinPanels: Record<BuiltinSupportPanelKind, BuiltinSupportPanelExport>;
};

export type WorkspaceConfigExport = {
  id: string;
  name: string;
  path: string;
  profileIds: string[];
  panels: WorkspacePanelsExport;
};

export type WorkspaceConfigBundleFile = {
  version: 1;
  workspaces: WorkspaceConfigExport[];
};

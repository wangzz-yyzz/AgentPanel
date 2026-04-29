import { useEffect, useRef, useState } from "react";
import {
  BookText,
  CalendarDays,
  CheckSquare,
  Database,
  LayoutTemplate,
  Plus,
  Sparkles,
  Trash2
} from "lucide-react";
import { defaultBuiltinPanelScopes } from "../lib/support-panels";
import { useAppStore } from "../state/store";
import type { BuiltinSupportPanelKind, PanelScope } from "../types/support-panel";
import { CalendarNotesPanel } from "./panels/CalendarNotesPanel";
import { KnowledgeBasePanel } from "./panels/KnowledgeBasePanel";
import { SkillsPanel } from "./panels/SkillsPanel";
import { TodoPanel } from "./panels/TodoPanel";

const iconMap: Record<BuiltinSupportPanelKind | "custom", typeof CheckSquare> = {
  todo: CheckSquare,
  calendar: CalendarDays,
  skills: Sparkles,
  knowledge: BookText,
  custom: LayoutTemplate
};

const builtinOrder: BuiltinSupportPanelKind[] = ["todo", "calendar", "skills", "knowledge"];

function formatTimestamp(value: string) {
  try {
    return new Intl.DateTimeFormat("en", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function scopeLabel(scope: PanelScope) {
  return scope === "global" ? "Global" : "Workspace only";
}

export function SupportPanelGrid() {
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const ensureWorkspacePanels = useAppStore((state) => state.ensureWorkspacePanels);
  const workspacePanels = useAppStore((state) => state.supportPanels[activeWorkspaceId]);
  const workspaces = useAppStore((state) => state.workspaces);
  const updateBuiltinPanel = useAppStore((state) => state.updateBuiltinPanel);
  const activeWorkspacePath = workspaces.find((workspace) => workspace.id === activeWorkspaceId)?.path ?? "";
  useEffect(() => {
    ensureWorkspacePanels(activeWorkspaceId);
  }, [activeWorkspaceId, ensureWorkspacePanels]);

  if (!workspacePanels) {
    return null;
  }

  return (
    <section className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {builtinOrder.map((kind, index) => {
          const panel = workspacePanels.builtinPanels[kind];
          const Icon = iconMap[kind];

          return (
            <article
              key={kind}
              className="ui-surface animate-enter flex h-full flex-col rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_6px_18px_rgba(34,56,110,0.05)]"
              style={{ animationDelay: `${120 + index * 45}ms` }}
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <input
                    value={panel.title}
                    onChange={(event) =>
                      updateBuiltinPanel(activeWorkspaceId, kind, { title: event.target.value })
                    }
                    className="w-full border-none bg-transparent p-0 text-xs font-semibold uppercase tracking-[0.22em] text-slate-400 outline-none"
                  />
                  <input
                    value={panel.description}
                    onChange={(event) =>
                      updateBuiltinPanel(activeWorkspaceId, kind, { description: event.target.value })
                    }
                    className="mt-1 w-full min-w-0 overflow-hidden border-none bg-transparent p-0 text-sm font-semibold tracking-[-0.02em] text-slate-900 text-ellipsis whitespace-nowrap outline-none"
                  />
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <div
                    className={[
                      "inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]",
                      defaultBuiltinPanelScopes[kind] === "global"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-slate-200 bg-slate-50 text-slate-600"
                    ].join(" ")}
                  >
                    {scopeLabel(defaultBuiltinPanelScopes[kind])}
                  </div>
                  <div
                    className={[
                      "flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-[0_12px_30px_rgba(15,23,42,0.18)]",
                      panel.accentClassName
                    ].join(" ")}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                </div>
              </div>
              {kind === "todo" ? (
                <TodoPanel
                  panel={panel}
                  onPatch={(patch) => updateBuiltinPanel(activeWorkspaceId, kind, patch)}
                />
              ) : kind === "calendar" ? (
                <CalendarNotesPanel
                  panel={panel}
                  onPatch={(patch) => updateBuiltinPanel(activeWorkspaceId, kind, patch)}
                />
              ) : kind === "skills" ? (
                <SkillsPanel workspacePath={activeWorkspacePath} />
              ) : kind === "knowledge" ? (
                <KnowledgeBasePanel
                  panel={panel}
                  onPatch={(patch) => updateBuiltinPanel(activeWorkspaceId, kind, patch)}
                />
              ) : (
                <textarea
                  value={panel.content}
                  rows={6}
                  onChange={(event) =>
                    updateBuiltinPanel(activeWorkspaceId, kind, { content: event.target.value })
                  }
                  className="min-h-[240px] w-full flex-1 resize-y rounded-3xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 text-sm leading-6 text-slate-700 outline-none transition focus:border-brand-hover focus:bg-white"
                  placeholder="Write panel notes here..."
                />
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function WorkspaceExtensions() {
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const ensureWorkspacePanels = useAppStore((state) => state.ensureWorkspacePanels);
  const workspacePanels = useAppStore((state) => state.supportPanels[activeWorkspaceId]);
  const updateRegistryPath = useAppStore((state) => state.updateRegistryPath);
  const createCustomPanel = useAppStore((state) => state.createCustomPanel);
  const updateCustomPanel = useAppStore((state) => state.updateCustomPanel);
  const removeCustomPanel = useAppStore((state) => state.removeCustomPanel);
  const exportCustomPanels = useAppStore((state) => state.exportCustomPanels);
  const importCustomPanels = useAppStore((state) => state.importCustomPanels);
  const [syncMessage, setSyncMessage] = useState("");
  const [recentCustomPanelId, setRecentCustomPanelId] = useState<string>();
  const previousCustomPanelIdsRef = useRef<string[]>([]);

  useEffect(() => {
    ensureWorkspacePanels(activeWorkspaceId);
  }, [activeWorkspaceId, ensureWorkspacePanels]);

  useEffect(() => {
    if (!workspacePanels) {
      previousCustomPanelIdsRef.current = [];
      return;
    }

    const previousIds = previousCustomPanelIdsRef.current;
    const nextIds = workspacePanels.customPanels.map((panel) => panel.id);
    const addedId = nextIds.find((id) => !previousIds.includes(id));
    previousCustomPanelIdsRef.current = nextIds;

    if (!addedId) {
      return;
    }

    setRecentCustomPanelId(addedId);
    const timer = window.setTimeout(() => {
      setRecentCustomPanelId((current) => (current === addedId ? undefined : current));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [workspacePanels]);

  if (!workspacePanels) {
    return null;
  }

  return (
    <section className="grid gap-4">
      <article className="ui-surface rounded-[28px] border border-[#1b1f29] bg-[#0d1117] p-4 text-white shadow-terminal">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
              Custom Panel Registry
            </div>
            <h2 className="mt-1 text-xl font-semibold tracking-[-0.03em]">Workspace extensions</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-400">Import, export, and edit extra panels.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() =>
                void importCustomPanels(activeWorkspaceId)
                  .then(() => setSyncMessage("Imported custom panels from registry file."))
                  .catch((error: unknown) =>
                    setSyncMessage(error instanceof Error ? error.message : "Unable to import registry file.")
                  )
              }
              className="ui-action rounded-pill border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.12]"
            >
              Import
            </button>
            <button
              onClick={() =>
                void exportCustomPanels(activeWorkspaceId)
                  .then((path) => setSyncMessage(`Exported registry to ${path}`))
                  .catch((error: unknown) =>
                    setSyncMessage(error instanceof Error ? error.message : "Unable to export registry file.")
                  )
              }
              className="ui-action rounded-pill border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.12]"
            >
              Export
            </button>
            <button
              onClick={() => createCustomPanel(activeWorkspaceId)}
              className="ui-action rounded-pill border border-brand-hover/35 bg-brand-blue px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-hover"
            >
              <span className="inline-flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Add custom panel
              </span>
            </button>
          </div>
        </div>

        <div className="mb-4 rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-200">
            <Database className="h-4 w-4 text-brand-hover" />
            Registry index
          </div>
          <input
            value={workspacePanels.registryPath}
            onChange={(event) => updateRegistryPath(activeWorkspaceId, event.target.value)}
            className="mb-3 w-full rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-200 outline-none transition focus:border-brand-hover"
            placeholder="./extensions/local/agentpanel.panels.json"
          />
          {syncMessage ? <div className="animate-panel-swap mb-3 text-sm text-slate-400">{syncMessage}</div> : null}
          {workspacePanels.registry.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 px-4 py-5 text-sm text-slate-400">
              No custom panels yet. Add one to create a registry entry and editable rendering surface.
            </div>
          ) : (
            <div className="grid gap-3">
              {workspacePanels.registry.map((entry, index) => (
                <div
                  key={entry.id}
                  className="animate-enter-soft rounded-2xl border border-white/10 bg-black/20 px-4 py-3"
                  style={{ animationDelay: `${index * 35}ms` }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-semibold text-slate-100">{entry.title}</div>
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                      Updated {formatTimestamp(entry.updatedAt)}
                    </div>
                  </div>
                  <div className="mt-2 text-sm text-slate-400">
                    {entry.description || "No description yet."}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid gap-3">
          {workspacePanels.customPanels.map((panel, index) => {
            const Icon = iconMap.custom;

            return (
              <article
                key={panel.id}
                className={[
                  "ui-surface animate-enter-soft rounded-[24px] border border-white/10 bg-white/[0.04] p-4",
                  recentCustomPanelId === panel.id ? "animate-success-flash" : ""
                ].join(" ")}
                style={{ animationDelay: `${index * 45}ms` }}
              >
                <div className="mb-3 flex items-start justify-between gap-4">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-brand-hover">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-3">
                      <input
                        value={panel.title}
                        onChange={(event) =>
                          updateCustomPanel(activeWorkspaceId, panel.id, { title: event.target.value })
                        }
                        className="w-full rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-base font-semibold text-white outline-none transition focus:border-brand-hover"
                        placeholder="Panel title"
                      />
                      <input
                        value={panel.description}
                        onChange={(event) =>
                          updateCustomPanel(activeWorkspaceId, panel.id, { description: event.target.value })
                        }
                        className="w-full rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-300 outline-none transition focus:border-brand-hover"
                        placeholder="Short registry description"
                      />
                      <div className="inline-flex rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
                        Workspace only
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => removeCustomPanel(activeWorkspaceId, panel.id)}
                    className="ui-action flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-red-400/20 bg-red-500/10 text-red-200 transition hover:bg-red-500/20"
                    aria-label={`Delete ${panel.title}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <textarea
                  value={panel.content}
                  rows={5}
                  onChange={(event) =>
                    updateCustomPanel(activeWorkspaceId, panel.id, { content: event.target.value })
                  }
                  className="min-h-[128px] w-full resize-y rounded-3xl border border-white/10 bg-black/25 px-4 py-3 text-sm leading-6 text-slate-200 outline-none transition focus:border-brand-hover focus:bg-black/35"
                  placeholder="Panel content, URLs, operator notes, or future tool config..."
                />
                <div className="mt-3 text-xs uppercase tracking-[0.18em] text-slate-500">
                  Created {formatTimestamp(panel.createdAt)} | Updated {formatTimestamp(panel.updatedAt)}
                </div>
              </article>
            );
          })}
        </div>
      </article>
    </section>
  );
}

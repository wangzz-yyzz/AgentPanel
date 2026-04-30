import { useEffect } from "react";
import {
  BookText,
  CalendarDays,
  CheckSquare,
  Sparkles
} from "lucide-react";
import { defaultBuiltinPanelScopes } from "../lib/support-panels";
import { useAppStore } from "../state/store";
import type { BuiltinSupportPanelKind, PanelScope } from "../types/support-panel";
import { CalendarNotesPanel } from "./panels/CalendarNotesPanel";
import { KnowledgeBasePanel } from "./panels/KnowledgeBasePanel";
import { SkillsPanel } from "./panels/SkillsPanel";
import { TodoPanel } from "./panels/TodoPanel";

const iconMap: Record<BuiltinSupportPanelKind, typeof CheckSquare> = {
  todo: CheckSquare,
  calendar: CalendarDays,
  skills: Sparkles,
  knowledge: BookText
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

import { FolderOpenDot, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { useAppStore } from "../state/store";
import type { WorkspaceDraft, WorkspaceSummary } from "../types/agent";
import { WorkspaceDirectoryTree } from "./WorkspaceDirectoryTree";

const emptyDraft: WorkspaceDraft = {
  name: "",
  path: "",
  profileIds: []
};

function draftFromWorkspace(workspace?: WorkspaceSummary): WorkspaceDraft {
  if (!workspace) {
    return emptyDraft;
  }

  return {
    id: workspace.id,
    name: workspace.name,
    path: workspace.path,
    profileIds: workspace.profileIds
  };
}

export function WorkspaceRail() {
  const workspaces = useAppStore((state) => state.workspaces);
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const setActiveWorkspace = useAppStore((state) => state.setActiveWorkspace);
  const saveWorkspace = useAppStore((state) => state.saveWorkspace);
  const deleteWorkspace = useAppStore((state) => state.deleteWorkspace);
  const exportWorkspaceBundle = useAppStore((state) => state.exportWorkspaceBundle);
  const importWorkspaceBundle = useAppStore((state) => state.importWorkspaceBundle);
  const initialize = useAppStore((state) => state.initialize);

  const [editorMode, setEditorMode] = useState<"hidden" | "create" | "edit">("hidden");
  const [draft, setDraft] = useState<WorkspaceDraft>(emptyDraft);
  const [editorError, setEditorError] = useState<string>();
  const [manageMode, setManageMode] = useState(false);
  const [pendingDeleteWorkspaceId, setPendingDeleteWorkspaceId] = useState<string>();
  const [recentWorkspaceIds, setRecentWorkspaceIds] = useState<string[]>([]);
  const previousWorkspaceIdsRef = useRef<string[]>(workspaces.map((workspace) => workspace.id));

  const activeWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? workspaces[0],
    [activeWorkspaceId, workspaces]
  );

  useEffect(() => {
    void initialize();
  }, [initialize]);

  useEffect(() => {
    const previousIds = previousWorkspaceIdsRef.current;
    const nextIds = workspaces.map((workspace) => workspace.id);
    const addedIds = nextIds.filter((id) => !previousIds.includes(id));
    previousWorkspaceIdsRef.current = nextIds;

    if (addedIds.length === 0) {
      return;
    }

    setRecentWorkspaceIds((current) => Array.from(new Set([...current, ...addedIds])));
    const timer = window.setTimeout(() => {
      setRecentWorkspaceIds((current) => current.filter((id) => !addedIds.includes(id)));
    }, 1100);

    return () => window.clearTimeout(timer);
  }, [workspaces]);

  const resetEditor = () => {
    setEditorMode("hidden");
    setDraft(emptyDraft);
    setEditorError(undefined);
  };

  const handleSave = () => {
    setEditorError(undefined);
    try {
      const workspace = saveWorkspace(draft);
      setDraft(draftFromWorkspace(workspace));
      setEditorMode("hidden");
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : "Unable to save workspace.");
    }
  };

  const handleBrowsePath = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      defaultPath: draft.path.trim() || undefined,
      title: "Select Workspace Directory"
    });

    if (typeof selected === "string" && selected.trim()) {
      setDraft((state) => ({ ...state, path: selected }));
      setEditorError(undefined);
    }
  };

  const handleExportBundle = async () => {
    try {
      const path = await save({
        title: "Export Workspaces",
        defaultPath: "agentpanel-workspaces.json",
        filters: [{ name: "JSON", extensions: ["json"] }]
      });

      if (!path) {
        return;
      }

      await exportWorkspaceBundle(path);
      setEditorError(undefined);
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : "Unable to export workspace bundle.");
    }
  };

  const handleImportBundle = async () => {
    try {
      const path = await open({
        title: "Import Workspaces",
        multiple: false,
        directory: false,
        filters: [{ name: "JSON", extensions: ["json"] }]
      });

      if (typeof path !== "string" || !path.trim()) {
        return;
      }

      await importWorkspaceBundle(path);
      setEditorError(undefined);
      resetEditor();
      setPendingDeleteWorkspaceId(undefined);
      setManageMode(false);
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : "Unable to import workspace bundle.");
    }
  };

  const handleDelete = async (workspace: WorkspaceSummary) => {
    try {
      await deleteWorkspace(workspace.id);
      setPendingDeleteWorkspaceId((current) => (current === workspace.id ? undefined : current));
      if (draft.id === workspace.id) {
        resetEditor();
      }
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : "Unable to delete workspace.");
    }
  };

  return (
    <aside
      className="animate-enter flex w-full shrink-0 flex-col gap-3 rounded-[28px] border border-slate-200 bg-[#fbfcfe] p-3 shadow-[0_6px_18px_rgba(34,56,110,0.05)] xl:sticky xl:top-4 xl:h-[calc(100vh-2rem)] xl:w-[320px] xl:min-h-0"
      style={{ animationDelay: "10ms" }}
    >
      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[26px] border border-slate-200 bg-white p-3 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Workspaces</div>
            <div className="mt-1 text-xl font-semibold tracking-[-0.03em]">Surface map</div>
          </div>
          <button
            type="button"
            onClick={() => {
              const nextManageMode = !manageMode;
              setManageMode(nextManageMode);
              if (!nextManageMode) {
                resetEditor();
                setPendingDeleteWorkspaceId(undefined);
              }
            }}
            className="ui-action inline-flex items-center gap-1 rounded-full border border-brand-blue/15 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-brand-blue transition hover:bg-brand-surface"
          >
            {manageMode ? <X className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
            {manageMode ? "Done" : "Manage"}
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <div className="mb-4 rounded-[22px] border border-slate-200/80 bg-slate-50 px-3 py-3 text-sm text-slate-500">
            {workspaces.length} active workspaces
          </div>
          {manageMode ? (
            <div className="animate-panel-swap mb-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => void handleImportBundle()}
                className="ui-action rounded-pill border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                Import
              </button>
              <button
                type="button"
                onClick={() => void handleExportBundle()}
                className="ui-action rounded-pill border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                Export
              </button>
            </div>
          ) : null}
          {editorError && editorMode === "hidden" ? (
            <div className="mb-4 min-w-0 overflow-hidden rounded-[22px] border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 [overflow-wrap:anywhere]">
              {editorError}
            </div>
          ) : null}
          {manageMode && editorMode === "hidden" ? (
            <button
              type="button"
              onClick={() => {
                setDraft(emptyDraft);
                setEditorError(undefined);
                setEditorMode("create");
              }}
              className="ui-action animate-panel-swap mb-4 inline-flex w-full items-center justify-center gap-2 rounded-[22px] border border-dashed border-brand-blue/30 bg-brand-surface px-3 py-3 text-sm font-semibold text-brand-blue transition hover:border-brand-blue hover:bg-brand-hover hover:text-white"
            >
              <Plus className="h-4 w-4" />
              New workspace
            </button>
          ) : null}
          {editorMode !== "hidden" ? (
            <div className="animate-panel-swap mb-4 min-w-0 rounded-[22px] border border-slate-200/80 bg-slate-50 p-3">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-800">
                    {editorMode === "create" ? "New workspace" : "Edit workspace"}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">Name and working directory drive session launch behavior.</div>
                </div>
                <button
                  type="button"
                  onClick={resetEditor}
                  className="ui-action shrink-0 rounded-full border border-slate-200 p-1 text-slate-500 transition hover:bg-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="grid gap-3">
                <label className="grid gap-1.5 text-sm">
                  <span className="text-slate-600">Name</span>
                  <input
                    value={draft.name}
                    onChange={(event) => setDraft((state) => ({ ...state, name: event.target.value }))}
                    className="min-w-0 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-slate-900 outline-none transition focus:border-brand-blue"
                    placeholder="Frontend Sandbox"
                  />
                </label>
                <label className="grid gap-1.5 text-sm">
                  <span className="text-slate-600">Path</span>
                  <div className="flex min-w-0 flex-col gap-2">
                    <input
                      value={draft.path}
                      readOnly
                      className="min-w-0 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-slate-900 outline-none"
                      placeholder="Choose a directory"
                    />
                    <button
                      type="button"
                      onClick={() => void handleBrowsePath()}
                      className="ui-action w-full rounded-pill border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                    >
                      Browse
                    </button>
                  </div>
                </label>
                {editorError ? (
                  <div className="min-w-0 overflow-hidden rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 [overflow-wrap:anywhere]">
                    {editorError}
                  </div>
                ) : null}
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={handleSave}
                    className="ui-action inline-flex w-full items-center justify-center gap-2 rounded-pill border border-brand-blue bg-brand-blue px-3 py-2 text-sm font-semibold text-white transition hover:bg-brand-hover"
                  >
                    <Save className="h-4 w-4" />
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={resetEditor}
                    className="ui-action w-full rounded-pill border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          ) : null}
          <div className="grid auto-rows-max content-start gap-2.5">
            {workspaces.map((workspace, index) => {
              const active = workspace.id === activeWorkspaceId;
              const pendingDelete = pendingDeleteWorkspaceId === workspace.id;
              return (
                <div
                  key={workspace.id}
                  className={[
                    "ui-surface animate-enter-soft min-w-0 overflow-hidden rounded-[22px] border p-3.5 transition",
                    active
                      ? "border-brand-blue bg-brand-blue text-white shadow-[0_10px_24px_rgba(0,82,255,0.18)]"
                      : "border-slate-200/80 bg-white",
                    recentWorkspaceIds.includes(workspace.id) ? "animate-success-flash" : ""
                  ].join(" ")}
                  style={{ animationDelay: `${60 + index * 28}ms` }}
                >
                  <button type="button" onClick={() => setActiveWorkspace(workspace.id)} className="w-full min-w-0 text-left">
                    <div className="mb-2 flex items-center gap-3">
                      <div
                        className={[
                          "flex h-9 w-9 items-center justify-center rounded-2xl",
                          active ? "bg-white/15 text-white" : "bg-brand-surface text-brand-blue"
                        ].join(" ")}
                      >
                        <FolderOpenDot className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate-start font-semibold" title={workspace.name}>
                          {workspace.name}
                        </div>
                        <div
                          className={active ? "truncate-start text-sm text-blue-100" : "truncate-start text-sm text-slate-500"}
                          title={workspace.path}
                        >
                          {workspace.path}
                        </div>
                      </div>
                    </div>
                    <div
                      className={
                        active
                          ? "text-xs uppercase tracking-[0.16em] text-blue-100"
                          : "text-xs uppercase tracking-[0.16em] text-slate-500"
                      }
                    >
                      {workspace.profileIds.length} attached profiles
                    </div>
                  </button>
                  {manageMode ? (
                    pendingDelete ? (
                      <div className="mt-3 grid gap-2">
                        <div className={active ? "text-xs text-blue-100" : "text-xs text-red-700"}>
                          Delete this workspace and close its sessions?
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleDelete(workspace);
                            }}
                            disabled={workspaces.length <= 1}
                          className={[
                            "ui-action inline-flex flex-1 items-center justify-center gap-1 rounded-pill border px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40",
                              active
                                ? "border-white/15 bg-white/10 text-white hover:bg-white/15"
                                : "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                            ].join(" ")}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Confirm
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setPendingDeleteWorkspaceId(undefined);
                            }}
                            className={[
                              "ui-action rounded-pill border px-3 py-2 text-xs font-semibold transition",
                              active
                                ? "border-white/15 bg-white/10 text-white hover:bg-white/15"
                                : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                            ].join(" ")}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setPendingDeleteWorkspaceId(undefined);
                            setDraft(draftFromWorkspace(workspace));
                            setEditorError(undefined);
                            setEditorMode("edit");
                          }}
                          className={[
                            "ui-action inline-flex flex-1 items-center justify-center gap-1 rounded-pill border px-3 py-2 text-xs font-semibold transition",
                            active
                              ? "border-white/15 bg-white/10 text-white hover:bg-white/15"
                              : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                          ].join(" ")}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setPendingDeleteWorkspaceId(workspace.id);
                          }}
                          disabled={workspaces.length <= 1}
                          className={[
                            "ui-action inline-flex items-center justify-center rounded-pill border px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40",
                            active
                              ? "border-white/15 bg-white/10 text-white hover:bg-white/15"
                              : "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                          ].join(" ")}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </section>
      <WorkspaceDirectoryTree />
    </aside>
  );
}

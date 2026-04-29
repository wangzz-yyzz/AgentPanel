import { BookMarked, FileText, FileUp, FolderOpen, FolderPlus, RefreshCw, Sparkles, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { open } from "@tauri-apps/plugin-dialog";
import { importSkillItems, listSkillFiles } from "../../lib/tauri";
import { useAppStore } from "../../state/store";
import type { SkillFileEntry } from "../../lib/tauri";

type SkillsPanelProps = {
  workspacePath: string;
};

function formatSourceLabel(sourceRoot: string) {
  return sourceRoot === ".skills" ? ".skills" : "skills";
}

function scanTarget(workspacePath: string, sourceRoot: string) {
  return `${workspacePath.replace(/\\/g, "/").replace(/\/$/, "")}/${sourceRoot}`;
}

function normalizeDialogSelection(selected: string | string[] | null): string[] {
  if (!selected) {
    return [];
  }

  return Array.isArray(selected) ? selected.filter((item) => item.trim()) : [selected].filter((item) => item.trim());
}

function fileNameFromPath(path: string) {
  const normalized = path.replace(/\\/g, "/").replace(/\/+$/, "");
  const segments = normalized.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? normalized;
}

function normalizePathKey(path: string) {
  return path.replace(/\//g, "\\").toLowerCase();
}

type PendingSkillImportItem = {
  path: string;
  kind: "file" | "folder";
};

export function SkillsPanel({ workspacePath }: SkillsPanelProps) {
  const requestFilePreview = useAppStore((state) => state.requestFilePreview);
  const [entries, setEntries] = useState<SkillFileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string>();
  const [importError, setImportError] = useState<string>();
  const [lastScannedAt, setLastScannedAt] = useState<string>();
  const [statusMessage, setStatusMessage] = useState<string>();
  const [recentEntryPaths, setRecentEntryPaths] = useState<string[]>([]);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [pendingImportItems, setPendingImportItems] = useState<PendingSkillImportItem[]>([]);
  const previousEntryPathsRef = useRef<string[]>([]);

  const groupedEntries = useMemo(() => {
    const groups: Record<string, SkillFileEntry[]> = {
      skills: [],
      ".skills": []
    };

    for (const entry of entries) {
      if (!groups[entry.sourceRoot]) {
        groups[entry.sourceRoot] = [];
      }
      groups[entry.sourceRoot].push(entry);
    }

    return groups;
  }, [entries]);

  const refreshSkills = async () => {
    if (!workspacePath.trim()) {
      setEntries([]);
      setError("Workspace path is empty.");
      return;
    }

    setLoading(true);
    try {
      const nextEntries = await listSkillFiles(workspacePath);
      setEntries(nextEntries);
      setError(undefined);
      setLastScannedAt(new Date().toISOString());
    } catch (loadError) {
      setEntries([]);
      setError(loadError instanceof Error ? loadError.message : "Unable to scan skill files.");
    } finally {
      setLoading(false);
    }
  };

  const closeImportDialog = () => {
    if (importing) {
      return;
    }

    setImportDialogOpen(false);
    setPendingImportItems([]);
    setImportError(undefined);
  };

  const appendPendingImportItems = (kind: PendingSkillImportItem["kind"], paths: string[]) => {
    if (paths.length === 0) {
      return;
    }

    setPendingImportItems((current) => {
      const seen = new Set(current.map((item) => normalizePathKey(item.path)));
      const next = [...current];

      for (const path of paths) {
        const key = normalizePathKey(path);
        if (seen.has(key)) {
          continue;
        }

        seen.add(key);
        next.push({ path, kind });
      }

      return next;
    });
    setImportError(undefined);
  };

  const handleAddMarkdownFiles = async () => {
    if (!workspacePath.trim()) {
      setImportError("Workspace path is empty.");
      return;
    }

    const selected = await open({
      multiple: true,
      directory: false,
      defaultPath: workspacePath,
      title: "Select Markdown Skill Files",
      filters: [{ name: "Markdown", extensions: ["md"] }]
    });

    appendPendingImportItems("file", normalizeDialogSelection(selected));
  };

  const handleAddSkillFolders = async () => {
    if (!workspacePath.trim()) {
      setImportError("Workspace path is empty.");
      return;
    }

    const selected = await open({
      multiple: true,
      directory: true,
      defaultPath: workspacePath,
      title: "Select Skill Folders"
    });

    appendPendingImportItems("folder", normalizeDialogSelection(selected));
  };

  const handleLoadSkill = async () => {
    if (!workspacePath.trim()) {
      setError("Workspace path is empty.");
      return;
    }

    setImportDialogOpen(true);
    setPendingImportItems([]);
    setImportError(undefined);
  };

  const handleConfirmImport = async () => {
    if (!workspacePath.trim()) {
      setImportError("Workspace path is empty.");
      return;
    }
    if (pendingImportItems.length === 0) {
      setImportError("Add at least one Markdown file or skill folder.");
      return;
    }

    setImporting(true);
    try {
      const importedItems = await importSkillItems(
        workspacePath,
        pendingImportItems.map((item) => item.path)
      );
      const fileCount = importedItems.filter((item) => !item.isDirectory).length;
      const folderCount = importedItems.filter((item) => item.isDirectory).length;
      const summaryParts = [
        fileCount ? `${fileCount} file${fileCount === 1 ? "" : "s"}` : "",
        folderCount ? `${folderCount} folder${folderCount === 1 ? "" : "s"}` : ""
      ].filter(Boolean);

      setStatusMessage(`Loaded ${summaryParts.join(" and ")} into skills/.`);
      setError(undefined);
      setImportError(undefined);
      setImportDialogOpen(false);
      setPendingImportItems([]);
      await refreshSkills();
    } catch (loadError) {
      setStatusMessage(undefined);
      setImportError(loadError instanceof Error ? loadError.message : "Unable to load the selected skill items.");
    } finally {
      setImporting(false);
    }
  };

  useEffect(() => {
    void refreshSkills();
  }, [workspacePath]);

  useEffect(() => {
    const previousPaths = previousEntryPathsRef.current;
    const nextPaths = entries.map((entry) => entry.path);
    const addedPaths = nextPaths.filter((path) => !previousPaths.includes(path));
    previousEntryPathsRef.current = nextPaths;

    if (addedPaths.length === 0) {
      return;
    }

    setRecentEntryPaths((current) => Array.from(new Set([...current, ...addedPaths])));
    const timer = window.setTimeout(() => {
      setRecentEntryPaths((current) => current.filter((path) => !addedPaths.includes(path)));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [entries]);

  useEffect(() => {
    if (!importDialogOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeImportDialog();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [importDialogOpen, importing]);

  useEffect(() => {
    if (!importDialogOpen || typeof document === "undefined") {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [importDialogOpen]);

  const actionButtonClassName =
    "inline-flex items-center gap-2 rounded-pill border border-[#1f8a70] bg-[#1f8a70] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#125b50] disabled:cursor-not-allowed disabled:opacity-50";

  const importDialog =
    importDialogOpen && typeof document !== "undefined"
      ? createPortal(
          <div
            className="animate-modal-overlay fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/72 px-4 py-6 backdrop-blur-md"
            onClick={closeImportDialog}
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_40%)]" />
            <div
              className="animate-modal-card relative flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-[32px] border border-slate-200/80 bg-white shadow-[0_36px_120px_rgba(2,12,27,0.55)]"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-[linear-gradient(135deg,rgba(18,91,80,0.14),rgba(95,207,128,0.05))] px-5 py-4">
                <div className="min-w-0">
                  <div className="inline-flex items-center gap-2 rounded-full border border-[#1f8a70]/15 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#1f8a70]">
                    <FileUp className="h-3.5 w-3.5" />
                    Skill import
                  </div>
                  <div className="mt-3 text-lg font-semibold tracking-[-0.03em] text-slate-900">Load files and folders together</div>
                  <div className="mt-1 text-sm text-slate-500">
                    Add Markdown files and skill folders to one batch, then import them into `skills/`.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeImportDialog}
                  disabled={importing}
                  className="ui-action shrink-0 rounded-full border border-slate-200 bg-white p-2 text-slate-500 transition hover:border-slate-300 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Close import dialog"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
                <div className="mb-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void handleAddMarkdownFiles()}
                    disabled={importing}
                    className="ui-action inline-flex items-center gap-2 rounded-pill border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <FileText className="h-4 w-4 text-slate-500" />
                    Add Markdown Files
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleAddSkillFolders()}
                    disabled={importing}
                    className="ui-action inline-flex items-center gap-2 rounded-pill border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <FolderPlus className="h-4 w-4 text-[#1f8a70]" />
                    Add Skill Folders
                  </button>
                </div>

                {importError ? (
                  <div className="mb-4 rounded-[24px] border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">{importError}</div>
                ) : null}

                {pendingImportItems.length === 0 ? (
                  <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50/70 px-4 py-6 text-sm text-slate-500">
                    Nothing queued yet. Add Markdown files, skill folders, or both, then import them together.
                  </div>
                ) : (
                  <div className="rounded-[24px] border border-slate-200 bg-slate-50/60 p-3">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-slate-900">Queued items</div>
                      <div className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                        {pendingImportItems.length} selected
                      </div>
                    </div>
                    <div className="space-y-2">
                      {pendingImportItems.map((item) => (
                        <div
                          key={item.path}
                          className="flex items-center gap-3 rounded-[20px] border border-slate-200 bg-white px-4 py-3"
                        >
                          <div className="shrink-0">
                            {item.kind === "folder" ? (
                              <FolderOpen className="h-4 w-4 text-[#1f8a70]" />
                            ) : (
                              <FileText className="h-4 w-4 text-slate-500" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-semibold text-slate-900" title={fileNameFromPath(item.path)}>
                              {fileNameFromPath(item.path)}
                            </div>
                            <div className="mt-1 truncate-start text-xs text-slate-500" title={item.path}>
                              {item.path}
                            </div>
                          </div>
                          <div className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                            {item.kind}
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setPendingImportItems((current) => current.filter((currentItem) => currentItem.path !== item.path))
                            }
                            disabled={importing}
                            className="ui-action shrink-0 rounded-full border border-slate-200 bg-white p-2 text-slate-500 transition hover:border-red-200 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                            aria-label={`Remove ${item.path}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-5 py-4">
                <button
                  type="button"
                  onClick={closeImportDialog}
                  disabled={importing}
                  className="ui-action rounded-pill border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleConfirmImport()}
                  disabled={importing}
                  className="ui-action inline-flex items-center gap-2 rounded-pill border border-[#1f8a70] bg-[#1f8a70] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#125b50] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <FileUp className="h-4 w-4" />
                  {importing ? "Importing..." : "Import"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <div className="flex min-h-[440px] flex-1 flex-col">
      <div className="mb-4 rounded-[24px] border border-slate-200 bg-[linear-gradient(135deg,rgba(18,91,80,0.12),rgba(95,207,128,0.04))] p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-[#1f8a70] shadow-[inset_0_0_0_1px_rgba(31,138,112,0.08)]">
              <BookMarked className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold tracking-[-0.02em] text-slate-900">
                Skills in this workspace
              </div>
              <div className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                {entries.length} skills indexed
              </div>
            </div>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void refreshSkills()}
              disabled={loading}
              className={`ui-action ${actionButtonClassName}`}
            >
              <RefreshCw className={["h-4 w-4", loading ? "animate-spin" : ""].join(" ")} />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => void handleLoadSkill()}
              disabled={loading || importing}
              className={`ui-action ${actionButtonClassName}`}
            >
              <FileUp className="h-4 w-4" />
              Load
            </button>
          </div>
        </div>

        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {["skills", ".skills"].map((sourceRoot) => (
            <div key={sourceRoot} className="rounded-[20px] border border-white/60 bg-white/80 px-3 py-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                <FolderOpen className="h-4 w-4 text-[#1f8a70]" />
                {formatSourceLabel(sourceRoot)}
              </div>
              <div className="mt-1 truncate-start text-xs text-slate-500" title={scanTarget(workspacePath, sourceRoot)}>
                {scanTarget(workspacePath, sourceRoot)}
              </div>
            </div>
          ))}
        </div>

        {lastScannedAt ? (
          <div className="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Last scan {new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(lastScannedAt))}
          </div>
        ) : null}
        {statusMessage ? <div className="animate-panel-swap mt-2 text-sm text-[#125b50]">{statusMessage}</div> : null}
      </div>

      <div className="h-[300px] overflow-y-auto pr-1">
        {error ? (
          <div className="rounded-[24px] border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">{error}</div>
        ) : loading ? (
          <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50/70 px-4 py-5 text-sm text-slate-500">
            Scanning `skills` and `.skills` for file and folder skills...
          </div>
        ) : entries.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50/70 px-4 py-5 text-sm text-slate-500">
            No skills found under `skills/` or `.skills/`.
          </div>
        ) : (
          <div className="grid gap-3">
            {(["skills", ".skills"] as const).map((sourceRoot, sectionIndex) =>
              groupedEntries[sourceRoot]?.length ? (
                <section
                  key={`${sourceRoot}:${lastScannedAt ?? "initial"}`}
                  className="animate-panel-swap rounded-[24px] border border-slate-200 bg-white p-3 shadow-[0_8px_24px_rgba(15,23,42,0.04)]"
                  style={{ animationDelay: `${sectionIndex * 45}ms` }}
                >
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <Sparkles className="h-4 w-4 text-[#1f8a70]" />
                      {formatSourceLabel(sourceRoot)}
                    </div>
                    <div className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                      {groupedEntries[sourceRoot].length} skills
                    </div>
                  </div>
                  <div className="space-y-2">
                    {groupedEntries[sourceRoot].map((entry, index) => (
                      <button
                        key={entry.path}
                        type="button"
                        onClick={() => void requestFilePreview(entry.previewPath, entry.name)}
                        className={[
                          "ui-action animate-enter-soft w-full rounded-[20px] border border-slate-200 bg-slate-50/80 px-4 py-3 text-left transition hover:border-[#1f8a70]/30 hover:bg-white",
                          recentEntryPaths.includes(entry.path) ? "animate-success-flash" : ""
                        ].join(" ")}
                        style={{ animationDelay: `${index * 28}ms` }}
                      >
                        <div className="flex items-center gap-2 text-sm font-semibold tracking-[-0.02em] text-slate-900">
                          {entry.isDirectory ? (
                            <FolderOpen className="h-4 w-4 shrink-0 text-[#1f8a70]" />
                          ) : (
                            <FileText className="h-4 w-4 shrink-0 text-slate-500" />
                          )}
                          <span className="truncate" title={entry.name}>
                            {entry.name}
                          </span>
                        </div>
                        <div className="mt-1 truncate-start text-xs font-semibold uppercase tracking-[0.16em] text-slate-500" title={entry.relativePath}>
                          {entry.relativePath}
                        </div>
                        {entry.isDirectory ? (
                          <div
                            className="mt-1 truncate-start text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1f8a70]"
                            title={entry.previewPath}
                          >
                            Folder skill
                          </div>
                        ) : null}
                      </button>
                    ))}
                  </div>
                </section>
              ) : null
            )}
          </div>
        )}
      </div>
      {importDialog}
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  BookText,
  ChevronDown,
  ChevronRight,
  FileArchive,
  FileCode2,
  FileCog,
  FileImage,
  FileJson2,
  FileSpreadsheet,
  FileTerminal,
  FileText,
  Folder,
  FolderOpen
} from "lucide-react";
import { countMarkdownFiles, getDefaultKnowledgeBasePath, listMarkdownDirectory } from "../../lib/tauri";
import type { DirectoryEntry } from "../../lib/tauri";
import { useAppStore } from "../../state/store";
import type { KnowledgePanelData } from "../../types/support-panel";

type DirectoryTreeState = {
  children: Record<string, DirectoryEntry[]>;
  loading: Record<string, boolean>;
  errors: Record<string, string | undefined>;
};

type KnowledgeBasePanelProps = {
  panel: {
    data?: unknown;
  };
  onPatch: (patch: { data?: KnowledgePanelData }) => void;
};

function configuredRootPathFromData(data: unknown) {
  if (typeof data !== "object" || data === null) {
    return "";
  }

  const record = data as Record<string, unknown>;
  return typeof record.rootPath === "string" ? record.rootPath.trim() : "";
}

function iconForEntry(entry: DirectoryEntry) {
  if (entry.isDirectory) {
    return { closed: Folder, open: FolderOpen, className: "text-[#2b6fff]" };
  }

  switch (entry.extension) {
    case "ts":
    case "tsx":
    case "js":
    case "jsx":
    case "rs":
    case "py":
    case "css":
    case "html":
      return { closed: FileCode2, open: FileCode2, className: "text-[#0f766e]" };
    case "json":
    case "yaml":
    case "yml":
    case "toml":
    case "lock":
      return { closed: FileJson2, open: FileJson2, className: "text-[#7c3aed]" };
    case "md":
    case "txt":
      return { closed: FileText, open: FileText, className: "text-[#475569]" };
    case "png":
    case "jpg":
    case "jpeg":
    case "gif":
    case "svg":
    case "webp":
      return { closed: FileImage, open: FileImage, className: "text-[#ea580c]" };
    case "csv":
    case "xlsx":
    case "xls":
      return { closed: FileSpreadsheet, open: FileSpreadsheet, className: "text-[#15803d]" };
    case "sh":
    case "ps1":
    case "bat":
      return { closed: FileTerminal, open: FileTerminal, className: "text-[#0369a1]" };
    case "zip":
    case "tar":
    case "gz":
    case "7z":
      return { closed: FileArchive, open: FileArchive, className: "text-[#b45309]" };
    default:
      return { closed: FileCog, open: FileCog, className: "text-[#64748b]" };
  }
}

export function KnowledgeBasePanel({ panel, onPatch }: KnowledgeBasePanelProps) {
  const requestFilePreview = useAppStore((state) => state.requestFilePreview);
  const configuredRootPath = configuredRootPathFromData(panel.data);
  const [rootPath, setRootPath] = useState("");
  const [markdownCount, setMarkdownCount] = useState<number>();
  const [pathError, setPathError] = useState<string>();
  const [selectingPath, setSelectingPath] = useState(false);
  const [treeState, setTreeState] = useState<DirectoryTreeState>({
    children: {},
    loading: {},
    errors: {}
  });
  const [expandedPaths, setExpandedPaths] = useState<Record<string, boolean>>({});

  const applyRootPath = (path: string) => {
    setRootPath(path);
    setMarkdownCount(undefined);
    setPathError(undefined);
    setExpandedPaths(path ? { [path]: true } : {});
    setTreeState({
      children: {},
      loading: {},
      errors: {}
    });
  };

  const loadDirectory = (path: string) => {
    setTreeState((current) => ({
      ...current,
      loading: {
        ...current.loading,
        [path]: true
      },
      errors: {
        ...current.errors,
        [path]: undefined
      }
    }));

    return listMarkdownDirectory(path)
      .then((entries) => {
        setTreeState((current) => {
          const loading = { ...current.loading };
          delete loading[path];
          return {
            children: {
              ...current.children,
              [path]: entries
            },
            loading,
            errors: {
              ...current.errors,
              [path]: undefined
            }
          };
        });
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "Unable to load knowledge base files.";
        setTreeState((current) => {
          const loading = { ...current.loading };
          delete loading[path];
          return {
            ...current,
            loading,
            errors: {
              ...current.errors,
              [path]: message
            }
          };
        });
      });
  };

  useEffect(() => {
    let cancelled = false;

    if (configuredRootPath) {
      applyRootPath(configuredRootPath);
      return () => {
        cancelled = true;
      };
    }

    void getDefaultKnowledgeBasePath()
      .then((path) => {
        if (cancelled) {
          return;
        }
        applyRootPath(path);
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        setPathError(error instanceof Error ? error.message : "Unable to determine the default knowledge base path.");
      });

    return () => {
      cancelled = true;
    };
  }, [configuredRootPath]);

  useEffect(() => {
    if (!rootPath) {
      return;
    }

    let cancelled = false;
    void loadDirectory(rootPath);
    void countMarkdownFiles(rootPath)
      .then((total) => {
        if (cancelled) {
          return;
        }
        setMarkdownCount(total);
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        setMarkdownCount(undefined);
        setPathError(error instanceof Error ? error.message : "Unable to scan the knowledge base.");
      });

    return () => {
      cancelled = true;
    };
  }, [rootPath]);

  const headline = useMemo(() => {
    if (markdownCount === undefined) {
      return "Counting Markdown files...";
    }
    return `${markdownCount} Markdown file${markdownCount === 1 ? "" : "s"} indexed`;
  }, [markdownCount]);

  const toggleDirectory = (entry: DirectoryEntry) => {
    if (!entry.isDirectory) {
      return;
    }

    setExpandedPaths((current) => ({
      ...current,
      [entry.path]: !current[entry.path]
    }));

    if (treeState.children[entry.path] || treeState.loading[entry.path]) {
      return;
    }
    void loadDirectory(entry.path);
  };

  const handleEntryClick = (entry: DirectoryEntry) => {
    if (entry.isDirectory) {
      toggleDirectory(entry);
      return;
    }

    void requestFilePreview(entry.path, entry.name);
  };

  const handleChangePath = async () => {
    try {
      setSelectingPath(true);
      const selected = await open({
        directory: true,
        multiple: false,
        defaultPath: rootPath || undefined,
        title: "Select Knowledge Base Folder"
      });

      if (typeof selected !== "string" || !selected.trim()) {
        return;
      }

      const nextPath = selected.trim();
      applyRootPath(nextPath);
      onPatch({
        data: {
          rootPath: nextPath
        }
      });
    } catch (error: unknown) {
      setPathError(error instanceof Error ? error.message : "Unable to select a knowledge base folder.");
    } finally {
      setSelectingPath(false);
    }
  };

  const renderEntries = (entries: DirectoryEntry[], depth = 0) =>
    entries.map((entry) => {
      const expanded = !!expandedPaths[entry.path];
      const loading = !!treeState.loading[entry.path];
      const childEntries = treeState.children[entry.path] ?? [];
      const error = treeState.errors[entry.path];
      const IconSet = iconForEntry(entry);
      const Icon = expanded && entry.isDirectory ? IconSet.open : IconSet.closed;

      return (
        <div key={entry.path} className="grid gap-1">
          <button
            type="button"
            onClick={() => handleEntryClick(entry)}
            className={[
              "ui-action group flex w-full min-w-0 items-center gap-2 rounded-xl border border-transparent px-2 py-1.5 text-left transition",
              entry.isDirectory ? "hover:border-slate-200 hover:bg-white" : "hover:bg-white/80"
            ].join(" ")}
            style={{ paddingLeft: `${depth * 14 + 8}px` }}
          >
            <div className="flex h-4 w-4 shrink-0 items-center justify-center text-slate-400">
              {entry.isDirectory ? (
                expanded ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )
              ) : null}
            </div>
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-white shadow-[inset_0_0_0_1px_rgba(148,163,184,0.16)]">
              <Icon className={["h-4.5 w-4.5", IconSet.className].join(" ")} />
            </div>
            <div className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{entry.name}</div>
          </button>
          {entry.isDirectory && expanded ? (
            <div className="grid gap-1">
              {loading ? (
                <div
                  className="rounded-2xl border border-dashed border-slate-200 bg-white/70 px-3 py-2 text-sm text-slate-500"
                  style={{ marginLeft: `${depth * 14 + 34}px` }}
                >
                  Loading...
                </div>
              ) : null}
              {error ? (
                <div
                  className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
                  style={{ marginLeft: `${depth * 14 + 34}px` }}
                >
                  {error}
                </div>
              ) : null}
              {!loading && !error && childEntries.length === 0 ? (
                <div
                  className="rounded-2xl border border-dashed border-slate-200 bg-white/70 px-3 py-2 text-sm text-slate-400"
                  style={{ marginLeft: `${depth * 14 + 34}px` }}
                >
                  No Markdown notes here
                </div>
              ) : null}
              {!loading && !error ? renderEntries(childEntries, depth + 1) : null}
            </div>
          ) : null}
        </div>
      );
    });

  return (
    <div className="flex min-h-[440px] flex-1 flex-col">
      <div className="mb-4 rounded-[24px] border border-slate-200 bg-[linear-gradient(135deg,rgba(95,39,205,0.10),rgba(179,136,255,0.04))] p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-[#7d47db] shadow-[inset_0_0_0_1px_rgba(125,71,219,0.08)]">
              <BookText className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold tracking-[-0.02em] text-slate-900">Obsidian Vault</div>
              <div className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                {headline}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleChangePath()}
            disabled={selectingPath}
            className="ui-action inline-flex shrink-0 items-center gap-2 rounded-pill border border-[#7d47db]/20 bg-white px-4 py-2 text-sm font-semibold text-[#6d34d1] transition hover:border-[#7d47db]/40 hover:bg-[#f6f0ff] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <FolderOpen className="h-4 w-4" />
            Change path
          </button>
        </div>
        <div key={rootPath || "default"} className="animate-panel-swap mt-3 rounded-[20px] border border-white/70 bg-white/80 px-3 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Vault path</div>
          <div className="mt-1 truncate-start text-sm text-slate-600" title={rootPath}>
            {rootPath || "Resolving default knowledge base path..."}
          </div>
        </div>
      </div>

      <div key={rootPath || "empty"} className="terminal-scrollbar animate-panel-swap h-[300px] overflow-y-auto pr-1">
        {pathError ? (
          <div className="rounded-[24px] border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">{pathError}</div>
        ) : !rootPath ? (
          <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50/70 px-4 py-5 text-sm text-slate-500">
            Resolving the default Obsidian Vault path...
          </div>
        ) : treeState.errors[rootPath] ? (
          <div className="rounded-[22px] border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">
            {treeState.errors[rootPath]}
          </div>
        ) : treeState.loading[rootPath] ? (
          <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50/70 px-4 py-5 text-sm text-slate-500">
            Loading knowledge base files...
          </div>
        ) : (treeState.children[rootPath] ?? []).length === 0 ? (
          <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50/70 px-4 py-5 text-sm text-slate-500">
            No Markdown files found in this knowledge base.
          </div>
        ) : (
          <div className="grid gap-1">{renderEntries(treeState.children[rootPath] ?? [])}</div>
        )}
      </div>
    </div>
  );
}

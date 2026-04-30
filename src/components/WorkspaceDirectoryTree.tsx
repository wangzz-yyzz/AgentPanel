import { useEffect, useMemo, useRef, useState } from "react";
import {
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
import { listen } from "@tauri-apps/api/event";
import { listDirectory, unwatchWorkspaceDirectory, watchWorkspaceDirectory } from "../lib/tauri";
import { useAppStore } from "../state/store";
import type { DirectoryEntry, WorkspaceFsChangePayload } from "../lib/tauri";

type DirectoryTreeState = {
  children: Record<string, DirectoryEntry[]>;
  loading: Record<string, boolean>;
  errors: Record<string, string | undefined>;
};

type RecentWorkspaceChange = {
  paths: string[];
  happenedAt: number;
};

function normalizePath(path: string) {
  return path.replace(/\\/g, "/").toLowerCase();
}

function isPathRelated(directoryPath: string, changedPath: string) {
  const directory = normalizePath(directoryPath);
  const changed = normalizePath(changedPath);
  return changed.startsWith(`${directory}/`) || changed === directory || directory.startsWith(`${changed}/`);
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
    case "pdf":
      return { closed: FileText, open: FileText, className: "text-[#dc2626]" };
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

function pathTail(path: string) {
  const normalized = path.replace(/\\/g, "/").replace(/\/+$/, "");
  const segments = normalized.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? normalized;
}

function formatElapsed(seconds: number) {
  if (seconds < 10) {
    return "just now";
  }

  if (seconds < 60) {
    return `${seconds}s ago`;
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}min ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function WorkspaceDirectoryTree() {
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const workspaces = useAppStore((state) => state.workspaces);
  const requestFilePreview = useAppStore((state) => state.requestFilePreview);
  const activeWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? workspaces[0],
    [activeWorkspaceId, workspaces]
  );
  const rootPath = activeWorkspace?.path ?? "";

  const [expandedPaths, setExpandedPaths] = useState<Record<string, boolean>>({});
  const [treeState, setTreeState] = useState<DirectoryTreeState>({
    children: {},
    loading: {},
    errors: {}
  });
  const [recentChange, setRecentChange] = useState<RecentWorkspaceChange>();
  const [now, setNow] = useState(() => Date.now());
  const treeChildrenRef = useRef<Record<string, DirectoryEntry[]>>({});

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

    return listDirectory(path)
      .then((entries) => {
        setTreeState((current) => {
          const loading = { ...current.loading };
          delete loading[path];
          const children = {
            ...current.children,
            [path]: entries
          };
          treeChildrenRef.current = children;
          return {
            children,
            loading,
            errors: {
              ...current.errors,
              [path]: undefined
            }
          };
        });
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "Unable to load workspace files.";
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
    if (!rootPath) {
      return;
    }

    setExpandedPaths({ [rootPath]: true });
    treeChildrenRef.current = {};
    setRecentChange(undefined);
    setTreeState({
      children: {},
      loading: {},
      errors: {}
    });
    void loadDirectory(rootPath);
  }, [rootPath]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!rootPath) {
      return;
    }

    void watchWorkspaceDirectory(rootPath);

    let refreshTimer: number | undefined;
    let queuedPaths: string[] = [];

    const disposePromise = listen<WorkspaceFsChangePayload>("workspace://fs-changed", (event) => {
      if (normalizePath(event.payload.rootPath) !== normalizePath(rootPath)) {
        return;
      }

      queuedPaths = [...queuedPaths, ...event.payload.paths];
      setRecentChange({
        paths: Array.from(new Set(event.payload.paths.map((path) => path.replace(/\/+$/, "")))).slice(0, 3),
        happenedAt: Date.now()
      });
      if (refreshTimer) {
        window.clearTimeout(refreshTimer);
      }

      refreshTimer = window.setTimeout(() => {
        const changedPaths = [...queuedPaths];
        queuedPaths = [];
        const candidateDirectories = Object.keys(treeChildrenRef.current).filter((directoryPath) =>
          changedPaths.some((changedPath) => isPathRelated(directoryPath, changedPath))
        );

        const targets = candidateDirectories.length > 0 ? candidateDirectories : [rootPath];
        for (const target of targets) {
          void loadDirectory(target);
        }
      }, 160);
    });

    return () => {
      if (refreshTimer) {
        window.clearTimeout(refreshTimer);
      }
      void disposePromise.then((dispose) => dispose());
      void unwatchWorkspaceDirectory();
    };
  }, [rootPath]);

  const recentChangeLabel = useMemo(() => {
    if (!rootPath) {
      return "No workspace path";
    }

    if (!recentChange) {
      return "Watching for file changes";
    }

    const elapsed = formatElapsed(Math.max(0, Math.floor((now - recentChange.happenedAt) / 1000)));
    const names = recentChange.paths
      .map((path) => pathTail(path))
      .filter((name) => name.length > 0 && normalizePath(name) !== normalizePath(pathTail(rootPath)));

    if (names.length === 0) {
      return `Workspace updated ${elapsed}`;
    }

    if (names.length === 1) {
      return `${names[0]} updated ${elapsed}`;
    }

    if (recentChange.paths.length === 2) {
      return `${names[0]} and ${names[1]} updated ${elapsed}`;
    }

    return `${names[0]}, ${names[1]} +${recentChange.paths.length - 2} updated ${elapsed}`;
  }, [now, recentChange, rootPath]);

  const toggleDirectory = (entry: DirectoryEntry) => {
    if (!entry.isDirectory) {
      return;
    }

    setExpandedPaths((current) => {
      const nextExpanded = !current[entry.path];
      return {
        ...current,
        [entry.path]: nextExpanded
      };
    });

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
                  Empty folder
                </div>
              ) : null}
              {!loading && !error ? renderEntries(childEntries, depth + 1) : null}
            </div>
          ) : null}
        </div>
      );
    });

  return (
    <section className="flex min-h-0 flex-1 flex-col rounded-[26px] border border-slate-200 bg-[radial-gradient(circle_at_top,#ffffff,rgba(244,247,252,0.98)_55%,rgba(235,240,248,0.96))] p-3 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
      <div className="mb-3 min-w-0">
        <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Workspace Files</div>
        <div className="mt-1 truncate text-sm font-medium text-slate-600" title={recentChangeLabel}>
          {recentChangeLabel}
        </div>
        <div className="mt-2 truncate-start text-sm text-slate-500" title={rootPath}>
          {rootPath || "No workspace path"}
        </div>
      </div>
      <div className="terminal-scrollbar min-h-0 flex-1 overflow-y-auto pr-1">
        {!rootPath ? (
          <div className="rounded-[22px] border border-dashed border-slate-200 bg-white/75 px-4 py-5 text-sm text-slate-500">
            Select a workspace to inspect its files.
          </div>
        ) : treeState.errors[rootPath] ? (
          <div className="rounded-[22px] border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">
            {treeState.errors[rootPath]}
          </div>
        ) : treeState.loading[rootPath] ? (
          <div className="rounded-[22px] border border-dashed border-slate-200 bg-white/75 px-4 py-5 text-sm text-slate-500">
            Loading workspace files...
          </div>
        ) : (
          <div className="grid gap-1">{renderEntries(treeState.children[rootPath] ?? [])}</div>
        )}
      </div>
    </section>
  );
}

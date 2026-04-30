import { useEffect } from "react";
import { SquareTerminal } from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import { AppNotificationToast } from "./components/AppNotificationToast";
import { FilePreviewDialog } from "./components/FilePreviewDialog";
import { ProfileManager } from "./components/ProfileManager";
import { WorkspaceRail } from "./components/WorkspaceRail";
import { TerminalDeck } from "./components/TerminalDeck";
import { SupportPanelGrid } from "./components/SupportPanelGrid";
import { useAppStore } from "./state/store";
import type { SessionExitPayload, SessionOutputPayload } from "./types/terminal";

export function App() {
  const appendOutput = useAppStore((state) => state.appendOutput);
  const markExited = useAppStore((state) => state.markExited);
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const workspaces = useAppStore((state) => state.workspaces);
  const profiles = useAppStore((state) => state.profiles);
  const sessions = useAppStore((state) => state.sessions);

  const activeWorkspace = workspaces.find((item) => item.id === activeWorkspaceId) ?? workspaces[0];
  const attachedProfileCount = activeWorkspace?.profileIds.length ?? 0;

  useEffect(() => {
    let mounted = true;

    const setup = async () => {
      const unlistenOutput = await listen<SessionOutputPayload>("pty://output", (event) => {
        if (mounted) {
          appendOutput(event.payload);
        }
      });

      const unlistenExit = await listen<SessionExitPayload>("pty://exit", (event) => {
        if (mounted) {
          markExited(event.payload);
        }
      });

      return () => {
        unlistenOutput();
        unlistenExit();
      };
    };

    const disposer = setup();

    return () => {
      mounted = false;
      void disposer.then((cleanup) => cleanup?.());
    };
  }, [appendOutput, markExited]);

  return (
    <div className="min-h-screen text-brand-dark">
      <div className="mx-auto flex min-h-screen max-w-[1800px] gap-4 px-3 py-3 md:px-5 md:py-4">
        <WorkspaceRail />
        <main className="terminal-scrollbar flex min-h-[calc(100vh-1.5rem)] flex-1 flex-col gap-4 overflow-y-auto pr-1">
          <section
            className="animate-enter flex flex-wrap items-center justify-between gap-3 rounded-[28px] border border-slate-200 bg-white px-4 py-3 shadow-[0_6px_18px_rgba(34,56,110,0.05)]"
            style={{ animationDelay: "40ms" }}
          >
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full border border-brand-blue/15 bg-brand-blue/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-brand-blue">
                  <SquareTerminal className="h-4 w-4" />
                  Operator surface
                </div>
              <div className="mt-2">
                <h1 className="text-2xl font-semibold tracking-[-0.04em] md:text-[2rem]">
                  {activeWorkspace?.name ?? "Workspace"} command center
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  Keep terminals primary. Profiles and workspace notes stay close, but out of the way.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="rounded-pill border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                {sessions.length} live sessions
              </div>
              <div className="rounded-pill border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                {attachedProfileCount}/{profiles.length} attached profiles
              </div>
              <div className="rounded-pill border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                {workspaces.length} workspaces
              </div>
            </div>
          </section>
          <section className="grid flex-1 gap-4">
            <TerminalDeck />
            <SupportPanelGrid />
            <div className="animate-enter" style={{ animationDelay: "180ms" }}>
              <ProfileManager />
            </div>
          </section>
        </main>
      </div>
      <AppNotificationToast />
      <FilePreviewDialog />
    </div>
  );
}

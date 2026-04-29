import { Play, RefreshCcw, Square, TerminalSquare } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAppStore } from "../state/store";
import { TerminalViewport } from "./TerminalViewport";

export function TerminalDeck() {
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const workspaces = useAppStore((state) => state.workspaces);
  const profiles = useAppStore((state) => state.profiles);
  const sessions = useAppStore((state) => state.sessions);
  const activeSessionId = useAppStore((state) => state.activeSessionId);
  const setActiveSession = useAppStore((state) => state.setActiveSession);
  const launchSession = useAppStore((state) => state.launchSession);
  const terminateSession = useAppStore((state) => state.terminateSession);
  const relaunchSession = useAppStore((state) => state.relaunchSession);

  const activeWorkspace = workspaces.find((item) => item.id === activeWorkspaceId);
  const workspaceProfiles = profiles.filter((profile) => activeWorkspace?.profileIds.includes(profile.id));
  const activeSession = sessions.find((item) => item.id === activeSessionId) ?? sessions[0];
  const shouldRenderTerminal = Boolean(activeSession && (activeSession.status !== "error" || activeSession.buffer.length > 0));
  const sessionTabsRef = useRef<HTMLDivElement | null>(null);
  const previousSessionCountRef = useRef(sessions.length);
  const [recentSessionId, setRecentSessionId] = useState<string>();

  useEffect(() => {
    const previousCount = previousSessionCountRef.current;
    const sessionAdded = sessions.length > previousCount;
    previousSessionCountRef.current = sessions.length;

    if (!sessionAdded || !activeSession) {
      return;
    }

    setRecentSessionId(activeSession.id);
    const timer = window.setTimeout(() => {
      setRecentSessionId((current) => (current === activeSession.id ? undefined : current));
    }, 900);

    sessionTabsRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });

    return () => window.clearTimeout(timer);
  }, [activeSession, sessions.length]);

  return (
    <section
      className="animate-enter flex min-h-[640px] min-w-0 flex-col rounded-[28px] border border-[#1b1f29] bg-[#0a0b0d] p-4 text-white shadow-terminal"
      style={{ animationDelay: "80ms" }}
    >
      <div className="relative mb-4 border-b border-white/10 pb-4">
        <div className="flex min-w-0 flex-wrap items-center gap-2 pr-0 lg:pr-[12.5rem]">
          {workspaceProfiles.map((profile) => (
            <button
              type="button"
              key={profile.id}
              onClick={(event) => {
                event.currentTarget.blur();
                void launchSession({
                  profile,
                  workspaceId: activeWorkspaceId,
                  cwd: undefined,
                  title: `${profile.name}`
                });
              }}
              className="ui-action rounded-pill border border-brand-blue/25 bg-[#111318] px-3.5 py-2 text-sm font-semibold text-slate-100 transition hover:border-brand-hover hover:bg-brand-blue hover:text-white"
            >
              <span className="inline-flex items-center gap-2">
                <Play className="h-4 w-4" />
                {profile.name}
              </span>
            </button>
          ))}
          {workspaceProfiles.length === 0 ? (
            <div className="rounded-pill border border-dashed border-white/10 px-4 py-2 text-sm text-slate-400">
              Attach a profile to launch here.
            </div>
          ) : null}
        </div>
        <div className="mt-3 text-xs uppercase tracking-[0.18em] text-slate-500 lg:pr-[12.5rem]">
          PTY-backed tabs with resize, restart, and kill controls
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 lg:absolute lg:right-0 lg:top-0 lg:mt-0 lg:w-auto lg:justify-end">
          <button
            type="button"
            disabled={!activeSession}
            onClick={() => activeSession && void relaunchSession(activeSession.id)}
            className="ui-action rounded-pill border border-white/10 bg-[#111318] px-3.5 py-2 text-sm text-slate-200 transition hover:bg-[#191c22] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span className="inline-flex items-center gap-2">
              <RefreshCcw className="h-4 w-4" />
              Restart
            </span>
          </button>
          <button
            type="button"
            disabled={!activeSession}
            onClick={() => activeSession && void terminateSession(activeSession.id)}
            className="ui-action rounded-pill border border-red-400/20 bg-red-950/30 px-3.5 py-2 text-sm text-red-200 transition hover:bg-red-950/50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span className="inline-flex items-center gap-2">
              <Square className="h-4 w-4" />
              Kill
            </span>
          </button>
        </div>
      </div>
      <div ref={sessionTabsRef} className="mb-3 min-w-0 overflow-x-auto pb-1">
        {sessions.length === 0 ? (
          <div className="flex items-center gap-3 rounded-3xl border border-dashed border-white/15 bg-white/[0.03] px-4 py-3 text-sm text-slate-400">
            <TerminalSquare className="h-4 w-4" />
            No sessions yet. Start a profile to open a PTY-backed terminal.
          </div>
        ) : null}
        <div className="flex min-w-max gap-2">
          {sessions.map((session) => {
            const active = session.id === activeSession?.id;
            return (
              <button
                type="button"
                key={session.id}
                onClick={() => setActiveSession(session.id)}
                className={[
                  "ui-action shrink-0 rounded-full border px-3.5 py-2 text-sm transition",
                  active
                    ? "border-brand-hover bg-brand-blue text-white"
                    : "border-white/10 bg-white/[0.04] text-slate-300 hover:border-white/25 hover:bg-white/[0.08]",
                  recentSessionId === session.id ? "animate-attention" : ""
                ].join(" ")}
              >
                <span className="inline-flex items-center gap-3">
                  <span>{session.title}</span>
                  <span className="text-xs uppercase tracking-[0.22em] opacity-70">{session.status}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
      {activeSession?.status === "error" && activeSession.error ? (
        <div className="mb-3 rounded-[22px] border border-red-400/20 bg-red-950/30 px-4 py-3 text-sm text-red-100">
          <div className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-red-200">Launch error</div>
          <pre className="m-0 whitespace-pre-wrap break-words font-sans select-text">Error: {activeSession.error}</pre>
        </div>
      ) : null}
      <div className="min-h-0 min-w-0 flex-1 overflow-hidden rounded-[28px] border border-white/10 bg-[#050608]">
        {shouldRenderTerminal && activeSession ? (
          <TerminalViewport session={activeSession} />
        ) : (
          <div className="flex h-full items-center justify-center p-6 text-center text-slate-400">
            <div>
              <div className="mb-2 text-base font-semibold text-slate-300">
                {activeSession?.status === "error" ? "Session did not start" : "No active terminal"}
              </div>
              <div className="text-sm">
                {activeSession?.status === "error"
                  ? "Use Restart to retry with the same profile, or Kill to dismiss the failed draft tab."
                  : "Launch a profile to mount an interactive PTY session."}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

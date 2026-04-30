import { ArrowUpRight, Brain, History, Play, RefreshCcw, Sparkles, Square } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "../state/store";
import type { AgentProfile } from "../types/agent";
import type { AgentHistoryEntry } from "../types/terminal";
import { TerminalViewport } from "./TerminalViewport";

function usesTallTerminal(profileId?: string) {
  return profileId === "claude" || profileId === "codex";
}

function waitForNextPaint() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve());
    });
  });
}

function baseTallTerminalHeight() {
  const verticalChrome = window.matchMedia("(min-width: 768px)").matches ? 40 : 32;
  return Math.max(640, Math.floor(window.innerHeight - verticalChrome));
}

function tallTerminalHeightFromScrollAnchor(node: HTMLElement | null, anchor: HTMLElement | null) {
  const baseHeight = baseTallTerminalHeight();
  if (!node || !anchor) {
    return baseHeight;
  }

  const deckRect = node.getBoundingClientRect();
  const anchorRect = anchor.getBoundingClientRect();
  const anchorOffset = Math.max(0, Math.floor(anchorRect.top - deckRect.top));
  return Math.max(640, baseHeight + anchorOffset);
}

function relativeTimeLabel(timestamp: string) {
  const numeric = Number(timestamp);
  const target = Number.isFinite(numeric) ? numeric : Date.parse(timestamp);
  if (Number.isNaN(target)) {
    return "Unknown time";
  }

  const deltaSeconds = Math.round((target - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["day", 60 * 60 * 24],
    ["hour", 60 * 60],
    ["minute", 60],
    ["second", 1]
  ];

  for (const [unit, size] of units) {
    if (Math.abs(deltaSeconds) >= size || unit === "second") {
      return formatter.format(Math.round(deltaSeconds / size), unit);
    }
  }

  return "just now";
}

function historyTone(agentKind: AgentHistoryEntry["agentKind"]) {
  return agentKind === "claude"
    ? {
        badge: "border-white/10 bg-white/[0.06] text-slate-100",
        icon: Brain,
        iconClassName: "text-slate-300"
      }
    : {
        badge: "border-brand-blue/20 bg-brand-blue/10 text-[#c7d8ff]",
        icon: Sparkles,
        iconClassName: "text-brand-hover"
      };
}

function buildResumeLaunch(profile: AgentProfile, entry: AgentHistoryEntry) {
  if (entry.agentKind === "claude") {
    return {
      ...profile,
      args: [...profile.args, "--resume", entry.sessionId]
    };
  }

  return {
    ...profile,
    args: [...profile.args, "resume", entry.sessionId]
  };
}

function HistoryColumn({
  title,
  entries,
  emptyLabel,
  onResume
}: {
  title: string;
  entries: AgentHistoryEntry[];
  emptyLabel: string;
  onResume: (entry: AgentHistoryEntry) => void;
}) {
  return (
    <div className="flex min-w-0 flex-col self-start rounded-[20px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.035),rgba(255,255,255,0.015))] p-2.5">
      <div className="mb-1.5 flex items-center justify-between gap-2 border-b border-white/8 pb-1.5">
        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">{title}</div>
        <div className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
          {entries.length}
        </div>
      </div>
      {entries.length === 0 ? (
        <div className="rounded-[16px] border border-dashed border-white/10 bg-black/10 px-3 py-3 text-xs leading-4 text-slate-500">
          {emptyLabel}
        </div>
      ) : (
        <div className="space-y-1.5">
          {entries.map((entry) => {
            const tone = historyTone(entry.agentKind);
            const Icon = tone.icon;
            return (
              <button
                type="button"
                key={`${entry.agentKind}-${entry.sessionId}`}
                onClick={() => onResume(entry)}
                className="ui-action group w-full rounded-[16px] border border-[#1d2430] bg-[linear-gradient(180deg,#0e1218,rgba(10,11,13,0.98))] px-3 py-2.5 text-left transition hover:border-brand-blue/35 hover:bg-[linear-gradient(180deg,#121826,rgba(12,14,20,0.98))]"
              >
                <div className="flex min-w-0 items-center justify-between gap-1.5">
                  <span
                    className={[
                      "inline-flex shrink-0 items-center gap-1 rounded-pill border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em]",
                      tone.badge
                    ].join(" ")}
                  >
                    <Icon className={["h-3 w-3", tone.iconClassName].join(" ")} />
                    {entry.agentKind === "claude" ? "Claude" : "Codex"}
                  </span>
                  <span className="shrink-0 text-[10px] font-medium text-slate-500">{relativeTimeLabel(entry.updatedAt)}</span>
                </div>
                <div className="mt-1.5 truncate text-[12px] font-semibold leading-4 tracking-[-0.02em] text-slate-100">{entry.title}</div>
                <div className="mt-0.5 flex min-w-0 items-center justify-between gap-2">
                  <div className="truncate font-mono text-[10px] leading-3.5 text-slate-500">{entry.sessionId}</div>
                  <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-hover transition group-hover:text-white">
                    Resume
                    <ArrowUpRight className="h-3 w-3 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function TerminalDeck() {
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const workspaces = useAppStore((state) => state.workspaces);
  const profiles = useAppStore((state) => state.profiles);
  const sessions = useAppStore((state) => state.sessions);
  const agentHistoryByWorkspace = useAppStore((state) => state.agentHistoryByWorkspace);
  const activeSessionId = useAppStore((state) => state.activeSessionId);
  const setActiveSession = useAppStore((state) => state.setActiveSession);
  const launchSession = useAppStore((state) => state.launchSession);
  const terminateSession = useAppStore((state) => state.terminateSession);
  const relaunchSession = useAppStore((state) => state.relaunchSession);
  const refreshAgentHistory = useAppStore((state) => state.refreshAgentHistory);

  const activeWorkspace = workspaces.find((item) => item.id === activeWorkspaceId);
  const workspaceProfiles = profiles.filter((profile) => activeWorkspace?.profileIds.includes(profile.id));
  const activeSession = sessions.find((item) => item.id === activeSessionId) ?? sessions[0];
  const shouldRenderTerminal = Boolean(activeSession && (activeSession.status !== "error" || activeSession.buffer.length > 0));
  const deckRef = useRef<HTMLElement | null>(null);
  const sessionTabsRef = useRef<HTMLDivElement | null>(null);
  const previousSessionCountRef = useRef(sessions.length);
  const [recentSessionId, setRecentSessionId] = useState<string>();
  const [historyRefreshing, setHistoryRefreshing] = useState(false);
  const [pendingTallLaunchProfileId, setPendingTallLaunchProfileId] = useState<string>();
  const [tallTerminalHeight, setTallTerminalHeight] = useState(640);

  const workspaceHistory = agentHistoryByWorkspace[activeWorkspaceId] ?? [];
  const claudeProfile = workspaceProfiles.find((profile) => profile.id === "claude");
  const codexProfile = workspaceProfiles.find((profile) => profile.id === "codex");
  const shouldUseTallTerminal = usesTallTerminal(activeSession?.profile.id) || usesTallTerminal(pendingTallLaunchProfileId);
  const historyProfileAvailable = workspaceProfiles.some((profile) => profile.id === "claude" || profile.id === "codex");
  const historyColumns = useMemo(() => {
    const midpoint = Math.ceil(workspaceHistory.length / 2);
    return [workspaceHistory.slice(0, midpoint), workspaceHistory.slice(midpoint)] as [AgentHistoryEntry[], AgentHistoryEntry[]];
  }, [workspaceHistory]);
  const historyStats = useMemo(() => {
    const claude = workspaceHistory.filter((entry) => entry.agentKind === "claude").length;
    const codex = workspaceHistory.length - claude;
    return {
      total: workspaceHistory.length,
      claude,
      codex,
      latestUpdatedAt: workspaceHistory[0]?.updatedAt
    };
  }, [workspaceHistory]);

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

  useEffect(() => {
    if (!activeWorkspaceId) {
      return;
    }
    void refreshAgentHistory(activeWorkspaceId);
  }, [activeWorkspaceId, refreshAgentHistory]);

  useEffect(() => {
    if (!shouldUseTallTerminal) {
      setTallTerminalHeight(640);
      return;
    }

    const syncHeight = () => {
      const nextHeight = tallTerminalHeightFromScrollAnchor(deckRef.current, sessionTabsRef.current);
      setTallTerminalHeight((current) => (current === nextHeight ? current : nextHeight));
    };

    syncHeight();
    window.addEventListener("resize", syncHeight);
    return () => window.removeEventListener("resize", syncHeight);
  }, [shouldUseTallTerminal]);

  const handleRefreshHistory = async () => {
    setHistoryRefreshing(true);
    try {
      await refreshAgentHistory(activeWorkspaceId);
    } finally {
      window.setTimeout(() => setHistoryRefreshing(false), 280);
    }
  };

  const prepareTerminalLaunch = async (profile: AgentProfile) => {
    if (!usesTallTerminal(profile.id)) {
      return;
    }

    setPendingTallLaunchProfileId(profile.id);
    setTallTerminalHeight(tallTerminalHeightFromScrollAnchor(deckRef.current, sessionTabsRef.current));
    await waitForNextPaint();
    sessionTabsRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
    const delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 180;
    if (delay > 0) {
      await new Promise<void>((resolve) => window.setTimeout(resolve, delay));
    }
  };

  const handleLaunchProfile = async (profile: AgentProfile, title: string, cwd?: string, args?: string[]) => {
    await prepareTerminalLaunch(profile);
    try {
      await launchSession({
        profile: args ? { ...profile, args } : profile,
        workspaceId: activeWorkspaceId,
        cwd,
        title
      });
    } finally {
      setPendingTallLaunchProfileId(undefined);
    }
  };

  const handleResumeHistory = async (entry: AgentHistoryEntry) => {
    const profile = entry.agentKind === "claude" ? claudeProfile : codexProfile;
    if (!profile) {
      return;
    }

    const resumeLaunch = buildResumeLaunch(profile, entry);
    await handleLaunchProfile(profile, `${profile.name} resume`, activeWorkspace?.path, resumeLaunch.args);
  };

  return (
    <section
      ref={deckRef}
      className={[
        "animate-enter flex min-h-0 min-w-0 shrink-0 flex-col rounded-[28px] border border-[#1b1f29] bg-[#0a0b0d] p-4 text-white shadow-terminal transition-[height] duration-300 ease-out",
        shouldUseTallTerminal ? "" : "h-[640px]"
      ].join(" ")}
      style={{
        animationDelay: "80ms",
        height: shouldUseTallTerminal ? `${tallTerminalHeight}px` : undefined
      }}
    >
      <div className="relative mb-4 border-b border-white/10 pb-4">
        <div className="flex min-w-0 flex-wrap items-center gap-2 pr-0 lg:pr-[12.5rem]">
          {workspaceProfiles.map((profile) => (
            <button
              type="button"
              key={profile.id}
              onClick={(event) => {
                event.currentTarget.blur();
                void handleLaunchProfile(profile, `${profile.name}`);
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
          PTY-backed tabs with local conversation history for the current workspace
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 lg:absolute lg:right-0 lg:top-0 lg:mt-0 lg:w-auto lg:justify-end">
          <button
            type="button"
            onClick={() => void handleRefreshHistory()}
            disabled={historyRefreshing}
            className="ui-action rounded-pill border border-white/10 bg-[#111318] px-3.5 py-2 text-sm text-slate-200 transition hover:bg-[#191c22] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span className="inline-flex items-center gap-2">
              <RefreshCcw className={["h-4 w-4", historyRefreshing ? "animate-spin" : ""].join(" ")} />
              History
            </span>
          </button>
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
      <div ref={sessionTabsRef} className="mb-2 min-w-0 overflow-x-auto pb-1">
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
        ) : activeSession?.status === "error" ? (
          <div className="flex h-full items-center justify-center p-6 text-center text-slate-400">
            <div>
              <div className="mb-2 text-base font-semibold text-slate-300">Session did not start</div>
              <div className="text-sm">Use Restart to retry with the same profile, or Kill to dismiss the failed draft tab.</div>
            </div>
          </div>
        ) : (
          <div className="flex h-full min-h-0 flex-col bg-[radial-gradient(circle_at_top_left,rgba(0,82,255,0.18),transparent_28%),linear-gradient(180deg,#07090d,#050608_34%,#080b11)] px-3.5 pb-3.5 pt-3.5 sm:px-4 sm:pb-4 sm:pt-4">
            <div className="mb-2.5 rounded-[20px] border border-white/10 bg-[linear-gradient(135deg,rgba(0,82,255,0.14),rgba(17,19,24,0.92)_36%,rgba(10,11,13,0.98)_100%)] px-3.5 py-2.5 shadow-[0_16px_36px_rgba(0,0,0,0.24)]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="inline-flex items-center gap-1.5 rounded-pill border border-brand-blue/20 bg-brand-blue/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-[#c7d8ff]">
                    <History className="h-3 w-3 text-brand-hover" />
                    Local archive
                  </div>
                  <div className="mt-1.5 text-base font-semibold tracking-[-0.04em] text-white">Recent history</div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <div className="rounded-pill border border-white/10 bg-black/20 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-300">
                    {historyStats.total} entries
                  </div>
                  <div className="rounded-pill border border-white/10 bg-black/20 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-300">
                    {historyStats.claude} claude
                  </div>
                  <div className="rounded-pill border border-brand-blue/20 bg-brand-blue/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#c7d8ff]">
                    {historyStats.codex} codex
                  </div>
                  <div className="rounded-pill border border-white/10 bg-black/20 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                    {historyStats.latestUpdatedAt ? relativeTimeLabel(historyStats.latestUpdatedAt) : "none"}
                  </div>
                </div>
              </div>
            </div>
            <div className="terminal-scrollbar min-h-0 flex-1 overflow-y-auto pr-1">
              <div className="grid min-h-full gap-2.5 lg:grid-cols-2">
                <HistoryColumn
                  title="Newest sessions"
                  entries={historyColumns[0]}
                  emptyLabel={historyProfileAvailable
                    ? "No local Claude or Codex history was found for this workspace path."
                    : "Claude and Codex are not enabled for this workspace."}
                  onResume={(entry) => void handleResumeHistory(entry)}
                />
                <HistoryColumn
                  title="Earlier sessions"
                  entries={historyColumns[1]}
                  emptyLabel={historyProfileAvailable
                    ? "No additional history entries."
                    : "Claude and Codex are not enabled for this workspace."}
                  onResume={(entry) => void handleResumeHistory(entry)}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

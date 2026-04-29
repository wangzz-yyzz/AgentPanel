import { useEffect, useRef } from "react";
import "xterm/css/xterm.css";
import { useXterm } from "../hooks/useXterm";
import { resizeSession, writeSessionInput } from "../lib/tauri";
import { useAppStore } from "../state/store";
import type { SessionRecord } from "../types/terminal";

type TerminalViewportProps = {
  session?: SessionRecord;
};

const terminalOptions = {
  cursorBlink: false,
  fontSize: 13,
  fontFamily: "JetBrains Mono, Consolas, Menlo, Monaco, monospace",
  lineHeight: 1.35,
  theme: {
    background: "#050608",
    foreground: "#eef2ff",
    cursor: "#578bfa",
    selectionBackground: "rgba(87, 139, 250, 0.35)",
    black: "#111318",
    blue: "#5a9cff",
    brightBlue: "#8cb6ff"
  }
} as const;

export function TerminalViewport({ session }: TerminalViewportProps) {
  const syncSessionSize = useAppStore((state) => state.syncSessionSize);
  const { containerRef, fitAddon, terminal } = useXterm({
    options: terminalOptions,
    onData: (data) => {
      const targetSessionId = session?.backendSessionId;
      if (targetSessionId) {
        void writeSessionInput(targetSessionId, data);
      }
    },
    onResize: (cols, rows) => {
      if (session) {
        syncSessionSize(session.id, cols, rows);
      }

      const targetSessionId = session?.backendSessionId;
      if (targetSessionId) {
        void resizeSession(targetSessionId, cols, rows);
      }
    }
  });
  const lastSessionIdRef = useRef<string | undefined>(undefined);
  const lastSizedBackendSessionIdRef = useRef<string | undefined>(undefined);
  const writtenLengthRef = useRef(0);
  const placeholderModeRef = useRef<"none" | "empty" | "starting">("none");

  useEffect(() => {
    if (!terminal.current) {
      return;
    }

    if (!session) {
      return;
    }

    const sessionChanged = lastSessionIdRef.current !== session.id;
    if (sessionChanged) {
      terminal.current.reset();
      lastSessionIdRef.current = session.id;
      lastSizedBackendSessionIdRef.current = undefined;
      writtenLengthRef.current = 0;
      placeholderModeRef.current = "none";
    }

    if (session.buffer.length > writtenLengthRef.current) {
      const chunk = session.buffer.slice(writtenLengthRef.current);
      terminal.current.write(chunk);
      writtenLengthRef.current = session.buffer.length;
      placeholderModeRef.current = "none";
    } else if (sessionChanged && session.status === "starting") {
      terminal.current.writeln("");
      terminal.current.writeln(`  Starting ${session.title}...`);
      placeholderModeRef.current = "starting";
    }

    if (sessionChanged) {
      fitAddon.current?.fit();
      terminal.current.focus();
      syncSessionSize(session.id, terminal.current.cols, terminal.current.rows);
    }

    const backendSessionId = session.backendSessionId;
    const backendSessionReady =
      backendSessionId && lastSizedBackendSessionIdRef.current !== backendSessionId;

    if (backendSessionReady) {
      lastSizedBackendSessionIdRef.current = backendSessionId;
      syncSessionSize(session.id, terminal.current.cols, terminal.current.rows);
      void resizeSession(backendSessionId, terminal.current.cols, terminal.current.rows);
    }
  }, [fitAddon, session, syncSessionSize, terminal]);

  return <div ref={containerRef} className="terminal-viewport h-full w-full p-3" />;
}

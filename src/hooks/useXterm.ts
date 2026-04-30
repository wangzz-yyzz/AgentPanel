import { useEffect, useRef } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal, type ITerminalOptions } from "@xterm/xterm";

interface UseXtermOptions {
  options?: ITerminalOptions;
  onData?: (data: string) => void;
  onResize?: (cols: number, rows: number) => void;
  multilineEnter?: "default" | "line-feed";
}

export function useXterm({ options, onData, onResize, multilineEnter = "default" }: UseXtermOptions) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const onDataRef = useRef(onData);
  const onResizeRef = useRef(onResize);
  const multilineEnterRef = useRef(multilineEnter);
  const lastSizeRef = useRef<{ cols: number; rows: number } | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    onDataRef.current = onData;
  }, [onData]);

  useEffect(() => {
    onResizeRef.current = onResize;
  }, [onResize]);

  useEffect(() => {
    multilineEnterRef.current = multilineEnter;
  }, [multilineEnter]);

  useEffect(() => {
    if (!containerRef.current || terminalRef.current) {
      return;
    }

    const container = containerRef.current;
    const terminal = new Terminal({
      convertEol: false,
      cursorBlink: false,
      fontFamily: "JetBrains Mono, SFMono-Regular, monospace",
      fontSize: 13,
      lineHeight: 1.35,
      letterSpacing: 0.1,
      theme: {
        background: "#0a0b0d",
        foreground: "#f3f6fb",
        cursor: "#0052ff",
        selectionBackground: "rgba(87, 139, 250, 0.35)",
        black: "#0a0b0d",
        blue: "#4a7fff",
        brightBlue: "#78a4ff",
        brightCyan: "#84d4ff",
        brightGreen: "#7ff2ad",
        brightMagenta: "#c7a0ff",
        brightRed: "#ff8d8d",
        brightWhite: "#ffffff",
        brightYellow: "#ffe38a",
        cyan: "#46c5ef",
        green: "#49cf85",
        magenta: "#9f7aea",
        red: "#ff6b6b",
        white: "#f3f6fb",
        yellow: "#f3bb4f",
      },
      ...options,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(container);
    fitAddon.fit();
    terminal.focus();

    const writeSelectionToClipboard = async () => {
      const selection = terminal.getSelection();
      if (!selection || !navigator.clipboard?.writeText) {
        return false;
      }

      try {
        await navigator.clipboard.writeText(selection);
        return true;
      } catch {
        return false;
      }
    };

    const pasteClipboardIntoTerminal = async () => {
      if (!navigator.clipboard?.readText) {
        return;
      }

      try {
        const clipboardText = await navigator.clipboard.readText();
        terminal.paste(clipboardText);
        terminal.focus();
      } catch {
        // Keep the event swallowed; if clipboard access is denied the user can still use context menu paste.
      }
    };

    terminal.attachCustomKeyEventHandler((event) => {
      if (event.type !== "keydown") {
        return true;
      }

      const normalizedKey = event.key.toLowerCase();
      const hasPrimaryModifier = event.ctrlKey || event.metaKey;
      const isCopyShortcut = hasPrimaryModifier && !event.altKey && normalizedKey === "c";
      const isPasteShortcut = hasPrimaryModifier && !event.altKey && normalizedKey === "v";
      const isCtrlInsertCopy = event.ctrlKey && !event.altKey && !event.metaKey && event.key === "Insert";
      const isShiftInsertPaste =
        event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey && event.key === "Insert";
      const isShiftEnterLineFeed =
        multilineEnterRef.current === "line-feed" &&
        event.key === "Enter" &&
        event.shiftKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.metaKey;

      if (isShiftEnterLineFeed) {
        onDataRef.current?.("\n");
        event.preventDefault();
        return false;
      }

      if ((isCopyShortcut || isCtrlInsertCopy) && terminal.hasSelection()) {
        void writeSelectionToClipboard();
        event.preventDefault();
        return false;
      }

      if (isPasteShortcut || isShiftInsertPaste) {
        void pasteClipboardIntoTerminal();
        event.preventDefault();
        return false;
      }

      return true;
    });
    terminal.onData((data) => onDataRef.current?.(data));
    lastSizeRef.current = { cols: terminal.cols, rows: terminal.rows };

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    const handleResize = () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }

      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        fitAddonRef.current?.fit();
        if (!terminalRef.current) {
          return;
        }

        const cols = terminalRef.current.cols;
        const rows = terminalRef.current.rows;
        const previous = lastSizeRef.current;
        lastSizeRef.current = { cols, rows };

        if (!previous || previous.cols !== cols || previous.rows !== rows) {
          onResizeRef.current?.(cols, rows);
        }
      });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        handleResize();
      }
    };

    const handlePointerDown = () => {
      terminalRef.current?.focus();
    };

    window.addEventListener("resize", handleResize);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    container.addEventListener("pointerdown", handlePointerDown);

    const mountTimer = window.setTimeout(() => {
      if (!terminalRef.current) {
        return;
      }
      handleResize();
      terminalRef.current.focus();
    }, 0);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
      window.clearTimeout(mountTimer);
      window.removeEventListener("resize", handleResize);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      container.removeEventListener("pointerdown", handlePointerDown);
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      lastSizeRef.current = null;
    };
  }, [options]);

  return {
    containerRef,
    fitAddon: fitAddonRef,
    terminal: terminalRef,
  };
}

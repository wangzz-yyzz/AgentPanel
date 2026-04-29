# AgentPanel

AgentPanel is a Tauri 2 desktop application for running and managing multiple terminal-native coding agents inside one workspace. It combines a React + TypeScript frontend with a Rust PTY backend so tools such as Codex CLI, Claude Code, or plain shell sessions can live side by side in a single operator surface.

[中文说明 / Chinese README](./README.zh-CN.md)

## Status

This repository is an MVP scaffold. The core desktop flow is in place, but the project is still early and should be treated as a working prototype rather than a stable product release.

## Features

- Multi-session terminal deck backed by real PTY sessions
- Workspace-oriented layout with a primary terminal surface
- Built-in profiles for terminal-native agents and shell commands
- Workspace-scoped profile attachment
- Support panels for TODOs, skills, knowledge snippets, and calendar notes
- Local JSON-backed profile persistence
- Tauri command/event bridge for session create, input, resize, restart, and exit

## Tech Stack

- Desktop shell: Tauri 2
- Frontend: React 18, TypeScript, Vite
- Styling: Tailwind CSS
- Terminal rendering: xterm.js
- Backend: Rust with `portable-pty`
- State management: Zustand

## Project Structure

```text
src/          React UI, state, hooks, and frontend utilities
src-tauri/    Tauri app, Rust backend, PTY/session management
tests/        Small helper scripts and QA support
skills/       Local skill artifacts used by the project workspace
```

## Requirements

- Node.js 20+ recommended
- npm 10+ recommended
- Rust toolchain (`rustup`, `cargo`)
- Platform prerequisites required by Tauri 2 for your OS

On Windows PowerShell, `npm` may be blocked by execution policy if it resolves to `npm.ps1`. If that happens, use `npm.cmd` instead.

## Getting Started

Install dependencies:

```powershell
npm.cmd install
```

Run frontend type checks:

```powershell
npm.cmd run typecheck
```

Run frontend tests:

```powershell
npm.cmd run test
```

Run the frontend development server only:

```powershell
npm.cmd run dev
```

Run the Tauri desktop app in development:

```powershell
npm.cmd run tauri dev
```

Check the Rust backend directly:

```powershell
cd src-tauri
cargo check
```

## Build

Build the frontend bundle:

```powershell
npm.cmd run build
```

The frontend output is written to `dist/`.

Build desktop release bundles:

```powershell
npm.cmd run tauri build
```

Tauri release artifacts are typically generated under `src-tauri/target/release/bundle/`.

## Suggested Pre-Release Checks

Before publishing changes, run:

```powershell
npm.cmd run typecheck
npm.cmd run test
npm.cmd run build
cd src-tauri
cargo check
```

## Notes

- `Cargo.lock` is intentionally kept in the repository because this is an application, not a reusable Rust library.
- `package-lock.json` is also expected to be committed if npm is the installation path you want others to reproduce.
- The current Tauri bundle identifier is `com.agentpanel.app`. That suffix works, but Tauri warns that identifiers ending with `.app` are not ideal for macOS packaging.

## License

No license file is included yet. Add one before making the repository publicly reusable.

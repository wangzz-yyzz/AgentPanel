# AgentPanel

AgentPanel 是一个基于 Tauri 2 的桌面应用，用来在同一个工作区里运行和管理多个终端原生的编码代理。它使用 React + TypeScript 构建前端界面，使用 Rust + PTY 作为后端会话层，因此可以把 Codex CLI、Claude Code、普通 Shell 等会话放在同一个操作界面里统一管理。

[English README](./README.md)

## 项目状态

当前仓库属于 MVP 原型。核心桌面流程已经具备，但整体仍处于早期阶段，更适合作为可运行原型和后续迭代基础，而不是稳定正式版。

## 主要能力

- 基于真实 PTY 会话的多终端标签页
- 以工作区为中心的桌面布局，终端保持主视图
- 内置多种终端代理配置和 Shell 配置
- 工作区级别的 profile 绑定
- TODO、技能、知识片段、日历笔记等辅助面板
- 基于本地 JSON 的 profile 持久化
- 基于 Tauri command / event 的会话创建、输入、缩放、重启和退出

## 技术栈

- 桌面壳：Tauri 2
- 前端：React 18、TypeScript、Vite
- 样式：Tailwind CSS
- 终端渲染：xterm.js
- 后端：Rust + `portable-pty`
- 状态管理：Zustand

## 目录结构

```text
src/          React UI、状态管理、hooks 与前端工具
src-tauri/    Tauri 应用、Rust 后端、PTY/会话管理
tests/        少量辅助脚本与 QA 支持文件
skills/       项目工作区使用的本地 skill 资产
```

## 环境要求

- 建议 Node.js 20+
- 建议 npm 10+
- Rust 工具链：`rustup`、`cargo`
- 目标操作系统下 Tauri 2 所需的原生依赖

如果在 Windows PowerShell 中执行 `npm` 遇到执行策略限制，通常是因为它调用了 `npm.ps1`。这种情况下直接使用 `npm.cmd` 即可。

## 开发与运行

安装依赖：

```powershell
npm.cmd install
```

前端类型检查：

```powershell
npm.cmd run typecheck
```

运行前端测试：

```powershell
npm.cmd run test
```

仅启动前端开发服务器：

```powershell
npm.cmd run dev
```

启动 Tauri 桌面开发版本：

```powershell
npm.cmd run tauri dev
```

单独检查 Rust 后端：

```powershell
cd src-tauri
cargo check
```

## 构建与发布

构建前端产物：

```powershell
npm.cmd run build
```

前端产物会输出到 `dist/`。

构建桌面发布包：

```powershell
npm.cmd run tauri build
```

Tauri 的发布产物通常会出现在 `src-tauri/target/release/bundle/`。

## 建议的发布前检查

在推送或发布前，建议至少执行：

```powershell
npm.cmd run typecheck
npm.cmd run test
npm.cmd run build
cd src-tauri
cargo check
```

## 额外说明

- `Cargo.lock` 建议保留并提交，因为这是应用项目，不是要给别人复用的 Rust 库。
- 如果项目默认使用 npm 安装依赖，`package-lock.json` 也建议一并提交，便于复现依赖树。
- 当前 Tauri 的 bundle identifier 是 `com.agentpanel.app`。它可以工作，但 Tauri 会提示以 `.app` 结尾的 identifier 对 macOS 打包并不理想。

## 许可证

仓库目前还没有 `LICENSE` 文件。如果准备公开到 GitHub 并允许他人使用，最好先补上许可证。

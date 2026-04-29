import type { AgentProfile } from "./agent";

export type SessionStatus = "idle" | "starting" | "running" | "exited" | "error";

export type SessionRecord = {
  id: string;
  backendSessionId?: string;
  title: string;
  workspaceId: string;
  profile: AgentProfile;
  cwd?: string;
  env?: Record<string, string>;
  cols: number;
  rows: number;
  status: SessionStatus;
  buffer: string;
  error?: string;
  exitCode?: number | null;
};

export type CreateSessionInput = {
  profile: AgentProfile;
  workspaceId: string;
  title?: string;
  cwd?: string;
  env?: Record<string, string>;
  cols: number;
  rows: number;
};

export type SessionOutputPayload = {
  sessionId: string;
  chunk: string;
};

export type SessionExitPayload = {
  sessionId: string;
  exitCode: number | null;
};

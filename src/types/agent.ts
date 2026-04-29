export type AgentProfile = {
  id: string;
  name: string;
  command: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
  icon?: string;
  description?: string;
};

export type AgentProfileDraft = {
  id?: string;
  name: string;
  command: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
  icon?: string;
  description?: string;
};

export const BUILTIN_PROFILE_IDS = ["codex", "claude", "shell"] as const;

export function isBuiltinProfile(profileId: string): boolean {
  return BUILTIN_PROFILE_IDS.includes(profileId as (typeof BUILTIN_PROFILE_IDS)[number]);
}

export type WorkspaceSummary = {
  id: string;
  name: string;
  path: string;
  profileIds: string[];
};

export type WorkspaceDraft = {
  id?: string;
  name: string;
  path: string;
  profileIds: string[];
};

import { useEffect, useMemo, useState } from "react";
import { Bot, FolderTree, Plus, Save, ScrollText, Terminal } from "lucide-react";
import { useAppStore } from "../state/store";
import { isBuiltinProfile, type AgentProfile, type AgentProfileDraft } from "../types/agent";

type DraftState = {
  id?: string;
  name: string;
  command: string;
  argsText: string;
  cwd: string;
  envText: string;
  icon: string;
  description: string;
};

const emptyDraft: DraftState = {
  name: "",
  command: "",
  argsText: "",
  cwd: "",
  envText: "",
  icon: "bot",
  description: ""
};

function draftFromProfile(profile?: AgentProfile): DraftState {
  if (!profile) {
    return emptyDraft;
  }

  return {
    id: profile.id,
    name: profile.name,
    command: profile.command,
    argsText: profile.args.join("\n"),
    cwd: profile.cwd ?? "",
    envText: Object.entries(profile.env ?? {})
      .map(([key, value]) => `${key}=${value}`)
      .join("\n"),
    icon: profile.icon ?? "bot",
    description: profile.description ?? ""
  };
}

function parseEnvText(envText: string): Record<string, string> {
  return Object.fromEntries(
    envText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const separatorIndex = line.indexOf("=");
        if (separatorIndex === -1) {
          throw new Error(`Invalid env entry: ${line}`);
        }
        return [line.slice(0, separatorIndex).trim(), line.slice(separatorIndex + 1).trim()] as const;
      })
      .filter(([key]) => key)
  );
}

function buildProfileDraft(draft: DraftState): AgentProfileDraft {
  return {
    id: draft.id,
    name: draft.name,
    command: draft.command,
    args: draft.argsText
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean),
    cwd: draft.cwd,
    env: draft.envText.trim() ? parseEnvText(draft.envText) : undefined,
    icon: draft.icon,
    description: draft.description
  };
}

function ProfileCard({
  profile,
  active,
  onSelect
}: {
  profile: AgentProfile;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={[
        "w-full rounded-[24px] border p-4 text-left transition",
        active
          ? "border-brand-blue bg-brand-blue text-white shadow-[0_10px_24px_rgba(0,82,255,0.18)]"
          : "border-slate-200/80 bg-white hover:border-brand-blue/30 hover:bg-brand-surface"
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="truncate text-base font-semibold">{profile.name}</div>
            <span
              className={[
                "rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]",
                isBuiltinProfile(profile.id)
                  ? active
                    ? "bg-white/15 text-blue-100"
                    : "bg-slate-100 text-slate-500"
                  : active
                    ? "bg-white/15 text-blue-100"
                    : "bg-emerald-50 text-emerald-700"
              ].join(" ")}
            >
              {isBuiltinProfile(profile.id) ? "Built-in" : "User"}
            </span>
          </div>
          <div className={active ? "mt-2 text-sm text-blue-100" : "mt-2 text-sm text-slate-500"}>{profile.command}</div>
        </div>
        <div
          className={[
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl",
            active ? "bg-white/15 text-white" : "bg-slate-100 text-slate-500"
          ].join(" ")}
        >
          <Terminal className="h-4 w-4" />
        </div>
      </div>
      <div className={active ? "mt-3 line-clamp-2 text-sm text-blue-100" : "mt-3 line-clamp-2 text-sm text-slate-500"}>
        {profile.description ?? "No description"}
      </div>
    </button>
  );
}

export function ProfileManager() {
  const profiles = useAppStore((state) => state.profiles);
  const workspaces = useAppStore((state) => state.workspaces);
  const loadingProfiles = useAppStore((state) => state.loadingProfiles);
  const profileError = useAppStore((state) => state.profileError);
  const saveUserProfile = useAppStore((state) => state.saveUserProfile);
  const toggleWorkspaceProfile = useAppStore((state) => state.toggleWorkspaceProfile);

  const [selectedProfileId, setSelectedProfileId] = useState<string>();
  const [draft, setDraft] = useState<DraftState>(emptyDraft);
  const [editorMode, setEditorMode] = useState<"view" | "create" | "edit">("view");
  const [saveError, setSaveError] = useState<string>();
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === selectedProfileId) ?? profiles[0],
    [profiles, selectedProfileId]
  );

  useEffect(() => {
    if (!selectedProfileId && profiles[0]) {
      setSelectedProfileId(profiles[0].id);
    }
  }, [profiles, selectedProfileId]);

  useEffect(() => {
    if (editorMode === "view") {
      setDraft(draftFromProfile(selectedProfile));
      setSaveError(undefined);
      setSaveState("idle");
    }
  }, [editorMode, selectedProfile]);

  const readOnly = editorMode === "view";

  const handleSave = async () => {
    setSaveError(undefined);
    setSaveState("saving");
    try {
      const profile = await saveUserProfile(buildProfileDraft(draft));
      setSelectedProfileId(profile.id);
      setEditorMode("view");
      setSaveState("saved");
    } catch (error) {
      setSaveState("idle");
      setSaveError(error instanceof Error ? error.message : "Unable to save profile.");
    }
  };

  return (
    <section className="grid gap-4 xl:grid-cols-2">
      <article className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_6px_18px_rgba(34,56,110,0.05)]">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Profiles</div>
            <h2 className="mt-1 text-xl font-semibold tracking-[-0.03em]">Agent profile registry</h2>
            <p className="mt-1 text-sm text-slate-500">Launch settings and workspace attachment.</p>
          </div>
          <button
            onClick={() => {
              setEditorMode("create");
              setDraft(emptyDraft);
              setSaveError(undefined);
              setSaveState("idle");
            }}
            className="inline-flex items-center gap-2 rounded-pill border border-brand-blue/15 bg-brand-surface px-4 py-2 text-sm font-semibold text-brand-blue transition hover:bg-brand-hover hover:text-white"
          >
            <Plus className="h-4 w-4" />
            New profile
          </button>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3">
          <div className="rounded-3xl bg-slate-50 px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Available</div>
            <div className="mt-1 text-2xl font-semibold tracking-[-0.04em]">{profiles.length}</div>
          </div>
          <div className="rounded-3xl bg-slate-50 px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Custom</div>
            <div className="mt-1 text-2xl font-semibold tracking-[-0.04em]">
              {profiles.filter((profile) => !isBuiltinProfile(profile.id)).length}
            </div>
          </div>
        </div>

        {profileError ? (
          <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{profileError}</div>
        ) : null}

        <div className="grid max-h-[420px] gap-3 overflow-auto pr-1">
          {loadingProfiles ? <div className="rounded-3xl border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500">Loading profiles...</div> : null}
          {!loadingProfiles &&
            profiles.map((profile) => (
              <ProfileCard
                key={profile.id}
                profile={profile}
                active={profile.id === selectedProfile?.id && editorMode !== "create"}
                onSelect={() => {
                  setSelectedProfileId(profile.id);
                  setEditorMode("view");
                }}
              />
            ))}
        </div>
      </article>

      <article className="rounded-[28px] border border-[#1b1f29] bg-[#0a0b0d] p-4 text-white shadow-terminal">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Inspector</div>
            <h2 className="mt-1 text-xl font-semibold tracking-[-0.03em]">
              {editorMode === "create" ? "Create user profile" : selectedProfile?.name ?? "Profile details"}
            </h2>
          </div>
          {selectedProfile && editorMode === "view" ? (
            <button
              onClick={() => {
                setEditorMode("edit");
                setDraft(draftFromProfile(selectedProfile));
                setSaveError(undefined);
                setSaveState("idle");
              }}
              className="rounded-pill border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-white/[0.12]"
            >
              Edit profile
            </button>
          ) : null}
        </div>

        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-2 text-sm">
              <span className="text-slate-300">Profile name</span>
              <input
                value={draft.name}
                readOnly={readOnly}
                onChange={(event) => setDraft((state) => ({ ...state, name: event.target.value }))}
                className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-brand-hover"
                placeholder="Deployment shell"
              />
            </label>
            <label className="grid gap-2 text-sm">
              <span className="text-slate-300">Icon</span>
              <select
                value={draft.icon}
                disabled={readOnly}
                onChange={(event) => setDraft((state) => ({ ...state, icon: event.target.value }))}
                className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-white outline-none transition focus:border-brand-hover disabled:cursor-not-allowed disabled:opacity-70"
              >
                <option value="bot">Bot</option>
                <option value="terminal">Terminal</option>
                <option value="sparkles">Codex</option>
                <option value="brain">Claude</option>
              </select>
            </label>
          </div>

          <label className="grid gap-2 text-sm">
            <span className="text-slate-300">Description</span>
            <textarea
              value={draft.description}
              readOnly={readOnly}
              onChange={(event) => setDraft((state) => ({ ...state, description: event.target.value }))}
              rows={2}
              className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-brand-hover"
              placeholder="What this profile is for and when to launch it."
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-2 text-sm">
              <span className="text-slate-300">Command</span>
              <input
                value={draft.command}
                readOnly={readOnly}
                onChange={(event) => setDraft((state) => ({ ...state, command: event.target.value }))}
                className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-brand-hover"
                placeholder="powershell"
              />
            </label>
            <label className="grid gap-2 text-sm">
              <span className="text-slate-300">Working directory</span>
              <input
                value={draft.cwd}
                readOnly={readOnly}
                onChange={(event) => setDraft((state) => ({ ...state, cwd: event.target.value }))}
                className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-brand-hover"
                placeholder="E:\\front\\AgentPanel"
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-2 text-sm">
              <span className="inline-flex items-center gap-2 text-slate-300">
                <ScrollText className="h-4 w-4" />
                Args, one per line
              </span>
              <textarea
                value={draft.argsText}
                readOnly={readOnly}
                onChange={(event) => setDraft((state) => ({ ...state, argsText: event.target.value }))}
                rows={6}
                className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 font-mono text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-brand-hover"
                placeholder={"-NoLogo\n-Command\nnpm run dev"}
              />
            </label>
            <label className="grid gap-2 text-sm">
              <span className="inline-flex items-center gap-2 text-slate-300">
                <FolderTree className="h-4 w-4" />
                Env, `KEY=value`
              </span>
              <textarea
                value={draft.envText}
                readOnly={readOnly}
                onChange={(event) => setDraft((state) => ({ ...state, envText: event.target.value }))}
                rows={6}
                className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 font-mono text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-brand-hover"
                placeholder={"OPENAI_API_KEY=...\nNODE_ENV=development"}
              />
            </label>
          </div>

          {selectedProfile && editorMode !== "create" ? (
            <div className="grid gap-3 rounded-[24px] border border-white/10 bg-white/[0.04] p-4 text-sm text-slate-300 sm:grid-cols-3">
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Id</div>
                <div className="break-all">{selectedProfile.id}</div>
              </div>
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Launch</div>
                <div className="break-all">{[selectedProfile.command, ...selectedProfile.args].join(" ")}</div>
              </div>
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Mode</div>
                <div className="inline-flex items-center gap-2">
                  <Bot className="h-4 w-4" />
                  {isBuiltinProfile(selectedProfile.id) ? "Built-in profile" : "User-defined profile"}
                </div>
              </div>
            </div>
          ) : null}

          {selectedProfile && editorMode !== "create" ? (
            <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
              <div className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Workspace attachment
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {workspaces.map((workspace) => {
                  const attached = workspace.profileIds.includes(selectedProfile.id);
                  return (
                    <label
                      key={workspace.id}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-2.5 text-sm text-slate-200"
                    >
                      <div>
                        <div className="font-semibold">{workspace.name}</div>
                        <div className="text-xs text-slate-500">{workspace.path}</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={attached}
                        onChange={() => toggleWorkspaceProfile(workspace.id, selectedProfile.id)}
                        className="h-4 w-4 accent-[#0052ff]"
                      />
                    </label>
                  );
                })}
              </div>
            </div>
          ) : null}

          {editorMode === "create" || editorMode === "edit" ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
              <div className="text-sm text-slate-300">
                {saveError ? (
                  <span className="text-red-300">{saveError}</span>
                ) : saveState === "saved" ? (
                  <span className="text-emerald-300">Profile saved.</span>
                ) : (
                  "Profile changes are saved immediately to the shared profile config."
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setEditorMode("view");
                    setDraft(draftFromProfile(selectedProfile));
                  }}
                  className="rounded-pill border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.12]"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void handleSave()}
                  disabled={saveState === "saving"}
                  className="inline-flex items-center gap-2 rounded-pill border border-brand-hover bg-brand-blue px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Save className="h-4 w-4" />
                  {saveState === "saving" ? "Saving..." : "Save profile"}
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-[24px] border border-dashed border-white/10 bg-white/[0.03] px-4 py-4 text-sm text-slate-400">
              Select a profile to edit it, or create a new one.
            </div>
          )}
        </div>
      </article>
    </section>
  );
}

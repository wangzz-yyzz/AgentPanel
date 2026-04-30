import { describe, expect, it } from "vitest";
import {
  createDefaultWorkspaceSupportPanels,
  hydrateSupportPanelsState,
  upsertWorkspaceSupportPanels
} from "./support-panels";
import type { CalendarPanelData, SupportPanelsState, TodoPanelData } from "../types/support-panel";

describe("support panels helpers", () => {
  it("creates default builtin panels", () => {
    const panels = createDefaultWorkspaceSupportPanels("workspace-core");

    expect(panels.builtinPanels.todo.title).toBe("TODO");
    expect((panels.builtinPanels.todo.data as TodoPanelData | undefined)?.tasks.length).toBeGreaterThan(0);
    expect((panels.builtinPanels.calendar.data as CalendarPanelData | undefined)?.view).toBe("calendar");
  });

  it("upserts workspace support panels", () => {
    const next = upsertWorkspaceSupportPanels({}, "workspace-core", (current) => ({
      ...current,
      builtinPanels: {
        ...current.builtinPanels,
        todo: {
          ...current.builtinPanels.todo,
          title: "Updated TODO"
        }
      }
    }));

    expect(next["workspace-core"].builtinPanels.todo.title).toBe("Updated TODO");
  });

  it("hydrates stored support panels without resetting legacy todo and calendar content", () => {
    const legacyState = {
      "workspace-core": {
        builtinPanels: {
          todo: {
            kind: "todo",
            title: "TODO",
            description: "Legacy tasks",
            content: "- Legacy task",
            accentClassName: "from-[#0f6cfe] via-[#2c8dff] to-[#73b4ff]"
          },
          calendar: {
            kind: "calendar",
            title: "Calendar Notes",
            description: "Legacy notes",
            content: "Legacy calendar note",
            accentClassName: "from-[#ff7a18] via-[#ff9f45] to-[#ffd166]"
          },
          skills: {
            kind: "skills",
            title: "Skills",
            description: "Workspace skills",
            content: "- release-checklist",
            accentClassName: "from-[#125b50] via-[#1f8a70] to-[#5fcf80]"
          },
          knowledge: {
            kind: "knowledge",
            title: "Knowledge Base",
            description: "Vault path",
            content: "",
            accentClassName: "from-[#5f27cd] via-[#7d47db] to-[#b388ff]",
            data: {
              rootPath: "C:/vault"
            }
          }
        },
        customPanels: [],
        registry: [],
        registryPath: "./extensions/local/workspace-core.panels.json"
      }
    } as unknown as SupportPanelsState;

    const hydrated = hydrateSupportPanelsState(
      ["workspace-core", "workspace-next"],
      legacyState
    );

    const todoData = hydrated["workspace-core"].builtinPanels.todo.data as TodoPanelData;
    const calendarData = hydrated["workspace-core"].builtinPanels.calendar.data as CalendarPanelData;
    const nextWorkspaceTodoData = hydrated["workspace-next"].builtinPanels.todo.data as TodoPanelData;
    const nextWorkspaceCalendarData = hydrated["workspace-next"].builtinPanels.calendar.data as CalendarPanelData;
    const nextWorkspaceKnowledgeData = hydrated["workspace-next"].builtinPanels.knowledge.data as
      | { rootPath?: string }
      | undefined;

    expect(todoData.tasks).toHaveLength(1);
    expect(todoData.tasks[0]?.title).toBe("Legacy task");
    expect(calendarData.notes).toHaveLength(1);
    expect(calendarData.notes[0]?.content).toBe("Legacy calendar note");
    expect(nextWorkspaceTodoData.tasks.map((task) => task.title)).not.toContain("Legacy task");
    expect(nextWorkspaceCalendarData.notes[0]?.content).toBe("Legacy calendar note");
    expect(nextWorkspaceKnowledgeData?.rootPath).toBe("C:/vault");
  });
});

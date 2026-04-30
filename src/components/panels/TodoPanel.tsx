import {
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  Clock3,
  GripVertical,
  Plus,
  Trash2,
  X
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  BuiltinSupportPanelState,
  TodoPanelData,
  TodoTaskFilter,
  TodoTaskPriority,
  TodoTaskRecord
} from "../../types/support-panel";

type TodoPanelProps = {
  panel: BuiltinSupportPanelState;
  onPatch: (patch: Partial<BuiltinSupportPanelState>) => void;
};

type PrioritySelectorProps = {
  value: TodoTaskPriority;
  onChange: (value: TodoTaskPriority) => void;
  compact?: boolean;
};

type DeadlineControlProps = {
  value: string;
  onChange: (value: string) => void;
  compact?: boolean;
};

type PriorityBadgeProps = {
  value: TodoTaskPriority;
};

const filterOptions: Array<{ value: TodoTaskFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "done", label: "Done" }
];

const priorityOptions: Array<{
  value: TodoTaskPriority;
  label: string;
  dotClassName: string;
  toneClassName: string;
}> = [
  { value: "high", label: "High", dotClassName: "bg-red-500", toneClassName: "border-red-200 bg-red-50 text-red-700" },
  {
    value: "medium",
    label: "Medium",
    dotClassName: "bg-amber-500",
    toneClassName: "border-amber-200 bg-amber-50 text-amber-700"
  },
  {
    value: "low",
    label: "Low",
    dotClassName: "bg-emerald-500",
    toneClassName: "border-emerald-200 bg-emerald-50 text-emerald-700"
  }
];

function priorityOptionFor(value: TodoTaskPriority) {
  return priorityOptions.find((option) => option.value === value) ?? priorityOptions[1];
}

function buildTodoContent(data: TodoPanelData) {
  return data.tasks
    .map((task) => {
      const parts = [`${task.completed ? "[x]" : "[ ]"} ${task.title}`];
      parts.push(`priority:${task.priority}`);
      if (task.dueDate) {
        parts.push(`due:${task.dueDate}`);
      }
      return parts.join(" | ");
    })
    .join("\n");
}

function moveTask(tasks: TodoTaskRecord[], draggedId: string, targetId: string) {
  const draggedIndex = tasks.findIndex((task) => task.id === draggedId);
  const targetIndex = tasks.findIndex((task) => task.id === targetId);
  if (draggedIndex === -1 || targetIndex === -1 || draggedIndex === targetIndex) {
    return tasks;
  }

  const next = [...tasks];
  const [draggedTask] = next.splice(draggedIndex, 1);
  next.splice(targetIndex, 0, draggedTask);
  return next;
}

function normalizeTaskTitle(title: string) {
  const trimmed = title.trim();
  return trimmed || "Untitled task";
}

function dueDateDeadline(value: string) {
  if (!value) {
    return null;
  }

  if (value.includes("T")) {
    const [datePart, timePart] = value.split("T");
    const [year, month, day] = datePart.split("-").map(Number);
    const [hours, minutes] = timePart.split(":").map(Number);
    if (!year || !month || !day || Number.isNaN(hours) || Number.isNaN(minutes)) {
      return null;
    }
    return new Date(year, month - 1, day, hours, minutes, 59, 999);
  }

  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) {
    return null;
  }

  return new Date(year, month - 1, day, 23, 59, 59, 999);
}

function toLocalDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toLocalTimeInputValue(date: Date) {
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${hours}:${minutes}`;
}

function splitDateTimeParts(value: string) {
  if (!value) {
    return {
      date: "",
      time: ""
    };
  }

  if (value.includes("T")) {
    const [date, time = "23:59"] = value.split("T");
    return {
      date,
      time: time.slice(0, 5)
    };
  }

  return {
    date: value,
    time: "23:59"
  };
}

function buildDateTimeValue(date: string, time: string) {
  if (!date) {
    return "";
  }

  return `${date}T${(time || "23:59").slice(0, 5)}`;
}

function formatDueDateValue(value: string) {
  if (!value) {
    return "No deadline";
  }

  const deadline = dueDateDeadline(value);
  if (!deadline) {
    return value.replace("T", " | ");
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  })
    .format(deadline)
    .replace(", ", " | ");
}

function presetInHours(hours: number) {
  const date = new Date();
  date.setHours(date.getHours() + hours);
  date.setSeconds(0, 0);
  return date;
}

function presetTonight() {
  const date = new Date();
  date.setHours(23, 59, 0, 0);
  if (date.getTime() <= Date.now()) {
    date.setDate(date.getDate() + 1);
  }
  return date;
}

function presetTomorrowMorning() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(9, 0, 0, 0);
  return date;
}

function toDateTimeValueFromDate(date: Date) {
  return buildDateTimeValue(toLocalDateInputValue(date), toLocalTimeInputValue(date));
}

function formatRelativeDuration(milliseconds: number) {
  const totalSeconds = Math.max(1, Math.ceil(milliseconds / 1000));
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const totalMinutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  if (totalMinutes < 60) {
    if (remainingSeconds === 0) {
      return `${totalMinutes}min`;
    }
    return `${totalMinutes}min ${remainingSeconds}s`;
  }

  const totalHours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;
  if (totalHours < 24) {
    if (remainingMinutes === 0) {
      return `${totalHours}h`;
    }
    return `${totalHours}h ${remainingMinutes}min`;
  }

  const totalDays = Math.floor(totalHours / 24);
  const remainingHours = totalHours % 24;
  if (remainingHours === 0) {
    return `${totalDays}d`;
  }
  return `${totalDays}d ${remainingHours}h`;
}

function deadlineMeta(task: TodoTaskRecord, now: number) {
  if (!task.dueDate) {
    return {
      label: "No deadline",
      className: "border-slate-200 bg-white text-slate-500"
    };
  }

  if (task.completed) {
    return {
      label: "Completed",
      className: "border-emerald-200 bg-emerald-50 text-emerald-700"
    };
  }

  const deadline = dueDateDeadline(task.dueDate);
  if (!deadline) {
    return {
      label: task.dueDate,
      className: "border-slate-200 bg-white text-slate-500"
    };
  }

  const remaining = deadline.getTime() - now;
  if (remaining <= 0) {
    return {
      label: `Overdue by ${formatRelativeDuration(Math.abs(remaining))}`,
      className: "border-red-200 bg-red-50 text-red-700"
    };
  }

  if (remaining <= 1000 * 60 * 60) {
    return {
      label: `${formatRelativeDuration(remaining)} left`,
      className: "border-red-200 bg-red-50 text-red-700"
    };
  }

  if (remaining <= 1000 * 60 * 60 * 24) {
    return {
      label: `${formatRelativeDuration(remaining)} left`,
      className: "border-amber-200 bg-amber-50 text-amber-700"
    };
  }

  return {
    label: `${formatRelativeDuration(remaining)} left`,
    className: "border-slate-200 bg-white text-slate-500"
  };
}

function PrioritySelector({ value, onChange, compact = false }: PrioritySelectorProps) {
  return (
    <div
      className={[
        "inline-flex min-w-0 items-center gap-1 rounded-pill border border-slate-200 bg-[rgba(255,255,255,0.94)] p-1 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.08)]",
        compact ? "flex-wrap" : "w-full flex-wrap"
      ].join(" ")}
    >
      {priorityOptions.map((option) => {
        const active = option.value === value;

        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={[
              "ui-action inline-flex items-center gap-2 rounded-pill border px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition",
              compact ? "" : "flex-1 justify-center",
              active
                ? "border-brand-blue bg-brand-blue text-white shadow-[0_10px_22px_rgba(0,82,255,0.18)]"
                : "border-transparent bg-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-900"
            ].join(" ")}
          >
            <span className={["h-2 w-2 rounded-full", active ? "bg-white/80" : option.dotClassName].join(" ")} />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function PriorityBadge({ value }: PriorityBadgeProps) {
  const option = priorityOptionFor(value);

  return (
    <div
      className={[
        "inline-flex items-center gap-2 rounded-pill border px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em]",
        option.toneClassName
      ].join(" ")}
    >
      <span className={["h-2 w-2 rounded-full", option.dotClassName].join(" ")} />
      {option.label}
    </div>
  );
}

function DeadlineControl({ value, onChange, compact = false }: DeadlineControlProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const initialParts = splitDateTimeParts(value);
  const [draftDate, setDraftDate] = useState(initialParts.date);
  const [draftTime, setDraftTime] = useState(initialParts.time);

  useEffect(() => {
    if (!open) {
      return;
    }

    const parts = splitDateTimeParts(value);
    setDraftDate(parts.date);
    setDraftTime(parts.time);
  }, [open, value]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  const applyValue = () => {
    onChange(buildDateTimeValue(draftDate, draftTime));
    setOpen(false);
  };

  const setPreset = (date: Date) => {
    const nextValue = toDateTimeValueFromDate(date);
    const parts = splitDateTimeParts(nextValue);
    setDraftDate(parts.date);
    setDraftTime(parts.time);
    onChange(nextValue);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className={["relative min-w-0", compact ? "" : "w-full"].join(" ")}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={[
          "ui-action inline-flex min-w-0 items-center justify-between gap-3 rounded-pill border bg-white text-left transition",
          compact ? "w-auto max-w-full px-3 py-2" : "h-[48px] w-full px-3.5 py-2",
          open
            ? "border-brand-blue shadow-[0_12px_28px_rgba(0,82,255,0.12)]"
            : "border-slate-200 hover:border-brand-blue/30 hover:bg-[#f8fbff]"
        ].join(" ")}
      >
        <span className="flex min-w-0 items-center gap-3">
          <span
            className={[
              "flex shrink-0 items-center justify-center rounded-full bg-[#eef4ff] text-brand-blue",
              compact ? "h-7 w-7" : "h-8 w-8"
            ].join(" ")}
          >
            <CalendarClock className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
          </span>
          <span
            className={[
              "block min-w-0 truncate font-semibold tracking-[-0.02em]",
              value ? "text-slate-900" : "text-slate-500",
              compact ? "text-xs" : "text-sm"
            ].join(" ")}
          >
            {value ? formatDueDateValue(value) : compact ? "Set deadline" : "Choose deadline"}
          </span>
          {!compact ? (
            <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              Deadline
            </span>
          ) : null}
        </span>
        <ChevronDown
          className={[
            "shrink-0 text-slate-400 transition-transform duration-200",
            compact ? "h-3.5 w-3.5" : "h-4 w-4",
            open ? "rotate-180" : ""
          ].join(" ")}
        />
      </button>

      {open ? (
        <div
          className={[
            "animate-pop-in absolute z-20 mt-2 w-[min(340px,calc(100vw-3rem))] rounded-[28px] border border-slate-200 bg-white p-3 shadow-[0_22px_64px_rgba(15,23,42,0.16)]",
            compact ? "right-0" : "left-0"
          ].join(" ")}
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                Deadline editor
              </div>
              <div className="mt-1 text-sm font-semibold tracking-[-0.02em] text-slate-900">
                {draftDate ? formatDueDateValue(buildDateTimeValue(draftDate, draftTime)) : "No deadline selected"}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="ui-action rounded-full border border-slate-200 bg-white p-1.5 text-slate-400 transition hover:border-slate-300 hover:text-slate-700"
              aria-label="Close deadline editor"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="rounded-[22px] border border-slate-200 bg-slate-50 px-3 py-3">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Date</span>
              <input
                type="date"
                value={draftDate}
                onChange={(event) => setDraftDate(event.target.value)}
                className="mt-1 w-full border-none bg-transparent p-0 text-sm font-semibold text-slate-900 outline-none"
              />
            </label>
            <label className="rounded-[22px] border border-slate-200 bg-slate-50 px-3 py-3">
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                <Clock3 className="h-3 w-3" />
                Time
              </span>
              <input
                type="time"
                value={draftTime}
                onChange={(event) => setDraftTime(event.target.value)}
                className="mt-1 w-full border-none bg-transparent p-0 text-sm font-semibold text-slate-900 outline-none"
              />
            </label>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setPreset(presetInHours(1))}
              className="ui-action rounded-pill border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600 transition hover:border-brand-blue/25 hover:text-brand-blue"
            >
              In 1h
            </button>
            <button
              type="button"
              onClick={() => setPreset(presetTonight())}
              className="ui-action rounded-pill border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600 transition hover:border-brand-blue/25 hover:text-brand-blue"
            >
              Tonight
            </button>
            <button
              type="button"
              onClick={() => setPreset(presetTomorrowMorning())}
              className="ui-action rounded-pill border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600 transition hover:border-brand-blue/25 hover:text-brand-blue"
            >
              Tomorrow
            </button>
          </div>

          <div className="mt-3 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                setDraftDate("");
                setDraftTime("");
                onChange("");
                setOpen(false);
              }}
              className="ui-action rounded-pill border border-slate-200 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={applyValue}
              className="ui-action inline-flex items-center gap-2 rounded-pill border border-brand-blue bg-brand-blue px-3.5 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-white transition hover:bg-brand-hover"
            >
              <Check className="h-3.5 w-3.5" />
              Apply
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function TodoPanel({ panel, onPatch }: TodoPanelProps) {
  const data = (panel.data as TodoPanelData | undefined) ?? { tasks: [], filter: "all" };
  const [draftTitle, setDraftTitle] = useState("");
  const [draftPriority, setDraftPriority] = useState<TodoTaskPriority>("medium");
  const [draftDueDate, setDraftDueDate] = useState("");
  const [draggingTaskId, setDraggingTaskId] = useState<string>();
  const [now, setNow] = useState(() => Date.now());
  const [recentTaskIds, setRecentTaskIds] = useState<string[]>([]);
  const [completionPulseTaskId, setCompletionPulseTaskId] = useState<string>();
  const previousTaskIdsRef = useRef<string[]>(data.tasks.map((task) => task.id));

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const previousIds = previousTaskIdsRef.current;
    const nextIds = data.tasks.map((task) => task.id);
    const addedIds = nextIds.filter((id) => !previousIds.includes(id));
    previousTaskIdsRef.current = nextIds;

    if (addedIds.length === 0) {
      return;
    }

    setRecentTaskIds((current) => Array.from(new Set([...current, ...addedIds])));
    const timer = window.setTimeout(() => {
      setRecentTaskIds((current) => current.filter((id) => !addedIds.includes(id)));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [data.tasks]);

  const filteredTasks = useMemo(() => {
    if (data.filter === "open") {
      return data.tasks.filter((task) => !task.completed);
    }
    if (data.filter === "done") {
      return data.tasks.filter((task) => task.completed);
    }
    return data.tasks;
  }, [data.filter, data.tasks]);

  const completedCount = data.tasks.filter((task) => task.completed).length;
  const openCount = data.tasks.length - completedCount;

  const updateData = (nextData: TodoPanelData) => {
    onPatch({
      data: nextData,
      content: buildTodoContent(nextData)
    });
  };

  const updateTask = (taskId: string, patch: Partial<TodoTaskRecord>) => {
    updateData({
      ...data,
      tasks: data.tasks.map((task) => (task.id === taskId ? { ...task, ...patch } : task))
    });
  };

  const addTask = () => {
    const title = draftTitle.trim();
    if (!title) {
      return;
    }

    updateData({
      ...data,
      tasks: [
        ...data.tasks,
        {
          id: `todo-${crypto.randomUUID()}`,
          title,
          priority: draftPriority,
          dueDate: draftDueDate,
          completed: false
        }
      ]
    });
    setDraftTitle("");
    setDraftPriority("medium");
    setDraftDueDate("");
  };

  return (
    <div className="flex min-h-[440px] flex-1 flex-col">
      <div className="mb-4 grid gap-3 rounded-[24px] border border-slate-200 bg-[linear-gradient(135deg,rgba(0,82,255,0.08),rgba(87,139,250,0.02))] p-3">
        <div className="flex flex-wrap items-center gap-2">
          {filterOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => updateData({ ...data, filter: option.value })}
              className={[
                "ui-action rounded-pill border px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition",
                data.filter === option.value
                  ? "border-brand-blue bg-brand-blue text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-brand-blue/25 hover:text-brand-blue"
              ].join(" ")}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="grid gap-2">
          <input
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addTask();
              }
            }}
            className="min-w-0 rounded-pill border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-brand-blue"
            placeholder="Add a new task"
          />
          <div className="flex flex-wrap items-center gap-2 md:flex-nowrap">
            <PrioritySelector value={draftPriority} onChange={setDraftPriority} compact />
            <div className="min-w-0 flex-1">
              <DeadlineControl value={draftDueDate} onChange={setDraftDueDate} />
            </div>
            <button
              type="button"
              onClick={addTask}
              className="ui-action inline-flex shrink-0 items-center justify-center gap-2 rounded-pill border border-brand-blue bg-brand-blue px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-hover"
            >
              <Plus className="h-4 w-4" />
              Add
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
          <div className="rounded-full border border-slate-200 bg-white px-3 py-1.5">{openCount} open</div>
          <div className="rounded-full border border-slate-200 bg-white px-3 py-1.5">{completedCount} done</div>
        </div>
      </div>

      <div className="terminal-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {filteredTasks.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50/70 px-4 py-5 text-sm text-slate-500">
            No tasks in this filter yet.
          </div>
        ) : (
          filteredTasks.map((task, index) => {
            const dueMeta = deadlineMeta(task, now);

            return (
              <div
                key={task.id}
                draggable
                onDragStart={() => setDraggingTaskId(task.id)}
                onDragEnd={() => setDraggingTaskId(undefined)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  if (!draggingTaskId || draggingTaskId === task.id) {
                    return;
                  }
                  updateData({
                    ...data,
                    tasks: moveTask(data.tasks, draggingTaskId, task.id)
                  });
                  setDraggingTaskId(undefined);
                }}
                className={[
                  "animate-enter-soft rounded-[26px] border bg-white px-3 py-3 transition-all duration-300",
                  task.completed
                    ? "border-emerald-200/80 bg-emerald-50/60 shadow-[0_8px_22px_rgba(34,197,94,0.08)]"
                    : "border-slate-200 shadow-[0_8px_24px_rgba(15,23,42,0.04)]",
                  draggingTaskId === task.id ? "scale-[0.985] opacity-70" : "",
                  recentTaskIds.includes(task.id) ? "animate-success-flash" : "",
                  completionPulseTaskId === task.id ? "animate-attention" : ""
                ].join(" ")}
                style={{ animationDelay: `${index * 28}ms` }}
              >
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    className="ui-action mt-1 text-slate-400 transition hover:text-brand-blue"
                    aria-label={`Mark ${task.title} as ${task.completed ? "open" : "done"}`}
                    onClick={() => {
                      setCompletionPulseTaskId(task.id);
                      updateTask(task.id, { completed: !task.completed });
                      window.setTimeout(() => {
                        setCompletionPulseTaskId((current) => (current === task.id ? undefined : current));
                      }, 520);
                    }}
                  >
                    {task.completed ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    ) : (
                      <Circle className="h-5 w-5" />
                    )}
                  </button>

                  <button
                    type="button"
                    className="ui-action mt-1 cursor-grab text-slate-300 transition hover:text-slate-500 active:cursor-grabbing"
                    aria-label={`Drag ${task.title}`}
                  >
                    <GripVertical className="h-4 w-4" />
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className="relative">
                      <input
                        value={task.title}
                        onChange={(event) => updateTask(task.id, { title: event.target.value })}
                        onBlur={(event) => updateTask(task.id, { title: normalizeTaskTitle(event.target.value) })}
                        className={[
                          "w-full border-none bg-transparent p-0 pr-2 text-base font-semibold tracking-[-0.02em] outline-none transition",
                          task.completed ? "text-slate-500" : "text-slate-900"
                        ].join(" ")}
                      />
                      <span
                        className={[
                          "pointer-events-none absolute left-0 top-1/2 h-px -translate-y-1/2 bg-slate-400 transition-[width] duration-300",
                          task.completed ? "w-full" : "w-0"
                        ].join(" ")}
                      />
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <PriorityBadge value={task.priority} />
                      <DeadlineControl
                        value={task.dueDate}
                        onChange={(value) => updateTask(task.id, { dueDate: value })}
                        compact
                      />
                      <div
                        className={[
                          "rounded-pill border px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em]",
                          dueMeta.className
                        ].join(" ")}
                      >
                        {dueMeta.label}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => updateData({ ...data, tasks: data.tasks.filter((item) => item.id !== task.id) })}
                    className="ui-action rounded-full border border-slate-200 bg-white p-2 text-slate-400 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                    aria-label={`Delete ${task.title}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

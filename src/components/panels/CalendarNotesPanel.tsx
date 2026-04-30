import { ChevronLeft, ChevronRight, Eye, FileText, NotebookPen, Save, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getChinaCalendarDayMeta } from "../../lib/china-calendar";
import { MarkdownDocument } from "../MarkdownDocument";
import type {
  BuiltinSupportPanelState,
  CalendarNoteRecord,
  CalendarPanelData,
  CalendarPanelView
} from "../../types/support-panel";

type CalendarNotesPanelProps = {
  panel: BuiltinSupportPanelState;
  onPatch: (patch: Partial<BuiltinSupportPanelState>) => void;
};

type CalendarDayCell = {
  date: string;
  inCurrentMonth: boolean;
  dayOfMonth: number;
};

const viewOptions: Array<{ value: CalendarPanelView; label: string }> = [
  { value: "calendar", label: "Calendar" },
  { value: "list", label: "Notes" }
];

const markdownHelpers = [
  { label: "H1", value: "# Heading" },
  { label: "Bold", value: "**Important**" },
  { label: "List", value: "- Bullet item" },
  { label: "Code", value: "`command`" }
];

function toLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthStartFor(dateString: string) {
  const [year, month] = dateString.split("-").map(Number);
  return new Date(year, month - 1, 1);
}

function shiftMonth(date: Date, delta: number) {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

function buildCalendarGrid(currentMonth: Date): CalendarDayCell[] {
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstDay = new Date(year, month, 1);
  const firstWeekday = firstDay.getDay();
  const gridStart = new Date(year, month, 1 - firstWeekday);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index);
    return {
      date: toLocalDateString(date),
      inCurrentMonth: date.getMonth() === month,
      dayOfMonth: date.getDate()
    };
  });
}

function buildCalendarContent(data: CalendarPanelData) {
  return data.notes
    .map((note) => `${note.date} | ${note.title || "Untitled"} | ${note.content.replace(/\n+/g, " ").trim()}`)
    .join("\n");
}

function formatMonth(date: Date) {
  return new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric"
  }).format(date);
}

function formatLongDate(date: string) {
  return new Intl.DateTimeFormat("en", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(`${date}T00:00:00`));
}

function formatShortDate(date: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric"
  }).format(new Date(`${date}T00:00:00`));
}

function stripMarkdown(text: string) {
  return text
    .replace(/[*_`>#-]/g, " ")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function calendarCellClasses(kind: ReturnType<typeof getChinaCalendarDayMeta>["kind"], inCurrentMonth: boolean, selected: boolean) {
  if (selected) {
    return "border-[#ff7a18] bg-white shadow-[0_10px_22px_rgba(255,122,24,0.16)]";
  }

  if (!inCurrentMonth) {
    if (kind === "holiday") {
      return "border-red-200/70 bg-red-50/70 text-slate-500 hover:border-red-300";
    }
    if (kind === "makeup-workday") {
      return "border-blue-200/70 bg-blue-50/70 text-slate-500 hover:border-blue-300";
    }
    if (kind === "weekend") {
      return "border-amber-200/70 bg-amber-50/60 text-slate-500 hover:border-amber-300";
    }
    return "border-slate-200/70 bg-slate-100/60 text-slate-400 hover:border-slate-300";
  }

  if (kind === "holiday") {
    return "border-red-200 bg-[linear-gradient(180deg,#fff6f4,rgba(255,255,255,0.98))] hover:border-red-300";
  }

  if (kind === "makeup-workday") {
    return "border-blue-200 bg-[linear-gradient(180deg,#f4f9ff,rgba(255,255,255,0.98))] hover:border-blue-300";
  }

  if (kind === "weekend") {
    return "border-amber-200 bg-[linear-gradient(180deg,#fff9ed,rgba(255,255,255,0.98))] hover:border-amber-300";
  }

  return "border-slate-200 bg-white hover:border-[#ff7a18]/30";
}

function holidayBadgeClasses(selected: boolean) {
  return selected
    ? "border-[#ff7a18]/20 bg-[#fff2e9] text-[#c65c0e]"
    : "border-red-200 bg-white/90 text-red-600";
}

export function CalendarNotesPanel({ panel, onPatch }: CalendarNotesPanelProps) {
  const data = (panel.data as CalendarPanelData | undefined) ?? { notes: [], view: "calendar" };
  const today = useMemo(() => toLocalDateString(), []);
  const [selectedDate, setSelectedDate] = useState(() => data.notes[0]?.date ?? today);
  const [currentMonth, setCurrentMonth] = useState(() => monthStartFor(data.notes[0]?.date ?? today));
  const [editorMode, setEditorMode] = useState<"write" | "preview">("write");
  const [editorSourceView, setEditorSourceView] = useState<CalendarPanelView | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");

  const notesByDate = useMemo(() => new Map(data.notes.map((note) => [note.date, note])), [data.notes]);
  const selectedNote = notesByDate.get(selectedDate);
  const sortedNotes = useMemo(
    () => [...data.notes].sort((left, right) => right.date.localeCompare(left.date)),
    [data.notes]
  );
  const monthGrid = useMemo(() => buildCalendarGrid(currentMonth), [currentMonth]);
  const notesThisMonth = data.notes.filter((note) =>
    note.date.startsWith(`${currentMonth.getFullYear()}-${`${currentMonth.getMonth() + 1}`.padStart(2, "0")}`)
  ).length;
  const isEditing = editorSourceView !== null;

  useEffect(() => {
    setDraftTitle(selectedNote?.title ?? "");
    setDraftContent(selectedNote?.content ?? "");
  }, [selectedDate, selectedNote?.content, selectedNote?.title]);

  const updateData = (nextData: CalendarPanelData) => {
    onPatch({
      data: nextData,
      content: buildCalendarContent(nextData)
    });
  };

  const selectDate = (date: string) => {
    setSelectedDate(date);
    setCurrentMonth(monthStartFor(date));
  };

  const openEditor = (date: string, sourceView: CalendarPanelView) => {
    selectDate(date);
    setEditorMode("write");
    setEditorSourceView(sourceView);
  };

  const closeEditor = () => {
    setEditorMode("write");
    setEditorSourceView(null);
  };

  const saveNote = () => {
    const title = draftTitle.trim();
    const content = draftContent.trim();
    if (!title && !content) {
      return;
    }

    const timestamp = new Date().toISOString();
    const existing = notesByDate.get(selectedDate);
    const nextNote: CalendarNoteRecord = {
      id: existing?.id ?? `calendar-note-${crypto.randomUUID()}`,
      date: selectedDate,
      title,
      content,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp
    };

    updateData({
      ...data,
      notes: [...data.notes.filter((note) => note.date !== selectedDate), nextNote].sort((left, right) =>
        left.date.localeCompare(right.date)
      )
    });
  };

  const deleteNote = () => {
    updateData({
      ...data,
      notes: data.notes.filter((note) => note.date !== selectedDate)
    });
    setDraftTitle("");
    setDraftContent("");
  };

  return (
    <div className="flex min-h-[440px] flex-1 flex-col">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-slate-200 bg-[linear-gradient(135deg,rgba(255,122,24,0.12),rgba(255,209,102,0.03))] p-3">
        <div className="flex flex-wrap items-center gap-2">
          {viewOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                closeEditor();
                updateData({ ...data, view: option.value });
              }}
              className={[
                "ui-action rounded-pill border px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition",
                data.view === option.value
                  ? "border-[#ff7a18] bg-[#ff7a18] text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-[#ff7a18]/25 hover:text-[#ff7a18]"
              ].join(" ")}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
          <div className="rounded-full border border-slate-200 bg-white px-3 py-1.5">{notesThisMonth} this month</div>
          <button
            type="button"
            onClick={() => selectDate(today)}
            className="ui-action rounded-full border border-slate-200 bg-white px-3 py-1.5 transition hover:border-brand-blue hover:text-brand-blue"
          >
            Jump to today
          </button>
        </div>
      </div>

      {isEditing ? (
        <div
          key={`editor-${selectedDate}-${editorMode}-${editorSourceView ?? "direct"}`}
          className="animate-panel-swap flex min-h-0 flex-1 flex-col rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)]"
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Selected day</div>
              <div className="mt-1 text-lg font-semibold tracking-[-0.03em] text-slate-900">{formatLongDate(selectedDate)}</div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setEditorMode("write")}
                className={[
                  "ui-action rounded-pill border px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition",
                  editorMode === "write"
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"
                ].join(" ")}
              >
                <span className="inline-flex items-center gap-1.5">
                  <NotebookPen className="h-3.5 w-3.5" />
                  Write
                </span>
              </button>
              <button
                type="button"
                onClick={() => setEditorMode("preview")}
                className={[
                  "ui-action rounded-pill border px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition",
                  editorMode === "preview"
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"
                ].join(" ")}
              >
                <span className="inline-flex items-center gap-1.5">
                  <Eye className="h-3.5 w-3.5" />
                  Preview
                </span>
              </button>
            </div>
          </div>

          <input
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            className="mb-3 rounded-pill border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-[#ff7a18] focus:bg-white"
            placeholder="Note title"
          />

          {editorMode === "write" ? (
            <>
              <div className="mb-3 flex flex-wrap gap-2">
                {markdownHelpers.map((helper) => (
                  <button
                    key={helper.label}
                    type="button"
                    onClick={() => setDraftContent((value) => `${value}${value ? "\n" : ""}${helper.value}`)}
                    className="ui-action rounded-pill border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-slate-600 transition hover:border-[#ff7a18]/30 hover:text-[#ff7a18]"
                  >
                    {helper.label}
                  </button>
                ))}
              </div>
              <textarea
                value={draftContent}
                onChange={(event) => setDraftContent(event.target.value)}
                rows={8}
                className="min-h-[220px] flex-1 resize-none rounded-[24px] border border-slate-200 bg-slate-50/80 px-4 py-4 text-sm leading-6 text-slate-700 outline-none transition focus:border-[#ff7a18] focus:bg-white"
                placeholder="Write notes with simple Markdown..."
              />
            </>
          ) : (
            <div className="terminal-scrollbar min-h-[220px] flex-1 overflow-y-auto rounded-[24px] border border-slate-200 bg-slate-50/80 px-4 py-4">
              <MarkdownDocument markdown={draftContent} />
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
              Markdown supported: GFM tables, task lists, code fences, links, images, blockquotes, raw HTML
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={saveNote}
                className="ui-action inline-flex items-center gap-2 rounded-pill border border-[#ff7a18] bg-[#ff7a18] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#ff9f45]"
              >
                <Save className="h-4 w-4" />
                Save note
              </button>
              <button
                type="button"
                onClick={deleteNote}
                disabled={!selectedNote}
                className="ui-action inline-flex items-center gap-2 rounded-pill border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
              <button
                type="button"
                onClick={closeEditor}
                className="ui-action rounded-pill border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-400 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : data.view === "calendar" ? (
        <div
          key={`calendar-${formatMonth(currentMonth)}`}
          className="animate-panel-swap min-h-0 flex-1 rounded-[24px] border border-slate-200 bg-slate-50/70 p-3"
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setCurrentMonth((value) => shiftMonth(value, -1))}
              className="ui-action rounded-full border border-slate-200 bg-white p-2 text-slate-500 transition hover:border-[#ff7a18] hover:text-[#ff7a18]"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="text-base font-semibold tracking-[-0.02em] text-slate-900">{formatMonth(currentMonth)}</div>
            <button
              type="button"
              onClick={() => setCurrentMonth((value) => shiftMonth(value, 1))}
              className="ui-action rounded-full border border-slate-200 bg-white p-2 text-slate-500 transition hover:border-[#ff7a18] hover:text-[#ff7a18]"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[11px] font-semibold tracking-[0.16em] text-slate-400">
            {["周日", "周一", "周二", "周三", "周四", "周五", "周六"].map((weekday) => (
              <div key={weekday} className="py-1">
                {weekday}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {monthGrid.map((day) => {
              const isSelected = day.date === selectedDate;
              const hasNote = notesByDate.has(day.date);
              const isToday = day.date === today;
              const dayMeta = getChinaCalendarDayMeta(day.date);

              return (
                <button
                  key={day.date}
                  type="button"
                  onClick={() => openEditor(day.date, "calendar")}
                  className={[
                    "ui-action relative min-h-[66px] rounded-[18px] border px-2.5 py-2 text-left transition",
                    calendarCellClasses(dayMeta.kind, day.inCurrentMonth, isSelected)
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div
                        className={[
                          "text-base font-semibold tracking-[-0.02em]",
                          isToday && !isSelected
                            ? "text-brand-blue"
                            : day.inCurrentMonth
                              ? dayMeta.kind === "holiday"
                                ? "text-red-700"
                                : "text-slate-900"
                              : "text-slate-400"
                        ].join(" ")}
                      >
                        {day.dayOfMonth}
                      </div>
                      {dayMeta.holidayLabel ? (
                        <div className="mt-1">
                          <span
                            className={[
                              "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-[0.14em]",
                              holidayBadgeClasses(isSelected)
                            ].join(" ")}
                          >
                            {dayMeta.holidayLabel}
                          </span>
                        </div>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {hasNote ? <span className="h-2.5 w-2.5 rounded-full bg-[#ff7a18]" /> : null}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div key="list-view" className="animate-panel-swap min-h-0 flex-1 rounded-[24px] border border-slate-200 bg-slate-50/70 p-3">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <FileText className="h-4 w-4 text-[#ff7a18]" />
            Saved notes
          </div>
          <div className="terminal-scrollbar space-y-2 overflow-y-auto pr-1">
            {sortedNotes.length === 0 ? (
              <div className="rounded-[18px] border border-dashed border-slate-200 bg-white/80 px-4 py-4 text-sm text-slate-500">
                No notes yet. Pick a day in the calendar view and save one.
              </div>
            ) : (
              sortedNotes.map((note, index) => (
                <button
                  key={note.id}
                  type="button"
                  onClick={() => openEditor(note.date, "list")}
                  className={[
                    "ui-action animate-enter-soft w-full rounded-[20px] border px-4 py-3 text-left transition",
                    note.date === selectedDate
                      ? "border-[#ff7a18] bg-white shadow-[0_10px_20px_rgba(255,122,24,0.12)]"
                      : "border-slate-200 bg-white hover:border-[#ff7a18]/30"
                  ].join(" ")}
                  style={{ animationDelay: `${index * 30}ms` }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-semibold text-slate-900">{note.title || "Untitled note"}</div>
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      {formatShortDate(note.date)}
                    </div>
                  </div>
                  <div className="mt-2 line-clamp-2 text-sm leading-6 text-slate-500">
                    {stripMarkdown(note.content) || "Open to continue writing."}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

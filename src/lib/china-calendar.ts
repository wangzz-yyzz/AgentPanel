export type ChinaDayKind = "holiday" | "makeup-workday" | "weekend" | "workday";

export type ChinaCalendarDayMeta = {
  date: string;
  weekdayIndex: number;
  weekdayLabel: string;
  isWeekend: boolean;
  isWorkday: boolean;
  kind: ChinaDayKind;
  statusLabel: string;
  holidayLabel?: string;
};

type HolidayRange = {
  label: string;
  start: string;
  end: string;
};

type ChinaHolidaySchedule = {
  holidays: HolidayRange[];
  makeupWorkdays: string[];
};

const weekdayLabels = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"] as const;

const chinaHolidaySchedules: Record<number, ChinaHolidaySchedule> = {
  2024: {
    holidays: [
      { label: "元旦", start: "2024-01-01", end: "2024-01-01" },
      { label: "春节", start: "2024-02-10", end: "2024-02-17" },
      { label: "清明节", start: "2024-04-04", end: "2024-04-06" },
      { label: "劳动节", start: "2024-05-01", end: "2024-05-05" },
      { label: "端午节", start: "2024-06-10", end: "2024-06-10" },
      { label: "中秋节", start: "2024-09-15", end: "2024-09-17" },
      { label: "国庆节", start: "2024-10-01", end: "2024-10-07" }
    ],
    makeupWorkdays: ["2024-02-04", "2024-02-18", "2024-04-07", "2024-04-28", "2024-05-11", "2024-09-14", "2024-09-29", "2024-10-12"]
  },
  2025: {
    holidays: [
      { label: "元旦", start: "2025-01-01", end: "2025-01-01" },
      { label: "春节", start: "2025-01-28", end: "2025-02-04" },
      { label: "清明节", start: "2025-04-04", end: "2025-04-06" },
      { label: "劳动节", start: "2025-05-01", end: "2025-05-05" },
      { label: "端午节", start: "2025-05-31", end: "2025-06-02" },
      { label: "国庆/中秋", start: "2025-10-01", end: "2025-10-08" }
    ],
    makeupWorkdays: ["2025-01-26", "2025-02-08", "2025-04-27", "2025-09-28", "2025-10-11"]
  },
  2026: {
    holidays: [
      { label: "元旦", start: "2026-01-01", end: "2026-01-03" },
      { label: "春节", start: "2026-02-15", end: "2026-02-23" },
      { label: "清明节", start: "2026-04-04", end: "2026-04-06" },
      { label: "劳动节", start: "2026-05-01", end: "2026-05-05" },
      { label: "端午节", start: "2026-06-19", end: "2026-06-21" },
      { label: "中秋节", start: "2026-09-25", end: "2026-09-27" },
      { label: "国庆节", start: "2026-10-01", end: "2026-10-07" }
    ],
    makeupWorkdays: ["2026-01-04", "2026-02-14", "2026-02-28", "2026-05-09", "2026-09-20", "2026-10-10"]
  }
};

function toDateParts(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return { year, month, day };
}

function toLocalDate(date: string) {
  const { year, month, day } = toDateParts(date);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function isWithinRange(date: string, range: HolidayRange) {
  return date >= range.start && date <= range.end;
}

function holidayLabelForDate(date: string, schedule?: ChinaHolidaySchedule) {
  if (!schedule) {
    return undefined;
  }

  const matchedRange = schedule.holidays.find((range) => isWithinRange(date, range));
  return matchedRange?.label;
}

export function getChinaCalendarDayMeta(date: string): ChinaCalendarDayMeta {
  const localDate = toLocalDate(date);
  const weekdayIndex = localDate.getDay();
  const weekdayLabel = weekdayLabels[weekdayIndex];
  const isWeekend = weekdayIndex === 0 || weekdayIndex === 6;
  const schedule = chinaHolidaySchedules[localDate.getFullYear()];
  const holidayLabel = holidayLabelForDate(date, schedule);
  const isMakeupWorkday = Boolean(schedule?.makeupWorkdays.includes(date));

  if (holidayLabel) {
    return {
      date,
      weekdayIndex,
      weekdayLabel,
      isWeekend,
      isWorkday: false,
      kind: "holiday",
      statusLabel: "法定假期",
      holidayLabel
    };
  }

  if (isMakeupWorkday) {
    return {
      date,
      weekdayIndex,
      weekdayLabel,
      isWeekend,
      isWorkday: true,
      kind: "makeup-workday",
      statusLabel: "调休上班"
    };
  }

  if (isWeekend) {
    return {
      date,
      weekdayIndex,
      weekdayLabel,
      isWeekend,
      isWorkday: false,
      kind: "weekend",
      statusLabel: "周末"
    };
  }

  return {
    date,
    weekdayIndex,
    weekdayLabel,
    isWeekend: false,
    isWorkday: true,
    kind: "workday",
    statusLabel: "工作日"
  };
}

import { describe, expect, it } from "vitest";
import { getChinaCalendarDayMeta } from "./china-calendar";

describe("china calendar helpers", () => {
  it("marks official holidays with holiday labels", () => {
    expect(getChinaCalendarDayMeta("2025-01-29")).toMatchObject({
      kind: "holiday",
      statusLabel: "法定假期",
      holidayLabel: "春节",
      isWorkday: false
    });

    expect(getChinaCalendarDayMeta("2026-10-03")).toMatchObject({
      kind: "holiday",
      holidayLabel: "国庆节"
    });
  });

  it("marks weekend makeup days as workdays", () => {
    expect(getChinaCalendarDayMeta("2025-01-26")).toMatchObject({
      kind: "makeup-workday",
      statusLabel: "调休上班",
      isWorkday: true
    });

    expect(getChinaCalendarDayMeta("2026-10-10")).toMatchObject({
      kind: "makeup-workday",
      isWorkday: true
    });
  });

  it("marks regular weekends and regular weekdays", () => {
    expect(getChinaCalendarDayMeta("2025-01-25")).toMatchObject({
      kind: "weekend",
      statusLabel: "周末",
      isWorkday: false
    });

    expect(getChinaCalendarDayMeta("2025-01-02")).toMatchObject({
      kind: "workday",
      statusLabel: "工作日",
      isWorkday: true
    });
  });

  it("falls back cleanly for years without official schedule data", () => {
    const weekendMeta = getChinaCalendarDayMeta("2027-05-08");
    expect(weekendMeta).toMatchObject({
      kind: "weekend"
    });
    expect(weekendMeta).not.toHaveProperty("holidayLabel");

    const workdayMeta = getChinaCalendarDayMeta("2027-05-10");
    expect(workdayMeta).toMatchObject({
      kind: "workday"
    });
    expect(workdayMeta).not.toHaveProperty("holidayLabel");
  });
});

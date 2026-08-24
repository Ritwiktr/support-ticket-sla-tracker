import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import {
  addBusinessMinutes,
  businessMinutesBetween,
  snapForwardToBusiness,
} from "../../src/services/sla/businessHours";
import { DEFAULT_BUSINESS_HOURS } from "../../src/services/sla/types";

const TZ = "Asia/Kolkata";
const config = { ...DEFAULT_BUSINESS_HOURS, timezone: TZ };

function at(year: number, month: number, day: number, hour: number, minute = 0): Date {
  const dt = DateTime.fromObject(
    { year, month, day, hour, minute, second: 0, millisecond: 0 },
    { zone: TZ },
  );
  if (!dt.isValid) {
    throw new Error("invalid test datetime");
  }
  return dt.toUTC().toJSDate();
}

function isoLocal(date: Date): string {
  return DateTime.fromJSDate(date, { zone: "utc" }).setZone(TZ).toFormat("yyyy-LL-dd HH:mm");
}

describe("business hours engine", () => {
  it("counts a normal weekday window", () => {
    const start = at(2026, 1, 5, 9, 0); // Monday
    const due = addBusinessMinutes(start, 240, new Set(), config);
    expect(isoLocal(due)).toBe("2026-01-05 13:00");
    expect(businessMinutesBetween(start, due, new Set(), config)).toBe(240);
  });

  it("starts counting at 09:00 when created before business hours", () => {
    const created = at(2026, 1, 5, 7, 0);
    const snapped = snapForwardToBusiness(created, new Set(), config);
    expect(isoLocal(snapped.toUTC().toJSDate())).toBe("2026-01-05 09:00");
    const due = addBusinessMinutes(created, 60, new Set(), config);
    expect(isoLocal(due)).toBe("2026-01-05 10:00");
  });

  it("starts counting next morning when created after business hours", () => {
    const created = at(2026, 1, 5, 20, 0);
    const due = addBusinessMinutes(created, 60, new Set(), config);
    expect(isoLocal(due)).toBe("2026-01-06 10:00");
  });

  it("skips the weekend", () => {
    const saturday = at(2026, 1, 10, 11, 0);
    const sunday = at(2026, 1, 11, 11, 0);
    expect(isoLocal(addBusinessMinutes(saturday, 60, new Set(), config))).toBe("2026-01-12 10:00");
    expect(isoLocal(addBusinessMinutes(sunday, 60, new Set(), config))).toBe("2026-01-12 10:00");
  });

  it("uses only the remaining Friday minute before the weekend", () => {
    const created = at(2026, 1, 9, 17, 59); // Friday
    const plusOne = addBusinessMinutes(created, 1, new Set(), config);
    expect(isoLocal(plusOne)).toBe("2026-01-09 18:00");
    const plusTwo = addBusinessMinutes(created, 2, new Set(), config);
    expect(isoLocal(plusTwo)).toBe("2026-01-12 09:01");
  });

  it("matches the assignment HIGH Friday 17:00 example", () => {
    const created = at(2026, 1, 9, 17, 0);
    const due = addBusinessMinutes(created, 240, new Set(), config);
    expect(isoLocal(due)).toBe("2026-01-12 12:00");
  });

  it("excludes a public holiday from the budget", () => {
    const created = at(2026, 1, 9, 17, 0); // Friday
    const holidays = new Set(["2026-01-12"]); // Monday
    const due = addBusinessMinutes(created, 240, holidays, config);
    expect(isoLocal(due)).toBe("2026-01-13 12:00");
  });

  it("skips weekend plus a Monday holiday", () => {
    const saturday = at(2026, 1, 10, 16, 0);
    const holidays = new Set(["2026-01-12"]);
    const due = addBusinessMinutes(saturday, 60, holidays, config);
    expect(isoLocal(due)).toBe("2026-01-13 10:00");
  });

  it("crosses multiple business days", () => {
    const created = at(2026, 1, 5, 9, 0); // Monday
    // 24 business hours = 2 full days (18h) + 6h → Wednesday 15:00
    const due = addBusinessMinutes(created, 1440, new Set(), config);
    expect(isoLocal(due)).toBe("2026-01-07 15:00");
  });
});

import { DateTime } from "luxon";
import { DEFAULT_BUSINESS_HOURS, type BusinessHoursConfig } from "./types";

const MAX_LOOKAHEAD_DAYS = 4000;

export type HolidaySet = ReadonlySet<string>;

function assertZone(timezone: string): void {
  const probe = DateTime.now().setZone(timezone);
  if (!probe.isValid) {
    throw new Error(`Invalid business timezone: ${timezone}`);
  }
}

export function toHolidayKey(date: Date, timezone: string): string {
  const iso = DateTime.fromJSDate(date, { zone: "utc" }).setZone(timezone).toISODate();
  if (iso === null) {
    throw new Error("Unable to format holiday date");
  }
  return iso;
}

export function holidayKeyFromDateOnly(date: Date): string {
  const iso = DateTime.fromJSDate(date, { zone: "utc" }).toISODate();
  if (iso === null) {
    throw new Error("Unable to format holiday date");
  }
  return iso;
}

function isWeekend(dt: DateTime): boolean {
  return dt.weekday === 6 || dt.weekday === 7;
}

function isHoliday(dt: DateTime, holidays: HolidaySet): boolean {
  const key = dt.toISODate();
  return key !== null && holidays.has(key);
}

export function isBusinessDay(dt: DateTime, holidays: HolidaySet): boolean {
  return !isWeekend(dt) && !isHoliday(dt, holidays);
}

function requireValid(dt: DateTime): DateTime {
  if (!dt.isValid) {
    throw new Error(dt.invalidReason ?? "Invalid DateTime");
  }
  return dt;
}

function startOfBusinessDay(dt: DateTime, config: BusinessHoursConfig): DateTime {
  return requireValid(
    dt.set({
      hour: config.startHour,
      minute: 0,
      second: 0,
      millisecond: 0,
    }),
  );
}

function endOfBusinessDay(dt: DateTime, config: BusinessHoursConfig): DateTime {
  return requireValid(
    dt.set({
      hour: config.endHour,
      minute: 0,
      second: 0,
      millisecond: 0,
    }),
  );
}

/**
 * If `instant` falls outside business hours, move it forward to the next
 * business-period start. Instants already inside a business window are unchanged.
 */
export function snapForwardToBusiness(
  instant: Date,
  holidays: HolidaySet,
  config: BusinessHoursConfig = DEFAULT_BUSINESS_HOURS,
): DateTime {
  assertZone(config.timezone);
  let current: DateTime = DateTime.fromJSDate(instant, { zone: "utc" }).setZone(config.timezone);
  if (!current.isValid) {
    throw new Error("Invalid timestamp");
  }

  for (let i = 0; i < MAX_LOOKAHEAD_DAYS; i += 1) {
    if (!isBusinessDay(current, holidays)) {
      current = startOfBusinessDay(requireValid(current.plus({ days: 1 })), config);
      continue;
    }

    const start = startOfBusinessDay(current, config);
    const end = endOfBusinessDay(current, config);

    if (current < start) {
      return start;
    }
    if (current >= end) {
      current = startOfBusinessDay(requireValid(current.plus({ days: 1 })), config);
      continue;
    }
    return current;
  }

  throw new Error("Could not find a business period within the lookahead window");
}

/**
 * Add `minutes` of business time to `start`. Nights, weekends, and holidays
 * do not consume the budget.
 */
export function addBusinessMinutes(
  start: Date,
  minutes: number,
  holidays: HolidaySet,
  config: BusinessHoursConfig = DEFAULT_BUSINESS_HOURS,
): Date {
  if (minutes < 0) {
    throw new Error("Cannot add a negative number of business minutes");
  }

  let current = snapForwardToBusiness(start, holidays, config);
  let remainingSeconds = minutes * 60;

  if (remainingSeconds === 0) {
    const js = current.toUTC().toJSDate();
    return js;
  }

  while (remainingSeconds > 0) {
    const windowEnd = endOfBusinessDay(current, config);
    const availableSeconds = windowEnd.diff(current, "seconds").as("seconds");

    if (remainingSeconds <= availableSeconds) {
      return requireValid(current.plus({ seconds: remainingSeconds })).toUTC().toJSDate();
    }

    remainingSeconds -= availableSeconds;
    current = snapForwardToBusiness(
      requireValid(windowEnd.plus({ milliseconds: 1 })).toUTC().toJSDate(),
      holidays,
      config,
    );
  }

  return current.toUTC().toJSDate();
}

/**
 * Count business minutes in `[start, end)`. Returns 0 when end is at or before start.
 */
export function businessMinutesBetween(
  start: Date,
  end: Date,
  holidays: HolidaySet,
  config: BusinessHoursConfig = DEFAULT_BUSINESS_HOURS,
): number {
  if (end.getTime() <= start.getTime()) {
    return 0;
  }

  const endLocal = DateTime.fromJSDate(end, { zone: "utc" }).setZone(config.timezone);
  let current = snapForwardToBusiness(start, holidays, config);

  if (current.toUTC().toMillis() >= end.getTime()) {
    return 0;
  }

  let totalSeconds = 0;

  for (let i = 0; i < MAX_LOOKAHEAD_DAYS; i += 1) {
    if (current.toUTC().toMillis() >= end.getTime()) {
      break;
    }

    const windowEnd = endOfBusinessDay(current, config);
    const cap = windowEnd.toUTC().toMillis() < end.getTime() ? windowEnd : endLocal;
    const delta = cap.diff(current, "seconds").as("seconds");
    if (delta > 0) {
      totalSeconds += delta;
    }

    current = snapForwardToBusiness(
      requireValid(windowEnd.plus({ milliseconds: 1 })).toUTC().toJSDate(),
      holidays,
      config,
    );
  }

  return totalSeconds / 60;
}

export function toIsoUtc(date: Date): string {
  return DateTime.fromJSDate(date, { zone: "utc" }).toUTC().toISO({ suppressMilliseconds: false }) ?? date.toISOString();
}

import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import { evaluateTicketSla } from "../../src/services/sla/engine";
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

describe("SLA engine", () => {
  it("computes first-response and resolution due times for HIGH", () => {
    const created = at(2026, 1, 5, 9, 0);
    const sla = evaluateTicketSla({
      createdAt: created,
      priority: "HIGH",
      firstResponseAt: null,
      resolvedAt: null,
      now: at(2026, 1, 5, 10, 0),
      holidays: new Set(),
      config,
    });
    expect(
      DateTime.fromJSDate(sla.firstResponseDueAt, { zone: "utc" }).setZone(TZ).toFormat("HH:mm"),
    ).toBe("13:00");
    expect(
      DateTime.fromJSDate(sla.resolutionDueAt, { zone: "utc" }).setZone(TZ).toFormat("yyyy-LL-dd HH:mm"),
    ).toBe("2026-01-07 15:00");
  });

  it("marks first-response AT_RISK after 75% of the budget", () => {
    const created = at(2026, 1, 5, 9, 0);
    // HIGH first response = 4h. 75% = 3h → 12:00 is still ON_TRACK
    const atThreshold = evaluateTicketSla({
      createdAt: created,
      priority: "HIGH",
      firstResponseAt: null,
      resolvedAt: null,
      now: at(2026, 1, 5, 12, 0),
      holidays: new Set(),
      config,
    });
    expect(atThreshold.firstResponseState).toBe("ON_TRACK");

    const pastThreshold = evaluateTicketSla({
      createdAt: created,
      priority: "HIGH",
      firstResponseAt: null,
      resolvedAt: null,
      now: at(2026, 1, 5, 12, 1),
      holidays: new Set(),
      config,
    });
    expect(pastThreshold.firstResponseState).toBe("AT_RISK");
  });

  it("marks an SLA BREACHED after the deadline", () => {
    const created = at(2026, 1, 5, 9, 0);
    const sla = evaluateTicketSla({
      createdAt: created,
      priority: "HIGH",
      firstResponseAt: null,
      resolvedAt: null,
      now: at(2026, 1, 5, 13, 1),
      holidays: new Set(),
      config,
    });
    expect(sla.firstResponseState).toBe("BREACHED");
    expect(sla.firstResponseRemainingMinutes).toBe(0);
  });

  it("keeps a completed first-response clock from later becoming BREACHED", () => {
    const created = at(2026, 1, 5, 9, 0);
    const sla = evaluateTicketSla({
      createdAt: created,
      priority: "HIGH",
      firstResponseAt: at(2026, 1, 5, 11, 0),
      resolvedAt: null,
      now: at(2026, 1, 9, 17, 0),
      holidays: new Set(),
      config,
    });
    expect(sla.firstResponseCompleted).toBe(true);
    expect(sla.firstResponseState).toBe("ON_TRACK");
    expect(sla.firstResponseRemainingMinutes).toBe(120);
  });

  it("freezes resolution SLA at resolvedAt", () => {
    const created = at(2026, 1, 5, 9, 0);
    const sla = evaluateTicketSla({
      createdAt: created,
      priority: "URGENT",
      firstResponseAt: at(2026, 1, 5, 9, 30),
      resolvedAt: at(2026, 1, 5, 12, 0),
      now: at(2026, 1, 20, 12, 0),
      holidays: new Set(),
      config,
    });
    expect(sla.resolutionCompleted).toBe(true);
    expect(sla.resolutionState).toBe("ON_TRACK");
  });

  it("records a late first response as BREACHED and keeps it frozen", () => {
    const created = at(2026, 1, 5, 9, 0);
    const sla = evaluateTicketSla({
      createdAt: created,
      priority: "URGENT",
      firstResponseAt: at(2026, 1, 5, 11, 0),
      resolvedAt: null,
      now: at(2026, 1, 8, 10, 0),
      holidays: new Set(),
      config,
    });
    expect(sla.firstResponseCompleted).toBe(true);
    expect(sla.firstResponseState).toBe("BREACHED");
  });

  it("freezes first-response consumption at resolvedAt without marking the reply complete", () => {
    const created = at(2026, 1, 5, 9, 0);
    const sla = evaluateTicketSla({
      createdAt: created,
      priority: "HIGH",
      firstResponseAt: null,
      resolvedAt: at(2026, 1, 5, 11, 0),
      now: at(2026, 1, 20, 12, 0),
      holidays: new Set(),
      config,
    });
    expect(sla.firstResponseCompleted).toBe(false);
    expect(sla.firstResponseState).toBe("ON_TRACK");
    expect(sla.firstResponseRemainingMinutes).toBe(120);
    expect(sla.resolutionCompleted).toBe(true);
  });

  it("uses URGENT 1h / 4h policies", () => {
    const created = at(2026, 1, 5, 9, 0);
    const sla = evaluateTicketSla({
      createdAt: created,
      priority: "URGENT",
      firstResponseAt: null,
      resolvedAt: null,
      now: created,
      holidays: new Set(),
      config,
    });
    expect(
      DateTime.fromJSDate(sla.firstResponseDueAt, { zone: "utc" }).setZone(TZ).toFormat("HH:mm"),
    ).toBe("10:00");
    expect(
      DateTime.fromJSDate(sla.resolutionDueAt, { zone: "utc" }).setZone(TZ).toFormat("HH:mm"),
    ).toBe("13:00");
  });
});

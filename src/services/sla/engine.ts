import { addBusinessMinutes, businessMinutesBetween, type HolidaySet } from "./businessHours";
import { getSlaPolicy } from "./policies";
import {
  AT_RISK_THRESHOLD,
  DEFAULT_BUSINESS_HOURS,
  type BusinessHoursConfig,
  type Priority,
  type SLAClock,
  type SLAInfo,
  type SLAState,
} from "./types";

export type EvaluateSlaInput = {
  createdAt: Date;
  priority: Priority;
  firstResponseAt: Date | null;
  resolvedAt: Date | null;
  now: Date;
  holidays: HolidaySet;
  config?: BusinessHoursConfig;
};

function stateFromConsumption(consumedMinutes: number, budgetMinutes: number, breached: boolean): SLAState {
  if (breached) {
    return "BREACHED";
  }
  if (budgetMinutes <= 0) {
    return "ON_TRACK";
  }
  const consumedRatio = consumedMinutes / budgetMinutes;
  // Exactly 75% remains ON_TRACK. AT_RISK is strictly greater than 75%.
  if (consumedRatio > AT_RISK_THRESHOLD) {
    return "AT_RISK";
  }
  return "ON_TRACK";
}

function evaluateClock(params: {
  createdAt: Date;
  budgetMinutes: number;
  freezeAt: Date | null;
  now: Date;
  holidays: HolidaySet;
  config: BusinessHoursConfig;
}): SLAClock {
  const { createdAt, budgetMinutes, freezeAt, now, holidays, config } = params;
  const dueAt = addBusinessMinutes(createdAt, budgetMinutes, holidays, config);
  const stopAt = freezeAt ?? now;
  const consumed = businessMinutesBetween(createdAt, stopAt, holidays, config);
  const remainingRaw = businessMinutesBetween(stopAt, dueAt, holidays, config);
  const breached = stopAt.getTime() > dueAt.getTime();
  const remainingMinutes = breached ? 0 : Math.max(0, Math.round(remainingRaw));

  return {
    dueAt,
    state: stateFromConsumption(consumed, budgetMinutes, breached),
    remainingMinutes,
    completed: freezeAt !== null,
    budgetMinutes,
  };
}

export function computeDueDates(
  createdAt: Date,
  priority: Priority,
  holidays: HolidaySet,
  config: BusinessHoursConfig = DEFAULT_BUSINESS_HOURS,
): { firstResponseDueAt: Date; resolutionDueAt: Date } {
  const policy = getSlaPolicy(priority);
  return {
    firstResponseDueAt: addBusinessMinutes(createdAt, policy.firstResponseMinutes, holidays, config),
    resolutionDueAt: addBusinessMinutes(createdAt, policy.resolutionMinutes, holidays, config),
  };
}

/**
 * SLA clocks freeze when their event timestamp is set.
 * A completed clock never later becomes BREACHED if the event happened on time.
 */
export function evaluateTicketSla(input: EvaluateSlaInput): SLAInfo {
  const config = input.config ?? DEFAULT_BUSINESS_HOURS;
  const policy = getSlaPolicy(input.priority);

  const firstResponse = evaluateClock({
    createdAt: input.createdAt,
    budgetMinutes: policy.firstResponseMinutes,
    freezeAt: input.firstResponseAt,
    now: input.now,
    holidays: input.holidays,
    config,
  });

  const resolution = evaluateClock({
    createdAt: input.createdAt,
    budgetMinutes: policy.resolutionMinutes,
    freezeAt: input.resolvedAt,
    now: input.now,
    holidays: input.holidays,
    config,
  });

  return {
    firstResponseDueAt: firstResponse.dueAt,
    resolutionDueAt: resolution.dueAt,
    firstResponseState: firstResponse.state,
    resolutionState: resolution.state,
    firstResponseRemainingMinutes: firstResponse.remainingMinutes,
    resolutionRemainingMinutes: resolution.remainingMinutes,
    firstResponseCompleted: firstResponse.completed,
    resolutionCompleted: resolution.completed,
  };
}

/**
 * Effective SLA used for list filters and the dashboard.
 * Until first response, the first-response clock is the active clock.
 * After that, the resolution clock is active (even if already frozen).
 */
export function effectiveSlaState(sla: SLAInfo): SLAState {
  if (!sla.firstResponseCompleted) {
    return sla.firstResponseState;
  }
  return sla.resolutionState;
}

export function worstSlaState(sla: SLAInfo): SLAState {
  const rank: Record<SLAState, number> = { ON_TRACK: 0, AT_RISK: 1, BREACHED: 2 };
  return rank[sla.firstResponseState] >= rank[sla.resolutionState]
    ? sla.firstResponseState
    : sla.resolutionState;
}

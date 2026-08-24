export type Priority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export type SLAState = "ON_TRACK" | "AT_RISK" | "BREACHED";

export type SLAClock = {
  dueAt: Date;
  state: SLAState;
  remainingMinutes: number;
  completed: boolean;
  budgetMinutes: number;
};

export type SLAInfo = {
  firstResponseDueAt: Date;
  resolutionDueAt: Date;
  firstResponseState: SLAState;
  resolutionState: SLAState;
  firstResponseRemainingMinutes: number;
  resolutionRemainingMinutes: number;
  firstResponseCompleted: boolean;
  resolutionCompleted: boolean;
};

export type BusinessHoursConfig = {
  timezone: string;
  startHour: number;
  endHour: number;
};

export const DEFAULT_BUSINESS_HOURS: BusinessHoursConfig = {
  timezone: "Asia/Kolkata",
  startHour: 9,
  endHour: 18,
};

/** AT_RISK begins strictly after this fraction of the SLA budget is consumed. */
export const AT_RISK_THRESHOLD = 0.75;

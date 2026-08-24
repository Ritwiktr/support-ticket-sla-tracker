import type { Priority } from "./types";

export type SlaPolicy = {
  firstResponseMinutes: number;
  resolutionMinutes: number;
};

export const DEFAULT_SLA_POLICIES: Record<Priority, SlaPolicy> = {
  URGENT: { firstResponseMinutes: 60, resolutionMinutes: 240 },
  HIGH: { firstResponseMinutes: 240, resolutionMinutes: 1440 },
  MEDIUM: { firstResponseMinutes: 480, resolutionMinutes: 2880 },
  LOW: { firstResponseMinutes: 1440, resolutionMinutes: 4320 },
};

export function getSlaPolicy(priority: Priority): SlaPolicy {
  return DEFAULT_SLA_POLICIES[priority];
}

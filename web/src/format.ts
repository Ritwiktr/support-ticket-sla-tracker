import type { SLAInfo, SLAState } from "./api";

export function formatLocal(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function slaLabel(sla: SLAInfo): { state: SLAState | "MET"; text: string } {
  const activeCompleted = sla.firstResponseCompleted ? sla.resolutionCompleted : sla.firstResponseCompleted;
  const state = sla.firstResponseCompleted ? sla.resolutionState : sla.firstResponseState;
  const remaining = sla.firstResponseCompleted
    ? sla.resolutionRemainingMinutes
    : sla.firstResponseRemainingMinutes;

  if (activeCompleted && state !== "BREACHED") {
    return { state: "MET", text: "Met" };
  }
  if (state === "BREACHED") {
    return { state, text: "BREACHED" };
  }
  return { state, text: `${remaining}m` };
}

export function formatMinutes(minutes: number): string {
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem === 0 ? `${hours}h` : `${hours}h ${rem}m`;
}

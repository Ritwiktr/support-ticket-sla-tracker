import type { SLAInfo, SLAState } from "./api";

export function formatLocal(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function prettyLabel(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatMinutes(minutes: number): string {
  if (minutes <= 0) {
    return "0m";
  }
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem === 0 ? `${hours}h` : `${hours}h ${rem}m`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter((part) => part.length > 0);
  const first = parts[0];
  const last = parts.length > 1 ? parts[parts.length - 1] : undefined;
  if (first === undefined) {
    return "?";
  }
  if (last === undefined) {
    return first.slice(0, 2).toUpperCase();
  }
  return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase();
}

export function relativeTime(iso: string): string {
  const delta = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(delta / 60_000);
  if (Math.abs(minutes) < 1) {
    return "just now";
  }
  if (Math.abs(minutes) < 60) {
    return `${Math.abs(minutes)}m ago`;
  }
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 48) {
    return `${Math.abs(hours)}h ago`;
  }
  const days = Math.round(hours / 24);
  return `${Math.abs(days)}d ago`;
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
    return { state, text: "Breached" };
  }
  return { state, text: formatMinutes(remaining) };
}

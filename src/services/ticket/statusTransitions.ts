import type { TicketStatus } from "@prisma/client";
import { ErrorCode } from "../../graphql/errors";
import { AppError } from "../../validation/errors";

const ALLOWED: Record<TicketStatus, readonly TicketStatus[]> = {
  OPEN: ["IN_PROGRESS", "RESOLVED", "CLOSED"],
  IN_PROGRESS: ["OPEN", "RESOLVED", "CLOSED"],
  RESOLVED: ["CLOSED", "OPEN", "IN_PROGRESS"],
  CLOSED: ["OPEN"],
};

export function assertValidTransition(from: TicketStatus, to: TicketStatus): void {
  if (from === to) {
    return;
  }
  const allowed = ALLOWED[from];
  if (!allowed.includes(to)) {
    throw new AppError(
      `Ticket cannot transition from ${from} to ${to}.`,
      ErrorCode.INVALID_STATUS_TRANSITION,
    );
  }
}

export function allowedTransitions(from: TicketStatus): readonly TicketStatus[] {
  return ALLOWED[from];
}

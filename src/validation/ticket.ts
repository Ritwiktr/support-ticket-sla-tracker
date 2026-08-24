import { ErrorCode } from "../graphql/errors";
import { AppError } from "./errors";
import type { Priority, TicketStatus, UserRole } from "@prisma/client";

const PRIORITIES: readonly Priority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const STATUSES: readonly TicketStatus[] = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"];
const ROLES: readonly UserRole[] = ["REPORTER", "AGENT"];

export function requireNonEmpty(value: string, field: string): string {
  const trimmed = value.trim();
  if (trimmed === "") {
    throw new AppError(`${field} must not be empty.`, ErrorCode.VALIDATION_ERROR);
  }
  return trimmed;
}

export function requireEmail(value: string): string {
  const email = requireNonEmpty(value, "Email").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AppError("Email is invalid.", ErrorCode.VALIDATION_ERROR);
  }
  return email;
}

export function requirePassword(value: string): string {
  if (value.length < 8) {
    throw new AppError("Password must be at least 8 characters.", ErrorCode.VALIDATION_ERROR);
  }
  return value;
}

export function requirePriority(value: string): Priority {
  if (!PRIORITIES.includes(value as Priority)) {
    throw new AppError(`Invalid priority: ${value}`, ErrorCode.INVALID_PRIORITY);
  }
  return value as Priority;
}

export function requireStatus(value: string): TicketStatus {
  if (!STATUSES.includes(value as TicketStatus)) {
    throw new AppError(`Invalid status: ${value}`, ErrorCode.VALIDATION_ERROR);
  }
  return value as TicketStatus;
}

export function requireRole(value: string): UserRole {
  if (!ROLES.includes(value as UserRole)) {
    throw new AppError(`Invalid role: ${value}`, ErrorCode.INVALID_ROLE);
  }
  return value as UserRole;
}

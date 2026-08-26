import { describe, expect, it } from "vitest";
import { assertValidTransition, shouldClaimUnassignedTicket } from "../../src/services/ticket/statusTransitions";
import { AppError } from "../../src/validation/errors";
import { ErrorCode } from "../../src/graphql/errors";
import { requireNonEmpty, requirePriority } from "../../src/validation/ticket";

describe("status transitions", () => {
  it("allows the happy path OPEN → IN_PROGRESS → RESOLVED → CLOSED", () => {
    expect(() => assertValidTransition("OPEN", "IN_PROGRESS")).not.toThrow();
    expect(() => assertValidTransition("IN_PROGRESS", "RESOLVED")).not.toThrow();
    expect(() => assertValidTransition("RESOLVED", "CLOSED")).not.toThrow();
  });

  it("allows explicit reopen CLOSED → OPEN", () => {
    expect(() => assertValidTransition("CLOSED", "OPEN")).not.toThrow();
  });

  it("rejects CLOSED → IN_PROGRESS", () => {
    try {
      assertValidTransition("CLOSED", "IN_PROGRESS");
      throw new Error("expected failure");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).extensions.code).toBe(ErrorCode.INVALID_STATUS_TRANSITION);
      expect((error as AppError).message).toContain("CLOSED");
    }
  });

  it("claims unassigned tickets only when work starts or the issue is resolved", () => {
    expect(shouldClaimUnassignedTicket("IN_PROGRESS")).toBe(true);
    expect(shouldClaimUnassignedTicket("RESOLVED")).toBe(true);
    expect(shouldClaimUnassignedTicket("OPEN")).toBe(false);
    expect(shouldClaimUnassignedTicket("CLOSED")).toBe(false);
  });
});

describe("ticket validation", () => {
  it("rejects empty titles", () => {
    expect(() => requireNonEmpty("   ", "Title")).toThrow(AppError);
  });

  it("rejects empty descriptions", () => {
    expect(() => requireNonEmpty("", "Description")).toThrow(AppError);
  });

  it("rejects invalid priorities", () => {
    try {
      requirePriority("CRITICAL");
      throw new Error("expected failure");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).extensions.code).toBe(ErrorCode.INVALID_PRIORITY);
    }
  });
});

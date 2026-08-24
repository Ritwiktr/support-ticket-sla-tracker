import { describe, expect, it } from "vitest";
import { requireAgent, requireUser } from "../../src/auth/context";
import type { GraphQLContext } from "../../src/auth/context";
import { AppError } from "../../src/validation/errors";
import { ErrorCode } from "../../src/graphql/errors";

function ctx(user: GraphQLContext["user"]): GraphQLContext {
  return { prisma: {} as GraphQLContext["prisma"], user };
}

describe("authorization", () => {
  it("rejects unauthenticated access", () => {
    try {
      requireUser(ctx(null));
      throw new Error("expected failure");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).extensions.code).toBe(ErrorCode.UNAUTHORIZED);
    }
  });

  it("forbids reporters from agent-only actions", () => {
    try {
      requireAgent(ctx({ id: "u1", role: "REPORTER" }));
      throw new Error("expected failure");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).extensions.code).toBe(ErrorCode.FORBIDDEN);
    }
  });

  it("allows agents", () => {
    const user = requireAgent(ctx({ id: "u2", role: "AGENT" }));
    expect(user.id).toBe("u2");
  });
});

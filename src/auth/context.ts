import type { PrismaClient, UserRole } from "@prisma/client";
import type { AuthUser } from "./jwt";
import { forbidden, unauthorized } from "../validation/errors";

export type GraphQLContext = {
  prisma: PrismaClient;
  user: AuthUser | null;
};

export function requireUser(ctx: GraphQLContext): AuthUser {
  if (ctx.user === null) {
    unauthorized();
  }
  return ctx.user;
}

export function requireAgent(ctx: GraphQLContext): AuthUser {
  const user = requireUser(ctx);
  if (user.role !== "AGENT") {
    forbidden("Only support agents can perform this action.");
  }
  return user;
}

export function isAgent(role: UserRole): boolean {
  return role === "AGENT";
}

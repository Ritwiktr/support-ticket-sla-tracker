import jwt from "jsonwebtoken";
import { env } from "../config";
import type { UserRole } from "@prisma/client";

export type JwtPayload = {
  sub: string;
  role: UserRole;
};

export type AuthUser = {
  id: string;
  role: UserRole;
};

const TOKEN_TTL = "7d";

function isUserRole(value: unknown): value is UserRole {
  return value === "REPORTER" || value === "AGENT";
}

export function signToken(user: AuthUser): string {
  return jwt.sign({ sub: user.id, role: user.role } satisfies JwtPayload, env.jwtSecret, {
    expiresIn: TOKEN_TTL,
  });
}

export function verifyToken(token: string): AuthUser | null {
  try {
    const decoded: unknown = jwt.verify(token, env.jwtSecret);
    if (typeof decoded !== "object" || decoded === null) {
      return null;
    }
    if (!("sub" in decoded) || !("role" in decoded)) {
      return null;
    }
    if (typeof decoded.sub !== "string" || !isUserRole(decoded.role)) {
      return null;
    }
    return { id: decoded.sub, role: decoded.role };
  } catch {
    return null;
  }
}

export function readBearerToken(authorizationHeader: string | null): string | null {
  if (authorizationHeader === null) {
    return null;
  }
  const [scheme, token] = authorizationHeader.split(" ");
  if (scheme !== "Bearer" || token === undefined || token.trim() === "") {
    return null;
  }
  return token;
}

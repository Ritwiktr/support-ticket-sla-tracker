import type { PrismaClient, UserRole } from "@prisma/client";
import { hashPassword, verifyPassword } from "../../auth/password";
import { signToken } from "../../auth/jwt";
import { UserRepository } from "../../repositories/userRepository";
import { ErrorCode } from "../../graphql/errors";
import { AppError } from "../../validation/errors";
import { requireEmail, requireNonEmpty, requirePassword, requireRole } from "../../validation/ticket";

export class AuthService {
  private readonly users: UserRepository;

  constructor(prisma: PrismaClient) {
    this.users = new UserRepository(prisma);
  }

  async register(input: { name: string; email: string; password: string; role: string }) {
    const name = requireNonEmpty(input.name, "Name");
    const email = requireEmail(input.email);
    const password = requirePassword(input.password);
    const requestedRole = requireRole(input.role);

    if (requestedRole === "AGENT") {
      throw new AppError(
        "Agent accounts cannot be self-registered. Ask an administrator to provision an agent.",
        ErrorCode.FORBIDDEN,
      );
    }

    const role: UserRole = "REPORTER";
    const existing = await this.users.findByEmail(email);
    if (existing !== null) {
      throw new AppError("An account with this email already exists.", ErrorCode.EMAIL_TAKEN);
    }

    const passwordHash = await hashPassword(password);
    const user = await this.users.create({ name, email, passwordHash, role });
    const token = signToken({ id: user.id, role: user.role });
    return {
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    };
  }

  async login(input: { email: string; password: string }) {
    const email = requireEmail(input.email);
    const user = await this.users.findByEmail(email);
    if (user === null) {
      throw new AppError("Invalid email or password.", ErrorCode.INVALID_CREDENTIALS);
    }
    const ok = await verifyPassword(input.password, user.passwordHash);
    if (!ok) {
      throw new AppError("Invalid email or password.", ErrorCode.INVALID_CREDENTIALS);
    }
    const token = signToken({ id: user.id, role: user.role });
    return {
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    };
  }
}

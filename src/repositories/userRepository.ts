import type { PrismaClient, UserRole } from "@prisma/client";

export class UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  }

  list(role?: UserRole) {
    return this.prisma.user.findMany({
      where: role === undefined ? {} : { role },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, role: true },
    });
  }

  create(data: { name: string; email: string; passwordHash: string; role: UserRole }) {
    return this.prisma.user.create({
      data: {
        name: data.name,
        email: data.email.toLowerCase(),
        passwordHash: data.passwordHash,
        role: data.role,
      },
    });
  }
}

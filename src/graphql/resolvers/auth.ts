import type { GraphQLContext } from "../../auth/context";
import { AuthService } from "../../services/auth/authService";
import type { UserRole } from "@prisma/client";

export const authResolvers = {
  Mutation: {
    register: async (
      _parent: unknown,
      args: { name: string; email: string; password: string; role: UserRole },
      ctx: GraphQLContext,
    ) => {
      return new AuthService(ctx.prisma).register(args);
    },
    login: async (
      _parent: unknown,
      args: { email: string; password: string },
      ctx: GraphQLContext,
    ) => {
      return new AuthService(ctx.prisma).login(args);
    },
  },
};

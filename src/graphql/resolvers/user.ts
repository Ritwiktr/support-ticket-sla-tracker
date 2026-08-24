import type { GraphQLContext } from "../../auth/context";
import { requireUser } from "../../auth/context";
import { UserRepository } from "../../repositories/userRepository";
import { HolidayRepository } from "../../repositories/holidayRepository";
import { holidayKeyFromDateOnly } from "../../services/sla/businessHours";
import type { UserRole } from "@prisma/client";

export const directoryResolvers = {
  Query: {
    users: async (_parent: unknown, args: { role?: UserRole | null }, ctx: GraphQLContext) => {
      requireUser(ctx);
      const repo = new UserRepository(ctx.prisma);
      return repo.list(args.role === null || args.role === undefined ? undefined : args.role);
    },
    holidays: async (_parent: unknown, _args: unknown, ctx: GraphQLContext) => {
      requireUser(ctx);
      const holidays = await new HolidayRepository(ctx.prisma).list();
      return holidays.map((holiday) => ({
        id: holiday.id,
        name: holiday.name,
        date: holidayKeyFromDateOnly(holiday.date),
      }));
    },
  },
};

import type { PrismaClient } from "@prisma/client";
import { holidayKeyFromDateOnly } from "../services/sla/businessHours";

export class HolidayRepository {
  constructor(private readonly prisma: PrismaClient) {}

  list() {
    return this.prisma.holiday.findMany({ orderBy: { date: "asc" } });
  }

  async dateKeySet(): Promise<ReadonlySet<string>> {
    const holidays = await this.list();
    return new Set(holidays.map((holiday) => holidayKeyFromDateOnly(holiday.date)));
  }
}

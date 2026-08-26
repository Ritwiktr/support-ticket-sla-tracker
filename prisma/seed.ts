import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { DateTime } from "luxon";
import { hashPassword } from "../src/auth/password";
import { computeDueDates } from "../src/services/sla";
import { holidayKeyFromDateOnly } from "../src/services/sla/businessHours";
import { businessHoursConfig } from "../src/config";

const prisma = new PrismaClient();
const zone = businessHoursConfig.timezone;

function at(year: number, month: number, day: number, hour: number, minute = 0): Date {
  return DateTime.fromObject({ year, month, day, hour, minute, second: 0, millisecond: 0 }, { zone })
    .toUTC()
    .toJSDate();
}

async function main(): Promise<void> {
  await prisma.comment.deleteMany();
  await prisma.ticket.deleteMany();
  await prisma.holiday.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await hashPassword("Password123!");

  const reporter = await prisma.user.create({
    data: {
      name: "Asha Reporter",
      email: "reporter@example.com",
      passwordHash,
      role: "REPORTER",
    },
  });

  const reporterRahul = await prisma.user.create({
    data: {
      name: "Rahul Shah",
      email: "rahul.reporter@example.com",
      passwordHash,
      role: "REPORTER",
    },
  });

  const reporterPriya = await prisma.user.create({
    data: {
      name: "Priya Nair",
      email: "priya.reporter@example.com",
      passwordHash,
      role: "REPORTER",
    },
  });

  const agent = await prisma.user.create({
    data: {
      name: "Vikram Agent",
      email: "agent@example.com",
      passwordHash,
      role: "AGENT",
    },
  });

  const agentMeera = await prisma.user.create({
    data: {
      name: "Meera Iyer",
      email: "meera.agent@example.com",
      passwordHash,
      role: "AGENT",
    },
  });

  const independence = await prisma.holiday.create({
    data: { date: new Date("2026-08-15"), name: "Independence Day" },
  });
  const midweekHoliday = await prisma.holiday.create({
    data: { date: new Date("2026-08-17"), name: "Company Foundation Day" },
  });

  const holidays = new Set([
    holidayKeyFromDateOnly(independence.date),
    holidayKeyFromDateOnly(midweekHoliday.date),
  ]);

  async function createTicket(input: {
    title: string;
    description: string;
    priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
    createdAt: Date;
    reporterId: string;
    assigneeId?: string;
    status?: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
    firstResponseAt?: Date;
    resolvedAt?: Date;
  }) {
    const dues = computeDueDates(input.createdAt, input.priority, holidays, businessHoursConfig);
    return prisma.ticket.create({
      data: {
        title: input.title,
        description: input.description,
        priority: input.priority,
        status: input.status ?? "OPEN",
        reporterId: input.reporterId,
        createdAt: input.createdAt,
        firstResponseDueAt: dues.firstResponseDueAt,
        resolutionDueAt: dues.resolutionDueAt,
        ...(input.assigneeId !== undefined ? { assigneeId: input.assigneeId } : {}),
        ...(input.firstResponseAt !== undefined ? { firstResponseAt: input.firstResponseAt } : {}),
        ...(input.resolvedAt !== undefined ? { resolvedAt: input.resolvedAt } : {}),
      },
    });
  }

  const urgent = await createTicket({
    title: "Payment failed at checkout",
    description: "Customers cannot complete UPI payments on the checkout page.",
    priority: "URGENT",
    reporterId: reporter.id,
    createdAt: at(2026, 8, 21, 17, 0),
    assigneeId: agent.id,
    status: "IN_PROGRESS",
  });

  const high = await createTicket({
    title: "Login issue for SSO users",
    description: "SSO users receive a 500 after Okta redirect.",
    priority: "HIGH",
    reporterId: reporterRahul.id,
    createdAt: at(2026, 8, 25, 10, 0),
    assigneeId: agentMeera.id,
    status: "IN_PROGRESS",
  });

  const medium = await createTicket({
    title: "Export CSV missing columns",
    description: "The billing export omits tax and currency columns.",
    priority: "MEDIUM",
    reporterId: reporterPriya.id,
    createdAt: at(2026, 8, 24, 11, 0),
    status: "OPEN",
  });

  const low = await createTicket({
    title: "Typo on settings page",
    description: "The word 'organisation' is misspelled in the profile header.",
    priority: "LOW",
    reporterId: reporter.id,
    createdAt: at(2026, 8, 20, 9, 30),
    assigneeId: agent.id,
    status: "RESOLVED",
    firstResponseAt: at(2026, 8, 20, 10, 15),
    resolvedAt: at(2026, 8, 20, 16, 0),
  });

  await prisma.comment.createMany({
    data: [
      {
        ticketId: urgent.id,
        authorId: reporter.id,
        content: "This is blocking end-of-month invoicing.",
        createdAt: at(2026, 8, 21, 17, 5),
      },
      {
        ticketId: high.id,
        authorId: reporterRahul.id,
        content: "Reproduced on Chrome and Firefox.",
        createdAt: at(2026, 8, 25, 10, 10),
      },
      {
        ticketId: medium.id,
        authorId: reporterPriya.id,
        content: "Finance needs the tax column before month-close.",
        createdAt: at(2026, 8, 24, 11, 20),
      },
      {
        ticketId: low.id,
        authorId: reporter.id,
        content: "Screenshot attached in the internal wiki.",
        createdAt: at(2026, 8, 20, 9, 40),
      },
      {
        ticketId: low.id,
        authorId: agent.id,
        content: "Thanks — I can see the typo. Patching copy now.",
        createdAt: at(2026, 8, 20, 10, 15),
      },
    ],
  });

  console.log("Seeded users (password for all: Password123!):");
  console.log("  reporter@example.com        REPORTER  Asha Reporter");
  console.log("  rahul.reporter@example.com  REPORTER  Rahul Shah");
  console.log("  priya.reporter@example.com  REPORTER  Priya Nair");
  console.log("  agent@example.com           AGENT     Vikram Agent");
  console.log("  meera.agent@example.com     AGENT     Meera Iyer");
  console.log(`Seeded tickets: ${urgent.title}, ${high.title}, ${medium.title}, ${low.title}`);
  console.log("Seeded holidays: Independence Day (2026-08-15), Company Foundation Day (2026-08-17)");
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

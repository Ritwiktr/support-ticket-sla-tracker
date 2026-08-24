import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "../../src/auth/password";
import { TicketService } from "../../src/services/ticket/ticketService";

const databaseUrl = process.env.DATABASE_URL;

const describeIntegration = databaseUrl === undefined || databaseUrl.trim() === "" ? describe.skip : describe;

describeIntegration("ticket persistence (PostgreSQL)", () => {
  const prisma = new PrismaClient();
  const service = new TicketService(prisma);
  let reporterId = "";
  let agentId = "";

  beforeAll(async () => {
    const passwordHash = await hashPassword("Password123!");
    const suffix = `${Date.now()}`;
    const reporter = await prisma.user.create({
      data: {
        name: "Integration Reporter",
        email: `reporter-int-${suffix}@example.com`,
        passwordHash,
        role: "REPORTER",
      },
    });
    const agent = await prisma.user.create({
      data: {
        name: "Integration Agent",
        email: `agent-int-${suffix}@example.com`,
        passwordHash,
        role: "AGENT",
      },
    });
    reporterId = reporter.id;
    agentId = agent.id;
  });

  afterAll(async () => {
    await prisma.comment.deleteMany({
      where: { ticket: { reporterId: { in: [reporterId, agentId] } } },
    });
    await prisma.ticket.deleteMany({
      where: { reporterId: { in: [reporterId, agentId] } },
    });
    await prisma.user.deleteMany({ where: { id: { in: [reporterId, agentId] } } });
    await prisma.$disconnect();
  });

  it("creates a ticket, records firstResponseAt on the first non-reporter comment, and persists SLA due times", async () => {
    const created = await service.createTicket(
      { id: reporterId, role: "REPORTER" },
      {
        title: "Cannot reset password",
        description: "The reset email never arrives.",
        priority: "HIGH",
      },
    );

    expect(created.firstResponseAt).toBeNull();
    expect(created.sla.firstResponseDueAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(created.sla.resolutionDueAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const persisted = await prisma.ticket.findUniqueOrThrow({ where: { id: created.id } });
    expect(persisted.firstResponseDueAt).toBeInstanceOf(Date);
    expect(persisted.resolutionDueAt).toBeInstanceOf(Date);
    expect(persisted.firstResponseAt).toBeNull();

    await service.addComment({ id: reporterId, role: "REPORTER" }, created.id, "Still waiting on the email.");

    const afterReporter = await prisma.ticket.findUniqueOrThrow({ where: { id: created.id } });
    expect(afterReporter.firstResponseAt).toBeNull();

    await service.addComment({ id: agentId, role: "AGENT" }, created.id, "I can see the mail queue stall. Looking now.");

    const afterAgent = await prisma.ticket.findUniqueOrThrow({ where: { id: created.id } });
    expect(afterAgent.firstResponseAt).not.toBeNull();

    const firstResponseAt = afterAgent.firstResponseAt;
    if (firstResponseAt === null) {
      throw new Error("expected firstResponseAt");
    }

    await service.addComment({ id: agentId, role: "AGENT" }, created.id, "Follow-up: mail worker restarted.");
    const afterSecond = await prisma.ticket.findUniqueOrThrow({ where: { id: created.id } });
    expect(afterSecond.firstResponseAt?.getTime()).toBe(firstResponseAt.getTime());

    const view = await service.getTicket(created.id);
    expect(view.sla.firstResponseCompleted).toBe(true);
    expect(view.comments).toHaveLength(3);
  });
});

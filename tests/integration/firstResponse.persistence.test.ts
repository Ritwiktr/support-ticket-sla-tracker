import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "../../src/auth/password";
import { TicketService } from "../../src/services/ticket/ticketService";
import { AppError } from "../../src/validation/errors";

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

    const view = await service.getTicket({ id: agentId, role: "AGENT" }, created.id);
    expect(view.sla.firstResponseCompleted).toBe(true);
    expect(view.comments).toHaveLength(3);
  });

  it("claims an unassigned ticket for the agent who starts or resolves work, without stealing an existing assignee", async () => {
    const created = await service.createTicket(
      { id: reporterId, role: "REPORTER" },
      {
        title: "Checkout spinner never stops",
        description: "The pay button stays loading after UPI confirm.",
        priority: "MEDIUM",
      },
    );
    expect(created.assignee).toBeNull();
    expect(created.status).toBe("OPEN");

    const started = await service.changeStatus({ id: agentId, role: "AGENT" }, created.id, "IN_PROGRESS");
    expect(started.status).toBe("IN_PROGRESS");
    expect(started.assignee?.id).toBe(agentId);

    const otherAgent = await prisma.user.create({
      data: {
        name: "Second Agent",
        email: `agent-int-2-${Date.now()}@example.com`,
        passwordHash: await hashPassword("Password123!"),
        role: "AGENT",
      },
    });

    const stillOwned = await service.changeStatus({ id: otherAgent.id, role: "AGENT" }, created.id, "RESOLVED");
    expect(stillOwned.assignee?.id).toBe(agentId);
    expect(stillOwned.status).toBe("RESOLVED");

    const queued = await service.createTicket(
      { id: reporterId, role: "REPORTER" },
      {
        title: "Duplicate of an older request",
        description: "Please close, already tracked elsewhere.",
        priority: "LOW",
      },
    );
    const closed = await service.changeStatus({ id: agentId, role: "AGENT" }, queued.id, "CLOSED");
    expect(closed.status).toBe("CLOSED");
    expect(closed.assignee).toBeNull();

    const commented = await service.createTicket(
      { id: reporterId, role: "REPORTER" },
      {
        title: "Need a copy of last invoice",
        description: "Finance asked for August PDF.",
        priority: "LOW",
      },
    );
    await service.addComment({ id: agentId, role: "AGENT" }, commented.id, "Sending the PDF now.");
    const afterComment = await service.getTicket({ id: agentId, role: "AGENT" }, commented.id);
    expect(afterComment.assignee?.id).toBe(agentId);
    expect(afterComment.status).toBe("IN_PROGRESS");
    expect(afterComment.firstResponseAt).not.toBeNull();

    await prisma.comment.deleteMany({ where: { ticketId: { in: [created.id, queued.id, commented.id] } } });
    await prisma.ticket.deleteMany({ where: { id: { in: [created.id, queued.id, commented.id] } } });
    await prisma.user.delete({ where: { id: otherAgent.id } });
  });

  it("keeps reporter tickets private and refuses assigning a closed ticket", async () => {
    const otherReporter = await prisma.user.create({
      data: {
        name: "Other Reporter",
        email: `reporter-int-2-${Date.now()}@example.com`,
        passwordHash: await hashPassword("Password123!"),
        role: "REPORTER",
      },
    });

    const created = await service.createTicket(
      { id: reporterId, role: "REPORTER" },
      {
        title: "Private billing question",
        description: "Should not be visible to another reporter.",
        priority: "LOW",
      },
    );

    const listed = await service.listTickets({ id: otherReporter.id, role: "REPORTER" }, {});
    expect(listed.nodes.find((ticket) => ticket.id === created.id)).toBeUndefined();

    try {
      await service.getTicket({ id: otherReporter.id, role: "REPORTER" }, created.id);
      throw new Error("expected getTicket to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).extensions.code).toBe("TICKET_NOT_FOUND");
    }

    try {
      await service.addComment({ id: otherReporter.id, role: "REPORTER" }, created.id, "Peeking.");
      throw new Error("expected addComment to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).extensions.code).toBe("FORBIDDEN");
    }

    const closed = await service.changeStatus({ id: agentId, role: "AGENT" }, created.id, "CLOSED");
    expect(closed.status).toBe("CLOSED");
    expect(closed.assignee).toBeNull();

    try {
      await service.assignTicket(created.id, agentId);
      throw new Error("expected assignTicket to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).extensions.code).toBe("VALIDATION_ERROR");
    }

    const dash = await service.dashboard({ id: otherReporter.id, role: "REPORTER" });
    expect(dash.openTickets).toBe(0);

    await prisma.comment.deleteMany({ where: { ticketId: created.id } });
    await prisma.ticket.delete({ where: { id: created.id } });
    await prisma.user.delete({ where: { id: otherReporter.id } });
  });
});

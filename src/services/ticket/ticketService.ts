import type { PrismaClient, Priority, TicketStatus } from "@prisma/client";
import { businessHoursConfig } from "../../config";
import { ErrorCode } from "../../graphql/errors";
import { HolidayRepository } from "../../repositories/holidayRepository";
import {
  CommentRepository,
  TicketRepository,
  type TicketRecord,
} from "../../repositories/ticketRepository";
import { UserRepository } from "../../repositories/userRepository";
import {
  computeDueDates,
  effectiveSlaState,
  evaluateTicketSla,
  type SLAInfo,
  type SLAState,
} from "../sla";
import { toIsoUtc } from "../sla/businessHours";
import { AppError } from "../../validation/errors";
import { requireNonEmpty, requirePriority, requireStatus } from "../../validation/ticket";
import { assertValidTransition, shouldClaimUnassignedTicket } from "./statusTransitions";
import type { AuthUser } from "../../auth/jwt";

export type TicketView = {
  id: string;
  title: string;
  description: string;
  priority: Priority;
  status: TicketStatus;
  reporter: { id: string; name: string; email: string; role: TicketRecord["reporter"]["role"] };
  assignee: { id: string; name: string; email: string; role: TicketRecord["reporter"]["role"] } | null;
  createdAt: string;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  sla: GraphQlSlaInfo;
  comments: Array<{
    id: string;
    content: string;
    createdAt: string;
    author: { id: string; name: string; email: string; role: TicketRecord["reporter"]["role"] };
  }>;
};

export type GraphQlSlaInfo = {
  firstResponseDueAt: string;
  resolutionDueAt: string;
  firstResponseState: SLAState;
  resolutionState: SLAState;
  firstResponseRemainingMinutes: number;
  resolutionRemainingMinutes: number;
  firstResponseCompleted: boolean;
  resolutionCompleted: boolean;
};

function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}|${id}`, "utf8").toString("base64url");
}

function decodeCursor(cursor: string): { createdAt: Date; id: string } {
  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    const sep = decoded.lastIndexOf("|");
    if (sep === -1) {
      throw new Error("bad cursor");
    }
    const createdAt = new Date(decoded.slice(0, sep));
    const id = decoded.slice(sep + 1);
    if (Number.isNaN(createdAt.getTime()) || id === "") {
      throw new Error("bad cursor");
    }
    return { createdAt, id };
  } catch {
    throw new AppError("Invalid pagination cursor.", ErrorCode.VALIDATION_ERROR);
  }
}

function toUserView(user: TicketRecord["reporter"]) {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

function toSlaView(sla: SLAInfo): GraphQlSlaInfo {
  return {
    firstResponseDueAt: toIsoUtc(sla.firstResponseDueAt),
    resolutionDueAt: toIsoUtc(sla.resolutionDueAt),
    firstResponseState: sla.firstResponseState,
    resolutionState: sla.resolutionState,
    firstResponseRemainingMinutes: sla.firstResponseRemainingMinutes,
    resolutionRemainingMinutes: sla.resolutionRemainingMinutes,
    firstResponseCompleted: sla.firstResponseCompleted,
    resolutionCompleted: sla.resolutionCompleted,
  };
}

function reporterScope(actor: AuthUser): { reporterId: string } | Record<never, never> {
  if (actor.role === "AGENT") {
    return {};
  }
  return { reporterId: actor.id };
}

function assertCanViewTicket(actor: AuthUser, ticket: TicketRecord): void {
  if (actor.role !== "AGENT" && ticket.reporterId !== actor.id) {
    throw new AppError("Ticket not found.", ErrorCode.TICKET_NOT_FOUND);
  }
}

export class TicketService {
  private readonly tickets: TicketRepository;
  private readonly comments: CommentRepository;
  private readonly users: UserRepository;
  private readonly holidays: HolidayRepository;

  constructor(prisma: PrismaClient) {
    this.tickets = new TicketRepository(prisma);
    this.comments = new CommentRepository(prisma);
    this.users = new UserRepository(prisma);
    this.holidays = new HolidayRepository(prisma);
  }

  async toView(ticket: TicketRecord, now = new Date()): Promise<TicketView> {
    const holidaySet = await this.holidays.dateKeySet();
    const sla = evaluateTicketSla({
      createdAt: ticket.createdAt,
      priority: ticket.priority,
      firstResponseAt: ticket.firstResponseAt,
      resolvedAt: ticket.resolvedAt,
      now,
      holidays: holidaySet,
      config: businessHoursConfig,
    });

    return {
      id: ticket.id,
      title: ticket.title,
      description: ticket.description,
      priority: ticket.priority,
      status: ticket.status,
      reporter: toUserView(ticket.reporter),
      assignee: ticket.assignee === null ? null : toUserView(ticket.assignee),
      createdAt: toIsoUtc(ticket.createdAt),
      firstResponseAt: ticket.firstResponseAt === null ? null : toIsoUtc(ticket.firstResponseAt),
      resolvedAt: ticket.resolvedAt === null ? null : toIsoUtc(ticket.resolvedAt),
      sla: toSlaView(sla),
      comments: ticket.comments.map((comment) => ({
        id: comment.id,
        content: comment.content,
        createdAt: toIsoUtc(comment.createdAt),
        author: toUserView(comment.author),
      })),
    };
  }

  async createTicket(actor: AuthUser, input: { title: string; description: string; priority: string }) {
    const title = requireNonEmpty(input.title, "Title");
    const description = requireNonEmpty(input.description, "Description");
    const priority = requirePriority(input.priority);
    const reporter = await this.users.findById(actor.id);
    if (reporter === null) {
      throw new AppError("User not found.", ErrorCode.USER_NOT_FOUND);
    }

    const createdAt = new Date();
    const holidaySet = await this.holidays.dateKeySet();
    const dues = computeDueDates(createdAt, priority, holidaySet, businessHoursConfig);

    const ticket = await this.tickets.create({
      title,
      description,
      priority,
      status: "OPEN",
      reporter: { connect: { id: reporter.id } },
      createdAt,
      firstResponseDueAt: dues.firstResponseDueAt,
      resolutionDueAt: dues.resolutionDueAt,
    });

    return this.toView(ticket, createdAt);
  }

  async getTicket(actor: AuthUser, id: string) {
    const ticket = await this.tickets.findById(id);
    if (ticket === null) {
      throw new AppError("Ticket not found.", ErrorCode.TICKET_NOT_FOUND);
    }
    assertCanViewTicket(actor, ticket);
    return this.toView(ticket);
  }

  async listTickets(
    actor: AuthUser,
    input: {
      status?: TicketStatus;
      priority?: Priority;
      assigneeId?: string;
      slaState?: SLAState;
      take?: number | null;
      cursor?: string | null;
    },
  ) {
    const take = Math.min(Math.max(input.take ?? 20, 1), 100);
    const scope = reporterScope(actor);

    if (input.slaState !== undefined) {
      const all = await this.tickets.listMatching({
        ...(input.status !== undefined ? { status: input.status } : { statusIn: ["OPEN", "IN_PROGRESS"] }),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
        ...(input.assigneeId !== undefined ? { assigneeId: input.assigneeId } : {}),
        ...scope,
      });
      const holidaySet = await this.holidays.dateKeySet();
      const now = new Date();
      const withSla = await Promise.all(
        all.map(async (ticket) => {
          const sla = evaluateTicketSla({
            createdAt: ticket.createdAt,
            priority: ticket.priority,
            firstResponseAt: ticket.firstResponseAt,
            resolvedAt: ticket.resolvedAt,
            now,
            holidays: holidaySet,
            config: businessHoursConfig,
          });
          return { ticket, state: effectiveSlaState(sla) };
        }),
      );
      const filtered = withSla.filter((row) => row.state === input.slaState).map((row) => row.ticket);

      let start = 0;
      if (input.cursor !== null && input.cursor !== undefined && input.cursor !== "") {
        const parsed = decodeCursor(input.cursor);
        start = filtered.findIndex((ticket) => ticket.id === parsed.id) + 1;
        if (start === 0) {
          start = filtered.findIndex(
            (ticket) =>
              ticket.createdAt.getTime() < parsed.createdAt.getTime() ||
              (ticket.createdAt.getTime() === parsed.createdAt.getTime() && ticket.id < parsed.id),
          );
          if (start < 0) {
            start = filtered.length;
          }
        }
      }

      const page = filtered.slice(start, start + take);
      const hasNextPage = start + take < filtered.length;
      const last = page[page.length - 1];
      return {
        nodes: await Promise.all(page.map((ticket) => this.toView(ticket, now))),
        pageInfo: {
          hasNextPage,
          endCursor: last === undefined ? null : encodeCursor(last.createdAt, last.id),
        },
      };
    }

    const cursor =
      input.cursor !== null && input.cursor !== undefined && input.cursor !== ""
        ? decodeCursor(input.cursor)
        : undefined;

    const rows = await this.tickets.list({
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.assigneeId !== undefined ? { assigneeId: input.assigneeId } : {}),
      ...scope,
      ...(cursor !== undefined ? { cursorCreatedAt: cursor.createdAt, cursorId: cursor.id } : {}),
      take: take + 1,
    });

    const hasNextPage = rows.length > take;
    const page = hasNextPage ? rows.slice(0, take) : rows;
    const last = page[page.length - 1];
    return {
      nodes: await Promise.all(page.map((ticket) => this.toView(ticket))),
      pageInfo: {
        hasNextPage,
        endCursor: last === undefined ? null : encodeCursor(last.createdAt, last.id),
      },
    };
  }

  async assignTicket(ticketId: string, assigneeId: string) {
    const ticket = await this.tickets.findById(ticketId);
    if (ticket === null) {
      throw new AppError("Ticket not found.", ErrorCode.TICKET_NOT_FOUND);
    }
    if (ticket.status === "CLOSED") {
      throw new AppError("Reopen a closed ticket before assigning it.", ErrorCode.VALIDATION_ERROR);
    }
    const assignee = await this.users.findById(assigneeId);
    if (assignee === null) {
      throw new AppError("Assignee not found.", ErrorCode.USER_NOT_FOUND);
    }
    if (assignee.role !== "AGENT") {
      throw new AppError("Tickets can only be assigned to agents.", ErrorCode.VALIDATION_ERROR);
    }

    const updated = await this.tickets.update(ticketId, {
      assignee: { connect: { id: assignee.id } },
      ...(ticket.status === "OPEN" ? { status: "IN_PROGRESS" } : {}),
    });
    return this.toView(updated);
  }

  async changeStatus(actor: AuthUser, ticketId: string, nextStatus: string) {
    const status = requireStatus(nextStatus);
    const ticket = await this.tickets.findById(ticketId);
    if (ticket === null) {
      throw new AppError("Ticket not found.", ErrorCode.TICKET_NOT_FOUND);
    }
    assertValidTransition(ticket.status, status);

    const data: {
      status: TicketStatus;
      resolvedAt?: Date;
      assignee?: { connect: { id: string } };
    } = { status };

    if ((status === "RESOLVED" || status === "CLOSED") && ticket.resolvedAt === null) {
      data.resolvedAt = new Date();
    }
    if (ticket.assignee === null && shouldClaimUnassignedTicket(status)) {
      data.assignee = { connect: { id: actor.id } };
    }

    const updated = await this.tickets.update(ticketId, data);
    return this.toView(updated);
  }

  async resolveTicket(actor: AuthUser, ticketId: string) {
    return this.changeStatus(actor, ticketId, "RESOLVED");
  }

  async addComment(actor: AuthUser, ticketId: string, content: string) {
    const body = requireNonEmpty(content, "Comment");
    if (body.length === 0) {
      throw new AppError("Comment must not be empty.", ErrorCode.INVALID_COMMENT);
    }

    const ticket = await this.tickets.findById(ticketId);
    if (ticket === null) {
      throw new AppError("Ticket not found.", ErrorCode.TICKET_NOT_FOUND);
    }

    if (actor.role !== "AGENT" && ticket.reporterId !== actor.id) {
      throw new AppError("You can only comment on your own tickets.", ErrorCode.FORBIDDEN);
    }

    const author = await this.users.findById(actor.id);
    if (author === null) {
      throw new AppError("User not found.", ErrorCode.USER_NOT_FOUND);
    }

    const comment = await this.comments.create({
      content: body,
      ticketId,
      authorId: author.id,
    });

    const isFirstResponse =
      ticket.firstResponseAt === null &&
      author.role === "AGENT" &&
      author.id !== ticket.reporterId;
    const claimAsAgent =
      ticket.assignee === null &&
      author.role === "AGENT" &&
      (ticket.status === "OPEN" || ticket.status === "IN_PROGRESS");

    if (isFirstResponse || claimAsAgent) {
      await this.tickets.update(ticketId, {
        ...(isFirstResponse ? { firstResponseAt: comment.createdAt } : {}),
        ...(claimAsAgent
          ? {
              assignee: { connect: { id: author.id } },
              ...(ticket.status === "OPEN" ? { status: "IN_PROGRESS" as const } : {}),
            }
          : {}),
      });
    }

    return {
      id: comment.id,
      content: comment.content,
      createdAt: toIsoUtc(comment.createdAt),
      author: toUserView(comment.author),
    };
  }

  async dashboard(actor: AuthUser) {
    const reporterId = actor.role === "AGENT" ? undefined : actor.id;
    const [counts, openish] = await Promise.all([
      this.tickets.countByStatus(reporterId),
      this.tickets.listMatching(reporterId === undefined ? {} : { reporterId }),
    ]);

    const byStatus: Record<TicketStatus, number> = {
      OPEN: 0,
      IN_PROGRESS: 0,
      RESOLVED: 0,
      CLOSED: 0,
    };
    for (const row of counts) {
      byStatus[row.status] = row._count._all;
    }

    const holidaySet = await this.holidays.dateKeySet();
    const now = new Date();
    let atRiskTickets = 0;
    let breachedTickets = 0;

    for (const ticket of openish) {
      if (ticket.status !== "OPEN" && ticket.status !== "IN_PROGRESS") {
        continue;
      }
      const sla = evaluateTicketSla({
        createdAt: ticket.createdAt,
        priority: ticket.priority,
        firstResponseAt: ticket.firstResponseAt,
        resolvedAt: ticket.resolvedAt,
        now,
        holidays: holidaySet,
        config: businessHoursConfig,
      });
      const state = effectiveSlaState(sla);
      if (state === "AT_RISK") {
        atRiskTickets += 1;
      }
      if (state === "BREACHED") {
        breachedTickets += 1;
      }
    }

    return {
      openTickets: byStatus.OPEN,
      inProgressTickets: byStatus.IN_PROGRESS,
      atRiskTickets,
      breachedTickets,
    };
  }
}

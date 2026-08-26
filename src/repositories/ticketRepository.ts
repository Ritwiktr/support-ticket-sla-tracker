import type { Prisma, PrismaClient, Priority, TicketStatus } from "@prisma/client";

export const ticketInclude = {
  reporter: true,
  assignee: true,
  comments: {
    include: { author: true },
    orderBy: { createdAt: "asc" as const },
  },
} satisfies Prisma.TicketInclude;

export type TicketRecord = Prisma.TicketGetPayload<{ include: typeof ticketInclude }>;

export type TicketListFilters = {
  status?: TicketStatus;
  statusIn?: TicketStatus[];
  priority?: Priority;
  assigneeId?: string;
  reporterId?: string;
  cursorCreatedAt?: Date;
  cursorId?: string;
  take: number;
};

function buildWhere(
  filters: Omit<TicketListFilters, "take" | "cursorCreatedAt" | "cursorId">,
): Prisma.TicketWhereInput {
  const where: Prisma.TicketWhereInput = {};
  if (filters.status !== undefined) {
    where.status = filters.status;
  } else if (filters.statusIn !== undefined) {
    where.status = { in: filters.statusIn };
  }
  if (filters.priority !== undefined) {
    where.priority = filters.priority;
  }
  if (filters.assigneeId !== undefined) {
    where.assigneeId = filters.assigneeId;
  }
  if (filters.reporterId !== undefined) {
    where.reporterId = filters.reporterId;
  }
  return where;
}

export class TicketRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findById(id: string) {
    return this.prisma.ticket.findUnique({
      where: { id },
      include: ticketInclude,
    });
  }

  create(data: Prisma.TicketCreateInput) {
    return this.prisma.ticket.create({
      data,
      include: ticketInclude,
    });
  }

  update(id: string, data: Prisma.TicketUpdateInput) {
    return this.prisma.ticket.update({
      where: { id },
      data,
      include: ticketInclude,
    });
  }

  list(filters: TicketListFilters) {
    const where = buildWhere(filters);
    if (filters.cursorCreatedAt !== undefined && filters.cursorId !== undefined) {
      where.OR = [
        { createdAt: { lt: filters.cursorCreatedAt } },
        { createdAt: filters.cursorCreatedAt, id: { lt: filters.cursorId } },
      ];
    }

    return this.prisma.ticket.findMany({
      where,
      include: ticketInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: filters.take,
    });
  }

  listMatching(filters: Omit<TicketListFilters, "take" | "cursorCreatedAt" | "cursorId">) {
    return this.prisma.ticket.findMany({
      where: buildWhere(filters),
      include: ticketInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
  }

  countByStatus(reporterId?: string) {
    return this.prisma.ticket.groupBy({
      by: ["status"],
      ...(reporterId !== undefined ? { where: { reporterId } } : {}),
      _count: { _all: true },
    });
  }
}

export class CommentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  create(data: { content: string; ticketId: string; authorId: string }) {
    return this.prisma.comment.create({
      data,
      include: { author: true },
    });
  }
}

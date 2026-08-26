import type { GraphQLContext } from "../../auth/context";
import { requireAgent, requireUser } from "../../auth/context";
import { TicketService } from "../../services/ticket/ticketService";
import type { Priority, TicketStatus } from "@prisma/client";
import type { SLAState } from "../../services/sla/types";

function tickets(ctx: GraphQLContext) {
  return new TicketService(ctx.prisma);
}

export const ticketResolvers = {
  Query: {
    tickets: async (
      _parent: unknown,
      args: {
        status?: TicketStatus | null;
        priority?: Priority | null;
        assigneeId?: string | null;
        slaState?: SLAState | null;
        take?: number | null;
        cursor?: string | null;
      },
      ctx: GraphQLContext,
    ) => {
      const user = requireUser(ctx);
      return tickets(ctx).listTickets(user, {
        ...(args.status !== null && args.status !== undefined ? { status: args.status } : {}),
        ...(args.priority !== null && args.priority !== undefined ? { priority: args.priority } : {}),
        ...(args.assigneeId !== null && args.assigneeId !== undefined
          ? { assigneeId: args.assigneeId }
          : {}),
        ...(args.slaState !== null && args.slaState !== undefined ? { slaState: args.slaState } : {}),
        ...(args.take !== undefined ? { take: args.take } : {}),
        ...(args.cursor !== undefined ? { cursor: args.cursor } : {}),
      });
    },
    ticket: async (_parent: unknown, args: { id: string }, ctx: GraphQLContext) => {
      const user = requireUser(ctx);
      return tickets(ctx).getTicket(user, args.id);
    },
    dashboard: async (_parent: unknown, _args: unknown, ctx: GraphQLContext) => {
      const user = requireUser(ctx);
      return tickets(ctx).dashboard(user);
    },
  },
  Mutation: {
    createTicket: async (
      _parent: unknown,
      args: { title: string; description: string; priority: Priority },
      ctx: GraphQLContext,
    ) => {
      const user = requireUser(ctx);
      return tickets(ctx).createTicket(user, args);
    },
    assignTicket: async (
      _parent: unknown,
      args: { ticketId: string; assigneeId: string },
      ctx: GraphQLContext,
    ) => {
      requireAgent(ctx);
      return tickets(ctx).assignTicket(args.ticketId, args.assigneeId);
    },
    changeTicketStatus: async (
      _parent: unknown,
      args: { ticketId: string; status: TicketStatus },
      ctx: GraphQLContext,
    ) => {
      const actor = requireAgent(ctx);
      return tickets(ctx).changeStatus(actor, args.ticketId, args.status);
    },
    addComment: async (
      _parent: unknown,
      args: { ticketId: string; content: string },
      ctx: GraphQLContext,
    ) => {
      const user = requireUser(ctx);
      return tickets(ctx).addComment(user, args.ticketId, args.content);
    },
    resolveTicket: async (_parent: unknown, args: { ticketId: string }, ctx: GraphQLContext) => {
      const actor = requireAgent(ctx);
      return tickets(ctx).resolveTicket(actor, args.ticketId);
    },
  },
};

import { authResolvers } from "./auth";
import { directoryResolvers } from "./user";
import { ticketResolvers } from "./ticket";

export const resolvers = {
  Query: {
    ...ticketResolvers.Query,
    ...directoryResolvers.Query,
  },
  Mutation: {
    ...authResolvers.Mutation,
    ...ticketResolvers.Mutation,
  },
};

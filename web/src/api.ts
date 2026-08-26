export type UserRole = "REPORTER" | "AGENT";
export type Priority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type TicketStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
export type SLAState = "ON_TRACK" | "AT_RISK" | "BREACHED";

export type User = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
};

export type SLAInfo = {
  firstResponseDueAt: string;
  resolutionDueAt: string;
  firstResponseState: SLAState;
  resolutionState: SLAState;
  firstResponseRemainingMinutes: number;
  resolutionRemainingMinutes: number;
  firstResponseCompleted: boolean;
  resolutionCompleted: boolean;
};

export type Comment = {
  id: string;
  content: string;
  createdAt: string;
  author: User;
};

export type AuditEventKind = "STATUS" | "ASSIGNEE";

export type TicketAuditEvent = {
  id: string;
  kind: AuditEventKind;
  fromValue: string | null;
  toValue: string;
  createdAt: string;
  actor: User;
};

export type Ticket = {
  id: string;
  title: string;
  description: string;
  priority: Priority;
  status: TicketStatus;
  reporter: User;
  assignee: User | null;
  createdAt: string;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  sla: SLAInfo;
  comments: Comment[];
  auditEvents?: TicketAuditEvent[];
};

export type TicketConnection = {
  nodes: Ticket[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
};

export type TicketDashboard = {
  openTickets: number;
  inProgressTickets: number;
  atRiskTickets: number;
  breachedTickets: number;
};

export type Holiday = {
  id: string;
  date: string;
  name: string;
};

export class ApiError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.code = code;
    this.name = "ApiError";
  }
}

const API_URL = "/graphql";

type GqlResponse<T> = {
  data?: T;
  errors?: Array<{ message: string; extensions?: { code?: string } }>;
};

export async function gql<T>(
  query: string,
  variables: Record<string, unknown> | undefined,
  token: string | null,
): Promise<T> {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token !== null ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });

  const json = (await response.json()) as GqlResponse<T>;
  const firstError = json.errors?.[0];
  if (firstError !== undefined) {
    throw new ApiError(firstError.message, firstError.extensions?.code ?? "GRAPHQL_ERROR");
  }
  if (json.data === undefined) {
    throw new ApiError("Empty GraphQL response.", "GRAPHQL_ERROR");
  }
  return json.data;
}

const TICKET_FIELDS = `
  id title description priority status createdAt firstResponseAt resolvedAt
  reporter { id name email role }
  assignee { id name email role }
  sla {
    firstResponseDueAt resolutionDueAt
    firstResponseState resolutionState
    firstResponseRemainingMinutes resolutionRemainingMinutes
    firstResponseCompleted resolutionCompleted
  }
  comments { id content createdAt author { id name email role } }
`;

const TICKET_DETAIL_FIELDS = `
  ${TICKET_FIELDS}
  auditEvents {
    id kind fromValue toValue createdAt
    actor { id name email role }
  }
`;

export const api = {
  login: (email: string, password: string) =>
    gql<{ login: { token: string; user: User } }>(
      `mutation ($email: String!, $password: String!) {
        login(email: $email, password: $password) { token user { id name email role } }
      }`,
      { email, password },
      null,
    ),
  register: (name: string, email: string, password: string, role: UserRole) =>
    gql<{ register: { token: string; user: User } }>(
      `mutation ($name: String!, $email: String!, $password: String!, $role: UserRole!) {
        register(name: $name, email: $email, password: $password, role: $role) {
          token user { id name email role }
        }
      }`,
      { name, email, password, role },
      null,
    ),
  dashboard: (token: string) =>
    gql<{ dashboard: TicketDashboard }>(
      `query { dashboard { openTickets inProgressTickets atRiskTickets breachedTickets } }`,
      undefined,
      token,
    ),
  tickets: (
    token: string,
    filters: {
      status?: TicketStatus;
      priority?: Priority;
      assigneeId?: string;
      slaState?: SLAState;
      cursor?: string;
    },
  ) =>
    gql<{ tickets: TicketConnection }>(
      `query ($status: TicketStatus, $priority: Priority, $assigneeId: ID, $slaState: SLAState, $cursor: String) {
        tickets(status: $status, priority: $priority, assigneeId: $assigneeId, slaState: $slaState, take: 50, cursor: $cursor) {
          nodes { ${TICKET_FIELDS} }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      {
        status: filters.status ?? null,
        priority: filters.priority ?? null,
        assigneeId: filters.assigneeId ?? null,
        slaState: filters.slaState ?? null,
        cursor: filters.cursor ?? null,
      },
      token,
    ),
  ticket: (token: string, id: string) =>
    gql<{ ticket: Ticket | null }>(`query ($id: ID!) { ticket(id: $id) { ${TICKET_DETAIL_FIELDS} } }`, { id }, token),
  users: (token: string, role?: UserRole) =>
    gql<{ users: User[] }>(
      `query ($role: UserRole) { users(role: $role) { id name email role } }`,
      { role: role ?? null },
      token,
    ),
  holidays: (token: string) =>
    gql<{ holidays: Holiday[] }>(`query { holidays { id date name } }`, undefined, token),
  createTicket: (token: string, input: { title: string; description: string; priority: Priority }) =>
    gql<{ createTicket: Ticket }>(
      `mutation ($title: String!, $description: String!, $priority: Priority!) {
        createTicket(title: $title, description: $description, priority: $priority) { ${TICKET_DETAIL_FIELDS} }
      }`,
      input,
      token,
    ),
  addComment: (token: string, ticketId: string, content: string) =>
    gql<{ addComment: Comment }>(
      `mutation ($ticketId: ID!, $content: String!) {
        addComment(ticketId: $ticketId, content: $content) {
          id content createdAt author { id name email role }
        }
      }`,
      { ticketId, content },
      token,
    ),
  assignTicket: (token: string, ticketId: string, assigneeId: string) =>
    gql<{ assignTicket: Ticket }>(
      `mutation ($ticketId: ID!, $assigneeId: ID!) {
        assignTicket(ticketId: $ticketId, assigneeId: $assigneeId) { ${TICKET_DETAIL_FIELDS} }
      }`,
      { ticketId, assigneeId },
      token,
    ),
  changeTicketStatus: (token: string, ticketId: string, status: TicketStatus) =>
    gql<{ changeTicketStatus: Ticket }>(
      `mutation ($ticketId: ID!, $status: TicketStatus!) {
        changeTicketStatus(ticketId: $ticketId, status: $status) { ${TICKET_DETAIL_FIELDS} }
      }`,
      { ticketId, status },
      token,
    ),
  resolveTicket: (token: string, ticketId: string) =>
    gql<{ resolveTicket: Ticket }>(
      `mutation ($ticketId: ID!) { resolveTicket(ticketId: $ticketId) { ${TICKET_DETAIL_FIELDS} } }`,
      { ticketId },
      token,
    ),
};

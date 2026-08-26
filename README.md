# Support Ticket & SLA Tracker

A schema-first GraphQL support desk. Reporters raise tickets, agents work them, and every SLA clock is measured in **business hours only** — nights, weekends, and configured holidays do not count.

## Tech stack

- **Runtime:** Node.js 20+ (TypeScript, strict)
- **API:** GraphQL Yoga, schema-first `.graphql` files
- **ORM / DB:** Prisma + PostgreSQL (Docker Compose)
- **Auth:** JWT + bcrypt
- **Frontend:** React 19 + Vite + TypeScript
- **Tests:** Vitest (unit + PostgreSQL integration)

## Architecture overview

```
src/
  graphql/          schema + thin resolvers
  services/
    sla/            isolated business-hours / SLA engine
    ticket/         ticket workflow, first response, dashboard, audit
    auth/           register / login
  repositories/     Prisma access
  http/             rate limiting + Yoga plugins
  observability/    JSON request logs
  validation/       input rules + AppError codes
  auth/             password hashing, JWT, GraphQL context
prisma/             schema, migrations, seed
web/                React UI
tests/unit|integration
```

Resolvers authenticate, then call services. They never compute SLA state. The SLA engine is a pure module with injectable `now`, timezone, and holiday set — that is why the unit tests do not need GraphQL or PostgreSQL.

## Database schema

- **User** — name, unique email, bcrypt `passwordHash`, `REPORTER | AGENT`
- **Ticket** — title, description, priority, status, reporter, optional assignee, `createdAt`, `firstResponseAt`, `resolvedAt`, persisted due timestamps
- **TicketAuditEvent** — status and assignee changes (actor, previous value, new value, timestamp)
- **Comment** — belongs to a ticket, records author
- **Holiday** — unique calendar date + name

Indexes exist on `status`, `priority`, `assigneeId`, `createdAt`, and `(status, priority)`.

PostgreSQL also enforces non-empty names/titles/comments, emails that contain `@`, and `resolutionDueAt >= firstResponseDueAt`. Status-transition rules stay in application code because reopen keeps historical freeze timestamps.

## SLA calculation

Business hours: **Monday–Friday, 09:00–18:00** in `BUSINESS_TIMEZONE` (default `Asia/Kolkata`). That is 9 business hours per working day.

Default policies:

| Priority | First response | Resolution |
| --- | --- | --- |
| URGENT | 1h | 4h |
| HIGH | 4h | 24h |
| MEDIUM | 8h | 48h |
| LOW | 24h | 72h |

`addBusinessMinutes` snaps a timestamp forward to the next business period, then consumes only time inside 09:00–18:00, skipping weekends and holiday dates (`YYYY-MM-DD` in the business timezone).

### SLA state

Each clock is independently:

- **ON_TRACK** — 0%–75% of the budget consumed (**exactly 75% is ON_TRACK**)
- **AT_RISK** — **strictly greater than 75%** consumed, deadline not yet passed
- **BREACHED** — the evaluation instant is after the due timestamp

Clocks **freeze** when their event happens:

- First **agent** comment (the reporter of the ticket does not count, even if that user is an agent) → `firstResponseAt`
- Resolve / close without a prior resolution → `resolvedAt`
- Close / resolve without an agent reply freezes the first-response clock at that instant so remaining time does not keep ticking. The clock is not marked completed unless an agent actually replied.

A completed on-time clock never later becomes `BREACHED`. Remaining minutes for an active clock are business minutes from `now` to due; for a frozen clock they are business minutes from the event to due (0 if late).

List filters and the dashboard use the **effective** SLA: first-response clock until it completes, then the resolution clock. At-risk / breached filters without an explicit status only include **Open** and **In progress**, matching the dashboard cards.

The UI only **displays** `firstResponseState`, `resolutionState`, and remaining minutes. It does not re-run business-hour math. Inbox and ticket detail **refetch those API fields on an interval** so remaining time stays live as business minutes elapse.

## Status transition rules

```
OPEN        → IN_PROGRESS | RESOLVED | CLOSED
IN_PROGRESS → OPEN | RESOLVED | CLOSED
RESOLVED    → CLOSED | OPEN | IN_PROGRESS     (reopen)
CLOSED      → OPEN                            (explicit reopen only)
```

`CLOSED → IN_PROGRESS` is rejected with `INVALID_STATUS_TRANSITION`. Same-status updates are no-ops. Resolving or closing a ticket that has no `resolvedAt` freezes the resolution SLA.

Assignment is kept in sync with work:

- **Assign** an Open ticket → that agent owns it and status becomes `IN_PROGRESS`
- **Start work** / **Resolve** on an unassigned ticket → claimed by the acting agent (existing assignee is never overwritten)
- **Close** from the Open queue does **not** auto-assign
- Returning `IN_PROGRESS → OPEN` keeps the assignee
- An agent comment on an unassigned Open or In-progress ticket also claims it. Reporter comments do not.
- Closed tickets cannot be assigned until they are reopened.

## Authentication

- Passwords hashed with bcrypt (12 rounds), never stored in plain text
- JWT (`Authorization: Bearer …`), 7-day expiry
- Public `register` always creates a **REPORTER**. Requesting `AGENT` returns `FORBIDDEN`
- Authenticated users may create tickets and comment on tickets they can see
- **REPORTER** users only list, open, and comment on **their own** tickets. Dashboard counts are scoped the same way
- **AGENT** only: assign, change status, resolve, list users

## Environment variables

See `.env.example`:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | JWT signing secret |
| `BUSINESS_TIMEZONE` | IANA zone for business hours |
| `PORT` | API port (default 4000) |
| `WEB_ORIGIN` | CORS origin for the Vite app |
| `RATE_LIMIT_DISABLED` | Set `1` to turn off in-memory rate limiting (`NODE_ENV=test` also disables it) |

## Setup

```bash
cp .env.example .env
docker compose up -d
npm install
npx prisma generate
npm run migrate -- --name init   # first clone only, if migrations are already present skip this
npm run gendb
npm run dev
```

Recommended happy path once migrations are in the repo:

```bash
docker compose up -d && npm install && npm run gendb && npm run dev
```

- GraphQL API + GraphiQL: http://localhost:4000/graphql (`http://localhost:4000` redirects here)
- Web UI: http://localhost:5173 (or 5174 if 5173 is already taken)

PostgreSQL is published on **host port 55432** to avoid clashing with a local Postgres on 5432.

`docker compose up -d` starts **Postgres only**, so `npm run dev` can still bind port 4000. To run the API in Docker as well:

```bash
docker compose --profile app up --build
```

That container applies migrations on boot and serves GraphQL on port 4000. Keep using `npm run dev:web` for the Vite UI.

### Seed credentials

| Email | Password | Role |
| --- | --- | --- |
| `reporter@example.com` | `Password123!` | REPORTER (Asha) |
| `rahul.reporter@example.com` | `Password123!` | REPORTER (Rahul) |
| `priya.reporter@example.com` | `Password123!` | REPORTER (Priya) |
| `agent@example.com` | `Password123!` | AGENT (Vikram) |
| `meera.agent@example.com` | `Password123!` | AGENT (Meera) |

Holidays: Independence Day `2026-08-15`, Company Foundation Day `2026-08-17`.

## Tests

```bash
npm test              # unit + integration (integration needs DATABASE_URL + migrated DB)
npm run test:unit
npm run test:integration
npm run typecheck
npm run lint
```

The integration test talks to **real PostgreSQL** via Prisma. It creates a ticket, a reporter comment, then an agent comment, and asserts `firstResponseAt`, persisted due timestamps, claim-on-start-work, reporter isolation, and audit rows for status/assignee changes.

GitHub Actions (`.github/workflows/ci.yml`) runs migrate, typecheck, lint, and the same Vitest suite against Postgres.

## Bonus features included

- **Dockerized API** — `Dockerfile` plus `docker compose --profile app`
- **Database checks** — empty-string and due-date order constraints
- **Audit trail** — `ticket.auditEvents` for status and assignee changes
- **Live SLA remaining** — inbox every 15s, ticket detail every 10s, values still computed only on the server
- **Rate limiting** — 20 login/register attempts per IP per 10 minutes; 300 GraphQL operations per IP per minute
- **Observability** — JSON logs for each GraphQL operation (`operation`, `ms`, `userId`)
- **CI pipeline** — GitHub Actions with Postgres

## Example GraphQL

```graphql
mutation {
  login(email: "agent@example.com", password: "Password123!") {
    token
    user { id role }
  }
}

query {
  dashboard { openTickets inProgressTickets atRiskTickets breachedTickets }
  tickets(status: OPEN, take: 20) {
    nodes {
      id title priority status
      sla { firstResponseState firstResponseRemainingMinutes resolutionState }
    }
    pageInfo { hasNextPage endCursor }
  }
}

mutation {
  createTicket(title: "VPN down", description: "Office tunnel failing", priority: HIGH) {
    id
    sla { firstResponseDueAt resolutionDueAt firstResponseState }
  }
}
```

Send `Authorization: Bearer <token>` on subsequent operations.

Ticket history (status and assignee) is `auditEvents` on `ticket(id: …)`.

## How I'd extend this

- Pause SLA clocks while `WAITING_ON_CUSTOMER`
- Per-team calendars, holiday sets, and multiple timezones
- Escalation / email notifications when AT_RISK or BREACHED is crossed
- Recurring holidays (e.g. “every 15 August”)
- Store a materialized effective SLA state for cheaper filtered pagination at scale
- Agent performance metrics (first-response time, breach rate)
- Browser end-to-end tests

## Walkthrough

See [WALKTHROUGH.md](./WALKTHROUGH.md) for a 5–10 minute architecture tour.

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
    ticket/         ticket workflow, first response, dashboard
    auth/           register / login
  repositories/     Prisma access
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
- **Comment** — belongs to a ticket, records author
- **Holiday** — unique calendar date + name

Indexes exist on `status`, `priority`, `assigneeId`, `createdAt`, and `(status, priority)`.

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

- First comment by someone other than the reporter → `firstResponseAt`
- Resolve / close without a prior resolution → `resolvedAt`

A completed on-time clock never later becomes `BREACHED`. Remaining minutes for an active clock are business minutes from `now` to due; for a frozen clock they are business minutes from the event to due (0 if late).

List filters and the dashboard use the **effective** SLA: first-response clock until it completes, then the resolution clock.

The UI only **displays** `firstResponseState`, `resolutionState`, and remaining minutes. It does not re-run business-hour math.

## Status transition rules

```
OPEN        → IN_PROGRESS | RESOLVED | CLOSED
IN_PROGRESS → OPEN | RESOLVED | CLOSED
RESOLVED    → CLOSED | OPEN | IN_PROGRESS     (reopen)
CLOSED      → OPEN                            (explicit reopen only)
```

`CLOSED → IN_PROGRESS` is rejected with `INVALID_STATUS_TRANSITION`. Same-status updates are no-ops. Resolving or closing a ticket that has no `resolvedAt` freezes the resolution SLA.

## Authentication

- Passwords hashed with bcrypt (12 rounds), never stored in plain text
- JWT (`Authorization: Bearer …`), 7-day expiry
- Public `register` always creates a **REPORTER**. Requesting `AGENT` returns `FORBIDDEN`
- Authenticated users may create tickets and comment
- **AGENT** only: assign, change status, resolve

## Environment variables

See `.env.example`:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | JWT signing secret |
| `BUSINESS_TIMEZONE` | IANA zone for business hours |
| `PORT` | API port (default 4000) |
| `WEB_ORIGIN` | CORS origin for the Vite app |

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

- GraphQL API + GraphiQL: http://localhost:4000/graphql
- Web UI: http://localhost:5173

PostgreSQL is published on **host port 55432** to avoid clashing with a local Postgres on 5432.

### Seed credentials

| Email | Password | Role |
| --- | --- | --- |
| `reporter@example.com` | `Password123!` | REPORTER |
| `agent@example.com` | `Password123!` | AGENT |

Holidays: Independence Day `2026-08-15`, Company Foundation Day `2026-08-17`.

## Tests

```bash
npm test              # unit + integration (integration needs DATABASE_URL + migrated DB)
npm run test:unit
npm run test:integration
npm run typecheck
npm run lint
```

The integration test talks to **real PostgreSQL** via Prisma. It creates a ticket, a reporter comment, then an agent comment, and asserts `firstResponseAt` plus persisted due timestamps.

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

## How I'd extend this

- Pause SLA clocks while `WAITING_ON_CUSTOMER`
- Per-team calendars and holiday sets
- Escalation notifications as AT_RISK / BREACHED thresholds are crossed
- Audit log for assignee and status changes
- Recurring holidays (e.g. “every 15 August”)
- Store a materialized effective SLA state for cheaper filtered pagination at scale
- Agent performance metrics (first-response time, breach rate)

## Walkthrough

See [WALKTHROUGH.md](./WALKTHROUGH.md) for a 5–10 minute architecture tour.

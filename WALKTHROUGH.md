# Walkthrough (5–10 minutes)

## Overall architecture

The API is a GraphQL Yoga server with a **schema-first** `.graphql` file and TypeScript resolvers. Resolvers handle authz and then call services. Prisma repositories own SQL. The SLA engine is a pure function of `(createdAt, priority, freeze timestamps, now, holidays, timezone)` so it can be unit-tested without Yoga or Postgres.

The React app is a Vite SPA. It displays SLA fields from the API and never decides ON_TRACK / AT_RISK / BREACHED itself.

## GraphQL schema

Core types match the assignment: `Ticket`, `Priority`, `TicketStatus`, plus `SLAInfo`, `TicketConnection` (cursor pagination), `TicketDashboard`, `User`, `Holiday`, and auth mutations. Errors use GraphQL `extensions.code` values such as `VALIDATION_ERROR`, `TICKET_NOT_FOUND`, `FORBIDDEN`, and `INVALID_STATUS_TRANSITION`.

## Database schema

Users, tickets, comments, holidays. Tickets store UTC `Timestamptz` values, including `firstResponseDueAt` / `resolutionDueAt` snapshots computed at creation. Due times are **recomputed live** when serving SLA so a holiday added to the calendar still affects open tickets. Comments cascade with tickets.

## SLA calculation

First-response is the first **agent** comment. Closed tickets without a reply freeze that clock at close time without marking the reply complete.

Default budgets are the assignment table (URGENT 1h/4h, HIGH 4h/24h, MEDIUM 8h/48h, LOW 24h/72h). Consumption ratio vs 75% uses a strict greater-than: **75.0% is ON_TRACK**, **75.0%+ε is AT_RISK**. Breach is `evaluationInstant > dueAt`.

## Business hours

Luxon, zone `BUSINESS_TIMEZONE`. Snap-forward rules:

- Before 09:00 on a business day → 09:00 same day
- After 18:00 → next business day 09:00
- Weekend / holiday → next business day 09:00

Friday 17:00 + 4 business hours → Monday 12:00. If Monday is a holiday → Tuesday 12:00.

## Timezones

Persisted and returned as ISO-8601 UTC. Business math uses the configured IANA zone. The UI calls `toLocaleString()` so timestamps render in the browser's local zone.

## Status transitions

Documented in the README. Closed tickets must be explicitly reopened to `OPEN` before they can move to `IN_PROGRESS`.

## Testing strategy

- Unit: snap/add/elapsed business minutes, holiday/weekend/Friday-evening cases, AT_RISK/BREACHED/freeze, validation, illegal transitions
- Integration: real Postgres — create ticket, reporter comment does not set `firstResponseAt`, agent comment does, second agent comment does not change it, due timestamps persisted

## Tradeoffs

- SLA filtering paginates in memory after computing state, which is correct for this dataset size but would need a materialized column at scale
- Reopening keeps `resolvedAt` / `firstResponseAt` so historical clocks stay frozen rather than starting a new SLA cycle
- Self-registration cannot create agents

-- CreateEnum
CREATE TYPE "AuditEventKind" AS ENUM ('STATUS', 'ASSIGNEE');

-- CreateTable
CREATE TABLE "TicketAuditEvent" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "kind" "AuditEventKind" NOT NULL,
    "fromValue" TEXT,
    "toValue" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TicketAuditEvent_ticketId_createdAt_idx" ON "TicketAuditEvent"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "TicketAuditEvent_actorId_idx" ON "TicketAuditEvent"("actorId");

-- AddForeignKey
ALTER TABLE "TicketAuditEvent" ADD CONSTRAINT "TicketAuditEvent_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketAuditEvent" ADD CONSTRAINT "TicketAuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Database-level checks (empty strings, due-date order)
ALTER TABLE "User" ADD CONSTRAINT "User_name_not_empty" CHECK (char_length(btrim("name")) > 0);
ALTER TABLE "User" ADD CONSTRAINT "User_email_has_at" CHECK (position('@' in "email") > 1);
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_title_not_empty" CHECK (char_length(btrim("title")) > 0);
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_description_not_empty" CHECK (char_length(btrim("description")) > 0);
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_due_order" CHECK ("resolutionDueAt" >= "firstResponseDueAt");
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_content_not_empty" CHECK (char_length(btrim("content")) > 0);
ALTER TABLE "Holiday" ADD CONSTRAINT "Holiday_name_not_empty" CHECK (char_length(btrim("name")) > 0);

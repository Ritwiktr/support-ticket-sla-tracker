import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError, api, type Priority, type Ticket, type TicketStatus } from "../api";
import { useAuth } from "../auth";
import { formatLocal, prettyLabel, relativeTime } from "../format";
import { Avatar, Badge, SlaMeter } from "../ui";

const PRIORITY_HINTS: Record<Priority, string> = {
  URGENT: "1h / 4h",
  HIGH: "4h / 24h",
  MEDIUM: "8h / 48h",
  LOW: "24h / 72h",
};

export function NewTicketPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("MEDIUM");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (token === null) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      const result = await api.createTicket(token, { title, description, priority });
      navigate(`/tickets/${result.createTicket.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? `${err.code}: ${err.message}` : "Could not create ticket.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="create-wrap">
      <Link className="back-link" to="/">← Back to inbox</Link>
      <div className="page-head">
        <div>
          <p className="page-kicker">New request</p>
          <h1 className="page-title">Raise a ticket</h1>
          <p className="lede">Priority selects first-response and resolution budgets. Due times are calculated in business hours only.</p>
        </div>
      </div>
      <form className="card stack" onSubmit={(event) => void onSubmit(event)}>
        {error !== null ? <div className="error">{error}</div> : null}
        <label>
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Short summary of the issue" required />
        </label>
        <label>
          Description
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What happened, who is affected, and how to reproduce it." required />
        </label>
        <div>
          <div className="section-kicker">Priority</div>
          <div className="priority-grid">
            {(["URGENT", "HIGH", "MEDIUM", "LOW"] as const).map((option) => (
              <button
                className={`priority-option ${option} ${priority === option ? "selected" : ""}`}
                key={option}
                type="button"
                onClick={() => setPriority(option)}
              >
                {prettyLabel(option)}
                <small>{PRIORITY_HINTS[option]}</small>
              </button>
            ))}
          </div>
        </div>
        <button className="primary" type="submit" disabled={pending}>{pending ? "Creating…" : "Create ticket"}</button>
      </form>
    </div>
  );
}

const WORKFLOW: readonly TicketStatus[] = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"];

const STATUS_EXITS: Record<TicketStatus, readonly TicketStatus[]> = {
  OPEN: ["IN_PROGRESS", "RESOLVED", "CLOSED"],
  IN_PROGRESS: ["OPEN", "RESOLVED", "CLOSED"],
  RESOLVED: ["CLOSED", "OPEN", "IN_PROGRESS"],
  CLOSED: ["OPEN"],
};

function canTransition(from: TicketStatus, to: TicketStatus): boolean {
  return STATUS_EXITS[from].includes(to);
}

type StatusMove = {
  to: TicketStatus;
  label: string;
  hint: string;
  variant: "primary" | "secondary" | "ghost";
};

function statusMoves(status: TicketStatus): StatusMove[] {
  switch (status) {
    case "OPEN":
      return [
        { to: "IN_PROGRESS", label: "Start work", hint: "Assigns this ticket to you if it is unassigned, then moves it to In progress", variant: "primary" },
        { to: "RESOLVED", label: "Resolve", hint: "Mark fixed without starting work. Assigns to you if unassigned.", variant: "secondary" },
        { to: "CLOSED", label: "Close", hint: "Close without resolving", variant: "ghost" },
      ];
    case "IN_PROGRESS":
      return [
        { to: "RESOLVED", label: "Resolve ticket", hint: "Mark the issue as fixed. Assigns to you if it is still unassigned.", variant: "primary" },
        { to: "CLOSED", label: "Close", hint: "Close without resolving", variant: "secondary" },
        { to: "OPEN", label: "Return to open", hint: "Stop work and send it back to the queue", variant: "ghost" },
      ];
    case "RESOLVED":
      return [
        { to: "CLOSED", label: "Close ticket", hint: "Archive this as done", variant: "primary" },
        { to: "IN_PROGRESS", label: "Resume work", hint: "It is not actually resolved. Assigns to you if unassigned.", variant: "secondary" },
        { to: "OPEN", label: "Return to open", hint: "Send it back to the queue", variant: "ghost" },
      ];
    case "CLOSED":
      return [
        { to: "OPEN", label: "Reopen ticket", hint: "Closed tickets can only return to Open", variant: "primary" },
      ];
  }
}

function successForStatus(status: TicketStatus): string {
  switch (status) {
    case "OPEN":
      return "Ticket reopened";
    case "IN_PROGRESS":
      return "Status set to In progress";
    case "RESOLVED":
      return "Ticket resolved";
    case "CLOSED":
      return "Ticket closed";
  }
}

function AgentActions({
  ticket,
  agents,
  assigneeId,
  pending,
  error,
  notice,
  currentUserName,
  onAssigneeChange,
  onAssign,
  onClaim,
  onStatus,
}: {
  ticket: Ticket;
  agents: Array<{ id: string; name: string }>;
  assigneeId: string;
  pending: boolean;
  error: string | null;
  notice: string | null;
  currentUserName: string;
  onAssigneeChange: (id: string) => void;
  onAssign: () => void;
  onClaim: () => void;
  onStatus: (status: TicketStatus, success: string) => void;
}) {
  const currentAssigneeId = ticket.assignee?.id ?? "";
  const unassigned = ticket.assignee === null;
  const assignmentDirty = assigneeId !== "" && assigneeId !== currentAssigneeId;
  const selectedAgent = agents.find((agent) => agent.id === assigneeId);
  const assignLabel = assignmentDirty
    ? `Assign to ${selectedAgent?.name ?? "agent"}`
    : ticket.assignee !== null
      ? `Assigned to ${ticket.assignee.name}`
      : "Pick an agent first";
  const currentIndex = WORKFLOW.indexOf(ticket.status);

  return (
    <div className="action-panel">
      <div className="action-status">
        <span className="section-kicker">Workflow</span>
        <Badge value={ticket.status} />
      </div>
      <div className="workflow" aria-label="Ticket workflow">
        {WORKFLOW.map((step, index) => {
          const className = step === ticket.status ? "current" : index < currentIndex ? "done" : "";
          return (
            <div className={`workflow-step ${className}`.trim()} key={step}>
              {prettyLabel(step)}
            </div>
          );
        })}
      </div>
      {error !== null ? <div className="error">{error}</div> : null}
      {notice !== null ? <div className="notice">{notice}</div> : null}

      <div>
        <div className="section-kicker">Assignment</div>
        {unassigned ? (
          <p className="claim-callout">
            Nobody owns this ticket yet. Start work assigns it to you, or pick another agent below.
          </p>
        ) : null}
        <div className="assign-row">
          <label>
            Agent
            <select value={assigneeId} onChange={(e) => onAssigneeChange(e.target.value)} disabled={pending}>
              <option value="">Unassigned</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>{agent.name}</option>
              ))}
            </select>
          </label>
          <button
            className={assignmentDirty ? "primary" : "secondary"}
            type="button"
            disabled={pending || !assignmentDirty}
            title={assignmentDirty ? "Save this assignee" : "Choose a different agent to enable Assign"}
            onClick={onAssign}
          >
            {pending && assignmentDirty ? "Saving…" : assignLabel}
          </button>
        </div>
        {unassigned ? (
          <button
            className={`claim-btn ${ticket.status === "OPEN" ? "secondary" : "primary"}`}
            type="button"
            disabled={pending}
            onClick={onClaim}
          >
            Assign to me ({currentUserName})
          </button>
        ) : null}
        <p className="muted">
          Start work and Resolve claim an unassigned ticket for you. Assigning an Open ticket also starts work.
        </p>
      </div>

      <div className="status-actions">
        <div className="section-kicker">Status</div>
        {statusMoves(ticket.status).map((move) => {
          const allowed = canTransition(ticket.status, move.to);
          return (
            <button
              className={move.variant}
              key={move.to}
              type="button"
              disabled={pending || !allowed}
              title={move.hint}
              onClick={() => onStatus(move.to, successForStatus(move.to))}
            >
              {move.label}
            </button>
          );
        })}
        <p className="muted">
          {ticket.status === "CLOSED"
            ? "Reopen first. Closed tickets cannot jump to In progress."
            : unassigned && ticket.status === "OPEN"
              ? "Start work puts this in progress and assigns it to you. Closing from the queue leaves it unassigned."
              : "The filled button is the next normal step. Other valid moves stay available as quieter actions."}
        </p>
      </div>
    </div>
  );
}

export function TicketDetailPage({ ticketId }: { ticketId: string }) {
  const { token, user } = useAuth();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [agents, setAgents] = useState<Array<{ id: string; name: string }>>([]);
  const [comment, setComment] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const isAgent = user?.role === "AGENT";

  async function reload() {
    if (token === null) {
      return;
    }
    const [detail, users] = await Promise.all([api.ticket(token, ticketId), api.users(token, "AGENT")]);
    setTicket(detail.ticket);
    setAgents(users.users);
    setAssigneeId(detail.ticket?.assignee?.id ?? "");
  }

  useEffect(() => {
    void reload().catch((err: unknown) => {
      setError(err instanceof ApiError ? `${err.code}: ${err.message}` : "Failed to load ticket.");
    });
  }, [ticketId, token]);

  async function run(action: () => Promise<Ticket | void>, success?: string) {
    setError(null);
    setNotice(null);
    setPending(true);
    try {
      const updated = await action();
      if (updated !== undefined) {
        setTicket(updated);
        setAssigneeId(updated.assignee?.id ?? "");
      } else {
        await reload();
      }
      if (success !== undefined) {
        setNotice(success);
      }
    } catch (err) {
      setError(err instanceof ApiError ? `${err.code}: ${err.message}` : "Request failed.");
    } finally {
      setPending(false);
    }
  }

  if (ticket === null) {
    return error !== null ? (
      <div className="error">{error}</div>
    ) : (
      <div className="detail-grid">
        <div className="card skeleton-card" />
        <div className="card skeleton-card" />
      </div>
    );
  }

  const firstResponseComment = ticket.comments.find(
    (item) => item.author.role === "AGENT" && item.author.id !== ticket.reporter.id,
  );

  return (
    <>
      <Link className="back-link" to="/">← Inbox</Link>
      <div className="page-head">
        <div>
          <p className="page-kicker">
            <span className="ticket-id">#{ticket.id.slice(-8)}</span>
            <span> · raised {relativeTime(ticket.createdAt)}</span>
          </p>
          <h1 className="page-title">{ticket.title}</h1>
          <p className="lede">{formatLocal(ticket.createdAt)}</p>
        </div>
        <div className="ticket-flags">
          <Badge value={ticket.priority} />
          <Badge value={ticket.status} />
        </div>
      </div>
      {error !== null ? <div className="error">{error}</div> : null}
      {notice !== null ? <div className="notice">{notice}</div> : null}
      <div className="detail-grid">
        <section className="card conversation-card">
          <p className="ticket-body">{ticket.description}</p>
          <div className="conversation-head">
            <h3>Conversation</h3>
            <span className="muted">{ticket.comments.length} {ticket.comments.length === 1 ? "note" : "notes"}</span>
          </div>
          {ticket.comments.length === 0 ? (
            <p className="muted empty-thread">No comments yet. The first non-reporter reply becomes first response and freezes that clock.</p>
          ) : null}
          <div className="comment-thread">
            {ticket.comments.map((item) => {
              const mine = item.author.id === user?.id;
              return (
                <div className={`comment ${mine ? "mine" : ""} ${item.author.role.toLowerCase()}`} key={item.id}>
                  <Avatar name={item.author.name} />
                  <div className="comment-bubble">
                    <div className="comment-meta">
                      <strong>{item.author.name}</strong>
                      <span className="muted">{prettyLabel(item.author.role)} · {relativeTime(item.createdAt)}</span>
                      {firstResponseComment?.id === item.id ? <span className="first-response-tag">First response</span> : null}
                    </div>
                    <p>{item.content}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <form
            className="composer"
            onSubmit={(event) => {
              event.preventDefault();
              if (token === null) return;
              void run(async () => {
                await api.addComment(token, ticket.id, comment);
                setComment("");
              }, "Comment posted");
            }}
          >
            <label>
              Add comment
              <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Share an update…" required />
            </label>
            <button className="primary" type="submit" disabled={pending}>Post comment</button>
          </form>
        </section>
        <aside className="card stack sticky-aside">
          <div>
            <span className="section-kicker">People</span>
            <div className="ticket-meta people-row">
              <Avatar name={ticket.reporter.name} size="sm" />
              <div>
                <strong>{ticket.reporter.name}</strong>
                <div className="muted">Reporter</div>
              </div>
            </div>
            <div className={`ticket-meta people-row ${ticket.assignee === null ? "unassigned" : ""}`}>
              <Avatar name={ticket.assignee?.name ?? "Unassigned"} size="sm" />
              <div>
                <strong>{ticket.assignee?.name ?? "Unassigned"}</strong>
                <div className="muted">Assignee</div>
              </div>
            </div>
          </div>
          <SlaMeter
            title="First response"
            state={ticket.sla.firstResponseState}
            remainingMinutes={ticket.sla.firstResponseRemainingMinutes}
            dueAt={ticket.sla.firstResponseDueAt}
            completed={ticket.sla.firstResponseCompleted}
            dueLabel="first response"
          />
          <SlaMeter
            title="Resolution"
            state={ticket.sla.resolutionState}
            remainingMinutes={ticket.sla.resolutionRemainingMinutes}
            dueAt={ticket.sla.resolutionDueAt}
            completed={ticket.sla.resolutionCompleted}
            dueLabel="resolution"
          />
          {isAgent && token !== null && user !== null ? (
            <AgentActions
              ticket={ticket}
              agents={agents}
              assigneeId={assigneeId}
              pending={pending}
              error={error}
              notice={notice}
              currentUserName={user.name}
              onAssigneeChange={setAssigneeId}
              onAssign={() =>
                void run(
                  async () => (await api.assignTicket(token, ticket.id, assigneeId)).assignTicket,
                  "Assignee updated",
                )
              }
              onClaim={() =>
                void run(
                  async () => (await api.assignTicket(token, ticket.id, user.id)).assignTicket,
                  `Assigned to ${user.name}`,
                )
              }
              onStatus={(status, success) =>
                void run(async () => {
                  const shouldClaim =
                    ticket.assignee === null && (status === "IN_PROGRESS" || status === "RESOLVED");
                  let next = ticket;
                  if (shouldClaim) {
                    next = (await api.assignTicket(token, ticket.id, user.id)).assignTicket;
                  }
                  if (status === "IN_PROGRESS") {
                    if (next.status === "IN_PROGRESS") {
                      return next;
                    }
                    return (await api.changeTicketStatus(token, ticket.id, "IN_PROGRESS")).changeTicketStatus;
                  }
                  if (status === "RESOLVED") {
                    if (next.status === "RESOLVED") {
                      return next;
                    }
                    return (await api.resolveTicket(token, ticket.id)).resolveTicket;
                  }
                  return (await api.changeTicketStatus(token, ticket.id, status)).changeTicketStatus;
                }, ticket.assignee === null && (status === "IN_PROGRESS" || status === "RESOLVED")
                  ? `${success} · assigned to you`
                  : success)
              }
            />
          ) : null}
        </aside>
      </div>
    </>
  );
}

import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, api, type Priority } from "../api";
import { useAuth } from "../auth";

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
    <>
      <h1 className="page-title">Raise a ticket</h1>
      <p className="lede">Priority selects the first-response and resolution SLA budgets.</p>
      <form className="card stack" onSubmit={(event) => void onSubmit(event)}>
        {error !== null ? <div className="error">{error}</div> : null}
        <label>
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} required />
        </label>
        <label>
          Description
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} required />
        </label>
        <label>
          Priority
          <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
            <option>URGENT</option>
            <option>HIGH</option>
            <option>MEDIUM</option>
            <option>LOW</option>
          </select>
        </label>
        <button type="submit" disabled={pending}>{pending ? "Creating…" : "Create ticket"}</button>
      </form>
    </>
  );
}

export function TicketDetailPage({ ticketId }: { ticketId: string }) {
  const { token, user } = useAuth();
  const [ticket, setTicket] = useState<Awaited<ReturnType<typeof api.ticket>>["ticket"]>(null);
  const [agents, setAgents] = useState<Array<{ id: string; name: string }>>([]);
  const [comment, setComment] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [error, setError] = useState<string | null>(null);
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

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? `${err.code}: ${err.message}` : "Request failed.");
    }
  }

  if (ticket === null) {
    return error !== null ? <div className="error">{error}</div> : <p>Loading…</p>;
  }

  return (
    <>
      <h1 className="page-title">{ticket.title}</h1>
      <p className="lede">#{ticket.id.slice(-8)} · raised {new Date(ticket.createdAt).toLocaleString()}</p>
      {error !== null ? <div className="error">{error}</div> : null}
      <div className="detail-grid">
        <section className="card">
          <p>{ticket.description}</p>
          <h3>Comments</h3>
          {ticket.comments.map((item) => (
            <div className="comment" key={item.id}>
              <strong>{item.author.name}</strong> <span className="muted">{item.author.role} · {new Date(item.createdAt).toLocaleString()}</span>
              <p>{item.content}</p>
            </div>
          ))}
          <form
            className="stack"
            onSubmit={(event) => {
              event.preventDefault();
              if (token === null) return;
              void run(async () => {
                await api.addComment(token, ticket.id, comment);
                setComment("");
              });
            }}
          >
            <label>
              Add comment
              <textarea value={comment} onChange={(e) => setComment(e.target.value)} required />
            </label>
            <button type="submit">Comment</button>
          </form>
        </section>
        <aside className="card stack">
          <div><span className={`badge ${ticket.priority}`}>{ticket.priority}</span> <span className={`badge ${ticket.status}`}>{ticket.status}</span></div>
          <div>
            <strong>Reporter</strong>
            <div>{ticket.reporter.name}</div>
          </div>
          <div>
            <strong>Assignee</strong>
            <div>{ticket.assignee?.name ?? "Unassigned"}</div>
          </div>
          <div>
            <strong>First response SLA</strong>
            <div className={`badge ${ticket.sla.firstResponseState}`}>{ticket.sla.firstResponseState}</div>
            <div className="muted">
              {ticket.sla.firstResponseCompleted ? "Clock frozen" : `${ticket.sla.firstResponseRemainingMinutes} min remaining`}
              <br />
              Due {new Date(ticket.sla.firstResponseDueAt).toLocaleString()}
            </div>
          </div>
          <div>
            <strong>Resolution SLA</strong>
            <div className={`badge ${ticket.sla.resolutionState}`}>{ticket.sla.resolutionState}</div>
            <div className="muted">
              {ticket.sla.resolutionCompleted ? "Clock frozen" : `${ticket.sla.resolutionRemainingMinutes} min remaining`}
              <br />
              Due {new Date(ticket.sla.resolutionDueAt).toLocaleString()}
            </div>
          </div>
          {isAgent && token !== null ? (
            <>
              <label>
                Assign agent
                <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
                  <option value="">Select…</option>
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>{agent.name}</option>
                  ))}
                </select>
              </label>
              <div className="row-actions">
                <button type="button" disabled={assigneeId === ""} onClick={() => void run(() => api.assignTicket(token, ticket.id, assigneeId))}>
                  Assign
                </button>
                <button className="secondary" type="button" onClick={() => void run(() => api.changeTicketStatus(token, ticket.id, "IN_PROGRESS"))}>
                  In progress
                </button>
                <button type="button" onClick={() => void run(() => api.resolveTicket(token, ticket.id))}>
                  Resolve
                </button>
                <button className="secondary" type="button" onClick={() => void run(() => api.changeTicketStatus(token, ticket.id, "CLOSED"))}>
                  Close
                </button>
                <button className="secondary" type="button" onClick={() => void run(() => api.changeTicketStatus(token, ticket.id, "OPEN"))}>
                  Reopen
                </button>
              </div>
            </>
          ) : null}
        </aside>
      </div>
    </>
  );
}

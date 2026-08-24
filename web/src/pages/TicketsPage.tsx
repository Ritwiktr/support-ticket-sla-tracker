import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError, api, type Priority, type SLAState, type Ticket, type TicketDashboard, type TicketStatus, type User } from "../api";
import { useAuth } from "../auth";
import { formatLocal, slaLabel } from "../format";

type SortKey = "created" | "priority" | "sla";

const PRIORITY_RANK: Record<Priority, number> = { URGENT: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };

export function TicketsPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState<TicketDashboard | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [agents, setAgents] = useState<User[]>([]);
  const [status, setStatus] = useState<TicketStatus | "">("");
  const [priority, setPriority] = useState<Priority | "">("");
  const [assigneeId, setAssigneeId] = useState("");
  const [slaState, setSlaState] = useState<SLAState | "">("");
  const [sortKey, setSortKey] = useState<SortKey>("created");
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasNext, setHasNext] = useState(false);

  useEffect(() => {
    if (token === null) {
      return;
    }
    const authToken = token;
    let cancelled = false;
    async function load() {
      try {
        const [dash, list, users] = await Promise.all([
          api.dashboard(authToken),
          api.tickets(authToken, {
            ...(status !== "" ? { status } : {}),
            ...(priority !== "" ? { priority } : {}),
            ...(assigneeId !== "" ? { assigneeId } : {}),
            ...(slaState !== "" ? { slaState } : {}),
          }),
          api.users(authToken, "AGENT"),
        ]);
        if (cancelled) {
          return;
        }
        setDashboard(dash.dashboard);
        setTickets(list.tickets.nodes);
        setHasNext(list.tickets.pageInfo.hasNextPage);
        setCursor(list.tickets.pageInfo.endCursor);
        setAgents(users.users);
        setError(null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? `${err.code}: ${err.message}` : "Failed to load tickets.");
        }
      }
    }
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [token, status, priority, assigneeId, slaState]);

  const sorted = useMemo(() => {
    const copy = [...tickets];
    copy.sort((a, b) => {
      if (sortKey === "priority") {
        return PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority];
      }
      if (sortKey === "sla") {
        const aMin = a.sla.firstResponseCompleted
          ? a.sla.resolutionRemainingMinutes
          : a.sla.firstResponseRemainingMinutes;
        const bMin = b.sla.firstResponseCompleted
          ? b.sla.resolutionRemainingMinutes
          : b.sla.firstResponseRemainingMinutes;
        return aMin - bMin;
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    return copy;
  }, [tickets, sortKey]);

  async function loadMore() {
    if (token === null || cursor === null) {
      return;
    }
    const list = await api.tickets(token, {
      ...(status !== "" ? { status } : {}),
      ...(priority !== "" ? { priority } : {}),
      ...(assigneeId !== "" ? { assigneeId } : {}),
      ...(slaState !== "" ? { slaState } : {}),
      cursor,
    });
    setTickets((current) => [...current, ...list.tickets.nodes]);
    setHasNext(list.tickets.pageInfo.hasNextPage);
    setCursor(list.tickets.pageInfo.endCursor);
  }

  return (
    <>
      <h1 className="page-title">Support tickets</h1>
      <p className="lede">SLA state and remaining time come from the API. Business-hour math stays on the server.</p>
      {error !== null ? <div className="error">{error}</div> : null}
      {dashboard !== null ? (
        <section className="grid-4">
          <div className="stat"><span>Open</span><b>{dashboard.openTickets}</b></div>
          <div className="stat"><span>In progress</span><b>{dashboard.inProgressTickets}</b></div>
          <div className="stat risk"><span>At risk</span><b>{dashboard.atRiskTickets}</b></div>
          <div className="stat breach"><span>Breached</span><b>{dashboard.breachedTickets}</b></div>
        </section>
      ) : null}
      <div className="filters">
        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value as TicketStatus | "")}>
            <option value="">All</option>
            <option>OPEN</option>
            <option>IN_PROGRESS</option>
            <option>RESOLVED</option>
            <option>CLOSED</option>
          </select>
        </label>
        <label>
          Priority
          <select value={priority} onChange={(e) => setPriority(e.target.value as Priority | "")}>
            <option value="">All</option>
            <option>URGENT</option>
            <option>HIGH</option>
            <option>MEDIUM</option>
            <option>LOW</option>
          </select>
        </label>
        <label>
          Assignee
          <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
            <option value="">All</option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>{agent.name}</option>
            ))}
          </select>
        </label>
        <label>
          SLA
          <select value={slaState} onChange={(e) => setSlaState(e.target.value as SLAState | "")}>
            <option value="">All</option>
            <option>ON_TRACK</option>
            <option>AT_RISK</option>
            <option>BREACHED</option>
          </select>
        </label>
        <label>
          Sort
          <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
            <option value="created">Newest</option>
            <option value="priority">Priority</option>
            <option value="sla">Least remaining SLA</option>
          </select>
        </label>
        <Link to="/tickets/new"><button type="button">New ticket</button></Link>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Ticket</th>
              <th>Priority</th>
              <th>Status</th>
              <th>Assignee</th>
              <th>SLA</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((ticket) => {
              const sla = slaLabel(ticket.sla);
              return (
                <tr key={ticket.id} className="clickable" onClick={() => navigate(`/tickets/${ticket.id}`)}>
                  <td>
                    <strong>#{ticket.id.slice(-6)}</strong> {ticket.title}
                  </td>
                  <td><span className={`badge ${ticket.priority}`}>{ticket.priority}</span></td>
                  <td><span className={`badge ${ticket.status}`}>{ticket.status}</span></td>
                  <td>{ticket.assignee?.name ?? "Unassigned"}</td>
                  <td>
                    <span className={`badge ${sla.state === "MET" ? "RESOLVED" : sla.state}`}>
                      {sla.state === "BREACHED" ? "BREACHED" : sla.state === "MET" ? "Met" : `${sla.state} · ${sla.text}`}
                    </span>
                  </td>
                  <td>{formatLocal(ticket.createdAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {hasNext ? (
        <p><button className="secondary" type="button" onClick={() => void loadMore()}>Load more</button></p>
      ) : null}
    </>
  );
}

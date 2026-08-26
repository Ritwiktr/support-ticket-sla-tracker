import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ApiError,
  api,
  type Holiday,
  type Priority,
  type SLAState,
  type Ticket,
  type TicketDashboard,
  type TicketStatus,
  type User,
} from "../api";
import { useAuth } from "../auth";
import { formatLocal, relativeTime } from "../format";
import { Avatar, Badge, EmptyState, SlaChip, SlaRing } from "../ui";

type SortKey = "created" | "priority" | "sla";

const PRIORITY_RANK: Record<Priority, number> = { URGENT: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };

export function TicketsPage() {
  const { token, user } = useAuth();
  const isAgent = user?.role === "AGENT";
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState<TicketDashboard | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [agents, setAgents] = useState<User[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [status, setStatus] = useState<TicketStatus | "">("");
  const [priority, setPriority] = useState<Priority | "">("");
  const [assigneeId, setAssigneeId] = useState("");
  const [slaState, setSlaState] = useState<SLAState | "">("");
  const [sortKey, setSortKey] = useState<SortKey>("created");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token === null) {
      return;
    }
    const authToken = token;
    const loadAgents = isAgent;
    let cancelled = false;
    async function load() {
      try {
        const [dash, list, users, holidayList] = await Promise.all([
          api.dashboard(authToken),
          api.tickets(authToken, {
            ...(status !== "" ? { status } : {}),
            ...(priority !== "" ? { priority } : {}),
            ...(assigneeId !== "" ? { assigneeId } : {}),
            ...(slaState !== "" ? { slaState } : {}),
          }),
          loadAgents ? api.users(authToken, "AGENT") : Promise.resolve({ users: [] as User[] }),
          api.holidays(authToken),
        ]);
        if (cancelled) {
          return;
        }
        setDashboard(dash.dashboard);
        setTickets(list.tickets.nodes);
        setHasNext(list.tickets.pageInfo.hasNextPage);
        setCursor(list.tickets.pageInfo.endCursor);
        setAgents(users.users);
        setHolidays(holidayList.holidays);
        setError(null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? `${err.code}: ${err.message}` : "Failed to load tickets.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    void load();
    const timer = window.setInterval(() => void load(), 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [token, isAgent, status, priority, assigneeId, slaState]);

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
    const needle = query.trim().toLowerCase();
    if (needle === "") {
      return copy;
    }
    return copy.filter((ticket) => {
      return (
        ticket.title.toLowerCase().includes(needle) ||
        ticket.description.toLowerCase().includes(needle) ||
        ticket.id.toLowerCase().includes(needle) ||
        (ticket.assignee?.name ?? "").toLowerCase().includes(needle) ||
        ticket.reporter.name.toLowerCase().includes(needle)
      );
    });
  }, [tickets, sortKey, query]);

  const filtersActive = status !== "" || priority !== "" || assigneeId !== "" || slaState !== "" || query !== "";

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

  function clearFilters() {
    setStatus("");
    setPriority("");
    setAssigneeId("");
    setSlaState("");
    setQuery("");
  }

  return (
    <>
      <div className="page-head">
        <div>
          <p className="page-kicker">Queue</p>
          <h1 className="page-title">Inbox</h1>
          <p className="lede">SLA badges and remaining time come from the API and refresh live. The browser only displays them.</p>
        </div>
        <Link className="btn" to="/tickets/new">New ticket</Link>
      </div>
      {error !== null ? <div className="error">{error}</div> : null}
      {dashboard !== null ? (
        <section className="grid-4" aria-label="Queue snapshot">
          <button
            className={`stat ${status === "OPEN" ? "active" : ""}`}
            type="button"
            aria-pressed={status === "OPEN"}
            onClick={() => setStatus((current) => (current === "OPEN" ? "" : "OPEN"))}
          >
            <div className="stat-label">Open</div>
            <b>{dashboard.openTickets}</b>
            <div className="stat-hint">Waiting to be picked up</div>
          </button>
          <button
            className={`stat ${status === "IN_PROGRESS" ? "active" : ""}`}
            type="button"
            aria-pressed={status === "IN_PROGRESS"}
            onClick={() => setStatus((current) => (current === "IN_PROGRESS" ? "" : "IN_PROGRESS"))}
          >
            <div className="stat-label">In progress</div>
            <b>{dashboard.inProgressTickets}</b>
            <div className="stat-hint">Actively being worked</div>
          </button>
          <button
            className={`stat risk ${slaState === "AT_RISK" ? "active" : ""}`}
            type="button"
            aria-pressed={slaState === "AT_RISK"}
            onClick={() => setSlaState((current) => (current === "AT_RISK" ? "" : "AT_RISK"))}
          >
            <div className="stat-label">At risk</div>
            <b>{dashboard.atRiskTickets}</b>
            <div className="stat-hint">Over 75% of SLA used</div>
          </button>
          <button
            className={`stat breach ${slaState === "BREACHED" ? "active" : ""}`}
            type="button"
            aria-pressed={slaState === "BREACHED"}
            onClick={() => setSlaState((current) => (current === "BREACHED" ? "" : "BREACHED"))}
          >
            <div className="stat-label">Breached</div>
            <b>{dashboard.breachedTickets}</b>
            <div className="stat-hint">Deadline already passed</div>
          </button>
        </section>
      ) : null}
      {holidays.length > 0 ? (
        <div className="holiday-row">
          <span className="holiday-label">Holidays freeze the clock</span>
          {holidays.map((holiday) => (
            <span className="holiday-chip" key={holiday.id}>
              {holiday.date} · {holiday.name}
            </span>
          ))}
        </div>
      ) : null}
      <div className="filters">
        <label className="search-field">
          Search
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Title, reporter, assignee, or ticket id"
          />
        </label>
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
        {isAgent ? (
          <label>
            Assignee
            <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
              <option value="">All</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
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
        {filtersActive ? (
          <button className="ghost" type="button" onClick={clearFilters}>
            Clear
          </button>
        ) : null}
      </div>
      <div className="list-toolbar">
        <span>{loading ? "Refreshing queue…" : `${sorted.length} ticket${sorted.length === 1 ? "" : "s"}`}</span>
        <span className="muted">Live SLA · auto-refresh every 15s</span>
      </div>
      <div className="ticket-list">
        {loading ? (
          <div className="skeleton-list">
            <div className="skeleton-row" />
            <div className="skeleton-row" />
            <div className="skeleton-row" />
          </div>
        ) : null}
        {!loading && sorted.length === 0 ? (
          <EmptyState
            title="No tickets match these filters"
            body="Clear a filter or raise a new ticket to get the queue moving."
            action={<Link className="btn" to="/tickets/new">Raise ticket</Link>}
          />
        ) : null}
        {!loading
          ? sorted.map((ticket) => (
              <button
                className={`ticket-row ${ticket.priority}`}
                key={ticket.id}
                type="button"
                onClick={() => navigate(`/tickets/${ticket.id}`)}
              >
                <SlaRing sla={ticket.sla} />
                <span className="ticket-id">#{ticket.id.slice(-6)}</span>
                <span>
                  <span className="ticket-title">{ticket.title}</span>
                  <span className="ticket-meta">
                    <Avatar name={ticket.assignee?.name ?? ticket.reporter.name} size="sm" />
                    {ticket.assignee?.name ?? "Unassigned"}
                    <span>·</span>
                    <span title={formatLocal(ticket.createdAt)}>{relativeTime(ticket.createdAt)}</span>
                  </span>
                </span>
                <span className="ticket-flags">
                  <Badge value={ticket.priority} />
                  <Badge value={ticket.status} />
                  <SlaChip sla={ticket.sla} />
                </span>
              </button>
            ))
          : null}
      </div>
      {hasNext ? (
        <p className="load-more">
          <button className="secondary" type="button" onClick={() => void loadMore()}>
            Load more
          </button>
        </p>
      ) : null}
    </>
  );
}

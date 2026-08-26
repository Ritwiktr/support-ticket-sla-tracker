import { NavLink, Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "./auth";
import { Avatar } from "./ui";
import { LoginPage, RegisterPage } from "./pages/AuthPages";
import { NewTicketPage, TicketDetailPage } from "./pages/TicketPages";
import { TicketsPage } from "./pages/TicketsPage";
import { prettyLabel } from "./format";

function IconInbox() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M4 7h16v12H4z" />
      <path d="M4 12h4.5l1.5 2h4l1.5-2H20" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function DeskClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const time = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
  }).format(now);
  const weekday = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
  }).format(now);
  const day = now.toLocaleString("en-US", { timeZone: "Asia/Kolkata", weekday: "short" });
  const isWeekend = day === "Sat" || day === "Sun";
  return (
    <div className="desk-clock">
      <span className={`desk-pulse ${isWeekend ? "closed" : ""}`} />
      <div>
        <strong>{time} IST</strong>
        <span>{weekday} · {isWeekend ? "clock frozen" : "09:00–18:00 live"}</span>
      </div>
    </div>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="logo-mark">S</div>
          <div className="brand-copy">
            <strong>SLA Tracker</strong>
            <span>Business-hours desk</span>
          </div>
        </div>
        <nav className="nav-list">
          <NavLink to="/" end>
            <IconInbox />
            Inbox
          </NavLink>
          <NavLink to="/tickets/new">
            <IconPlus />
            Raise ticket
          </NavLink>
        </nav>
        <DeskClock />
        <div className="hours-card">
          <span className="section-kicker">SLA window</span>
          <p>Mon–Fri · 09:00–18:00</p>
          <p className="muted">Nights, weekends, and holidays never consume remaining time.</p>
        </div>
        <div className="user-card">
          <Avatar name={user?.name ?? "User"} />
          <div>
            <strong>{user?.name}</strong>
            <div className="meta">{user !== null ? prettyLabel(user.role) : ""}</div>
            <div className="meta">{user?.email}</div>
          </div>
          <button className="linkish" type="button" onClick={logout}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="main" data-path={location.pathname}>
        {children}
      </main>
    </div>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  if (token === null) {
    return <Navigate to="/login" replace />;
  }
  return <Shell>{children}</Shell>;
}

function DetailRoute() {
  const { id } = useParams();
  if (id === undefined) {
    return <Navigate to="/" replace />;
  }
  return <TicketDetailPage ticketId={id} />;
}

export function App() {
  const { token } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={token !== null ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/register" element={token !== null ? <Navigate to="/" replace /> : <RegisterPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <TicketsPage />
          </RequireAuth>
        }
      />
      <Route
        path="/tickets/new"
        element={
          <RequireAuth>
            <NewTicketPage />
          </RequireAuth>
        }
      />
      <Route
        path="/tickets/:id"
        element={
          <RequireAuth>
            <DetailRoute />
          </RequireAuth>
        }
      />
    </Routes>
  );
}

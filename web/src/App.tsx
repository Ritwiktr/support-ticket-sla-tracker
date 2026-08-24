import { NavLink, Navigate, Route, Routes, useParams } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "./auth";
import { LoginPage, RegisterPage } from "./pages/AuthPages";
import { NewTicketPage, TicketDetailPage } from "./pages/TicketPages";
import { TicketsPage } from "./pages/TicketsPage";

function Shell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          SLA Tracker
          <span>Business-hours support desk</span>
        </div>
        <NavLink to="/" end>Tickets</NavLink>
        <NavLink to="/tickets/new">New ticket</NavLink>
        <div className="user-card">
          <strong>{user?.name}</strong>
          {user?.role} · {user?.email}
          <div><button className="linkish" type="button" onClick={logout}>Sign out</button></div>
        </div>
      </aside>
      <main className="main">{children}</main>
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

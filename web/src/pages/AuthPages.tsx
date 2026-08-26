import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError, api } from "../api";
import { useAuth } from "../auth";

const DEMO_PASSWORD = "Password123!";

const DEMO_ACCOUNTS = [
  { email: "agent@example.com", name: "Vikram", role: "Agent" },
  { email: "meera.agent@example.com", name: "Meera", role: "Agent" },
  { email: "reporter@example.com", name: "Asha", role: "Reporter" },
  { email: "rahul.reporter@example.com", name: "Rahul", role: "Reporter" },
] as const;

function AuthHero() {
  return (
    <section className="auth-hero">
      <div>
        <div className="logo-mark">S</div>
        <p className="auth-kicker">Support desk · Asia/Kolkata</p>
        <h1>Keep every ticket inside business hours.</h1>
        <p>Nights, weekends, and holidays never eat the SLA. Remaining time is calculated on the server — the UI only displays it.</p>
      </div>
      <div className="auth-hours">
        <div>
          <span>Urgent</span>
          <strong>1h / 4h</strong>
        </div>
        <div>
          <span>High</span>
          <strong>4h / 24h</strong>
        </div>
        <div>
          <span>Medium</span>
          <strong>8h / 48h</strong>
        </div>
        <div>
          <span>Low</span>
          <strong>24h / 72h</strong>
        </div>
      </div>
    </section>
  );
}

export function LoginPage() {
  const { setSession } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("agent@example.com");
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const result = await api.login(email, password);
      setSession(result.login.token, result.login.user);
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? `${err.code}: ${err.message}` : "Login failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="auth-wrap">
      <AuthHero />
      <div className="auth-panel">
        <form className="auth-card stack" onSubmit={(event) => void onSubmit(event)}>
          <h1>Welcome back</h1>
          <p className="muted">Pick a seeded desk account, or sign in with your own credentials.</p>
          <div className="demo-chips" role="group" aria-label="Demo accounts">
            {DEMO_ACCOUNTS.map((account) => (
              <button
                className={email === account.email ? "demo-chip selected" : "demo-chip"}
                key={account.email}
                type="button"
                onClick={() => {
                  setEmail(account.email);
                  setPassword(DEMO_PASSWORD);
                }}
              >
                <strong>{account.name}</strong>
                <span>{account.role}</span>
              </button>
            ))}
          </div>
          {error !== null ? <div className="error">{error}</div> : null}
          <label>
            Email
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
          </label>
          <label>
            Password
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
          </label>
          <button className="primary" type="submit" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
          <p className="muted">
            New reporter? <Link to="/register">Create an account</Link>
          </p>
        </form>
      </div>
    </div>
  );
}

export function RegisterPage() {
  const { setSession } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const result = await api.register(name, email, password, "REPORTER");
      setSession(result.register.token, result.register.user);
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? `${err.code}: ${err.message}` : "Registration failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="auth-wrap">
      <AuthHero />
      <div className="auth-panel">
        <form className="auth-card stack" onSubmit={(event) => void onSubmit(event)}>
          <h1>Create a reporter account</h1>
          <p className="muted">Self-registration is limited to reporters. Agents are provisioned separately.</p>
          {error !== null ? <div className="error">{error}</div> : null}
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label>
            Email
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
          </label>
          <label>
            Password
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" minLength={8} required />
          </label>
          <button className="primary" type="submit" disabled={pending}>{pending ? "Creating…" : "Register"}</button>
          <p className="muted">
            Already have an account? <Link to="/login">Sign in</Link>
          </p>
        </form>
      </div>
    </div>
  );
}

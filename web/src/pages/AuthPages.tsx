import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError, api } from "../api";
import { useAuth } from "../auth";

export function LoginPage() {
  const { setSession } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("agent@example.com");
  const [password, setPassword] = useState("Password123!");
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
      <form className="auth-card stack" onSubmit={(event) => void onSubmit(event)}>
        <h1>SLA Ticket Tracker</h1>
        <p className="muted">Sign in to raise or work tickets. Seed: agent@example.com / Password123!</p>
        {error !== null ? <div className="error">{error}</div> : null}
        <label>
          Email
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
        </label>
        <label>
          Password
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
        </label>
        <button type="submit" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
        <p className="muted">
          New reporter? <Link to="/register">Create an account</Link>
        </p>
      </form>
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
      <form className="auth-card stack" onSubmit={(event) => void onSubmit(event)}>
        <h1>Create reporter account</h1>
        <p className="muted">Self-registration is limited to the REPORTER role. Agents are provisioned by seed/admin.</p>
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
        <button type="submit" disabled={pending}>{pending ? "Creating…" : "Register"}</button>
        <p className="muted">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </div>
  );
}

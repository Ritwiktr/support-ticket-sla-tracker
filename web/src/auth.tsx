import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { User } from "./api";

type AuthState = {
  token: string | null;
  user: User | null;
  setSession: (token: string, user: User) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthState | null>(null);

function readUser(): User | null {
  const raw = localStorage.getItem("sla.user");
  if (raw === null) {
    return null;
  }
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("sla.token"));
  const [user, setUser] = useState<User | null>(() => readUser());

  const value = useMemo<AuthState>(
    () => ({
      token,
      user,
      setSession: (nextToken, nextUser) => {
        localStorage.setItem("sla.token", nextToken);
        localStorage.setItem("sla.user", JSON.stringify(nextUser));
        setToken(nextToken);
        setUser(nextUser);
      },
      logout: () => {
        localStorage.removeItem("sla.token");
        localStorage.removeItem("sla.user");
        setToken(null);
        setUser(null);
      },
    }),
    [token, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (ctx === null) {
    throw new Error("AuthProvider missing");
  }
  return ctx;
}

import { describe, expect, it } from "vitest";
import { isAuthOperation, takeToken } from "../../src/http/rateLimit";

describe("rate limiter", () => {
  it("allows traffic under the limit and blocks once the window is full", () => {
    const store = new Map<string, { count: number; resetAt: number }>();
    const now = 1_000_000;
    expect(takeToken("ip", 2, 60_000, now, store).ok).toBe(true);
    expect(takeToken("ip", 2, 60_000, now + 10, store).ok).toBe(true);
    const blocked = takeToken("ip", 2, 60_000, now + 20, store);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.retryAfterSec).toBeGreaterThan(0);
    }
    expect(takeToken("ip", 2, 60_000, now + 60_000, store).ok).toBe(true);
  });

  it("detects login and register mutations without relying on operationName", () => {
    expect(isAuthOperation("mutation { login(email: \"a\", password: \"b\") { token } }", null)).toBe(true);
    expect(isAuthOperation("mutation { register(name: \"A\", email: \"a\", password: \"b\", role: REPORTER) { token } }", null)).toBe(true);
    expect(isAuthOperation("query { tickets { nodes { id } } }", "tickets")).toBe(false);
    expect(isAuthOperation("query { ticket(id: \"x\") { id } }", "login")).toBe(true);
  });
});

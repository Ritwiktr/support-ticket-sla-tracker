export type RateLimitDecision = { ok: true } | { ok: false; retryAfterSec: number };

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function takeToken(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
  store: Map<string, Bucket> = buckets,
): RateLimitDecision {
  if (store.size > 8_000) {
    for (const [existingKey, bucket] of store) {
      if (now >= bucket.resetAt) {
        store.delete(existingKey);
      }
    }
  }

  const current = store.get(key);
  if (current === undefined || now >= current.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }
  if (current.count >= limit) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
  }
  current.count += 1;
  return { ok: true };
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded !== null) {
    const first = forwarded.split(",")[0]?.trim();
    if (first !== undefined && first !== "") {
      return first;
    }
  }
  return "local";
}

export function isAuthOperation(query: string | undefined, operationName: string | null | undefined): boolean {
  if (operationName === "login" || operationName === "register") {
    return true;
  }
  if (query === undefined) {
    return false;
  }
  return /\bmutation\b[\s\S]*\b(login|register)\s*\(/i.test(query);
}

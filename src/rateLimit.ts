// Tiny in-memory token bucket (sliding window) as Hono middleware.
// CORS never stops non-browser callers; this is the actual abuse control
// for unauthenticated surfaces (/sim/guest mints keys + DB rows).
import type { Context, Next } from "hono";

export interface Bucket {
  windowMs: number;
  max: number;
}
export interface LimiterOptions extends Bucket {
  key?: (c: Context) => string;
  now?: () => number;
}

const DEFAULT_KEY = (c: Context): string => {
  const fwd = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || c.req.header("x-real-ip") || "unknown";
};

export function rateLimit(opts: LimiterOptions) {
  const windowMs = opts.windowMs;
  const max = opts.max;
  const keyOf = opts.key ?? DEFAULT_KEY;
  const now = opts.now ?? Date.now;
  const hits = new Map<string, number[]>();
  return async (c: Context, next: Next): Promise<Response | void> => {
    const t = now();
    const k = keyOf(c);
    const window = (hits.get(k) ?? []).filter((ts) => ts > t - windowMs);
    if (window.length >= max) {
      const retryAfter = Math.ceil((window[0] + windowMs - t) / 1000);
      return c.json({ error: "rate limited, try again shortly" }, 429, {
        "Retry-After": String(Math.max(retryAfter, 1)),
      });
    }
    window.push(t);
    hits.set(k, window);
    // Bound memory: drop buckets idle for 10 windows.
    if (hits.size > 5000) {
      for (const [kk, vv] of hits) {
        if (vv.length === 0 || vv[vv.length - 1] < t - windowMs * 10)
          hits.delete(kk);
      }
    }
    await next();
  };
}

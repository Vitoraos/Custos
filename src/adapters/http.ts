// Shared HTTP: timeout, one retry with jitter, UA, Zod parse. No silent fallbacks:
// failures throw and the caller returns outcome "error" + an honest say.
import type { z } from "zod";

const UA = "ContextForge/3 (+https://github.com/Vitoraos)";
export const httpTimeoutMs = 15000;

export async function fetchJson<T>(
  url: string,
  schema: z.ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  const attempt = async (): Promise<T> => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), httpTimeoutMs);
    try {
      const res = await fetch(url, {
        ...init,
        signal: ctrl.signal,
        headers: { "User-Agent": UA, ...(init?.headers ?? {}) },
      });
      if (!res.ok)
        throw new Error(`HTTP ${res.status} for ${new URL(url).hostname}`);
      const body: unknown = await res.json();
      const parsed = schema.safeParse(body);
      if (!parsed.success)
        throw new Error(`schema mismatch from ${new URL(url).hostname}`);
      return parsed.data;
    } finally {
      clearTimeout(t);
    }
  };
  try {
    return await attempt();
  } catch {
    await new Promise((r) => setTimeout(r, 300 + Math.random() * 400)); // jittered retry
    return attempt();
  }
}

// Tiny TTL cache (per-process). Keyed by caller; failures are never cached.
export class TtlCache<T> {
  private map = new Map<string, { exp: number; value: T }>();
  constructor(private ttlMs: number = 600_000) {}
  get(key: string): T | undefined {
    const e = this.map.get(key);
    if (!e || e.exp < Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    return e.value;
  }
  set(key: string, value: T): void {
    if (this.map.size > 200)
      this.map.delete(this.map.keys().next().value as string);
    this.map.set(key, { exp: Date.now() + this.ttlMs, value });
  }
}

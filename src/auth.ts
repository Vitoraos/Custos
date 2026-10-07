// Auth: Bearer cf_… key -> { userId, mode }. Key itself is never stored,
// only its sha256 hash (see api_keys in infra/migrations/001_v3.sql).
// Lookup is injected so tools/tests pass a fake and only server.ts wires Supabase.
import { createHash, randomBytes } from "node:crypto";

export type KeyMode = "forge" | "baseline";
export interface Session {
  userId: string;
  mode: KeyMode;
  [k: string]: unknown; // satisfies FastMCP's SessionData record bound
}
export interface KeyRow {
  user_id: string;
  mode: KeyMode;
  revoked_at: string | null;
}
export type KeyLookup = (keyHash: string) => Promise<KeyRow | null>;

export function parseBearer(
  authHeader: string | undefined,
): string | undefined {
  if (!authHeader) return undefined;
  const m = /^Bearer (cf_[A-Za-z0-9_-]{16,128})$/.exec(authHeader.trim());
  return m ? m[1] : undefined;
}

export function sha256Hex(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function newKey(): string {
  return `cf_${randomBytes(24).toString("hex")}`; // 48 hex chars, topic-safe charset
}

export async function authenticateRequest(
  authHeader: string | undefined,
  lookup: KeyLookup,
): Promise<Session | null> {
  const key = parseBearer(authHeader);
  if (!key) return null;
  const row = await lookup(sha256Hex(key));
  if (!row || row.revoked_at) return null;
  return { userId: row.user_id, mode: row.mode };
}

// FastMCP `authenticate` wrapper. Returns null -> framework answers 401.
export function createAuthenticator(lookup: KeyLookup) {
  return async (req: {
    headers: Record<string, string | string[] | undefined>;
  }) => {
    const h = req.headers.authorization;
    const header = Array.isArray(h) ? h[0] : h;
    return authenticateRequest(header, lookup);
  };
}

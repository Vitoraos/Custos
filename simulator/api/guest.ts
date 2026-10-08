// Guest sessions: one random user + forge/baseline keys per visitor (24h TTL).
// Judges never see each other's data. Lazy purge on access.
import { randomBytes } from "node:crypto";
import { newKey, sha256Hex } from "../../src/auth.js";
import type { Store } from "../../src/storage/store.js";

export interface Guest {
  id: string;
  userId: string;
  createdAt: number;
}
const TTL_MS = 24 * 3600 * 1000;
const guests = new Map<string, Guest>();
const keys = new Map<string, { forgeKey: string; baselineKey: string }>();

export async function issueGuest(
  store: Store,
): Promise<Guest & { forgeKey: string; baselineKey: string }> {
  purge();
  const id = randomBytes(8).toString("hex");
  const userId = `guest_${id}`;
  const forgeKey = newKey();
  const baselineKey = newKey();
  await store.insertKey(sha256Hex(forgeKey), {
    userId,
    mode: "forge",
    label: "guest",
    revokedAt: null,
  });
  await store.insertKey(sha256Hex(baselineKey), {
    userId,
    mode: "baseline",
    label: "guest",
    revokedAt: null,
  });
  const g: Guest = { id, userId, createdAt: Date.now() };
  guests.set(id, g);
  keys.set(id, { forgeKey, baselineKey });
  return { ...g, forgeKey, baselineKey };
}

export function guestKeys(
  id: string,
): { forgeKey: string; baselineKey: string } | null {
  purge();
  return keys.get(id) ?? null;
}

export function getGuest(id: string): Guest | null {
  purge();
  const g = guests.get(id);
  return g ?? null;
}

function purge(): void {
  const cutoff = Date.now() - TTL_MS;
  for (const [id, g] of guests) {
    if (g.createdAt < cutoff) {
      guests.delete(id);
      keys.delete(id);
      turns.delete(id);
    }
  }
}

// Budget: daily call cap + per-session turn cap. Over -> Replay mode.
let day = new Date().toISOString().slice(0, 10);
let dailyCalls = 0;
const DAILY_MAX = Number(process.env.SIM_DAILY_BUDGET_CALLS ?? 500);
const TURNS_MAX = Number(process.env.SIM_SESSION_MAX_TURNS ?? 30);
const turns = new Map<string, number>();

export function budgetCheck(guestId: string): { ok: boolean; reason?: string } {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== day) {
    day = today;
    dailyCalls = 0;
  }
  if (dailyCalls >= DAILY_MAX)
    return { ok: false, reason: "daily budget exhausted" };
  if ((turns.get(guestId) ?? 0) >= TURNS_MAX)
    return { ok: false, reason: "session turn cap reached" };
  return { ok: true };
}
export function budgetSpend(guestId: string): void {
  dailyCalls++;
  turns.set(guestId, (turns.get(guestId) ?? 0) + 1);
}

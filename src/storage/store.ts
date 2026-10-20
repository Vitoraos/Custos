// Persistence behind an interface. MemoryStore covers unit tests + offline dev;
// SupabaseStore is the durable production backend. Every operation is tenant-scoped.
export interface DeviceRow {
  device: string;
  state: Record<string, unknown>;
}
export interface FaultRow {
  profile: string;
  params: Record<string, unknown>;
}
export interface ListOp {
  op: "add" | "remove";
  item: string;
}
export interface MemoryRecord {
  id: string;
  userId: string;
  profile: string;
  kind: "constraint" | "fact" | "instruction";
  payload: unknown;
  source: "user_voice" | "explicit" | "inferred" | "external";
  status: "active" | "pending_confirmation" | "revoked";
  evidence: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
}
export type ScheduledActionStatus = "planned" | "scheduled" | "executing" | "executed" | "verified" | "unverified" | "blocked" | "failed" | "cancelled";
export interface ScheduledActionRecord { id: string; userId: string; runId: string; idempotencyKey: string; target: string; desiredState: Record<string, unknown>; timezone: string; localScheduledAt: string; scheduledAt: string; status: ScheduledActionStatus; evidence: Record<string, unknown>; createdAt: string; updatedAt: string; }
export interface KeyRecord {
  userId: string;
  mode: "forge" | "baseline";
  label: string | null;
  revokedAt: string | null;
}
export interface Store {
  ping(): Promise<{ ok: boolean }>;
  getDevice(
    userId: string,
    device: string,
  ): Promise<Record<string, unknown> | null>;
  setDevice(
    userId: string,
    device: string,
    state: Record<string, unknown>,
  ): Promise<void>;
  getFaults(userId: string): Promise<FaultRow>;
  setFaults(userId: string, row: FaultRow): Promise<void>;
  listItems(userId: string, list: string): Promise<string[]>;
  applyListOps(userId: string, list: string, ops: ListOp[]): Promise<string[]>;
  insertMemory(
    r: Omit<MemoryRecord, "id" | "createdAt" | "lastUsedAt" | "revokedAt">,
  ): Promise<MemoryRecord>;
  listMemories(userId: string): Promise<MemoryRecord[]>;
  getMemory(userId: string, id: string): Promise<MemoryRecord | null>;
  revokeMemory(userId: string, id: string): Promise<MemoryRecord | null>;
  deleteMemory(userId: string, id: string): Promise<boolean>;
  touchMemory(userId: string, id: string): Promise<void>;
  getKey(keyHash: string): Promise<(KeyRecord & { keyHash: string }) | null>;
  insertKey(keyHash: string, row: KeyRecord): Promise<void>;
  createScheduledAction(row: Omit<ScheduledActionRecord, "id" | "createdAt" | "updatedAt">): Promise<ScheduledActionRecord>;
  listScheduledActions(userId: string, runId?: string): Promise<ScheduledActionRecord[]>;
  updateScheduledAction(userId: string, id: string, status: ScheduledActionStatus, evidence?: Record<string, unknown>): Promise<ScheduledActionRecord | null>;
  claimDueScheduledActions(now: string, limit: number): Promise<ScheduledActionRecord[]>;
}

// JSON-encoding a tuple avoids collisions when a component contains the delimiter.
function tupleKey(...parts: string[]): string {
  return JSON.stringify(parts);
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export function dedupeKey(item: string): string {
  return item
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export class MemoryStore implements Store {
  private devices = new Map<string, Record<string, unknown>>();
  private faults = new Map<string, FaultRow>();
  private lists = new Map<string, string[]>();
  private memories = new Map<string, MemoryRecord>();
  private keys = new Map<string, KeyRecord>();
  private scheduled = new Map<string, ScheduledActionRecord>();
  private seq = 0;

  async ping(): Promise<{ ok: boolean }> {
    return { ok: true };
  }

  async getDevice(
    userId: string,
    device: string,
  ): Promise<Record<string, unknown> | null> {
    const state = this.devices.get(tupleKey(userId, device));
    return state ? clone(state) : null;
  }

  async setDevice(
    userId: string,
    device: string,
    state: Record<string, unknown>,
  ): Promise<void> {
    this.devices.set(tupleKey(userId, device), clone(state));
  }

  async getFaults(userId: string): Promise<FaultRow> {
    const row = this.faults.get(userId);
    return row ? clone(row) : { profile: "none", params: {} };
  }

  async setFaults(userId: string, row: FaultRow): Promise<void> {
    this.faults.set(userId, clone(row));
  }

  async listItems(userId: string, list: string): Promise<string[]> {
    return [...(this.lists.get(tupleKey(userId, list)) ?? [])];
  }

  async applyListOps(
    userId: string,
    list: string,
    ops: ListOp[],
  ): Promise<string[]> {
    const key = tupleKey(userId, list);
    const out = [...(this.lists.get(key) ?? [])];

    for (const operation of ops) {
      if (
        !operation ||
        (operation.op !== "add" && operation.op !== "remove") ||
        typeof operation.item !== "string"
      ) {
        throw new Error("store: invalid list operation");
      }

      const item = operation.item.trim();
      const normalized = dedupeKey(item);
      if (!normalized) continue;

      if (operation.op === "add") {
        if (!out.some((existing) => dedupeKey(existing) === normalized)) {
          out.push(item);
        }
      } else {
        // Match Supabase semantics: remove every normalized duplicate.
        for (let i = out.length - 1; i >= 0; i--) {
          if (dedupeKey(out[i]) === normalized) out.splice(i, 1);
        }
      }
    }

    this.lists.set(key, out);
    return [...out];
  }

  async insertMemory(
    r: Omit<MemoryRecord, "id" | "createdAt" | "lastUsedAt" | "revokedAt">,
  ): Promise<MemoryRecord> {
    this.seq++;
    const rec: MemoryRecord = {
      ...clone(r),
      id: `mem_${Date.now().toString(36)}_${this.seq}`,
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
      revokedAt: null,
    };
    this.memories.set(tupleKey(r.userId, rec.id), clone(rec));
    return clone(rec);
  }

  async listMemories(userId: string): Promise<MemoryRecord[]> {
    return [...this.memories.values()]
      .filter((memory) => memory.userId === userId)
      .map(clone);
  }

  async getMemory(userId: string, id: string): Promise<MemoryRecord | null> {
    const memory = this.memories.get(tupleKey(userId, id));
    return memory ? clone(memory) : null;
  }

  async revokeMemory(userId: string, id: string): Promise<MemoryRecord | null> {
    const memory = await this.getMemory(userId, id);
    if (!memory || memory.status === "revoked") return memory;

    const next: MemoryRecord = {
      ...memory,
      status: "revoked",
      revokedAt: new Date().toISOString(),
    };
    this.memories.set(tupleKey(userId, id), clone(next));
    return clone(next);
  }

  async deleteMemory(userId: string, id: string): Promise<boolean> {
    return this.memories.delete(tupleKey(userId, id));
  }

  async touchMemory(userId: string, id: string): Promise<void> {
    const memory = await this.getMemory(userId, id);
    if (memory) {
      this.memories.set(
        tupleKey(userId, id),
        clone({ ...memory, lastUsedAt: new Date().toISOString() }),
      );
    }
  }

  async getKey(
    keyHash: string,
  ): Promise<(KeyRecord & { keyHash: string }) | null> {
    const key = this.keys.get(keyHash);
    return key ? { ...key, keyHash } : null;
  }

  async createScheduledAction(row: Omit<ScheduledActionRecord, "id" | "createdAt" | "updatedAt">): Promise<ScheduledActionRecord> {
    const prior = [...this.scheduled.values()].find(x => x.userId === row.userId && x.idempotencyKey === row.idempotencyKey);
    if (prior) {
      if (prior.target !== row.target || JSON.stringify(prior.desiredState) !== JSON.stringify(row.desiredState) || prior.scheduledAt !== row.scheduledAt) throw new Error("schedule: idempotency key reused with different action");
      return clone(prior);
    }
    const now = new Date().toISOString();
    const record: ScheduledActionRecord = { ...clone(row), id: "sched_" + Date.now().toString(36) + "_" + (++this.seq), createdAt: now, updatedAt: now };
    this.scheduled.set(tupleKey(row.userId, record.id), record);
    return clone(record);
  }
  async listScheduledActions(userId: string, runId?: string): Promise<ScheduledActionRecord[]> {
    return [...this.scheduled.values()].filter(x => x.userId === userId && (!runId || x.runId === runId)).map(clone).sort((a,b) => a.scheduledAt.localeCompare(b.scheduledAt));
  }
  async updateScheduledAction(userId: string, id: string, status: ScheduledActionStatus, evidence?: Record<string, unknown>): Promise<ScheduledActionRecord | null> {
    const key = tupleKey(userId, id), prior = this.scheduled.get(key);
    if (!prior) return null;
    const next = { ...prior, status, evidence: evidence ? { ...prior.evidence, ...clone(evidence) } : prior.evidence, updatedAt: new Date().toISOString() };
    this.scheduled.set(key, next); return clone(next);
  }
  async claimDueScheduledActions(now: string, limit: number): Promise<ScheduledActionRecord[]> {
    const due = [...this.scheduled.values()]
      .filter(x => x.status === "scheduled" && Date.parse(x.scheduledAt) <= Date.parse(now))
      .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
      .slice(0, Math.max(0, limit));
    const claimed: ScheduledActionRecord[] = [];
    for (const action of due) {
      const next: ScheduledActionRecord = { ...action, status: "executing", updatedAt: now };
      this.scheduled.set(tupleKey(action.userId, action.id), next);
      claimed.push(clone(next));
    }
    return claimed;
  }

  async insertKey(keyHash: string, row: KeyRecord): Promise<void> {
    if (this.keys.has(keyHash)) {
      throw new Error("store: API key hash already exists");
    }
    this.keys.set(keyHash, clone(row));
  }
}

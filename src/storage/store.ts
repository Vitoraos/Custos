// Persistence behind an interface. MemoryStore covers unit tests + offline dev;
// SupabaseStore (service role) lands when SUPABASE creds exist — same interface,
// so swapping is one file. Every method is user-scoped (tenant isolation).
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
  private seq = 0;
  async ping(): Promise<{ ok: boolean }> {
    return { ok: true };
  }
  async getDevice(
    userId: string,
    device: string,
  ): Promise<Record<string, unknown> | null> {
    return this.devices.get(`${userId}|${device}`) ?? null;
  }
  async setDevice(
    userId: string,
    device: string,
    state: Record<string, unknown>,
  ): Promise<void> {
    this.devices.set(`${userId}|${device}`, state);
  }
  async getFaults(userId: string): Promise<FaultRow> {
    return this.faults.get(userId) ?? { profile: "none", params: {} };
  }
  async setFaults(userId: string, row: FaultRow): Promise<void> {
    this.faults.set(userId, row);
  }
  async listItems(userId: string, list: string): Promise<string[]> {
    return [...(this.lists.get(`${userId}|${list}`) ?? [])];
  }
  async applyListOps(
    userId: string,
    list: string,
    ops: ListOp[],
  ): Promise<string[]> {
    const key = `${userId}|${list}`;
    const cur = this.lists.get(key) ?? [];
    const seen = new Set(cur.map(dedupeKey));
    const out = [...cur];
    for (const o of ops) {
      const k = dedupeKey(o.item);
      if (o.op === "add") {
        if (!seen.has(k) && k.length > 0) {
          seen.add(k);
          out.push(o.item.trim());
        }
      } else {
        const i = out.findIndex((x) => dedupeKey(x) === k);
        if (i >= 0) {
          out.splice(i, 1);
          seen.delete(k);
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
      ...r,
      id: `mem_${Date.now().toString(36)}_${this.seq}`,
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
      revokedAt: null,
    };
    this.memories.set(`${r.userId}|${rec.id}`, rec);
    return rec;
  }
  async listMemories(userId: string): Promise<MemoryRecord[]> {
    return [...this.memories.values()].filter((m) => m.userId === userId);
  }
  async getMemory(userId: string, id: string): Promise<MemoryRecord | null> {
    const m = this.memories.get(`${userId}|${id}`);
    return m ?? null;
  }
  async revokeMemory(userId: string, id: string): Promise<MemoryRecord | null> {
    const m = await this.getMemory(userId, id);
    if (!m || m.status === "revoked") return m;
    const next: MemoryRecord = {
      ...m,
      status: "revoked",
      revokedAt: new Date().toISOString(),
    };
    this.memories.set(`${userId}|${id}`, next);
    return next;
  }
  async deleteMemory(userId: string, id: string): Promise<boolean> {
    return this.memories.delete(`${userId}|${id}`);
  }
  async touchMemory(userId: string, id: string): Promise<void> {
    const m = await this.getMemory(userId, id);
    if (m)
      this.memories.set(`${userId}|${id}`, {
        ...m,
        lastUsedAt: new Date().toISOString(),
      });
  }
  async getKey(
    keyHash: string,
  ): Promise<(KeyRecord & { keyHash: string }) | null> {
    const k = this.keys.get(keyHash);
    return k ? { ...k, keyHash } : null;
  }
  async insertKey(keyHash: string, row: KeyRecord): Promise<void> {
    this.keys.set(keyHash, row);
  }
}

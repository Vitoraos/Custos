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
export interface Store {
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
}

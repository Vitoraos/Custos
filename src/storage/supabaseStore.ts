// Supabase-backed Store (service role, RLS bypass; app scopes by userId).
// Same interface as MemoryStore — swap in createServer when creds exist.
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  FaultRow,
  KeyRecord,
  ListOp,
  MemoryRecord,
  Store,
} from "./store.js";
import { dedupeKey } from "./store.js";

export class SupabaseStore implements Store {
  constructor(private db: SupabaseClient) {}
  async ping(): Promise<{ ok: boolean }> {
    const { error } = await this.db
      .from("memories")
      .select("id", { count: "exact", head: true });
    return { ok: !error };
  }
  async getDevice(
    userId: string,
    device: string,
  ): Promise<Record<string, unknown> | null> {
    const { data } = await this.db
      .from("device_state")
      .select("state")
      .eq("user_id", userId)
      .eq("device", device)
      .maybeSingle();
    return (data?.state as Record<string, unknown>) ?? null;
  }
  async setDevice(
    userId: string,
    device: string,
    state: Record<string, unknown>,
  ): Promise<void> {
    const { error } = await this.db
      .from("device_state")
      .upsert({ user_id: userId, device, state });
    if (error) throw new Error(`store: ${error.message}`);
  }
  async getFaults(userId: string): Promise<FaultRow> {
    const { data } = await this.db
      .from("fault_config")
      .select("profile,params")
      .eq("user_id", userId)
      .maybeSingle();
    return {
      profile: data?.profile ?? "none",
      params: (data?.params as Record<string, unknown>) ?? {},
    };
  }
  async setFaults(userId: string, row: FaultRow): Promise<void> {
    const { error } = await this.db
      .from("fault_config")
      .upsert({ user_id: userId, ...row });
    if (error) throw new Error(`store: ${error.message}`);
  }
  async listItems(userId: string, list: string): Promise<string[]> {
    const { data, error } = await this.db
      .from("list_items")
      .select("item")
      .eq("user_id", userId)
      .eq("list", list)
      .order("created_at");
    if (error) throw new Error(`store: ${error.message}`);
    return (data ?? []).map((r) => r.item as string);
  }
  async applyListOps(
    userId: string,
    list: string,
    ops: ListOp[],
  ): Promise<string[]> {
    for (const o of ops) {
      const k = dedupeKey(o.item);
      if (!k) continue;
      if (o.op === "add") {
        await this.db
          .from("list_items")
          .upsert(
            { user_id: userId, list, item: o.item.trim(), dedupe_key: k },
            { onConflict: "user_id,list,dedupe_key" },
          );
      } else {
        await this.db
          .from("list_items")
          .delete()
          .eq("user_id", userId)
          .eq("list", list)
          .eq("dedupe_key", k);
      }
    }
    return this.listItems(userId, list);
  }
  async insertMemory(
    r: Omit<MemoryRecord, "id" | "createdAt" | "lastUsedAt" | "revokedAt">,
  ): Promise<MemoryRecord> {
    const { data, error } = await this.db
      .from("memories")
      .insert({
        user_id: r.userId,
        profile: r.profile,
        kind: r.kind,
        payload: r.payload,
        source: r.source,
        status: r.status,
        evidence: r.evidence,
        expires_at: r.expiresAt,
      })
      .select()
      .single();
    if (error) throw new Error(`store: ${error.message}`);
    return this.row(data);
  }
  async listMemories(userId: string): Promise<MemoryRecord[]> {
    const { data, error } = await this.db
      .from("memories")
      .select("*")
      .eq("user_id", userId)
      .order("created_at");
    if (error) throw new Error(`store: ${error.message}`);
    return (data ?? []).map((d) => this.row(d));
  }
  async getMemory(userId: string, id: string): Promise<MemoryRecord | null> {
    const { data } = await this.db
      .from("memories")
      .select("*")
      .eq("user_id", userId)
      .eq("id", id)
      .maybeSingle();
    return data ? this.row(data) : null;
  }
  async revokeMemory(userId: string, id: string): Promise<MemoryRecord | null> {
    const { data } = await this.db
      .from("memories")
      .update({ status: "revoked", revoked_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("id", id)
      .select()
      .maybeSingle();
    return data ? this.row(data) : null;
  }
  async deleteMemory(userId: string, id: string): Promise<boolean> {
    const { error, count } = await this.db
      .from("memories")
      .delete({ count: "exact" })
      .eq("user_id", userId)
      .eq("id", id);
    if (error) throw new Error(`store: ${error.message}`);
    return (count ?? 0) > 0;
  }
  async touchMemory(userId: string, id: string): Promise<void> {
    await this.db
      .from("memories")
      .update({ last_used_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("id", id);
  }
  async getKey(
    keyHash: string,
  ): Promise<(KeyRecord & { keyHash: string }) | null> {
    const { data } = await this.db
      .from("api_keys")
      .select("*")
      .eq("key_hash", keyHash)
      .maybeSingle();
    if (!data) return null;
    return {
      keyHash,
      userId: data.user_id as string,
      mode: data.mode as KeyRecord["mode"],
      label: (data.label as string) ?? null,
      revokedAt: (data.revoked_at as string) ?? null,
    };
  }
  async insertKey(keyHash: string, row: KeyRecord): Promise<void> {
    const { error } = await this.db.from("api_keys").insert({
      key_hash: keyHash,
      user_id: row.userId,
      mode: row.mode,
      label: row.label,
    });
    if (error) throw new Error(`store: ${error.message}`);
  }
  private row(d: Record<string, unknown>): MemoryRecord {
    return {
      id: d.id as string,
      userId: d.user_id as string,
      profile: d.profile as string,
      kind: d.kind as MemoryRecord["kind"],
      payload: d.payload,
      source: d.source as MemoryRecord["source"],
      status: d.status as MemoryRecord["status"],
      evidence: (d.evidence as string) ?? null,
      createdAt: d.created_at as string,
      lastUsedAt: (d.last_used_at as string) ?? null,
      expiresAt: (d.expires_at as string) ?? null,
      revokedAt: (d.revoked_at as string) ?? null,
    };
  }
}

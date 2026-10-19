// Supabase-backed Store. This client uses the service role and bypasses RLS;
// callers must derive userId from trusted authentication and every query is scoped.
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  FaultRow,
  KeyRecord,
  ListOp,
  MemoryRecord,
  Store,
} from "./store.js";
import { dedupeKey } from "./store.js";

const PAGE_SIZE = 500;

function fail(error: { message: string }): never {
  throw new Error(`store: ${error.message}`);
}

function asRecord(value: unknown, field: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`store: invalid database value for ${field}`);
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`store: invalid database value for ${field}`);
  }
  return value;
}

function nullableString(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") {
    throw new Error(`store: invalid database value for ${field}`);
  }
  return value;
}

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
    const { data, error } = await this.db
      .from("device_state")
      .select("state")
      .eq("user_id", userId)
      .eq("device", device)
      .maybeSingle();
    if (error) fail(error);
    return data ? asRecord(data.state, "device_state.state") : null;
  }

  async setDevice(
    userId: string,
    device: string,
    state: Record<string, unknown>,
  ): Promise<void> {
    const { error } = await this.db
      .from("device_state")
      .upsert({ user_id: userId, device, state });
    if (error) fail(error);
  }

  async getFaults(userId: string): Promise<FaultRow> {
    const { data, error } = await this.db
      .from("fault_config")
      .select("profile,params")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) fail(error);
    return {
      profile: data?.profile ?? "none",
      params: data ? asRecord(data.params, "fault_config.params") : {},
    };
  }

  async setFaults(userId: string, row: FaultRow): Promise<void> {
    const { error } = await this.db
      .from("fault_config")
      .upsert({ user_id: userId, ...row });
    if (error) fail(error);
  }

  async listItems(userId: string, list: string): Promise<string[]> {
    const { data, error } = await this.db
      .from("list_items")
      .select("item")
      .eq("user_id", userId)
      .eq("list", list)
      .order("created_at")
      .order("id");
    if (error) fail(error);
    return (data ?? []).map((row) =>
      requiredString(row.item, "list_items.item"),
    );
  }

  async applyListOps(
    userId: string,
    list: string,
    ops: ListOp[],
  ): Promise<string[]> {
    const normalized = ops.map((operation) => {
      if (
        !operation ||
        (operation.op !== "add" && operation.op !== "remove") ||
        typeof operation.item !== "string"
      ) {
        throw new Error("store: invalid list operation");
      }
      return {
        op: operation.op,
        item: operation.item.trim(),
        dedupe_key: dedupeKey(operation.item),
      };
    });

    const { data, error } = await this.db.rpc("apply_list_ops", {
      p_user_id: userId,
      p_list: list,
      p_ops: normalized,
    });
    if (error) fail(error);
    return (data ?? []).map((row: Record<string, unknown>) =>
      requiredString(row.item, "apply_list_ops.item"),
    );
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
    if (error) fail(error);
    return this.row(data);
  }

  async listMemories(userId: string): Promise<MemoryRecord[]> {
    const memories: MemoryRecord[] = [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = await this.db
        .from("memories")
        .select("*")
        .eq("user_id", userId)
        .order("created_at")
        .order("id")
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) fail(error);
      const page = data ?? [];
      memories.push(...page.map((row) => this.row(row)));
      if (page.length < PAGE_SIZE) return memories;
    }
  }

  async getMemory(userId: string, id: string): Promise<MemoryRecord | null> {
    const { data, error } = await this.db
      .from("memories")
      .select("*")
      .eq("user_id", userId)
      .eq("id", id)
      .maybeSingle();
    if (error) fail(error);
    return data ? this.row(data) : null;
  }

  async revokeMemory(userId: string, id: string): Promise<MemoryRecord | null> {
    const { data, error } = await this.db
      .from("memories")
      .update({ status: "revoked", revoked_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("id", id)
      .neq("status", "revoked")
      .select("*")
      .maybeSingle();
    if (error) fail(error);
    if (data) return this.row(data);

    // A concurrent or repeated revoke must preserve the original timestamp.
    const existing = await this.getMemory(userId, id);
    return existing?.status === "revoked" ? existing : null;
  }

  async deleteMemory(userId: string, id: string): Promise<boolean> {
    const { error, count } = await this.db
      .from("memories")
      .delete({ count: "exact" })
      .eq("user_id", userId)
      .eq("id", id);
    if (error) fail(error);
    return (count ?? 0) > 0;
  }

  async touchMemory(userId: string, id: string): Promise<void> {
    const { error } = await this.db
      .from("memories")
      .update({ last_used_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("id", id)
      .eq("status", "active");
    if (error) fail(error);
  }

  async getKey(
    keyHash: string,
  ): Promise<(KeyRecord & { keyHash: string }) | null> {
    const { data, error } = await this.db
      .from("api_keys")
      .select("*")
      .eq("key_hash", keyHash)
      .maybeSingle();
    if (error) fail(error);
    if (!data) return null;
    const mode = requiredString(data.mode, "api_keys.mode");
    if (mode !== "forge" && mode !== "baseline") {
      throw new Error("store: invalid database value for api_keys.mode");
    }
    return {
      keyHash,
      userId: requiredString(data.user_id, "api_keys.user_id"),
      mode,
      label: nullableString(data.label, "api_keys.label"),
      revokedAt: nullableString(data.revoked_at, "api_keys.revoked_at"),
    };
  }

  async insertKey(keyHash: string, row: KeyRecord): Promise<void> {
    const { error } = await this.db.from("api_keys").insert({
      key_hash: keyHash,
      user_id: row.userId,
      mode: row.mode,
      label: row.label,
      revoked_at: row.revokedAt,
    });
    if (error) fail(error);
  }

  private row(value: unknown): MemoryRecord {
    const d = asRecord(value, "memories row");
    const kind = requiredString(d.kind, "memories.kind");
    const source = requiredString(d.source, "memories.source");
    const status = requiredString(d.status, "memories.status");
    if (kind !== "constraint" && kind !== "fact" && kind !== "instruction") {
      throw new Error("store: invalid database value for memories.kind");
    }
    if (
      source !== "user_voice" &&
      source !== "explicit" &&
      source !== "inferred" &&
      source !== "external"
    ) {
      throw new Error("store: invalid database value for memories.source");
    }
    if (
      status !== "active" &&
      status !== "pending_confirmation" &&
      status !== "revoked"
    ) {
      throw new Error("store: invalid database value for memories.status");
    }
    const createdAt = requiredString(d.created_at, "memories.created_at");
    if (!Number.isFinite(Date.parse(createdAt))) {
      throw new Error(
        "store: invalid database timestamp for memories.created_at",
      );
    }
    const expiresAt = nullableString(d.expires_at, "memories.expires_at");
    if (expiresAt !== null && !Number.isFinite(Date.parse(expiresAt))) {
      throw new Error(
        "store: invalid database timestamp for memories.expires_at",
      );
    }
    const revokedAt = nullableString(d.revoked_at, "memories.revoked_at");
    const lastUsedAt = nullableString(d.last_used_at, "memories.last_used_at");
    const payload = asRecord(d.payload, "memories.payload");

    return {
      id: requiredString(d.id, "memories.id"),
      userId: requiredString(d.user_id, "memories.user_id"),
      profile: requiredString(d.profile, "memories.profile"),
      kind,
      payload,
      source,
      status,
      evidence: nullableString(d.evidence, "memories.evidence"),
      createdAt,
      lastUsedAt,
      expiresAt,
      revokedAt,
    };
  }
}

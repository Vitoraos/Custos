// Supabase-backed Store. This client uses the service role and bypasses RLS;
// callers must derive userId from trusted authentication and every query is scoped.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  canTransitionScheduledStatus,
  type FaultRow,
  type KeyRecord,
  type ListOp,
  type MemoryRecord,
  type ScheduledActionRecord,
  type ScheduledActionStatus,
  type Store,
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

  get client(): SupabaseClient {
    return this.db;
  }

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

  async createScheduledAction(
    row: Omit<ScheduledActionRecord, "id" | "createdAt" | "updatedAt">,
  ): Promise<ScheduledActionRecord> {
    const { data, error } = await this.db
      .from("scheduled_actions")
      .insert({
        user_id: row.userId,
        run_id: row.runId,
        idempotency_key: row.idempotencyKey,
        target: row.target,
        desired_state: row.desiredState,
        timezone: row.timezone,
        local_scheduled_at: row.localScheduledAt,
        scheduled_at: row.scheduledAt,
        status: row.status,
        evidence: row.evidence,
      })
      .select("*")
      .single();
    if (error?.code === "23505") {
      const existing = await this.db
        .from("scheduled_actions")
        .select("*")
        .eq("user_id", row.userId)
        .eq("idempotency_key", row.idempotencyKey)
        .maybeSingle();
      if (existing.error) fail(existing.error);
      if (!existing.data) fail(error);
      const d = existing.data;
      if (
        d.target !== row.target ||
        d.scheduled_at !== row.scheduledAt ||
        d.timezone !== row.timezone ||
        d.local_scheduled_at !== row.localScheduledAt ||
        d.run_id !== row.runId ||
        JSON.stringify(d.desired_state) !==
          JSON.stringify(row.desiredState)
      ) {
        throw new Error(
          "schedule: idempotency key reused with different action",
        );
      }
      return this.scheduledRow(d);
    }
    if (error) fail(error);
    return this.scheduledRow(data);
  }

  async listScheduledActions(userId: string, runId?: string): Promise<ScheduledActionRecord[]> {
    let query = this.db.from("scheduled_actions").select("*").eq("user_id", userId).order("scheduled_at");
    if (runId) query = query.eq("run_id", runId);
    const { data, error } = await query;
    if (error) fail(error);
    return (data ?? []).map(row => this.scheduledRow(row));
  }
  async updateScheduledAction(
    userId: string,
    id: string,
    status: ScheduledActionStatus,
    evidence?: Record<string, unknown>,
  ): Promise<ScheduledActionRecord | null> {
    const existing = await this.db
      .from("scheduled_actions")
      .select("status,evidence")
      .eq("user_id", userId)
      .eq("id", id)
      .maybeSingle();
    if (existing.error) fail(existing.error);
    if (!existing.data) return null;
    const previousStatus = existing.data.status as ScheduledActionStatus;
    if (!canTransitionScheduledStatus(previousStatus, status)) {
      throw new Error(`schedule: invalid status transition ${previousStatus} -> ${status}`);
    }
    const merged = { ...(existing.data.evidence ?? {}), ...(evidence ?? {}) };
    const { data, error } = await this.db
      .from("scheduled_actions")
      .update({
        status,
        evidence: merged,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("id", id)
      .eq("status", previousStatus)
      .select("*")
      .maybeSingle();
    if (error) fail(error);
    return data ? this.scheduledRow(data) : null;
  }

  private scheduledRow(value: unknown): ScheduledActionRecord {
    const d = asRecord(value, "scheduled_actions row");
    const status = requiredString(d.status, "scheduled_actions.status") as ScheduledActionStatus;
    if (!["planned","scheduled","executing","executed","verified","unverified","blocked","failed","cancelled"].includes(status)) throw new Error("store: invalid scheduled action status");
    return {
      id: requiredString(d.id, "scheduled_actions.id"), userId: requiredString(d.user_id, "scheduled_actions.user_id"),
      runId: requiredString(d.run_id, "scheduled_actions.run_id"), idempotencyKey: requiredString(d.idempotency_key, "scheduled_actions.idempotency_key"),
      target: requiredString(d.target, "scheduled_actions.target"), desiredState: asRecord(d.desired_state, "scheduled_actions.desired_state"),
      timezone: requiredString(d.timezone, "scheduled_actions.timezone"), localScheduledAt: requiredString(d.local_scheduled_at, "scheduled_actions.local_scheduled_at"),
      scheduledAt: requiredString(d.scheduled_at, "scheduled_actions.scheduled_at"), status,
      evidence: asRecord(d.evidence ?? {}, "scheduled_actions.evidence"),
      createdAt: requiredString(d.created_at, "scheduled_actions.created_at"), updatedAt: requiredString(d.updated_at, "scheduled_actions.updated_at"),
    };
  }
  async claimDueScheduledActions(now: string, limit: number): Promise<ScheduledActionRecord[]> {
    const boundedLimit = Math.max(0, Math.min(limit, 100));
    const staleBefore = new Date(Date.parse(now) - 5 * 60_000).toISOString();
    const scheduledQuery = await this.db
      .from("scheduled_actions")
      .select("*")
      .eq("status", "scheduled")
      .lte("scheduled_at", now)
      .order("scheduled_at")
      .limit(boundedLimit);
    if (scheduledQuery.error) fail(scheduledQuery.error);
    const staleQuery = await this.db
      .from("scheduled_actions")
      .select("*")
      .eq("status", "executing")
      .lte("scheduled_at", now)
      .lte("updated_at", staleBefore)
      .order("scheduled_at")
      .limit(boundedLimit);
    if (staleQuery.error) fail(staleQuery.error);
    const candidates = [...(scheduledQuery.data ?? []), ...(staleQuery.data ?? [])]
      .sort((a, b) => String(a.scheduled_at).localeCompare(String(b.scheduled_at)))
      .slice(0, boundedLimit);
    const claimed: ScheduledActionRecord[] = [];
    for (const row of candidates) {
      let query = this.db
        .from("scheduled_actions")
        .update({ status: "executing", updated_at: now })
        .eq("id", row.id)
        .eq("user_id", row.user_id)
        .eq("status", row.status);
      if (row.status === "executing") query = query.eq("updated_at", row.updated_at);
      const { data, error } = await query.select("*").maybeSingle();
      if (error) fail(error);
      if (data) claimed.push(this.scheduledRow(data));
    }
    return claimed;
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

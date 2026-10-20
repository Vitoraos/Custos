// Receipt persistence behind a minimal interface.
// Supabase implementation lands with server wiring (needs creds);
// MemoryReceipts covers unit tests + offline dev.
import type { Outcome } from "./result.js";

export interface Receipt {
  id?: string;
  userId: string;
  tool: string;
  idempotencyKey: string;
  args: unknown;
  decision: unknown;
  expectation: unknown;
  observed: unknown;
  outcome: Outcome;
  say: string; // stored so idempotent replays return the identical response
  attempts: number;
  latencyMs: number;
  createdAt: string;
}

export interface ReceiptStore {
  findByIdempotencyKey(
    userId: string,
    tool: string,
    key: string,
  ): Promise<Receipt | null>;
  insert(
    r: Omit<Receipt, "id" | "createdAt"> & { id?: string },
  ): Promise<Receipt>;
  latest(userId: string, tool?: string): Promise<Receipt | null>;
  /** Newest-first session history (in-memory only; resets on restart). */
  recent(userId: string, limit: number): Promise<Receipt[]>;
}

export class MemoryReceipts implements ReceiptStore {
  private rows: Receipt[] = [];
  async findByIdempotencyKey(
    userId: string,
    tool: string,
    key: string,
  ): Promise<Receipt | null> {
    return (
      this.rows.find(
        (r) =>
          r.userId === userId && r.tool === tool && r.idempotencyKey === key,
      ) ?? null
    );
  }
  async insert(
    r: Omit<Receipt, "id" | "createdAt"> & { id?: string },
  ): Promise<Receipt> {
    const saved: Receipt = {
      ...r,
      id: r.id ?? `rcpt_${this.rows.length + 1}`,
      createdAt: new Date().toISOString(),
    };
    this.rows.push(saved);
    return saved;
  }
  async latest(userId: string, tool?: string): Promise<Receipt | null> {
    const rows = this.rows.filter(
      (r) => r.userId === userId && (!tool || r.tool === tool),
    );
    return rows.length > 0 ? rows[rows.length - 1] : null;
  }
  async recent(userId: string, limit: number): Promise<Receipt[]> {
    return this.rows
      .filter((r) => r.userId === userId)
      .slice(-Math.max(1, limit))
      .reverse();
  }
}


// Durable production receipts. Queries are always scoped to the authenticated tenant.
import type { SupabaseClient } from "@supabase/supabase-js";

export class SupabaseReceipts implements ReceiptStore {
  constructor(private readonly db: SupabaseClient) {}

  async findByIdempotencyKey(
    userId: string,
    tool: string,
    key: string,
  ): Promise<Receipt | null> {
    const { data, error } = await this.db
      .from("action_receipts")
      .select("*")
      .eq("user_id", userId)
      .eq("tool", tool)
      .eq("idempotency_key", key)
      .maybeSingle();
    if (error) throw new Error("receipts: " + error.message);
    return data ? this.row(data) : null;
  }

  async insert(
    r: Omit<Receipt, "id" | "createdAt"> & { id?: string },
  ): Promise<Receipt> {
    const { data, error } = await this.db
      .from("action_receipts")
      .insert({
        ...(r.id ? { id: r.id } : {}),
        user_id: r.userId,
        tool: r.tool,
        idempotency_key: r.idempotencyKey,
        args: r.args,
        decision: r.decision,
        expectation: r.expectation,
        observed: r.observed,
        outcome: r.outcome,
        say: r.say,
        attempts: r.attempts,
        latency_ms: r.latencyMs,
      })
      .select("*")
      .single();
    if (error?.code === "23505") {
      const prior = await this.findByIdempotencyKey(
        r.userId,
        r.tool,
        r.idempotencyKey,
      );
      if (prior) return prior;
    }
    if (error) throw new Error("receipts: " + error.message);
    return this.row(data);
  }

  async latest(userId: string, tool?: string): Promise<Receipt | null> {
    let query = this.db
      .from("action_receipts")
      .select("*")
      .eq("user_id", userId);
    if (tool) query = query.eq("tool", tool);
    const { data, error } = await query
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error("receipts: " + error.message);
    return data ? this.row(data) : null;
  }

  async recent(userId: string, limit: number): Promise<Receipt[]> {
    const { data, error } = await this.db
      .from("action_receipts")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(Math.max(1, Math.min(100, limit)));
    if (error) throw new Error("receipts: " + error.message);
    return (data ?? []).map((row) => this.row(row));
  }

  private row(value: Record<string, unknown>): Receipt {
    const outcome = value.outcome;
    if (
      outcome !== "ok" &&
      outcome !== "verified" &&
      outcome !== "verified_after_retry" &&
      outcome !== "unverified" &&
      outcome !== "blocked" &&
      outcome !== "needs_confirmation" &&
      outcome !== "unsupported" &&
      outcome !== "error"
    ) {
      throw new Error("receipts: invalid persisted outcome");
    }
    if (
      typeof value.user_id !== "string" ||
      typeof value.tool !== "string" ||
      typeof value.idempotency_key !== "string" ||
      typeof value.say !== "string" ||
      typeof value.created_at !== "string"
    ) {
      throw new Error("receipts: invalid persisted receipt row");
    }
    return {
      id: typeof value.id === "string" ? value.id : undefined,
      userId: value.user_id,
      tool: value.tool,
      idempotencyKey: value.idempotency_key,
      args: value.args,
      decision: value.decision,
      expectation: value.expectation,
      observed: value.observed,
      outcome,
      say: value.say,
      attempts: Number(value.attempts),
      latencyMs: Number(value.latency_ms),
      createdAt: value.created_at,
    };
  }
}

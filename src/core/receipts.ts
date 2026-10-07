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
  insert(r: Omit<Receipt, "id" | "createdAt"> & { id?: string }): Promise<Receipt>;
  latest(userId: string, tool?: string): Promise<Receipt | null>;
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
  async insert(r: Omit<Receipt, "id" | "createdAt"> & { id?: string }): Promise<Receipt> {
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
}

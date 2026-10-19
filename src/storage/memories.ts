// Memory repository: typed constraints for the policy engine + provenance.
import {
  type Constraint,
  constraintSchema,
  type Fact,
  factSchema,
  type Instruction,
  instructionSchema,
} from "../core/constraints.js";
import type { MemoryRecord, Store } from "./store.js";

export interface StandingRule {
  id: string;
  profile: string;
  kind: string;
  summary: string;
  source: string;
  evidence: string | null;
  createdAt: string;
  lastUsedAt: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isCurrentlyActive(memory: MemoryRecord, now: number): boolean {
  if (memory.status !== "active") return false;
  if (memory.expiresAt === null) return true;
  const expiresAt = Date.parse(memory.expiresAt);
  // Fail closed for malformed timestamps in the in-memory or legacy store.
  return Number.isFinite(expiresAt) && expiresAt > now;
}

function summarize(recordKind: string, payload: unknown): string {
  if (!isRecord(payload)) return "[invalid memory payload]";
  const kind = typeof payload.kind === "string" ? payload.kind : recordKind;
  if (kind === "allergen")
    return `${String(payload.allergen ?? "unknown")} allergy (${String(payload.severity ?? "unspecified")})`;
  if (kind === "diet") return `${String(payload.value ?? "unknown")} diet`;
  if (kind === "quiet_hours")
    return `quiet hours ${String(payload.start ?? "?")}–${String(payload.end ?? "?")} ${String(payload.tz ?? "unknown timezone")}`;
  if (kind === "device_limit")
    return `${String(payload.device ?? "unknown device")} ${String(payload.attr ?? "unknown attribute")} range`;
  if (kind === "confirm_required")
    return `confirm before ${String(payload.action ?? "unknown action")}`;
  return typeof payload.text === "string" ? payload.text : kind;
}

function validatePayload(input: {
  profile: string;
  kind: "constraint" | "fact" | "instruction";
  payload: unknown;
  source: MemoryRecord["source"];
  expiresAt?: string;
}): void {
  if (!isRecord(input.payload)) {
    throw new Error("memory: payload must be an object");
  }
  const candidate = {
    ...input.payload,
    id: "memory-validation",
    profile: input.profile,
    source: input.source,
    createdAt: new Date().toISOString(),
    expiresAt: input.expiresAt ?? undefined,
  };
  const parsed =
    input.kind === "constraint"
      ? constraintSchema.safeParse(candidate)
      : input.kind === "fact"
        ? factSchema.safeParse(candidate)
        : instructionSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new Error(
      `memory: invalid ${input.kind} payload: ${parsed.error.message}`,
    );
  }
}

export async function loadConstraints(
  store: Store,
  userId: string,
): Promise<Constraint[]> {
  const out: Constraint[] = [];
  const now = Date.now();
  for (const memory of await store.listMemories(userId)) {
    if (memory.kind !== "constraint" || !isCurrentlyActive(memory, now)) {
      continue;
    }
    const payload = isRecord(memory.payload) ? memory.payload : {};
    const parsed = constraintSchema.safeParse({
      ...payload,
      id: memory.id,
      profile: memory.profile,
      source: memory.source,
      createdAt: memory.createdAt,
      // The database columns are authoritative. A stale payload field must not
      // override the canonical expiration column when it is null.
      expiresAt: memory.expiresAt ?? undefined,
    });
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

export async function listStandingRules(
  store: Store,
  userId: string,
): Promise<StandingRule[]> {
  const out: StandingRule[] = [];
  const now = Date.now();
  for (const memory of await store.listMemories(userId)) {
    if (!isCurrentlyActive(memory, now)) continue;
    out.push({
      id: memory.id,
      profile: memory.profile,
      kind: memory.kind,
      summary: summarize(memory.kind, memory.payload),
      source: memory.source,
      evidence: memory.evidence,
      createdAt: memory.createdAt,
      lastUsedAt: memory.lastUsedAt,
    });
  }
  return out;
}

export async function remember(
  store: Store,
  userId: string,
  input: {
    profile: string;
    kind: "constraint" | "fact" | "instruction";
    payload: Constraint | Fact | Instruction | Record<string, unknown>;
    evidence: string | null;
    source?: MemoryRecord["source"];
    expiresAt?: string;
  },
): Promise<MemoryRecord> {
  const source = input.source ?? "user_voice";
  validatePayload({ ...input, source });

  // External-source constraints stay dormant until the user confirms them.
  const status =
    source === "external" && input.kind === "constraint"
      ? "pending_confirmation"
      : "active";
  return store.insertMemory({
    userId,
    profile: input.profile,
    kind: input.kind,
    payload: structuredClone(input.payload),
    source,
    status,
    evidence: input.evidence,
    expiresAt: input.expiresAt ?? null,
  });
}

export async function findByQuery(
  store: Store,
  userId: string,
  query: string,
): Promise<MemoryRecord[]> {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  const terms = q.split(/\s+/);
  const now = Date.now();
  const hits: MemoryRecord[] = [];
  for (const memory of await store.listMemories(userId)) {
    if (!isCurrentlyActive(memory, now)) continue;
    const hay =
      `${summarize(memory.kind, memory.payload)} ${memory.profile} ${memory.evidence ?? ""}`.toLowerCase();
    if (terms.every((term) => hay.includes(term))) hits.push(memory);
  }
  return hits;
}

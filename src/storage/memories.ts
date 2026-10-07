// Memory repository: typed constraints for the policy engine + provenance
// for get_standing_rules. Payloads validated with the same Zod schemas.
import {
  constraintSchema,
  type Constraint,
  type Fact,
  type Instruction,
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

function summarize(recordKind: string, payload: unknown): string {
  const p = payload as Record<string, unknown>;
  const kind = (p.kind as string) ?? recordKind;
  if (kind === "allergen") return `${String(p.allergen)} allergy (${String(p.severity)})`;
  if (kind === "diet") return `${String(p.value)} diet`;
  if (kind === "quiet_hours") return `quiet hours ${String(p.start)}–${String(p.end)} ${String(p.tz)}`;
  if (kind === "device_limit") return `${String(p.device)} ${String(p.attr)} range`;
  if (kind === "confirm_required") return `confirm before ${String(p.action)}`;
  return String((p as { text?: unknown }).text ?? kind);
}

export async function loadConstraints(store: Store, userId: string): Promise<Constraint[]> {
  const out: Constraint[] = [];
  for (const m of await store.listMemories(userId)) {
    if (m.kind !== "constraint" || m.status !== "active") continue;
    const parsed = constraintSchema.safeParse({
      ...(m.payload as Record<string, unknown>),
      id: m.id,
      profile: m.profile,
      source: m.source,
      createdAt: m.createdAt,
      ...(m.expiresAt ? { expiresAt: m.expiresAt } : {}),
    });
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

export async function listStandingRules(store: Store, userId: string): Promise<StandingRule[]> {
  const out: StandingRule[] = [];
  for (const m of await store.listMemories(userId)) {
    if (m.status !== "active") continue;
    out.push({
      id: m.id,
      profile: m.profile,
      kind: m.kind,
      summary: summarize(m.kind, m.payload),
      source: m.source,
      evidence: m.evidence,
      createdAt: m.createdAt,
      lastUsedAt: m.lastUsedAt,
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
  // external-source constraints land dormant until the user confirms them.
  const status = input.source === "external" && input.kind === "constraint" ? "pending_confirmation" : "active";
  return store.insertMemory({
    userId,
    profile: input.profile,
    kind: input.kind,
    payload: input.payload,
    source: input.source ?? "user_voice",
    status,
    evidence: input.evidence,
    expiresAt: input.expiresAt ?? null,
  });
}

export async function findByQuery(store: Store, userId: string, query: string): Promise<MemoryRecord[]> {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  const hits: MemoryRecord[] = [];
  for (const m of await store.listMemories(userId)) {
    if (m.status !== "active") continue;
    const hay = `${summarize(m.kind, m.payload)} ${m.profile} ${m.evidence ?? ""}`.toLowerCase();
    if (q.split(/\s+/).every((w) => hay.includes(w))) hits.push(m);
  }
  return hits;
}

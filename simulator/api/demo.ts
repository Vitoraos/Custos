// Demo household seeder: wipes + writes one user's demo rows (idempotent).
// Shared by `npm run demo:seed` (Supabase, needs creds) and POST /sim/demo
// (whatever store the server runs). Bundle: infra/demo-household.json.
import bundle from "../../infra/demo-household.json" with { type: "json" };
import { loadConstraints, remember } from "../../src/storage/memories.js";
import type { Store } from "../../src/storage/store.js";

interface Bundle {
  rules: {
    profile: string;
    evidence: string;
    kind: string;
    [k: string]: unknown;
  }[];
  facts: { profile: string; text: string; evidence: string }[];
  devices: Record<string, Record<string, unknown>>;
  shopping: string[];
  pantry: string[];
  fault: { profile: string; params: Record<string, unknown> };
}
const BUNDLE = bundle as unknown as Bundle;
export const DEMO_RULE_COUNT = BUNDLE.rules.length;

export interface SeedSummary {
  userId: string;
  rules: number;
  facts: number;
  devices: number;
  items: string[];
  pantry: string[];
  constraintsLoaded: number;
}

export async function seedDemoHousehold(
  store: Store,
  userId: string,
): Promise<SeedSummary> {
  for (const m of await store.listMemories(userId)) {
    await store.deleteMemory(userId, m.id);
  }
  let facts = 0;
  for (const r of BUNDLE.rules) {
    // payload keeps kind: the Zod discriminated union needs it to parse.
    const { profile, evidence, ...payload } = r;
    await remember(store, userId, {
      profile,
      kind: "constraint",
      payload,
      evidence,
      source: "explicit",
    });
  }
  for (const f of BUNDLE.facts) {
    await remember(store, userId, {
      profile: f.profile,
      kind: "fact",
      payload: { kind: "fact", text: f.text },
      evidence: f.evidence,
      source: "explicit",
    });
    facts++;
  }
  const devices = Object.entries(BUNDLE.devices);
  for (const [device, state] of devices) {
    await store.setDevice(userId, device, state);
  }
  const current = await store.listItems(userId, "shopping");
  const ops = [
    ...current.map((item) => ({ op: "remove" as const, item })),
    ...BUNDLE.shopping.map((item) => ({ op: "add" as const, item })),
  ];
  const items = await store.applyListOps(userId, "shopping", ops);
  const currentPantry = await store.listItems(userId, "pantry");
  const pantry = await store.applyListOps(userId, "pantry", [
    ...currentPantry.map((item) => ({ op: "remove" as const, item })),
    ...BUNDLE.pantry.map((item) => ({ op: "add" as const, item })),
  ]);
  await store.setFaults(userId, BUNDLE.fault);
  const constraintsLoaded = (await loadConstraints(store, userId)).length;
  return {
    userId,
    rules: BUNDLE.rules.length,
    facts,
    devices: devices.length,
    items,
    pantry,
    constraintsLoaded,
  };
}

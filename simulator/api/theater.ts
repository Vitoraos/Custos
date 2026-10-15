// Demo theater runner: scripted beats for the interactive demo.
// The left (simulated Alexa+) column plays canned fixtures verbatim;
// the right (Custos) column always runs live. Assertions query ground state
// (store + receipts) so each beat proves what actually changed.
import bundle from "../../infra/demo-theater.json" with { type: "json" };
import type { Store } from "../../src/storage/store.js";
import type { Deps } from "../../src/tools/context.js";

export interface SyntheticEvent {
  type: "token" | "final";
  text: string;
}
export interface TheaterFault {
  profile: string;
  params: Record<string, unknown>;
}
export type Assertion =
  | {
      kind: "device";
      device: string;
      attr: string;
      equals?: unknown;
      unequals?: unknown;
    }
  | { kind: "shopping-contains"; items: string[] }
  | { kind: "shopping-excludes"; items: string[] }
  | { kind: "receipt"; tool: string; outcome: string };
export interface Beat {
  id: string;
  caption: string;
  narration: string;
  input: string | null;
  fault: TheaterFault | null;
  alexa: SyntheticEvent[];
  assertLeft: Assertion[];
  assertRight: Assertion[];
}
export interface AssertResult {
  description: string;
  pass: boolean;
  detail: string;
}

const BEATS = (bundle as { beats: Beat[] }).beats;
export const THEATER_DISCLAIMER = (bundle as { disclaimer: string }).disclaimer;

export function listBeats(): Pick<
  Beat,
  "id" | "caption" | "narration" | "input"
>[] {
  return BEATS.map(({ id, caption, narration, input }) => ({
    id,
    caption,
    narration,
    input,
  }));
}

export function getBeat(id: string): Beat | undefined {
  return BEATS.find((b) => b.id === id);
}

function describe(a: Assertion): string {
  switch (a.kind) {
    case "device":
      return a.equals !== undefined
        ? `${a.device}.${a.attr} == ${JSON.stringify(a.equals)}`
        : `${a.device}.${a.attr} != ${JSON.stringify(a.unequals)}`;
    case "shopping-contains":
      return `shopping contains ${a.items.join(", ")}`;
    case "shopping-excludes":
      return `shopping excludes ${a.items.join(", ")}`;
    case "receipt":
      return `latest ${a.tool} receipt is ${a.outcome}`;
  }
}

export async function assertBeat(
  store: Store,
  deps: Deps,
  userId: string,
  beatId: string,
  phase: "left" | "right",
): Promise<AssertResult[]> {
  const beat = getBeat(beatId);
  if (!beat) throw new Error(`unknown beat: ${beatId}`);
  const list = phase === "left" ? beat.assertLeft : beat.assertRight;
  const out: AssertResult[] = [];
  for (const a of list) {
    if (a.kind === "device") {
      const state = await store.getDevice(userId, a.device);
      const actual = state?.[a.attr];
      const pass =
        a.equals !== undefined ? actual === a.equals : actual !== a.unequals;
      out.push({
        description: describe(a),
        pass,
        detail: `observed ${JSON.stringify(actual)}`,
      });
    } else if (
      a.kind === "shopping-contains" ||
      a.kind === "shopping-excludes"
    ) {
      const items = (await store.listItems(userId, "shopping")).map((s) =>
        s.toLowerCase(),
      );
      const hits = a.items.filter((w) =>
        items.some((s) => s.includes(w.toLowerCase())),
      );
      const pass =
        a.kind === "shopping-contains"
          ? hits.length === a.items.length
          : hits.length === 0;
      out.push({
        description: describe(a),
        pass,
        detail: `shopping=[${items.join("; ") || "empty"}]`,
      });
    } else {
      const r = await deps.receipts.latest(userId, a.tool);
      const pass = r?.outcome === a.outcome;
      out.push({
        description: describe(a),
        pass,
        detail: r ? `latest=${r.outcome}` : "no receipt yet",
      });
    }
  }
  return out;
}

export async function applyBeatFault(
  store: Store,
  userId: string,
  beatId: string,
): Promise<void> {
  const beat = getBeat(beatId);
  if (!beat) throw new Error(`unknown beat: ${beatId}`);
  if (beat.fault) {
    await store.setFaults(userId, {
      profile: beat.fault.profile,
      params: beat.fault.params,
    });
  } else {
    await store.setFaults(userId, { profile: "none", params: {} });
  }
}

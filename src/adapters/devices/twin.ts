// Digital twin: simulated devices behind the real ActionAdapter interface.
// Honestly labelled — the verification pipeline is real and works against any
// adapter implementing the same interface. Faults are set via the simulator
// admin endpoint (/sim/faults), NEVER via MCP, and are seeded for repro runs.
import type { ActionAdapter } from "../../core/verify.js";
import type { Store } from "../../storage/store.js";

export const TWIN_DEVICES = [
  "kitchen_light",
  "hall_light",
  "thermostat",
  "front_door_lock",
  "coffee_maker",
] as const;
export interface TwinCmd {
  device: string;
  attr: string;
  value: string | number | boolean;
}
export type TwinState = Record<string, string | number | boolean>;

const CANON = new Set<string>(TWIN_DEVICES);

// Map a spoken name ("kitchen light", "hall lights") to its canonical key.
// Without this the twin writes a phantom row under the raw name and verifies
// against itself, so the UI (which reads canonical keys) never changes.
export function normalizeDevice(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  for (const c of [
    slug,
    slug.replace(/_lights$/, "_light"),
    slug.replace(/s$/, ""),
  ])
    if (CANON.has(c)) return c;
  throw new Error(
    `unknown device "${name}" — known: ${TWIN_DEVICES.join(", ")}`,
  );
}

function mulberry(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Per-write-call draw counters: retries draw fresh values (so recovery is
// possible), while the same (seed, call) always draws the same value —
// reproducible across bench runs. Keyed by idempotency key, which includes
// user + mode + args, so forge/baseline draws stay independent.
const draws = new Map<string, number>();
function draw(seed: number, key: string): number {
  const n = draws.get(key) ?? 0;
  draws.set(key, n + 1);
  const rand = mulberry((seed ^ Math.imul(n + 1, 0x9e3779b1)) | 0);
  return rand();
}

export class DeviceTwin implements ActionAdapter<TwinCmd, TwinState> {
  name = "device-twin";
  constructor(private store: Store) {}
  async write(
    userId: string,
    cmd: TwinCmd,
    idemKey: string,
  ): Promise<{ ackId?: string }> {
    const device = normalizeDevice(cmd.device);
    const fault = await this.store.getFaults(userId);
    const p = Number(fault.params.p ?? 0.3);
    const seed = Number(fault.params.seed ?? 1);
    const ms = Number(fault.params.ms ?? 2000);
    const rand = (): number => draw(seed + device.length, idemKey);
    const apply = async (): Promise<void> => {
      const cur = (await this.store.getDevice(userId, device)) ?? {};
      await this.store.setDevice(userId, device, {
        ...cur,
        [cmd.attr]: cmd.value,
      });
    };
    switch (fault.profile) {
      case "offline":
        if (rand() < p) throw new Error("device offline (twin fault)");
        break;
      case "lost_ack":
        if (rand() < p) return { ackId: `twin-${Date.now()}` }; // acked, never applied
        break;
      case "delayed":
        setTimeout(() => void apply(), ms).unref?.();
        return { ackId: `twin-${Date.now()}` };
      case "flaky":
        if (rand() < 0.5) throw new Error("device offline (twin fault)");
        if (rand() < 0.5) return { ackId: `twin-${Date.now()}` };
        break;
      default:
        break;
    }
    await apply();
    return { ackId: `twin-${Date.now()}` };
  }
  async read(userId: string, device: string): Promise<TwinState> {
    return ((await this.store.getDevice(userId, normalizeDevice(device))) ??
      {}) as TwinState;
  }
}

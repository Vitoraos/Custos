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

function mulberry(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class DeviceTwin implements ActionAdapter<TwinCmd, TwinState> {
  name = "device-twin";
  constructor(private store: Store) {}
  async write(
    userId: string,
    cmd: TwinCmd,
    _idemKey: string,
  ): Promise<{ ackId?: string }> {
    const fault = await this.store.getFaults(userId);
    const p = Number(fault.params.p ?? 0.3);
    const seed = Number(fault.params.seed ?? 1);
    const ms = Number(fault.params.ms ?? 2000);
    const rand = mulberry(seed + cmd.device.length);
    const apply = async (): Promise<void> => {
      const cur = (await this.store.getDevice(userId, cmd.device)) ?? {};
      await this.store.setDevice(userId, cmd.device, {
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
    return ((await this.store.getDevice(userId, device)) ?? {}) as TwinState;
  }
}

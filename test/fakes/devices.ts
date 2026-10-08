// Deterministic fakes for verify-runner tests. Mirrors ActionAdapter;
// fault knobs are per-test, not reachable via any tool surface.
import type { ActionAdapter } from "../../src/core/verify.js";

export type DeviceFault = "ok" | "lost_ack" | "offline" | "flaky";
export interface FakeDeviceCmd {
  device: string;
  value: string;
}

export class FakeDeviceTwin
  implements ActionAdapter<FakeDeviceCmd, { power: string }>
{
  name = "fake-twin";
  writes = 0;
  reads = 0;
  private state = new Map<string, string>();
  constructor(
    private fault: DeviceFault = "ok",
    private seed: number = 1,
    private delayMs = 0,
  ) {}
  private rand(): number {
    // mulberry32 — deterministic per seed for reproducible tests/benchmarks.
    this.seed = (this.seed + 0x6d2b79f5) | 0;
    let t = Math.imul(this.seed ^ (this.seed >>> 15), 1 | this.seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  private failWrite(): boolean {
    if (this.fault === "lost_ack" || this.fault === "offline") return true;
    if (this.fault === "flaky") return this.rand() < 0.5;
    return false;
  }
  async write(
    _userId: string,
    cmd: FakeDeviceCmd,
    _idemKey: string,
  ): Promise<{ ackId?: string }> {
    this.writes++;
    if (this.fault === "offline") throw new Error("device offline");
    if (this.failWrite()) return { ackId: `ack-${this.writes}` }; // acked but not applied
    if (this.delayMs > 0) {
      const { device, value } = cmd;
      setTimeout(() => this.state.set(device, value), this.delayMs).unref?.();
    } else {
      this.state.set(cmd.device, cmd.value);
    }
    return { ackId: `ack-${this.writes}` };
  }
  async read(_userId: string, device: string): Promise<{ power: string }> {
    this.reads++;
    return { power: this.state.get(device) ?? "off" };
  }
  set(device: string, value: string): void {
    this.state.set(device, value);
  }
}

import { DeviceTwin, normalizeDevice } from "../adapters/devices/twin.js";
import type { Store } from "../storage/store.js";

export interface ScheduleWorkerResult {
  claimed: number;
  verified: number;
  unverified: number;
  failed: number;
}

/** Execute due jobs against the simulator's device twin, then verify by read-back. */
export async function runDueScheduledActions(
  store: Store,
  now = new Date(),
  limit = 20,
): Promise<ScheduleWorkerResult> {
  const claimed = await store.claimDueScheduledActions(
    now.toISOString(),
    limit,
  );
  const twin = new DeviceTwin(store);
  const result: ScheduleWorkerResult = {
    claimed: claimed.length,
    verified: 0,
    unverified: 0,
    failed: 0,
  };

  for (const job of claimed) {
    try {
      const device = normalizeDevice(job.target);
      for (const [attr, value] of Object.entries(job.desiredState)) {
        await twin.write(
          job.userId,
          { device, attr, value: value as string | number | boolean },
          `scheduled-action:${job.id}:${attr}`,
        );
      }
      const observed = await twin.read(job.userId, device);
      const matches = Object.entries(job.desiredState).every(
        ([attr, value]) => observed[attr] === value,
      );
      await store.updateScheduledAction(job.userId, job.id, "executed", {
        executedAt: now.toISOString(),
        observed,
        verificationSource: "device-twin read-back",
      });
      if (matches) {
        await store.updateScheduledAction(job.userId, job.id, "verified", {
          verifiedAt: new Date().toISOString(),
          verification: "expected state matches observed state",
        });
        result.verified++;
      } else {
        await store.updateScheduledAction(job.userId, job.id, "unverified", {
          verification: "observed state did not match expected state",
        });
        result.unverified++;
      }
    } catch (error) {
      await store.updateScheduledAction(job.userId, job.id, "failed", {
        error:
          error instanceof Error
            ? error.message.slice(0, 240)
            : "unknown execution error",
        failedAt: new Date().toISOString(),
      });
      result.failed++;
    }
  }
  return result;
}

/** Start a small unref'd polling loop; due rows are claimed in storage before execution. */
export function startScheduledActionWorker(store: Store): () => void {
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    void runDueScheduledActions(store)
      .catch((error: unknown) => {
        console.error("scheduled action worker failed", error);
      })
      .finally(() => {
        running = false;
      });
  }, 15_000);
  timer.unref();
  return () => clearInterval(timer);
}

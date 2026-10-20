import { z } from "zod";
import { getLocale } from "../core/locale.js";
import { evaluate } from "../core/policy.js";
import {
  type Deps,
  envelope,
  envelopeSchema,
  requestContextFor,
  runCtx,
  sessionOf,
} from "./context.js";

export function localToInstant(local: string, timezone: string): Date | null {
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}$/.test(local)) {
    return null;
  }
  const parts = local.split("T");
  const date = parts[0].split("-").map(Number);
  const time = parts[1].split(":").map(Number);
  const [y, mo, d] = date;
  const [hh, mm] = time;
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || hh > 23 || mm > 59) {
    return null;
  }
  const wanted = Date.UTC(y, mo - 1, d, hh, mm);
  let guess = wanted;
  try {
    for (let i = 0; i < 4; i++) {
      const fields = new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).formatToParts(new Date(guess));
      const v = Object.fromEntries(fields.map((p) => [p.type, p.value]));
      const represented = Date.UTC(
        Number(v.year),
        Number(v.month) - 1,
        Number(v.day),
        Number(v.hour),
        Number(v.minute),
      );
      const delta = wanted - represented;
      if (delta === 0) break;
      guess += delta;
    }
    const instant = new Date(guess);
    const fields = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(instant);
    const v = Object.fromEntries(fields.map((p) => [p.type, p.value]));
    if (
      Number(v.year) !== y ||
      Number(v.month) !== mo ||
      Number(v.day) !== d ||
      Number(v.hour) !== hh ||
      Number(v.minute) !== mm
    ) {
      return null;
    }
    return instant;
  } catch {
    return null;
  }
}

const params = z.object({
  target: z.string().min(1).max(80),
  attr: z.string().min(1).max(40).default("power"),
  value: z.union([z.string().max(100), z.number(), z.boolean()]),
  localScheduledAt: z
    .string()
    .regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}$/),
  timezone: z.string().min(1).max(80).optional(),
  runId: z.string().min(1).max(100),
  idempotencyKey: z.string().min(8).max(160),
  confirmToken: z.string().min(16).max(64).optional(),
});

export function schedulingTools(deps: Deps) {
  return [
    {
      name: "schedule_device_action",
      description:
        "Persist a future device-state action in the household timezone. This records a schedule; it does not claim the device has already changed. Scheduled, executed, and verified are distinct states.",
      annotations: {
        readOnlyHint: false,
        idempotentHint: true,
        title: "Schedule device action",
      },
      parameters: params,
      outputSchema: envelopeSchema,
      execute: async (args: z.infer<typeof params>, ctx: unknown) => {
        const started = Date.now();
        const session = sessionOf(ctx);
        const c = await requestContextFor(deps, session);
        const locale = await getLocale(deps.store, session.userId);
        const timezone = args.timezone ?? locale.tz;
        const instant = localToInstant(args.localScheduledAt, timezone);
        if (!instant) {
          return envelope(
            {
              outcome: "error",
              say: "That local time is invalid or falls inside a daylight-saving clock gap.",
            },
            c,
          );
        }
        if (instant.getTime() <= Date.now()) {
          return envelope(
            {
              outcome: "error",
              say: "Choose a future local time; past actions are not scheduled.",
            },
            c,
          );
        }
        const rc = await runCtx(deps, session, ["household"]);
        const decision = evaluate(
          rc.rules,
          {
            type: "device_schedule",
            device: args.target,
            attr: args.attr,
            value: args.value,
            at: instant,
          },
          { now: new Date(), profiles: rc.profiles },
        );
        if (decision.verdict === "block") {
          return envelope(
            {
              outcome: "blocked",
              say: decision.reasons[0]?.text ?? "Blocked by a standing rule.",
              reasons: decision.reasons,
              data: { checked: decision.checked },
            },
            c,
          );
        }
        if (decision.verdict === "confirm") {
          return envelope(
            {
              outcome: "needs_confirmation",
              say: "This scheduled action requires confirmation before it can be stored.",
              data: { checked: decision.checked },
            },
            c,
          );
        }
        try {
          const record = await deps.store.createScheduledAction({
            userId: session.userId,
            runId: args.runId,
            idempotencyKey: args.idempotencyKey,
            target: args.target,
            desiredState: { [args.attr]: args.value },
            timezone,
            localScheduledAt: args.localScheduledAt,
            scheduledAt: instant.toISOString(),
            status: "scheduled",
            evidence: {
              policy: "allow",
              checked: decision.checked,
              persisted: true,
              physicalDeviceChanged: false,
            },
          });
          const say = `Schedule saved for ${args.localScheduledAt} (${timezone}); the device has not changed yet.`;
          const prior = await deps.receipts.findByIdempotencyKey(
            session.userId,
            "schedule_device_action",
            args.idempotencyKey,
          );
          if (prior) {
            return envelope(
              {
                outcome: prior.outcome,
                say: prior.say,
                data: record,
                receiptId: prior.id,
              },
              c,
            );
          }
          const receipt = await deps.receipts.insert({
            userId: session.userId,
            tool: "schedule_device_action",
            idempotencyKey: args.idempotencyKey,
            args: {
              target: args.target,
              attr: args.attr,
              value: args.value,
              localScheduledAt: args.localScheduledAt,
              timezone,
              runId: args.runId,
            },
            decision: {
              verdict: decision.verdict,
              checked: decision.checked,
            },
            expectation: {
              target: args.target,
              desiredState: record.desiredState,
              scheduledAt: record.scheduledAt,
            },
            observed: {
              id: record.id,
              status: record.status,
              persisted: true,
            },
            outcome: "verified",
            say,
            attempts: 1,
            latencyMs: Date.now() - started,
          });
          return envelope(
            {
              outcome: "verified",
              say,
              data: record,
              receiptId: receipt.id,
              evidence: {
                expected: {
                  target: args.target,
                  [args.attr]: args.value,
                  scheduledAt: instant.toISOString(),
                },
                observed: {
                  persisted: true,
                  status: record.status,
                  id: record.id,
                },
                source: "scheduled_actions database row",
                checkedAt: new Date().toISOString(),
              },
            },
            c,
          );
        } catch (e) {
          return envelope(
            {
              outcome: "error",
              say: (e as Error).message.slice(0, 200),
            },
            c,
          );
        }
      },
    },
  ];
}

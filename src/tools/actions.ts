// Action tools: set_device_state, set_reminder, update_shopping_list.
// Each strips confirmToken from runner args (token travels via RunContext,
// keeping the idempotency/confirm hashes stable across the two steps).
import { z } from "zod";
import {
  DeviceTwin,
  type TwinCmd,
  type TwinState,
} from "../adapters/devices/twin.js";
import { type ListCmd, ShoppingLists } from "../adapters/lists.js";
import {
  NtfyReminders,
  type ReminderCmd,
  type ReminderState,
  topicFor,
} from "../adapters/ntfy.js";
import { getLocale } from "../core/locale.js";
import { type ActionSpec, type RunContext, runAction } from "../core/verify.js";
import type { Runner } from "./accountability.js";
import {
  type Deps,
  envelope,
  envelopeSchema,
  requestContextFor,
  runCtx,
  sessionOf,
} from "./context.js";

const tokenParam = z.string().min(16).max(64).optional();

function strip<T extends Record<string, unknown>>(
  args: T,
): { rest: Omit<T, "confirmToken">; token?: string } {
  const { confirmToken, ...rest } = args as T & { confirmToken?: string };
  return { rest, token: confirmToken };
}

// ms until the next HH:MM wall-clock occurrence in tz ("today"|"tomorrow").
// Past times roll forward a day; DST edges approximate by wall diff. Null on bad input.
// Exported for unit tests; the only caller is set_reminder's atLocal path.
export function delayUntil(
  tz: string,
  day: "today" | "tomorrow",
  time: string,
  now: Date,
): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(time);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh > 23 || mm > 59) return null;
  let nowWall: number;
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: tz,
    }).formatToParts(now);
    const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
    const min = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
    nowWall = (h === 24 ? 0 : h) * 60 + min;
  } catch {
    return null;
  }
  const target = hh * 60 + mm;
  let deltaMin =
    day === "tomorrow" ? 24 * 60 - nowWall + target : target - nowWall;
  if (deltaMin <= 0) deltaMin += 24 * 60;
  return deltaMin * 60 * 1000;
}

export function actionTools(deps: Deps) {
  const twin = new DeviceTwin(deps.store);
  const lists = new ShoppingLists(deps.store);
  const ntfy = new NtfyReminders();

  const deviceSpec: ActionSpec<
    { device: string; attr: string; value: string | number | boolean },
    TwinCmd,
    TwinState
  > = {
    name: "set_device_state",
    risk: (a) => (/lock/.test(a.device.toLowerCase()) ? "high" : "low"),
    adapter: twin,
    toPolicyAction: (a) => ({
      type: "device_set",
      device: a.device,
      attr: a.attr,
      value: a.value,
      at: new Date(),
    }),
    toCommand: (a) => ({ device: a.device, attr: a.attr, value: a.value }),
    target: (a) => a.device,
    expected: (a) => (s) => s[a.attr] === a.value,
    verifiedWhat: (a) => `The ${a.device} ${a.attr} is ${a.value}`,
    unverifiedObserved: (a) =>
      `the ${a.device} ${a.attr} still shows otherwise`,
    confirmWhat: (a) => `Set the ${a.device} ${a.attr} to ${a.value}`,
  };
  const reminderSpec: ActionSpec<
    { topic: string; text: string; title?: string; delayMs: number },
    ReminderCmd,
    ReminderState
  > = {
    name: "set_reminder",
    risk: "low",
    adapter: ntfy,
    toPolicyAction: (a) => ({
      type: "reminder",
      at: new Date(Date.now() + a.delayMs),
      text: a.text,
    }),
    toCommand: (a) => ({
      topic: a.topic,
      text: a.text,
      title: a.title,
      delayMs: a.delayMs,
    }),
    target: (a) => `${a.topic}|${a.text}`,
    // Acceptance attestation: ntfy's id + scheduled time vs requested (±2 min).
    expected: (a) => (s) => {
      const c = s.confirmation;
      if (!c || c.text !== a.text) return false;
      return Math.abs(c.deliverAtMs - (Date.now() + a.delayMs)) < 120_000;
    },
    verifiedWhat: (a) => `Reminder set: ${a.text}`,
    unverifiedObserved: () => "no confirmation came back",
    confirmWhat: (a) => `Set the reminder: ${a.text}`,
  };
  const listSpec: ActionSpec<
    { list: string; ops: { op: "add" | "remove"; item: string }[] },
    ListCmd,
    string[]
  > = {
    name: "update_shopping_list",
    risk: "low",
    adapter: lists,
    toPolicyAction: (a) => ({
      type: "shopping_add",
      items: a.ops.filter((o) => o.op === "add").map((o) => o.item),
    }),
    toCommand: (a) => ({ list: a.list, ops: a.ops }),
    target: (a) => a.list,
    expected: (a) => (items) => {
      const have = new Set(items.map((i) => i.toLowerCase()));
      const norm = (s: string) =>
        s
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, "")
          .replace(/\s+/g, " ")
          .trim();
      return a.ops.every((o) =>
        o.op === "add"
          ? [...have].some((h) => norm(h) === norm(o.item))
          : ![...have].some((h) => norm(h) === norm(o.item)),
      );
    },
    verifiedWhat: () => "Shopping list updated",
    unverifiedObserved: () => "the list does not show the change",
    confirmWhat: () => "Update the shopping list",
  };

  const run =
    <A extends Record<string, unknown>, C, S>(
      s: ActionSpec<A, C, S>,
      adapt: (r: RunContext, a: A) => A = (_r, a) => a,
    ): Runner =>
    async (args, rc) => {
      const { confirmToken, ...rest } = args as A & { confirmToken?: string };
      return runAction(s, adapt(rc, rest as A), {
        ...rc,
        confirmToken: confirmToken ?? rc.confirmToken,
      });
    };

  const runners: Record<string, Runner> = {
    set_device_state: run(deviceSpec),
    set_reminder: run(reminderSpec, (rc, a) => ({
      ...a,
      topic: topicFor(rc.userId),
    })),
    update_shopping_list: run(listSpec),
  };

  const deviceParams = z.object({
    device: z.string().min(1).max(80),
    attr: z.string().min(1).max(40).default("power"),
    value: z.union([z.string().max(100), z.number(), z.boolean()]),
    confirmToken: tokenParam,
  });
  const reminderParams = z.object({
    text: z.string().min(1).max(200),
    inSeconds: z.number().int().min(10).max(259200).optional(),
    // Wall-clock time in the home timezone: the 4am-coffee case.
    // "tomorrow 07:00" or "today 15:00". Exactly one of inSeconds/atLocal.
    atLocal: z
      .object({
        day: z.enum(["today", "tomorrow"]),
        time: z.string().regex(/^\d{2}:\d{2}$/),
      })
      .optional(),
    title: z.string().max(100).optional(),
    confirmToken: tokenParam,
  });
  const listParams = z.object({
    list: z.string().min(1).max(40).default("shopping"),
    ops: z
      .array(
        z.object({
          op: z.enum(["add", "remove"]),
          item: z.string().min(1).max(120),
        }),
      )
      .min(1)
      .max(20),
    confirmToken: tokenParam,
  });

  return {
    runners,
    tools: [
      {
        name: "set_device_state",
        description:
          "Set a device (light, thermostat, lock, coffee maker). Guarded by rules, verified by read-back.",
        annotations: {
          readOnlyHint: false,
          idempotentHint: true,
          title: "Set device state",
        },
        parameters: deviceParams,
        outputSchema: envelopeSchema,
        execute: async (args: z.infer<typeof deviceParams>, ctx: unknown) => {
          const s = sessionOf(ctx);
          const c = await requestContextFor(deps, s);
          const { rest, token } = strip(args);
          return envelope(
            await runners.set_device_state(rest, {
              ...(await runCtx(deps, s)),
              confirmToken: token,
            }),
            c,
          );
        },
      },
      {
        name: "set_reminder",
        description:
          "Schedule a real push reminder (10s to 3 days). Guarded by quiet hours, verified against ntfy.",
        annotations: {
          readOnlyHint: false,
          idempotentHint: true,
          title: "Set reminder",
        },
        parameters: reminderParams,
        outputSchema: envelopeSchema,
        execute: async (args: z.infer<typeof reminderParams>, ctx: unknown) => {
          const s = sessionOf(ctx);
          const c = await requestContextFor(deps, s);
          const { rest, token } = strip(args);
          let delayMs: number | null = null;
          if (rest.inSeconds !== undefined && rest.atLocal !== undefined) {
            return envelope(
              {
                outcome: "error",
                say: "Give either inSeconds or atLocal, not both.",
              },
              c,
            );
          }
          if (rest.inSeconds !== undefined) {
            delayMs = rest.inSeconds * 1000;
          } else if (rest.atLocal !== undefined) {
            const locale = await getLocale(deps.store, s.userId);
            delayMs = delayUntil(
              locale.tz,
              rest.atLocal.day,
              rest.atLocal.time,
              new Date(),
            );
            if (delayMs === null) {
              return envelope(
                {
                  outcome: "error",
                  say: "That time did not parse. Use HH:MM, 24-hour.",
                },
                c,
              );
            }
          } else {
            return envelope(
              { outcome: "error", say: "Give either inSeconds or atLocal." },
              c,
            );
          }
          const withMs = {
            topic: topicFor(s.userId),
            text: rest.text,
            title: rest.title,
            delayMs,
          };
          return envelope(
            await runners.set_reminder(withMs, {
              ...(await runCtx(deps, s)),
              confirmToken: token,
            }),
            c,
          );
        },
      },
      {
        name: "update_shopping_list",
        description:
          "Add/remove shopping list items. Guarded by allergen and diet rules, verified by re-query.",
        annotations: {
          readOnlyHint: false,
          idempotentHint: true,
          title: "Update shopping list",
        },
        parameters: listParams,
        outputSchema: envelopeSchema,
        execute: async (args: z.infer<typeof listParams>, ctx: unknown) => {
          const s = sessionOf(ctx);
          const c = await requestContextFor(deps, s);
          const { rest, token } = strip(args);
          return envelope(
            await runners.update_shopping_list(rest, {
              ...(await runCtx(deps, s)),
              confirmToken: token,
            }),
            c,
          );
        },
      },
    ],
  };
}

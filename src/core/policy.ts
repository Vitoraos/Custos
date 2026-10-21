// Deterministic, fail-closed policy: rules in, verdict out. Pure functions, no I/O.
import { constraintSchema, type Allergen, type Constraint } from "./constraints.js";
import { matchAllergens, matchDiet } from "./matcher.js";

export type ProposedAction =
  | {
      type: "recipe";
      name: string;
      ingredients: string[];
      servingFor: string[];
    }
  | {
      type: "device_set" | "device_schedule";
      device: string;
      attr: string;
      value: unknown;
      at: Date;
    }
  | { type: "shopping_add"; items: string[] }
  | { type: "reminder"; at: Date; text: string };

export type Verdict = "allow" | "block" | "confirm";
export interface Reason {
  constraintId: string;
  text: string;
}
export interface Evaluation {
  verdict: Verdict;
  reasons: Reason[];
  checked: string[]; // constraint ids actually evaluated
}

export interface EvalContext {
  now: Date;
  profiles: string[]; // e.g. recipe servingFor, or ['household'] + speaker
}

function active(r: Constraint, now: Date): boolean {
  // External-source rules stay dormant until a user confirms them (poisoning guard).
  if (r.source === "external") return false;
  if (r.expiresAt && Date.parse(r.expiresAt) <= now.getTime()) return false;
  return true;
}

function inScope(r: Constraint, ctx: EvalContext): boolean {
  return r.profile === "household" || ctx.profiles.includes(r.profile);
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

// Wall-clock minutes in tz (handles DST via Intl; invalid zones are rejected by schema).
function nowInTz(now: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: tz,
  }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return (h === 24 ? 0 : h) * 60 + m;
}

function quietActive(
  start: string,
  end: string,
  tz: string,
  now: Date,
): boolean {
  const cur = nowInTz(now, tz);
  const s = toMinutes(start);
  const e = toMinutes(end);
  // Equal endpoints are treated as all-day quiet hours, never as an accidental bypass.
  if (s === e) return true;
  return s < e ? cur >= s && cur < e : cur >= s || cur < e;
}

function deviceDomain(
  device: string,
  attr: string,
): "lights" | "notifications" | "audio" | null {
  const d = `${device} ${attr}`.toLowerCase();
  if (/light|lamp|bulb|dimmer/.test(d)) return "lights";
  if (/speaker|audio|music|volume|chime|alarm|doorbell/.test(d)) return "audio";
  if (/remind|notif|push|announce/.test(d)) return "notifications";
  return null;
}

function isUnlock(device: string, value: unknown): boolean {
  return (
    /lock/.test(device.toLowerCase()) &&
    (value === "unlock" ||
      value === "unlocked" ||
      value === "open" ||
      value === true)
  );
}

function isValidAction(action: ProposedAction): boolean {
  if (!action || typeof action !== "object") return false;
  switch (action.type) {
    case "recipe":
      return (
        typeof action.name === "string" &&
        action.name.trim().length > 0 &&
        Array.isArray(action.ingredients) &&
        action.ingredients.every((item) => typeof item === "string" && item.trim()) &&
        Array.isArray(action.servingFor) &&
        action.servingFor.every((profile) => typeof profile === "string" && profile.trim())
      );
    case "device_set":
    case "device_schedule":
      return (
        typeof action.device === "string" &&
        action.device.trim().length > 0 &&
        typeof action.attr === "string" &&
        action.attr.trim().length > 0 &&
        action.at instanceof Date &&
        Number.isFinite(action.at.getTime()) &&
        (typeof action.value === "string" ||
          typeof action.value === "boolean" ||
          (typeof action.value === "number" && Number.isFinite(action.value)))
      );
    case "shopping_add":
      return (
        Array.isArray(action.items) &&
        action.items.every((item) => typeof item === "string" && item.trim())
      );
    case "reminder":
      return (
        action.at instanceof Date &&
        Number.isFinite(action.at.getTime()) &&
        typeof action.text === "string" &&
        action.text.trim().length > 0
      );
    default:
      return false;
  }
}

function invalidPolicy(reason: string, constraintId = "policy:invalid"): Evaluation {
  return {
    verdict: "block",
    reasons: [{ constraintId, text: reason }],
    checked: constraintId === "policy:invalid" ? [] : [constraintId],
  };
}

export function evaluate(
  rules: Constraint[],
  action: ProposedAction,
  ctx: EvalContext,
): Evaluation {
  // Do not let invalid clocks or corrupt persisted rules turn into an implicit allow.
  if (!(ctx.now instanceof Date) || !Number.isFinite(ctx.now.getTime())) {
    return invalidPolicy("Policy evaluation time is invalid.");
  }
  if (!Array.isArray(rules)) {
    return invalidPolicy("Stored safety rules are unavailable.");
  }
  if (!isValidAction(action)) {
    return invalidPolicy("The requested action contains invalid values.");
  }
  if (
    !Array.isArray(ctx.profiles) ||
    ctx.profiles.some((profile) => typeof profile !== "string" || !profile.trim())
  ) {
    return invalidPolicy("Policy profile context is invalid.");
  }
  for (const candidate of rules as unknown[]) {
    const parsed = constraintSchema.safeParse(candidate);
    if (!parsed.success) {
      const id =
        candidate && typeof candidate === "object" &&
        "id" in candidate && typeof candidate.id === "string"
          ? candidate.id
          : "policy:invalid-rule";
      return invalidPolicy(
        "A stored safety rule is invalid. No action was allowed.",
        id,
      );
    }
    if (
      parsed.data.kind === "device_limit" &&
      parsed.data.min !== undefined &&
      parsed.data.max !== undefined &&
      parsed.data.min > parsed.data.max
    ) {
      return invalidPolicy(
        "A stored device limit has an invalid range. No action was allowed.",
        parsed.data.id,
      );
    }
  }

  const reasons: Reason[] = [];
  const checked: string[] = [];
  let needConfirm = false;

  for (const r of rules) {
    if (!active(r, ctx.now) || !inScope(r, ctx)) continue;
    checked.push(r.id);

    if (r.kind === "allergen" || r.kind === "diet") {
      const targets =
        action.type === "recipe"
          ? action.ingredients
          : action.type === "shopping_add"
            ? action.items
            : [];
      for (const item of targets) {
        if (r.kind === "allergen") {
          const hits = matchAllergens(item, [r.allergen as Allergen]).filter(
            (h) => !h.ambiguous || r.severity === "severe",
          );
          for (const h of hits) {
            const why = h.ambiguous
              ? `could not rule out ${r.allergen} in "${item}" (${h.term})`
              : `"${item}" contains ${r.allergen} (${h.term})`;
            reasons.push({
              constraintId: r.id,
              text: `${r.profile === "household" ? "Household" : r.profile} rule (${r.allergen}, ${r.severity}): ${why}.`,
            });
          }
        } else {
          const bad = matchDiet(item, r.value);
          if (bad.length > 0) {
            reasons.push({
              constraintId: r.id,
              text: `${r.profile === "household" ? "Household" : r.profile} rule (${r.value}): "${item}" conflicts (${bad.join(", ")}).`,
            });
          }
        }
      }
    }

    if (r.kind === "quiet_hours") {
      const isDeviceAction =
        action.type === "device_set" ||
        action.type === "device_schedule";

      const domain = isDeviceAction
        ? deviceDomain(action.device, action.attr)
        : null;

      const appliesNow =
        (isDeviceAction &&
          (domain === null || r.applies.includes(domain))) ||
        (action.type === "reminder" &&
          r.applies.includes("notifications"));

      const actionTime =
        action.type === "reminder" ||
        action.type === "device_schedule"
          ? action.at
          : ctx.now;

      if (appliesNow && quietActive(r.start, r.end, r.tz, actionTime)) {
        reasons.push({
          constraintId: r.id,
          text:
            action.type === "device_set" && domain === null
              ? `Quiet hours (${r.start}–${r.end} ${r.tz}) conservatively block this unclassified device action.`
              : `Quiet hours (${r.start}–${r.end} ${r.tz}) cover this action.`,
        });
      }
    }
    if (
      r.kind === "device_limit" &&
      (action.type === "device_set" || action.type === "device_schedule")
    ) {
      if (
        action.device === r.device &&
        action.attr === r.attr &&
        typeof action.value === "number"
      ) {
        if (
          (r.min !== undefined && action.value < r.min) ||
          (r.max !== undefined && action.value > r.max)
        ) {
          reasons.push({
            constraintId: r.id,
            text: `${action.device} ${action.attr}=${action.value} is outside the allowed range${r.min !== undefined ? ` ≥${r.min}` : ""}${r.max !== undefined ? ` ≤${r.max}` : ""}.`,
          });
        }
      }
    }

    if (r.kind === "confirm_required") {
      const hit =
        (r.action === "unlock" &&
          (action.type === "device_set" || action.type === "device_schedule") &&
          isUnlock(action.device, action.value)) ||
        (r.action === "purchase" && action.type === "shopping_add");
      // forget_rule is enforced at the forget_memory tool (Phase 4), not here.
      if (hit) needConfirm = true;
    }
  }

  if (reasons.length > 0) return { verdict: "block", reasons, checked };
  if (needConfirm) return { verdict: "confirm", reasons: [], checked };
  return { verdict: "allow", reasons: [], checked };
}

// Deterministic, fail-closed policy: rules in, verdict out. Pure functions, no I/O.
import type { Allergen, Constraint } from "./constraints.js";
import { matchAllergens, matchDiet } from "./matcher.js";

export type ProposedAction =
  | {
      type: "recipe";
      name: string;
      ingredients: string[];
      servingFor: string[];
    }
  | {
      type: "device_set";
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
  // external-source rules stay dormant until a user confirms them (poisoning guard).
  if (r.source === "external") return false;
  if (r.expiresAt && new Date(r.expiresAt) <= now) return false;
  return true;
}

function inScope(r: Constraint, ctx: EvalContext): boolean {
  return r.profile === "household" || ctx.profiles.includes(r.profile);
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

// Wall-clock minutes in tz (handles DST via Intl; falls back to UTC on bad tz).
function nowInTz(now: Date, tz: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: tz,
    }).formatToParts(now);
    const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
    const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
    return (h === 24 ? 0 : h) * 60 + m;
  } catch {
    return now.getUTCHours() * 60 + now.getUTCMinutes();
  }
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
  return s <= e ? cur >= s && cur < e : cur >= s || cur < e; // overnight wrap
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

export function evaluate(
  rules: Constraint[],
  action: ProposedAction,
  ctx: EvalContext,
): Evaluation {
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
      const appliesNow =
        (action.type === "device_set" &&
          r.applies.includes(
            deviceDomain(action.device, action.attr) ?? "lights",
          )) ||
        (action.type === "reminder" && r.applies.includes("notifications"));
      if (
        appliesNow &&
        quietActive(
          r.start,
          r.end,
          r.tz,
          action.type === "reminder" ? action.at : ctx.now,
        )
      ) {
        reasons.push({
          constraintId: r.id,
          text: `Quiet hours (${r.start}–${r.end} ${r.tz}) cover this action.`,
        });
      }
    }

    if (r.kind === "device_limit" && action.type === "device_set") {
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
          action.type === "device_set" &&
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

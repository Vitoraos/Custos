import { randomUUID } from "node:crypto";
import { evaluate } from "../../src/core/policy.js";
import { loadConstraints, remember } from "../../src/storage/memories.js";
import type { Store } from "../../src/storage/store.js";

const TZ = "Africa/Lagos";

function localParts(now: Date): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const v = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return {
    date: `${v.year}-${v.month}-${v.day}`,
    minutes: Number(v.hour) * 60 + Number(v.minute),
  };
}

function nextLocalTime(hhmm: string, now = new Date()): string {
  const p = localParts(now);
  const parts = hhmm.split(":").map(Number);
  const target = parts[0] * 60 + parts[1];
  const date = new Date(`${p.date}T12:00:00+01:00`);
  if (target <= p.minutes) date.setUTCDate(date.getUTCDate() + 1);
  return `${date.toISOString().slice(0, 10)}T${hhmm}`;
}

function localToUtc(local: string): string {
  const parts = local.split("T");
  const date = parts[0].split("-").map(Number);
  const time = parts[1].split(":").map(Number);
  return new Date(
    Date.UTC(date[0], date[1] - 1, date[2], time[0] - 1, time[1]),
  ).toISOString();
}

export async function runShowcase(store: Store) {
  const runId = randomUUID();
  const baselineUser = `showcase-baseline-${randomUUID()}`;
  const custosUser = `showcase-custos-${randomUUID()}`;
  const rule = {
    profile: "Maya",
    kind: "allergen",
    allergen: "beef",
    severity: "severe",
    evidence: "Maya has a beef allergy",
  };

  for (const userId of [baselineUser, custosUser]) {
    const { profile, evidence, ...payload } = rule;
    await remember(store, userId, {
      profile,
      kind: "constraint",
      payload,
      evidence,
      source: "explicit",
    });
    await remember(store, userId, {
      profile: "Maya",
      kind: "fact",
      payload: { kind: "fact", text: "Maya's school ends at 1:30 PM." },
      evidence: "Household schedule provided by user",
      source: "explicit",
    });
    await store.setDevice(userId, "hall_light", { power: "off" });
    await store.setDevice(userId, "coffee_maker", { power: "off" });
  }

  const now = new Date();
  const coffeeLocal = nextLocalTime("08:00", now);
  const lightLocal = nextLocalTime("13:25", now);
  const coffeeAt = localToUtc(coffeeLocal);
  const lightAt = localToUtc(lightLocal);
  const rules = await loadConstraints(store, custosUser);
  const blockedDinner = evaluate(
    rules,
    {
      type: "recipe",
      name: "Beef tacos",
      ingredients: ["ground beef", "tortillas", "tomatoes"],
      servingFor: ["Maya"],
    },
    { now, profiles: ["Maya"] },
  );
  const safeDinner = evaluate(
    rules,
    {
      type: "recipe",
      name: "Lentil vegetable stew",
      ingredients: ["lentils", "carrots", "tomatoes", "olive oil"],
      servingFor: ["Maya"],
    },
    { now, profiles: ["Maya"] },
  );
  if (blockedDinner.verdict !== "block" || safeDinner.verdict !== "allow") {
    throw new Error("Showcase dinner policy assertion failed.");
  }

  const coffee = await store.createScheduledAction({
    userId: custosUser,
    runId,
    idempotencyKey: `${runId}:coffee`,
    target: "coffee_maker",
    desiredState: { power: "on" },
    timezone: TZ,
    localScheduledAt: coffeeLocal,
    scheduledAt: coffeeAt,
    status: "scheduled",
    evidence: {
      policy: "allow",
      persisted: true,
      physicalDeviceChanged: false,
      checkedRules: rules.map((x) => x.id),
    },
  });
  const light = await store.createScheduledAction({
    userId: custosUser,
    runId,
    idempotencyKey: `${runId}:hall-light`,
    target: "hall_light",
    desiredState: { power: "on" },
    timezone: TZ,
    localScheduledAt: lightLocal,
    scheduledAt: lightAt,
    status: "scheduled",
    evidence: {
      policy: "allow",
      persisted: true,
      physicalDeviceChanged: false,
      derivation: "13:30 school end minus 5 minutes",
      checkedRules: rules.map((x) => x.id),
    },
  });
  const stored = await store.listScheduledActions(custosUser, runId);
  if (stored.length !== 2 || stored.some((x) => x.status !== "scheduled")) {
    throw new Error("Schedule persistence verification failed.");
  }

  return {
    runId,
    timezone: TZ,
    prompt:
      "Make coffee for me at 8am, turn on the hall light 5 minutes before my daughter is back from school, and prepare dinner for me and my daughter.",
    disclosure:
      "Controlled simulator scenario. The baseline is scripted; this is not a live Alexa+ integration. Device twins are simulated.",
    rules: [
      {
        id: "school-return",
        profile: "Maya",
        summary: "School ends at 1:30 PM",
        evidence: "Household schedule provided by user",
      },
      {
        id: rules[0]?.id ?? "beef-allergy",
        profile: "Maya",
        summary: "Beef allergy: dinner must exclude beef",
        evidence: "Maya has a beef allergy",
      },
    ],
    baseline: {
      label: "Baseline (simulated)",
      summary:
        "Done! Coffee and dinner are handled. The hall light will be ready before Maya gets home.",
      status: "unverified",
      actions: [
        {
          title: "Coffee at 8:00 AM",
          status: "not scheduled",
          evidence: "No persisted schedule record",
        },
        {
          title: "Hall light at 1:25 PM",
          status: "not scheduled",
          evidence: "No persisted schedule record; rule not applied",
        },
        {
          title: "Dinner",
          status: "rule not checked",
          evidence: "No policy evaluation or receipt",
        },
      ],
      receipts: [],
    },
    custos: {
      label: "Custos",
      summary:
        "Coffee scheduled for 8:00 AM, hall light scheduled for 1:25 PM, dinner planned with beef excluded.",
      status: "verified",
      actions: [
        {
          title: "Coffee at 8:00 AM",
          status: "scheduled",
          localTime: coffeeLocal,
          recordId: coffee.id,
          evidence:
            "Schedule row persisted and read back; execution has not happened yet",
        },
        {
          title: "Hall light at 1:25 PM",
          status: "scheduled",
          localTime: lightLocal,
          recordId: light.id,
          evidence:
            "1:30 PM school end minus 5 minutes; schedule row persisted and read back",
        },
        {
          title: "Dinner",
          status: "policy verified",
          recipe: "Lentil vegetable stew",
          evidence:
            "Beef tacos blocked: " +
            (blockedDinner.reasons[0]?.text ?? "beef allergy") +
            "; safe alternative passed policy",
        },
      ],
      receipts: [
        {
          tool: "schedule_device_action",
          outcome: "verified",
          target: coffee.target,
          status: coffee.status,
          id: coffee.id,
          evidence: coffee.evidence,
        },
        {
          tool: "schedule_device_action",
          outcome: "verified",
          target: light.target,
          status: light.status,
          id: light.id,
          evidence: light.evidence,
        },
        {
          tool: "evaluate_recipe_policy",
          outcome: "blocked_then_allowed",
          target: "Maya dinner",
          status: "verified",
          evidence: {
            blocked: blockedDinner.reasons,
            safeAlternative: safeDinner.verdict,
          },
        },
      ],
    },
    deviceTruth: {
      baseline: {
        hall_light: { power: "off" },
        coffee_maker: { power: "off" },
      },
      custos: {
        hall_light: { power: "off" },
        coffee_maker: { power: "off" },
      },
    },
    note:
      "Scheduled means the future action is persisted. Executed and verified device state are separate statuses; this demo does not claim a physical device changed.",
  };
}

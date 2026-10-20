import { randomUUID } from "node:crypto";
import { evaluate } from "../../src/core/policy.js";
import { loadConstraints, remember } from "../../src/storage/memories.js";
import type { Store } from "../../src/storage/store.js";
import { createDeps, type Deps } from "../../src/tools/context.js";
import { scheduleReminder, topicFor } from "../../src/adapters/ntfy.js";

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

export async function runShowcase(
  store: Store,
  deps: Deps = createDeps(store),
) {
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

  // Seed a small, realistic pantry. The assistant must infer the next useful
  // steps: reconcile recipe ingredients, update the list, and notify the user.
  const pantry = ["tomatoes", "onions", "garlic", "salt", "rice"];
  await store.applyListOps(
    custosUser,
    "pantry",
    pantry.map((item) => ({ op: "add" as const, item })),
  );
  await store.applyListOps(custosUser, "shopping", [
    { op: "add", item: "milk" },
  ]);
  const recipe = {
    name: "Lentil vegetable stew",
    ingredients: ["lentils", "carrots", "tomatoes", "olive oil", "onions", "garlic", "salt"],
    instructions: [
      "Rinse the lentils and dice the carrots and onion.",
      "Soften onion and garlic in olive oil in a pot.",
      "Add lentils, carrots, tomatoes, and water or stock; bring to a boil.",
      "Simmer until the lentils and carrots are tender, about 25–30 minutes.",
      "Season with salt, check the texture, and serve. Keep beef and beef stock out of the meal.",
    ],
  };
  const pantryBefore = await store.listItems(custosUser, "pantry");
  const shoppingBefore = await store.listItems(custosUser, "shopping");
  const normalize = (value: string) =>
    value.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
  const alreadyAvailable = new Set(
    [...pantryBefore, ...shoppingBefore].map(normalize),
  );
  const missingIngredients = recipe.ingredients.filter(
    (ingredient) => !alreadyAvailable.has(normalize(ingredient)),
  );
  const shoppingAfter = await store.applyListOps(
    custosUser,
    "shopping",
    missingIngredients.map((item) => ({ op: "add" as const, item })),
  );
  const shoppingVerified = missingIngredients.every((item) =>
    shoppingAfter.some((stored) => normalize(stored) === normalize(item)),
  );
  if (!shoppingVerified) throw new Error("Shopping-list read-back verification failed.");

  const notificationText = [
    `Dinner plan: ${recipe.name} for you and Maya.`,
    `Ingredients: ${recipe.ingredients.join(", ")}.`,
    `Method: ${recipe.instructions.join(" ")}`,
    missingIngredients.length
      ? `Added to shopping list: ${missingIngredients.join(", ")}.`
      : "Everything needed is already in the pantry or shopping list.",
    "Beef excluded for Maya's allergy.",
  ].join("\n");
  const notificationTopic = topicFor(custosUser);
  let notification: { id: string; deliverAtMs: number; text: string } | null = null;
  try {
    notification = await scheduleReminder({
      topic: notificationTopic,
      title: "Dinner plan and shopping list",
      text: notificationText,
      delayMs: 0,
    });
  } catch {
    // Notification provider outages must be visible as unverified, not turn
    // the entire comparison into a blank error state.
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

  const scheduleReceipts: Parameters<Deps["receipts"]["insert"]>[0][] = [
    {
      userId: custosUser,
      tool: "schedule_device_action",
      idempotencyKey: `${runId}:coffee:receipt`,
      args: {
        target: coffee.target,
        desiredState: coffee.desiredState,
        localScheduledAt: coffee.localScheduledAt,
      },
      decision: { verdict: "allow", checked: rules.map((x) => x.id) },
      expectation: {
        target: coffee.target,
        desiredState: coffee.desiredState,
        scheduledAt: coffee.scheduledAt,
      },
      observed: { id: coffee.id, status: coffee.status, persisted: true },
      outcome: "verified" as const,
      say: "Coffee schedule persisted and read back; execution is pending.",
      attempts: 1,
      latencyMs: 0,
    },
    {
      userId: custosUser,
      tool: "schedule_device_action",
      idempotencyKey: `${runId}:hall-light:receipt`,
      args: {
        target: light.target,
        desiredState: light.desiredState,
        localScheduledAt: light.localScheduledAt,
      },
      decision: { verdict: "allow", checked: rules.map((x) => x.id) },
      expectation: {
        target: light.target,
        desiredState: light.desiredState,
        scheduledAt: light.scheduledAt,
      },
      observed: { id: light.id, status: light.status, persisted: true },
      outcome: "verified" as const,
      say: "Hall-light schedule persisted for 1:25 PM; execution is pending.",
      attempts: 1,
      latencyMs: 0,
    },
    {
      userId: custosUser,
      tool: "evaluate_recipe_policy",
      idempotencyKey: `${runId}:beef-blocked:receipt`,
      args: { recipe: "Beef tacos", servingFor: ["Maya"] },
      decision: {
        verdict: "block",
        checked: blockedDinner.checked,
        reasons: blockedDinner.reasons,
      },
      expectation: { recipe: "Beef tacos", rule: "Maya beef allergy" },
      observed: { policyVerdict: blockedDinner.verdict },
      outcome: "blocked" as const,
      say:
        blockedDinner.reasons[0]?.text ??
        "Beef tacos blocked by Maya's beef allergy.",
      attempts: 1,
      latencyMs: 0,
    },
    {
      userId: custosUser,
      tool: "evaluate_recipe_policy",
      idempotencyKey: `${runId}:safe-dinner:receipt`,
      args: { recipe: "Lentil vegetable stew", servingFor: ["Maya"] },
      decision: { verdict: "allow", checked: safeDinner.checked },
      expectation: { recipe: "Lentil vegetable stew", excludes: "beef" },
      observed: { policyVerdict: safeDinner.verdict },
      outcome: "verified" as const,
      say: "Lentil vegetable stew passed the standing-rule policy check.",
      attempts: 1,
      latencyMs: 0,
    },
  ];
  scheduleReceipts.push(
    {
      userId: custosUser,
      tool: "update_shopping_list",
      idempotencyKey: `${runId}:shopping-list:receipt`,
      args: { list: "shopping", items: missingIngredients },
      decision: { verdict: "allow", checked: rules.map((x) => x.id) },
      expectation: { contains: missingIngredients },
      observed: { items: shoppingAfter, verified: shoppingVerified },
      outcome: shoppingVerified ? "verified" : "unverified",
      say: shoppingVerified
        ? `Added missing recipe ingredients to the shopping list: ${missingIngredients.join(", ")}.`
        : "Could not verify all missing ingredients on the shopping list.",
      attempts: 1,
      latencyMs: 0,
    },
    {
      userId: custosUser,
      tool: "set_reminder",
      idempotencyKey: `${runId}:dinner-notification:receipt`,
      args: { title: "Dinner plan and shopping list", topic: notificationTopic },
      decision: { verdict: "allow", checked: rules.map((x) => x.id) },
      expectation: { notificationAccepted: true, recipeIncluded: true, instructionsIncluded: true },
      observed: notification
        ? { id: notification.id, deliverAtMs: notification.deliverAtMs, acceptedByProvider: true }
        : { acceptedByProvider: false },
      outcome: notification ? "verified" : "unverified",
      say: notification
        ? "Dinner recipe and cooking procedure accepted by the notification provider; device delivery is not independently confirmed."
        : "The notification provider could not confirm acceptance. The recipe and cooking procedure remain available in this demo.",
      attempts: 1,
      latencyMs: 0,
    },
  );
  for (const receipt of scheduleReceipts) await deps.receipts.insert(receipt);
  const persistedReceipts = await deps.receipts.recent(custosUser, 20);
  const receiptView = persistedReceipts.map((receipt) => ({
    tool: receipt.tool,
    outcome: receipt.outcome,
    target: String(
      (receipt.args as { target?: unknown; recipe?: unknown } | null)?.target ??
        (receipt.args as { recipe?: unknown } | null)?.recipe ??
        receipt.tool,
    ),
    status: receipt.outcome,
    id: receipt.id,
    evidence: {
      decision: receipt.decision,
      expectation: receipt.expectation,
      observed: receipt.observed,
      say: receipt.say,
    },
  }));
  const baselineHall = await store.getDevice(baselineUser, "hall_light");
  const baselineCoffee = await store.getDevice(baselineUser, "coffee_maker");
  const custosHall = await store.getDevice(custosUser, "hall_light");
  const custosCoffee = await store.getDevice(custosUser, "coffee_maker");

  return {
    runId,
    timezone: TZ,
    prompt:
      "Make coffee for me at 8am, turn on the hall light 5 minutes before my daughter is back from school, and prepare dinner for me and my daughter.",
    disclosure:
      "Controlled simulator scenario. The baseline is scripted; this is not a live Alexa+ integration. Device twins are simulated.",
    recipe: {
      ...recipe,
      missingIngredients,
    },
    pantry: pantryBefore,
    shoppingList: shoppingAfter,
    notification: {
      accepted: notification !== null,
      topic: notificationTopic,
      id: notification?.id ?? "",
      text: notificationText,
      deliveryNote: notification
        ? "Accepted by the notification provider; delivery to a specific device is not independently confirmed."
        : "The notification provider did not confirm acceptance. The recipe is shown here instead.",
    },
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
      status: "scheduled",
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
          evidence: `Beef tacos blocked: ${blockedDinner.reasons[0]?.text ?? "beef allergy"}; safe alternative passed policy`,
        },
      ],
      receipts: receiptView,
    },
    deviceTruth: {
      baseline: { hall_light: baselineHall, coffee_maker: baselineCoffee },
      custos: { hall_light: custosHall, coffee_maker: custosCoffee },
    },
    note: "Scheduled means the future action is persisted. Executed and verified device state are separate statuses; this demo does not claim a physical device changed.",
  };
}

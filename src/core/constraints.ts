// Typed standing rules. One Zod discriminated union, shared by tools, policy, tests.
// Keep validation at field level so consumers can safely use .omit() to derive tool inputs.
import { z } from "zod";

function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const clockTime = z.string().regex(
  /^(?:[01]\d|2[0-3]):[0-5]\d$/,
  "Expected a valid 24-hour time (HH:mm)",
);

const base = z.object({
  id: z.string().min(1).max(100),
  profile: z.string().trim().min(1).max(60), // 'household' or a person's name
  source: z.enum(["user_voice", "explicit", "inferred", "external"]),
  // Postgres timestamptz can return "+00:00", not only "Z".
  createdAt: z.string().datetime({ offset: true }),
  expiresAt: z.string().datetime({ offset: true }).optional(),
});

export const dietConstraint = base.extend({
  kind: z.literal("diet"),
  value: z.enum([
    "vegan",
    "vegetarian",
    "pescatarian",
    "gluten_free",
    "dairy_free",
  ]),
});

const EU14 = z.enum([
  "celery",
  "gluten",
  "crustaceans",
  "egg",
  "fish",
  "lupin",
  "milk",
  "molluscs",
  "mustard",
  "peanut",
  "sesame",
  "soy",
  "sulphites",
  "tree_nuts",
]);
export type Allergen = z.infer<typeof EU14>;

export const allergenConstraint = base.extend({
  kind: z.literal("allergen"),
  allergen: EU14,
  severity: z.enum(["avoid", "severe"]),
});

export const quietHoursConstraint = base.extend({
  kind: z.literal("quiet_hours"),
  start: clockTime,
  end: clockTime,
  tz: z.string().trim().min(1).max(60).refine(isValidTimeZone, {
    message: "Expected a valid IANA time zone",
  }),
  applies: z
    .array(z.enum(["lights", "notifications", "audio"]))
    .min(1)
    .max(3),
});

export const deviceLimitConstraint = base.extend({
  kind: z.literal("device_limit"),
  device: z.string().trim().min(1).max(80),
  attr: z.string().trim().min(1).max(40),
  min: z.number().finite().optional(),
  max: z.number().finite().optional(),
});

export const confirmRequiredConstraint = base.extend({
  kind: z.literal("confirm_required"),
  action: z.enum(["unlock", "purchase", "forget_rule"]),
});

export const constraintSchema = z.discriminatedUnion("kind", [
  dietConstraint,
  allergenConstraint,
  quietHoursConstraint,
  deviceLimitConstraint,
  confirmRequiredConstraint,
]);
export type Constraint = z.infer<typeof constraintSchema>;

// Stored-memory kinds that carry no enforcement (facts, instructions).
export const factSchema = base.extend({
  kind: z.literal("fact"),
  text: z.string().trim().min(1).max(500),
});
export const instructionSchema = base.extend({
  kind: z.literal("instruction"),
  text: z.string().trim().min(1).max(500),
});
export type Fact = z.infer<typeof factSchema>;
export type Instruction = z.infer<typeof instructionSchema>;

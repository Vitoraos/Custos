// Typed standing rules. One Zod discriminated union, shared by tools, policy, tests.
// spend_cap is P1 (cut) — add a variant here when it lands; evaluate() ignores unknown kinds.
import { z } from "zod";

const base = z.object({
  id: z.string().min(1).max(100),
  profile: z.string().min(1).max(60), // 'household' or a person's name
  source: z.enum(["user_voice", "explicit", "inferred", "external"]),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime().optional(),
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
  start: z.string().regex(/^\d{2}:\d{2}$/),
  end: z.string().regex(/^\d{2}:\d{2}$/),
  tz: z.string().min(1).max(60),
  applies: z
    .array(z.enum(["lights", "notifications", "audio"]))
    .min(1)
    .max(3),
});

export const deviceLimitConstraint = base.extend({
  kind: z.literal("device_limit"),
  device: z.string().min(1).max(80),
  attr: z.string().min(1).max(40),
  min: z.number().optional(),
  max: z.number().optional(),
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
  text: z.string().min(1).max(500),
});
export const instructionSchema = base.extend({
  kind: z.literal("instruction"),
  text: z.string().min(1).max(500),
});
export type Fact = z.infer<typeof factSchema>;
export type Instruction = z.infer<typeof instructionSchema>;

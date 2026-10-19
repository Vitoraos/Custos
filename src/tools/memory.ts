// Memory tools: get_standing_rules, remember_rule, forget_memory.

import { createHash } from "node:crypto";
import { z } from "zod";
import {
  allergenConstraint,
  confirmRequiredConstraint,
  deviceLimitConstraint,
  dietConstraint,
  factSchema,
  instructionSchema,
  quietHoursConstraint,
} from "../core/constraints.js";
import { getLocale } from "../core/locale.js";
import type { ToolResult } from "../core/result.js";
import { sayReadback } from "../core/say.js";
import type { RunContext } from "../core/verify.js";
import {
  findByQuery,
  listStandingRules,
  remember,
} from "../storage/memories.js";
import type { Runner } from "./accountability.js";
import {
  type Deps,
  envelope,
  envelopeSchema,
  requestContextFor,
  runCtx,
  sessionOf,
} from "./context.js";

const profile = z.string().min(1).max(60).default("household");
const evidence = z.string().max(500).optional();

const ruleInput = z.discriminatedUnion("kind", [
  allergenConstraint.omit({
    id: true,
    profile: true,
    source: true,
    createdAt: true,
  }),
  dietConstraint.omit({
    id: true,
    profile: true,
    source: true,
    createdAt: true,
  }),
  quietHoursConstraint
    .omit({
      id: true,
      profile: true,
      source: true,
      createdAt: true,
    })
    // tz defaults to the home timezone when omitted.
    .extend({ tz: z.string().min(1).max(60).optional() }),
  deviceLimitConstraint.omit({
    id: true,
    profile: true,
    source: true,
    createdAt: true,
  }),
  confirmRequiredConstraint.omit({
    id: true,
    profile: true,
    source: true,
    createdAt: true,
  }),
  factSchema.omit({ id: true, profile: true, source: true, createdAt: true }),
  instructionSchema.omit({
    id: true,
    profile: true,
    source: true,
    createdAt: true,
  }),
]);

function memoryDescription(rec: {
  kind: string;
  profile: string;
  payload: unknown;
}): string {
  const payload =
    rec.payload !== null &&
    typeof rec.payload === "object" &&
    !Array.isArray(rec.payload)
      ? (rec.payload as Record<string, unknown>)
      : {};
  const kind = typeof payload.kind === "string" ? payload.kind : rec.kind;
  switch (kind) {
    case "allergen":
      return `${String(payload.allergen ?? "unknown")} allergy (${String(
        payload.severity ?? "unspecified",
      )})`;
    case "diet":
      return `${String(payload.value ?? "unknown")} diet`;
    case "quiet_hours":
      return `quiet hours ${String(payload.start ?? "?")}–${String(
        payload.end ?? "?",
      )} ${String(payload.tz ?? "unknown timezone")}`;
    case "device_limit":
      return `${String(payload.device ?? "unknown device")} ${String(
        payload.attr ?? "unknown attribute",
      )} limit`;
    case "confirm_required":
      return `confirmation required before ${String(
        payload.action ?? "unknown action",
      )}`;
    case "fact":
    case "instruction":
      return typeof payload.text === "string" ? payload.text : kind;
    default:
      return `${kind} rule for ${rec.profile}`;
  }
}

const forgetMemoryInput = z
  .object({
    id: z.string().trim().min(1).max(100).optional(),
    query: z.string().trim().min(1).max(200).optional(),
    confirmToken: z.string().max(64).optional(),
  })
  .refine((value) => Boolean(value.id) !== Boolean(value.query), {
    message: "Provide exactly one of id or query.",
  });

export function memoryTools(deps: Deps) {
  // forget_memory as a runner so confirm_action can complete the second step.
  const forgetRunner: Runner = async (
    args,
    rc: RunContext,
  ): Promise<ToolResult> => {
    const { id, query, confirmToken } = args as {
      id?: string;
      query?: string;
      confirmToken?: string;
    };
    if (Boolean(id) === Boolean(query)) {
      return {
        outcome: "error",
        say: "Provide exactly one memory ID or a description.",
      };
    }

    let rec = id ? await deps.store.getMemory(rc.userId, id) : null;
    if (!id && query) {
      const matches = await findByQuery(deps.store, rc.userId, query);
      if (matches.length > 1) {
        return {
          outcome: "error",
          say: `I found ${matches.length} matching memories. Please identify the exact one before I delete anything.`,
          data: {
            candidates: matches.slice(0, 10).map((match) => ({
              id: match.id,
              profile: match.profile,
              kind: match.kind,
              description: memoryDescription(match),
            })),
            additionalMatches: Math.max(0, matches.length - 10),
          },
        };
      }
      rec = matches[0] ?? null;
    }
    if (!rec)
      return {
        outcome: "error",
        say: "I could not find that memory. Tell me which one.",
      };
    const payload = rec.payload as { severity?: string; kind?: string };
    const safety =
      rec.kind === "constraint" &&
      (payload.severity === "severe" || payload.kind === "confirm_required");
    const argsHash = createHash("sha256")
      .update(JSON.stringify({ id: rec.id }))
      .digest("hex");
    if (safety) {
      const presented = confirmToken
        ? await deps.confirms.consume(rc.userId, confirmToken)
        : null;
      const preAuth =
        rc.authorized?.tool === "forget_memory" &&
        rc.authorized?.argsHash === argsHash;
      if (
        (presented?.tool !== "forget_memory" ||
          presented.argsHash !== argsHash) &&
        !preAuth
      ) {
        const token = await deps.confirms.mint(
          rc.userId,
          "forget_memory",
          argsHash,
          { id: rec.id },
        );
        return {
          outcome: "needs_confirmation",
          say: "That is a safety rule. Confirm to delete it.",
          confirmToken: token,
        };
      }
    }
    const ok = await deps.store.deleteMemory(rc.userId, rec.id);
    const gone = (await deps.store.getMemory(rc.userId, rec.id)) === null;
    if (ok && gone)
      return { outcome: "verified", say: "Forgotten. I checked it is gone." };
    return {
      outcome: "error",
      say: "I could not delete that memory. Please try again.",
    };
  };
  const tools = [
    {
      name: "get_standing_rules",
      description:
        "Read the user's standing rules, facts and profiles. Call this FIRST for food, device, or purchase tasks.",
      annotations: {
        readOnlyHint: true,
        openWorldHint: false,
        title: "Standing rules",
      },
      parameters: z.object({ profile: z.string().min(1).max(60).optional() }),
      outputSchema: envelopeSchema,
      execute: async (args: { profile?: string }, ctx: unknown) => {
        const s = sessionOf(ctx);
        const c = await requestContextFor(deps, s);
        const rules = await listStandingRules(deps.store, s.userId);
        const filtered = args.profile
          ? rules.filter(
              (r) => r.profile === args.profile || r.profile === "household",
            )
          : rules;
        const say =
          filtered.length === 0
            ? "No standing rules stored yet."
            : `${filtered.length} standing rules on file.`;
        return envelope({ outcome: "ok", say, data: filtered }, c);
      },
    },
    {
      name: "remember_rule",
      description:
        "Store a typed constraint, fact, or instruction with provenance. Returns a spoken readback to confirm with the user.",
      annotations: {
        readOnlyHint: false,
        idempotentHint: false,
        title: "Remember a rule",
      },
      parameters: z.object({
        profile,
        rule: ruleInput,
        evidence: evidence,
        // Provenance is assigned by trusted application code, not by the model.
        // Visitor pattern: constraints that die on their own (e.g. end of day).
        expiresAt: z.string().datetime({ offset: true }).max(40).optional(),
      }),
      outputSchema: envelopeSchema,
      execute: async (
        args: {
          profile: string;
          rule: z.infer<typeof ruleInput>;
          evidence?: string;
          expiresAt?: string;
        },
        ctx: unknown,
      ) => {
        const s = sessionOf(ctx);
        const c = await requestContextFor(deps, s);
        const rule =
          args.rule.kind === "quiet_hours" && !args.rule.tz
            ? { ...args.rule, tz: (await getLocale(deps.store, s.userId)).tz }
            : args.rule;
        const rec = await remember(deps.store, s.userId, {
          profile: args.profile,
          kind:
            args.rule.kind === "fact" || args.rule.kind === "instruction"
              ? args.rule.kind
              : "constraint",
          payload: rule,
          evidence: args.evidence ?? null,
          source: "user_voice",
          expiresAt: args.expiresAt,
        });
        const label = memoryDescription({
          kind:
            args.rule.kind === "fact" || args.rule.kind === "instruction"
              ? args.rule.kind
              : "constraint",
          profile: args.profile,
          payload: rule,
        });
        return envelope(
          {
            outcome: "ok",
            say: sayReadback(label),
            data: { id: rec.id, status: rec.status },
          },
          c,
        );
      },
    },
    {
      name: "forget_memory",
      description:
        "Delete one stored entry by id or description. Removing a safety rule needs confirmation via confirmToken.",
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        title: "Forget a memory",
      },
      parameters: forgetMemoryInput,
      outputSchema: envelopeSchema,
      execute: async (
        args: z.infer<typeof forgetMemoryInput>,
        ctx: unknown,
      ) => {
        const s = sessionOf(ctx);
        const c = await requestContextFor(deps, s);
        return envelope(await forgetRunner(args, await runCtx(deps, s)), c);
      },
    },
  ];
  return { tools, runners: { forget_memory: forgetRunner } };
}

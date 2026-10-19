// Closed loop: guard -> act -> read back -> compare -> (retry once) ->
// honest report -> receipt. Idempotent per (user, tool, args, minute).
import { createHash, randomBytes } from "node:crypto";
import type { Constraint } from "./constraints.js";
import { DEFAULT_LOCALE, type Locale } from "./locale.js";
import { evaluate, type ProposedAction } from "./policy.js";
import { MemoryReceipts, type ReceiptStore } from "./receipts.js";
import { type Evidence, type ToolResult, toolError } from "./result.js";
import {
  sayBlocked,
  sayError,
  sayNeedsConfirmation,
  sayUnverified,
  sayVerified,
  sayVerifiedAfterRetry,
} from "./say.js";

export interface ActionAdapter<Cmd, State> {
  name: string; // evidence source label, e.g. "device-twin", "ntfy"
  write(
    userId: string,
    cmd: Cmd,
    idemKey: string,
  ): Promise<{ ackId?: string; ackText?: string }>;
  read(userId: string, target: string): Promise<State>;
}

export interface ActionSpec<Args, Cmd, State> {
  name: string;
  risk: "low" | "high" | ((a: Args) => "low" | "high");
  adapter: ActionAdapter<Cmd, State>;
  toPolicyAction(a: Args): ProposedAction;
  toCommand(a: Args): Cmd;
  target(a: Args): string;
  expected(a: Args): (s: State) => boolean;
  verifiedWhat(a: Args): string; // "The kitchen light is on"
  unverifiedObserved(a: Args): string; // "the kitchen light still shows off"
  confirmWhat(a: Args): string; // "Unlock the front door"
}

export interface RunContext {
  userId: string;
  mode: "forge" | "baseline";
  rules: Constraint[];
  profiles: string[];
  now: Date;
  locale?: Locale;
  receipts?: ReceiptStore;
  confirms?: ConfirmStore;
  confirmToken?: string;
  // Proof from confirm_action: a just-consumed token binding for this call.
  authorized?: { tool: string; argsHash: string };
  minuteBucket?: string; // override for tests; default = current UTC minute
}

// Short-TTL single-use confirmation tokens (high-risk second step).
export interface ConfirmStore {
  mint(
    userId: string,
    tool: string,
    argsHash: string,
    args?: unknown,
    ttlMs?: number,
  ): Promise<string>;
  consume(
    userId: string,
    token: string,
  ): Promise<{ tool: string; argsHash: string; args: unknown } | null>;
}

export class MemoryConfirms implements ConfirmStore {
  private tokens = new Map<
    string,
    {
      userId: string;
      tool: string;
      argsHash: string;
      args: unknown;
      exp: number;
    }
  >();
  async mint(
    userId: string,
    tool: string,
    argsHash: string,
    args: unknown = null,
    ttlMs = 120_000,
  ): Promise<string> {
    const t = randomBytes(16).toString("hex");
    this.tokens.set(t, {
      userId,
      tool,
      argsHash,
      args,
      exp: Date.now() + ttlMs,
    });
    return t;
  }
  async consume(
    userId: string,
    token: string,
  ): Promise<{ tool: string; argsHash: string; args: unknown } | null> {
    const rec = this.tokens.get(token);
    if (!rec) return null;
    this.tokens.delete(token);
    if (rec.userId !== userId || rec.exp < Date.now()) return null;
    if (token.length !== 32) return null;
    return { tool: rec.tool, argsHash: rec.argsHash, args: rec.args };
  }
}

function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v)
      .sort()
      .map(
        (k) =>
          `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`,
      )
      .join(",")}}`;
  }
  return JSON.stringify(v) ?? "null";
}

function idemKey(
  userId: string,
  mode: string,
  tool: string,
  args: unknown,
  bucket: string,
): string {
  return createHash("sha256")
    .update(`${userId}|${mode}|${tool}|${canonical(args)}|${bucket}`)
    .digest("hex");
}

function minuteBucket(d: Date): string {
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}-${d.getUTCHours()}-${d.getUTCMinutes()}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const WRITE_TIMEOUT_MS = 5_000;
const READ_TIMEOUT_MS = 1_500;

async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

// In-flight dedupe: concurrent identical calls share one execution/receipt.
const inFlight = new Map<string, Promise<ToolResult>>();

export async function runAction<Args, Cmd, State>(
  spec: ActionSpec<Args, Cmd, State>,
  args: Args,
  ctx: RunContext,
): Promise<ToolResult> {
  const started = Date.now();
  const receipts = ctx.receipts ?? new MemoryReceipts();
  const confirms = ctx.confirms ?? new MemoryConfirms();
  const bucket = ctx.minuteBucket ?? minuteBucket(ctx.now);
  const key = idemKey(ctx.userId, ctx.mode, spec.name, args, bucket);

  // Safe retry: an identical completed call returns the same receipt,
  // reconstructed so it still validates against the tool output schema.
  const prior = await receipts.findByIdempotencyKey(ctx.userId, spec.name, key);
  if (prior) {
    const exp = prior.expectation as {
      target?: unknown;
      source?: string;
    } | null;
    const dec = prior.decision as {
      reasons?: { constraintId: string; text: string }[];
    } | null;
    const replay: ToolResult = {
      outcome: prior.outcome,
      say: prior.say,
      receiptId: prior.id,
    };
    if (exp) {
      replay.evidence = {
        expected: exp.target,
        observed: prior.observed,
        source: exp.source ?? "unknown",
        checkedAt: prior.createdAt,
      };
    }
    if (dec?.reasons?.length) replay.reasons = dec.reasons;
    return replay;
  }
  const running = inFlight.get(key);
  if (running) return running;
  const task = execute(spec, args, ctx, { started, receipts, confirms, key });
  inFlight.set(key, task);
  try {
    return await task;
  } finally {
    inFlight.delete(key);
  }
}

async function execute<Args, Cmd, State>(
  spec: ActionSpec<Args, Cmd, State>,
  args: Args,
  ctx: RunContext,
  shared: {
    started: number;
    receipts: ReceiptStore;
    confirms: ConfirmStore;
    key: string;
  },
): Promise<ToolResult> {
  const { started, receipts, confirms, key } = shared;
  const argsHash = createHash("sha256").update(canonical(args)).digest("hex");

  // Baseline mode: memory without enforcement — raw ack, no guard, no verify.
  if (ctx.mode === "baseline") {
    try {
      const ack = await withTimeout(
        spec.adapter.write(ctx.userId, spec.toCommand(args), key),
        WRITE_TIMEOUT_MS,
        "action write",
      );
      const say = ack.ackText ?? "Done.";
      const saved = await receipts.insert({
        userId: ctx.userId,
        tool: spec.name,
        idempotencyKey: key,
        args,
        decision: { mode: "baseline" },
        expectation: null,
        observed: { ackId: ack.ackId ?? null },
        outcome: "ok",
        say,
        attempts: 1,
        latencyMs: Date.now() - started,
      });
      return { outcome: "ok", say, receiptId: saved.id };
    } catch {
      return toolError(sayError());
    }
  }

  // Guard.
  const policyAction = spec.toPolicyAction(args);
  const profiles =
    policyAction.type === "recipe"
      ? [...new Set([...ctx.profiles, ...policyAction.servingFor])]
      : ctx.profiles;
  const evaled = evaluate(ctx.rules, policyAction, { now: ctx.now, profiles });
  const decision = {
    verdict: evaled.verdict,
    checked: evaled.checked,
    reasons: evaled.reasons,
  };
  if (evaled.verdict === "block") {
    const say = sayBlocked(evaled.reasons);
    const saved = await receipts.insert({
      userId: ctx.userId,
      tool: spec.name,
      idempotencyKey: key,
      args,
      decision,
      expectation: null,
      observed: null,
      outcome: "blocked",
      say,
      attempts: 0,
      latencyMs: Date.now() - started,
    });
    return {
      outcome: "blocked",
      say,
      reasons: evaled.reasons,
      receiptId: saved.id,
    };
  }
  if (
    evaled.verdict === "confirm" ||
    (typeof spec.risk === "function" ? spec.risk(args) : spec.risk) === "high"
  ) {
    const presented = ctx.confirmToken
      ? await confirms.consume(ctx.userId, ctx.confirmToken)
      : null;
    const preAuth =
      ctx.authorized &&
      ctx.authorized.tool === spec.name &&
      ctx.authorized.argsHash === argsHash;
    if (
      (!presented ||
        presented.tool !== spec.name ||
        presented.argsHash !== argsHash) &&
      !preAuth
    ) {
      const token = await confirms.mint(ctx.userId, spec.name, argsHash, args);
      const say = sayNeedsConfirmation(spec.confirmWhat(args));
      return { outcome: "needs_confirmation", say, confirmToken: token };
    }
  }

  // Act with bounded read-back: 3 reads (300/700/1200ms), one idempotent retry.
  const target = spec.target(args);
  const match = spec.expected(args);
  const checkedAt = () => new Date().toISOString();
  const localCheckedAt = () => {
    const tz = ctx.locale?.tz ?? DEFAULT_LOCALE.tz;
    try {
      return new Intl.DateTimeFormat("en-GB", {
        dateStyle: "full",
        timeStyle: "short",
        timeZone: tz,
      }).format(new Date());
    } catch {
      return new Date().toISOString();
    }
  };
  let attempts = 0;
  const observe = async (): Promise<{ ok: boolean; state: State | null }> => {
    let lastState: State | null = null;
    let elapsedMs = 0;
    // Read at approximately 300ms, 700ms, and 1200ms after the write.
    for (const targetElapsedMs of [300, 700, 1200]) {
      await sleep(targetElapsedMs - elapsedMs);
      elapsedMs = targetElapsedMs;
      try {
        const state = await withTimeout(
          spec.adapter.read(ctx.userId, target),
          READ_TIMEOUT_MS,
          "state read-back",
        );
        lastState = state;
        if (match(state)) return { ok: true, state };
      } catch {
        // Read errors count as mismatch; the retry covers transient faults.
      }
    }
    return { ok: false, state: lastState };
  };

  const finish = async (
    outcome: ToolResult["outcome"],
    say: string,
    observed: unknown,
  ): Promise<ToolResult> => {
    const saved = await receipts.insert({
      userId: ctx.userId,
      tool: spec.name,
      idempotencyKey: key,
      args,
      decision,
      expectation: { target, source: spec.adapter.name },
      observed,
      outcome,
      say,
      attempts,
      latencyMs: Date.now() - started,
    });
    const evidence: Evidence = {
      expected: target,
      observed,
      source: spec.adapter.name,
      checkedAt: checkedAt(),
      localCheckedAt: localCheckedAt(),
    };
    return { outcome, say, evidence, receiptId: saved.id };
  };

  // A write can throw after the remote side effect succeeded (lost ACK).
  // Always read back before deciding that the action failed.
  try {
    attempts = 1;
    await withTimeout(
      spec.adapter.write(ctx.userId, spec.toCommand(args), key),
      WRITE_TIMEOUT_MS,
      "action write",
    );
  } catch {
    // The read-back below determines whether the write actually took effect.
  }
  const first = await observe();
  if (first.ok)
    return finish(
      "verified",
      sayVerified(spec.verifiedWhat(args)),
      first.state,
    );
  try {
    attempts = 2;
    await withTimeout(
      spec.adapter.write(ctx.userId, spec.toCommand(args), key),
      WRITE_TIMEOUT_MS,
      "action retry",
    );
  } catch {
    // The retry may also have succeeded despite a lost acknowledgement.
    const afterRetryError = await observe();
    if (afterRetryError.ok) {
      return finish(
        "verified_after_retry",
        sayVerifiedAfterRetry(spec.verifiedWhat(args)),
        afterRetryError.state,
      );
    }
    return finish("error", sayError(), {
      writeError: true,
      observed: afterRetryError.state,
    });
  }
  const second = await observe();
  if (second.ok)
    return finish(
      "verified_after_retry",
      sayVerifiedAfterRetry(spec.verifiedWhat(args)),
      second.state,
    );
  return finish(
    "unverified",
    sayUnverified(spec.verifiedWhat(args), spec.unverifiedObserved(args)),
    second.state,
  );
}

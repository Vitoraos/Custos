// Deterministic spoken summaries. No LLM. Every string is <=25 words.
// Designed to be read verbatim by Alexa+ / the simulator voice.
import type { ReasonRef } from "./result.js";

function reasonsShort(reasons: ReasonRef[]): string {
  return reasons
    .slice(0, 2)
    .map((r) => r.text.replace(/\.$/, ""))
    .join("; ");
}

export function sayVerified(what: string): string {
  return `${what}. I checked.`;
}

export function sayVerifiedAfterRetry(what: string): string {
  return `${what}, after a retry. I checked.`;
}

export function sayUnverified(what: string, observed: string): string {
  return `I sent the command, but ${observed}. I could not confirm ${what}.`;
}

export function sayBlocked(reasons: ReasonRef[]): string {
  return `I did not do that. ${reasonsShort(reasons)}.`;
}

export function sayNeedsConfirmation(what: string): string {
  return `${what} needs your confirmation first. Say confirm to proceed.`;
}

export function sayError(): string {
  return "Something went wrong on my end. Please try again.";
}

export function sayUnsupported(what: string): string {
  return `I cannot do that yet: ${what}.`;
}

export function sayReadback(rule: string): string {
  return `Got it: ${rule}. Correct?`;
}

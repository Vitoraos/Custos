// Deterministic spoken summaries. Every string is capped at 25 words.
// Designed to be read verbatim by voice clients; never uses an LLM.
import type { ReasonRef } from "./result.js";

const MAX_WORDS = 25;

function concise(text: string): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= MAX_WORDS) return words.join(" ");
  // The ellipsis is attached to the final word, keeping the count at 25.
  return `${words.slice(0, MAX_WORDS - 1).join(" ")}…`;
}

function reasonsShort(reasons: ReasonRef[]): string {
  return reasons
    .slice(0, 2)
    .map((r) => r.text.replace(/\.$/, ""))
    .join("; ");
}

export function sayVerified(what: string): string {
  return concise(`${what}. I checked.`);
}

export function sayVerifiedAfterRetry(what: string): string {
  return concise(`${what}, after a retry. I checked.`);
}

export function sayUnverified(what: string, observed: string): string {

  return concise(`I couldn't confirm ${what}: ${observed}.`);
=======
  return concise(
    `I sent the command, but ${observed}. I could not confirm ${what}.`,
  );

}

export function sayBlocked(reasons: ReasonRef[]): string {
  const detail = reasonsShort(reasons);
  return concise(detail ? `I did not do that. ${detail}.` : "I did not do that because a safety rule blocked it.");
}

export function sayNeedsConfirmation(what: string): string {
  return concise(`${what} needs your confirmation first. Say confirm to proceed.`);
}

export function sayError(): string {
  return "Something went wrong on my end. Please try again.";
}

export function sayUnsupported(what: string): string {
  return concise(`I cannot do that yet: ${what}.`);
}

export function sayReadback(rule: string): string {
  return concise(`Got it: ${rule}. Correct?`);
}

import { describe, expect, it } from "vitest";
import {
  authenticateRequest,
  createAuthenticator,
  type KeyLookup,
  newKey,
  parseBearer,
  sha256Hex,
} from "../../src/auth.js";

const row = { user_id: "u1", mode: "forge" as const, revoked_at: null };
const lookup: KeyLookup = async (h) =>
  h === sha256Hex("cf_abc1234567890123") ? row : null;

describe("parseBearer", () => {
  it("accepts well-formed keys", () => {
    expect(parseBearer("Bearer cf_abc1234567890123")).toBe(
      "cf_abc1234567890123",
    );
  });
  it("rejects missing, malformed, and non-cf schemes", () => {
    expect(parseBearer(undefined)).toBeUndefined();
    expect(parseBearer("Bearer xyz")).toBeUndefined();
    expect(parseBearer("Basic cf_abc1234567890123")).toBeUndefined();
    expect(parseBearer("Bearer cf_short")).toBeUndefined();
  });
});

describe("sha256Hex/newKey", () => {
  it("hashes deterministically and mints unique topic-safe keys", () => {
    expect(sha256Hex("cf_x")).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256Hex("cf_x")).toBe(sha256Hex("cf_x"));
    const a = newKey();
    const b = newKey();
    expect(a).not.toBe(b);
    expect(parseBearer(`Bearer ${a}`)).toBe(a);
  });
});

describe("authenticateRequest", () => {
  it("returns session for a known key", async () => {
    await expect(
      authenticateRequest("Bearer cf_abc1234567890123", lookup),
    ).resolves.toEqual({
      userId: "u1",
      mode: "forge",
    });
  });
  it("returns null for unknown keys, revoked keys, and bad headers", async () => {
    await expect(
      authenticateRequest("Bearer cf_ffff567890123456", lookup),
    ).resolves.toBeNull();
    await expect(authenticateRequest("nope", lookup)).resolves.toBeNull();
    const revoked: KeyLookup = async () => ({
      ...row,
      revoked_at: new Date().toISOString(),
    });
    await expect(
      authenticateRequest("Bearer cf_abc1234567890123", revoked),
    ).resolves.toBeNull();
  });
  it("createAuthenticator adapts to FastMCP request shape", async () => {
    const auth = createAuthenticator(lookup);
    await expect(
      auth({ headers: { authorization: "Bearer cf_abc1234567890123" } }),
    ).resolves.toEqual({
      userId: "u1",
      mode: "forge",
    });
    await expect(auth({ headers: {} })).resolves.toBeNull();
  });
});

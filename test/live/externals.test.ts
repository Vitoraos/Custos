// Live external-service tests. Gated: LIVE_TESTS=1 (network + no keys needed).
// All use throwaway topics / read-only queries; nothing persists.
import { describe, expect, it } from "vitest";
import { findRecipes } from "../../src/adapters/mealdb.js";
import {
  cancelReminder,
  pollTopic,
  scheduleReminder,
  topicFor,
} from "../../src/adapters/ntfy.js";
import { getWeather } from "../../src/adapters/openmeteo.js";
import { getHeadlines } from "../../src/adapters/rss.js";

const LIVE = process.env.LIVE_TESTS === "1";

describe.skipIf(!LIVE)("externals", () => {
  it("open-meteo resolves Lagos with a temp", async () => {
    const w = await getWeather("Lagos");
    expect(w.place.toLowerCase()).toContain("lagos");
    expect(w.tempC).toBeGreaterThan(10);
    expect(w.source).toBe("open-meteo");
  }, 30_000);
  it("themealdb returns real ingredient lists", async () => {
    const rs = await findRecipes("chicken", 4);
    expect(rs.length).toBeGreaterThan(0);
    expect(rs[0].ingredients.length).toBeGreaterThan(2);
  }, 30_000);
  it("rss returns headlines", async () => {
    const h = await getHeadlines(3);
    expect(h.items.length).toBeGreaterThan(0);
    expect(h.items[0].title.length).toBeGreaterThan(0);
  }, 30_000);
  it("ntfy schedule -> poll -> cancel on a throwaway topic", async () => {
    const topic =
      `${topicFor("live-test-user")}-t${Date.now().toString(36)}`.slice(0, 60);
    const now = await scheduleReminder({
      topic,
      text: "live-test-now",
      delayMs: 0,
    });
    expect(now.id.length).toBeGreaterThan(0);
    const seen = await pollTopic(topic, Date.now() - 60_000);
    expect(seen.some((m) => m.text === "live-test-now")).toBe(true);
    const fut = await scheduleReminder({
      topic,
      text: "live-test-future",
      delayMs: 120_000,
    });
    expect(await cancelReminder(topic, fut.id)).toBe(true);
  }, 60_000);
});

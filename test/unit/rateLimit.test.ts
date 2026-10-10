import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { rateLimit } from "../../src/rateLimit.js";

function appWith(
  limit: { windowMs: number; max: number },
  now: () => number,
): Hono {
  const app = new Hono();
  app.use("/sim/guest", rateLimit({ ...limit, now }));
  app.post("/sim/guest", (c) => c.json({ ok: true }));
  return app;
}

describe("rateLimit", () => {
  it("allows under the cap, 429s over it with Retry-After", async () => {
    const t = 1_000_000;
    const app = appWith({ windowMs: 60_000, max: 2 }, () => t);
    const req = () => new Request("http://x/sim/guest", { method: "POST" });
    expect((await app.request(req())).status).toBe(200);
    expect((await app.request(req())).status).toBe(200);
    const limited = await app.request(req());
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("Retry-After"))).toBeGreaterThan(0);
  });
  it("slides the window and keys callers independently", async () => {
    let t = 0;
    const app = new Hono();
    app.use(
      "/sim/chat",
      rateLimit({
        windowMs: 1000,
        max: 1,
        now: () => t,
        key: (c) => c.req.header("x-id") ?? "?",
      }),
    );
    app.post("/sim/chat", (c) => c.json({ ok: true }));
    const req = (id: string) =>
      new Request("http://x/sim/chat", {
        method: "POST",
        headers: { "x-id": id },
      });
    expect((await app.request(req("a"))).status).toBe(200);
    expect((await app.request(req("a"))).status).toBe(429);
    expect((await app.request(req("b"))).status).toBe(200); // different caller unaffected
    t += 1001; // window slides
    expect((await app.request(req("a"))).status).toBe(200);
  });
});

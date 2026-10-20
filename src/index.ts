// Entry point: binds $PORT (Render injects it).
import "dotenv/config";
import { buildCors } from "./cors.js";
import { startScheduledActionWorker } from "./core/scheduledWorker.js";
import { createServer } from "./server.js";

const port = Number(process.env.PORT ?? 3000);

const host = process.env.HOST ?? "0.0.0.0";
const { server, store } = createServer(undefined, { port });

const { cors, origins } = buildCors();
await server.start({
  transportType: "httpStream",
  httpStream: { port, host, endpoint: "/mcp", stateless: true, cors },
});
startScheduledActionWorker(store);
const backend = process.env.SUPABASE_URL ? "supabase" : "memory";
console.log(`ContextForge v3 on ${host}:${port}/mcp (store: ${backend})`);
console.log(
  `CORS origins: ${origins.join(", ") || "(none — same-origin only)"}`,
);

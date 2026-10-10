// Entry point: binds $PORT (Render injects it).
import "dotenv/config";
import { buildCors } from "./cors.js";
import { createServer, resolveStore } from "./server.js";

const port = Number(process.env.PORT ?? 3000);

const host = process.env.HOST ?? "0.0.0.0";
const { server, deps } = createServer(undefined, { port });
void deps;

const { cors, origins } = buildCors();
await server.start({
  transportType: "httpStream",
  httpStream: { port, host, endpoint: "/mcp", stateless: true, cors },
});
const backend = resolveStore().backend;
console.log(`ContextForge v3 on ${host}:${port}/mcp (store: ${backend})`);
console.log(
  `CORS origins: ${origins.join(", ") || "(none — same-origin only)"}`,
);

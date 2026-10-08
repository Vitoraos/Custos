// Entry point: binds $PORT (Render injects it).
import { createServer, resolveStore } from "./server.js";

const port = Number(process.env.PORT ?? 3000);
 
const host = process.env.HOST ?? "0.0.0.0";
const { server, deps } = createServer(undefined, { port });
void deps;

await server.start({
  transportType: "httpStream",
  httpStream: {
    port,
    host,
    endpoint: "/mcp",
    stateless: true,
    cors: process.env.ALLOWED_ORIGINS
      ? { origin: process.env.ALLOWED_ORIGINS.split(",").map((s) => s.trim()) }
      : true,
  },
});
const backend = resolveStore().backend;
console.log(`ContextForge v3 on ${host}:${port}/mcp (store: ${backend})`);
=======
const host = process.env.HOST ?? '0.0.0.0';

await createServer().start({
  transportType: 'httpStream',
  httpStream: { host, port, endpoint: '/mcp', stateless: true },
});
// eslint-disable-next-line no-console
console.log(`ContextForge MCP listening on ${host}:${port}/mcp (health ${host}:${port}/health)`);


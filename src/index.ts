// Entry point — starts FastMCP server (Streamable HTTP, stateless).
import { createServer } from './server.js';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';

await createServer().start({
  transportType: 'httpStream',
  httpStream: { host, port, endpoint: '/mcp', stateless: true },
});
// eslint-disable-next-line no-console
console.log(`ContextForge MCP listening on ${host}:${port}/mcp (health ${host}:${port}/health)`);

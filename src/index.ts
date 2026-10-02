// Entry point — starts FastMCP server (Streamable HTTP, stateless).
import { createServer } from './server.js';

const port = Number(process.env.PORT ?? 3000);

await createServer().start({
  transportType: 'httpStream',
  httpStream: { port, endpoint: '/mcp', stateless: true },
});
// eslint-disable-next-line no-console
console.log(`ContextForge MCP listening on :${port}/mcp (health :${port}/health)`);

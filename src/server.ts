import { FastMCP } from 'fastmcp';
import { storePreferenceTool } from './tools/store_preference.js';
import { getPreferencesTool } from './tools/get_preferences.js';
import { storeContextTool } from './tools/store_context.js';
import { getContextTool } from './tools/get_context.js';
import { executeWorkflowTool } from './tools/execute_workflow.js';
import { getMemorySummaryTool } from './tools/get_memory_summary.js';

export function createServer() {
  const server = new FastMCP({
    name: 'contextforge',
    version: '1.0.0',
    health: { enabled: true, path: '/health', message: 'ok', status: 200 },
  });
  server.addTool(storePreferenceTool);
  server.addTool(getPreferencesTool);
  server.addTool(storeContextTool);
  server.addTool(getContextTool);
  server.addTool(executeWorkflowTool);
  server.addTool(getMemorySummaryTool);
  return server;
}

/**
 * MCP server setup, tool routing, and capabilities
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { getAllTools, getHandlerForTool } from './domains/index.js';
import { registerResourceHandlers } from './resources.js';
import { setServerRef } from './utils/server-ref.js';
import { logger } from './utils/logger.js';

export function createMcpServer(): Server {
  const server = new Server(
    { name: 'timezest-mcp', version: '0.1.0' },
    { capabilities: { tools: {}, resources: {} } }
  );

  // Set server reference for elicitation
  setServerRef(server);

  // MCP Apps (SEP-1865): serve the ui:// scheduling-request card resource
  registerResourceHandlers(server);

  // Gateway-mode credentials are per-request (runWithCredentials, in
  // src/http.ts) — nothing to wire up at server-construction time.

  server.setRequestHandler(CallToolRequestSchema, async (request, _extra): Promise<any> => {
    const { name, arguments: args } = request.params;

    logger.debug('Tool call', { name });

    try {
      const handler = getHandlerForTool(name);

      if (!handler) {
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true,
        };
      }

      return await handler.handleCall(name, args || {});
    } catch (error) {
      logger.error('Tool call failed', { name, error });
      return {
        content: [{
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`,
        }],
        isError: true,
      };
    }
  });

  // Flat and unconditional: no navigation state to enter first. See
  // domains/index.ts for why the old decision-tree listing was removed.
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    logger.debug('Tools list requested');
    return { tools: getAllTools() };
  });

  return server;
}

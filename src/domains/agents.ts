/**
 * Agents domain - individual technicians
 */
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { DomainHandler, CallToolResult } from '../utils/types.js';
import { getClient } from '../utils/client.js';
import { logger } from '../utils/logger.js';

function getTools(): Tool[] {
  return [
    {
      name: 'timezest_agents_list',
      description: 'List all agents (technicians) available for scheduling',
      inputSchema: {
        type: 'object',
        properties: {
          pageSize: {
            type: 'number',
            description: 'Number of results per page (default: 50, max: 100)',
            minimum: 1,
            maximum: 100,
          },
          filter: {
            type: 'string',
            description: 'TQL filter string (e.g., "active:true AND department:\\"IT Support\\"")',
          },
        },
      },
    },
    {
      name: 'timezest_agents_get',
      description: 'Get details for a specific agent by ID',
      inputSchema: {
        type: 'object',
        properties: {
          agentId: {
            type: 'string',
            description: 'Agent ID',
          },
        },
        required: ['agentId'],
      },
    },
  ];
}

async function handleCall(
  toolName: string,
  args: Record<string, unknown>
): Promise<CallToolResult> {
  try {
    const client = await getClient();

    switch (toolName) {
      case 'timezest_agents_list': {
        const agents = await client.agents.list({
          pageSize: args.pageSize as number,
          filter: args.filter as string,
        });

        logger.info('Listed agents', { count: agents.length });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(agents, null, 2),
          }],
        };
      }

      case 'timezest_agents_get': {
        const agentId = args.agentId as string;
        const agent = await client.agents.get(agentId);

        logger.info('Retrieved agent', { agentId });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(agent, null, 2),
          }],
        };
      }

      default:
        return {
          content: [{ type: 'text', text: `Unknown tool: ${toolName}` }],
          isError: true,
        };
    }
  } catch (error) {
    logger.error('Agent operation failed', { toolName, error });
    return {
      content: [{
        type: 'text',
        text: `Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`,
      }],
      isError: true,
    };
  }
}

export const agentsHandler: DomainHandler = { getTools, handleCall };
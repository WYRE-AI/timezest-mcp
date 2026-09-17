/**
 * Resources domain - mixed agents and teams
 */
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { DomainHandler, CallToolResult } from '../utils/types.js';
import { getClient } from '../utils/client.js';
import { logger } from '../utils/logger.js';

function getTools(): Tool[] {
  return [
    {
      name: 'timezest_resources_list',
      description: 'List all resources (agents and teams) available for scheduling',
      inputSchema: {
        type: 'object',
        properties: {
          pageSize: {
            type: 'number',
            description: 'Number of results per page (default: 50, max: 100)',
            minimum: 1,
            maximum: 100,
          },
          type: {
            type: 'string',
            enum: ['agent', 'team'],
            description: 'Filter by resource type',
          },
          filter: {
            type: 'string',
            description: 'TQL filter string (e.g., "active:true")',
          },
        },
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
      case 'timezest_resources_list': {
        const resources = await client.resources.list({
          pageSize: args.pageSize as number,
          type: args.type as 'agent' | 'team',
          filter: args.filter as string,
        });

        logger.info('Listed resources', { count: resources.length, type: args.type });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(resources, null, 2),
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
    logger.error('Resources operation failed', { toolName, error });
    return {
      content: [{
        type: 'text',
        text: `Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`,
      }],
      isError: true,
    };
  }
}

export const resourcesHandler: DomainHandler = { getTools, handleCall };
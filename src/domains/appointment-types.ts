/**
 * Appointment Types domain - service/appointment type definitions
 */
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { DomainHandler, CallToolResult } from '../utils/types.js';
import { getClient } from '../utils/client.js';
import { logger } from '../utils/logger.js';

function getTools(): Tool[] {
  return [
    {
      name: 'timezest_appointment_types_list',
      description: 'List all appointment types available for scheduling',
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
            description: 'TQL filter string (e.g., "active:true")',
          },
        },
      },
    },
    {
      name: 'timezest_appointment_types_get',
      description: 'Get details for a specific appointment type by ID',
      inputSchema: {
        type: 'object',
        properties: {
          appointmentTypeId: {
            type: 'string',
            description: 'Appointment type ID',
          },
        },
        required: ['appointmentTypeId'],
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
      case 'timezest_appointment_types_list': {
        const types = await client.appointmentTypes.list({
          pageSize: args.pageSize as number,
          filter: args.filter as string,
        });

        logger.info('Listed appointment types', { count: types.length });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(types, null, 2),
          }],
        };
      }

      case 'timezest_appointment_types_get': {
        const appointmentTypeId = args.appointmentTypeId as string;
        const type = await client.appointmentTypes.get(appointmentTypeId);

        logger.info('Retrieved appointment type', { appointmentTypeId });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(type, null, 2),
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
    logger.error('Appointment type operation failed', { toolName, error });
    return {
      content: [{
        type: 'text',
        text: `Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`,
      }],
      isError: true,
    };
  }
}

export const appointmentTypesHandler: DomainHandler = { getTools, handleCall };
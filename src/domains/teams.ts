/**
 * Teams domain - team-based scheduling
 */
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { DomainHandler, CallToolResult } from '../utils/types.js';
import { getClient } from '../utils/client.js';
import { logger } from '../utils/logger.js';

function getTools(): Tool[] {
  return [
    {
      name: 'timezest_teams_list',
      description:
        'List teams available for scheduling. Deleted teams are omitted, using the same live set as timezest_resources_list (teams GET /v1/resources still returns).',
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
      name: 'timezest_teams_get',
      description: 'Get details for a specific team by ID',
      inputSchema: {
        type: 'object',
        properties: {
          teamId: {
            type: 'string',
            description: 'Team ID',
          },
        },
        required: ['teamId'],
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
      case 'timezest_teams_list': {
        const teams = await client.teams.list({
          pageSize: args.pageSize as number,
          filter: args.filter as string,
        });

        logger.info('Listed teams', { count: teams.length });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(teams, null, 2),
          }],
        };
      }

      case 'timezest_teams_get': {
        const teamId = args.teamId as string;
        const team = await client.teams.get(teamId);

        logger.info('Retrieved team', { teamId });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(team, null, 2),
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
    logger.error('Team operation failed', { toolName, error });
    return {
      content: [{
        type: 'text',
        text: `Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`,
      }],
      isError: true,
    };
  }
}

export const teamsHandler: DomainHandler = { getTools, handleCall };
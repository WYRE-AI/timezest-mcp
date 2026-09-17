/**
 * Connectivity/orientation tool.
 *
 * This file replaces the old `navigation.ts` decision-tree menu
 * (`timezest_navigate` / `timezest_back`). Those tools are suppressed by the
 * Conduit gateway — a container-side menu advertises a catalog without
 * knowing the caller's access tier — and every domain tool used to sit
 * behind them, so through Conduit this server published exactly one usable
 * tool. Tools are listed flatly now (see ./index.ts), which leaves
 * `timezest_status` as pure orientation: it names what is available rather
 * than gating it.
 */
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { DomainHandler, CallToolResult } from '../utils/types.js';

/** Tool groups, for the human-readable status summary only — nothing routes
 *  through this table (see getHandlerForTool in ./index.ts). */
const TOOL_GROUPS = [
  {
    name: 'Agents',
    description: 'Individual technicians available for booking',
    tools: ['timezest_agents_list', 'timezest_agents_get'],
  },
  {
    name: 'Teams',
    description: 'Team-based scheduling (round-robin, shared pools)',
    tools: ['timezest_teams_list', 'timezest_teams_get'],
  },
  {
    name: 'Appointment Types',
    description: 'Available appointment/service types',
    tools: ['timezest_appointment_types_list', 'timezest_appointment_types_get'],
  },
  {
    name: 'Resources',
    description: 'All available resources (agents + teams)',
    tools: ['timezest_resources_list'],
  },
  {
    name: 'Scheduling',
    description: 'Create, view, and manage scheduling requests',
    tools: [
      'timezest_scheduling_list',
      'timezest_scheduling_get',
      'timezest_scheduling_create_request',
      'timezest_scheduling_cancel',
    ],
  },
] as const;

function getTools(): Tool[] {
  return [
    {
      name: 'timezest_status',
      description: 'Show TimeZest connection status and the available tools',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
  ];
}

async function handleCall(
  toolName: string,
  _args: Record<string, unknown>
): Promise<CallToolResult> {
  if (toolName !== 'timezest_status') {
    return {
      content: [{ type: 'text', text: `Unknown tool: ${toolName}` }],
      isError: true,
    };
  }

  const groups = TOOL_GROUPS.map(
    (g) => `• ${g.name} — ${g.description}\n  ${g.tools.join(', ')}`
  ).join('\n');

  return {
    content: [
      {
        type: 'text',
        text: `TimeZest MCP Server

All tools are available directly — call any of the tools below.

${groups}`,
      },
    ],
  };
}

export const statusHandler: DomainHandler = { getTools, handleCall };

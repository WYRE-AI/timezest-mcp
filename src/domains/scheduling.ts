/**
 * Scheduling domain - create and manage scheduling requests
 */
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { DomainHandler, CallToolResult } from '../utils/types.js';
import { getClient } from '../utils/client.js';
import { logger } from '../utils/logger.js';
import { elicitSelection, elicitConfirmation } from '../utils/elicitation.js';
import { buildSchedulingRequestCard, SCHEDULING_REQUEST_CARD_META } from '../card.builder.js';
import {
  SCHEDULING_STATUS_ALIASES,
  TIMEZEST_SCHEDULING_STATUSES,
} from '../vendor/node-timezest/types/scheduling-requests.js';

function getTools(): Tool[] {
  return [
    {
      name: 'timezest_scheduling_list',
      description: 'List scheduling requests',
      inputSchema: {
        type: 'object',
        properties: {
          pageSize: {
            type: 'number',
            description:
              'How many records to return from this page (1–20). TimeZest list pages are fixed at 20 and ignore a page_size query parameter; smaller values truncate that page. Larger values still return at most one TimeZest page (20).',
            minimum: 1,
            maximum: 100,
          },
          status: {
            type: 'string',
            enum: [...TIMEZEST_SCHEDULING_STATUSES, ...Object.keys(SCHEDULING_STATUS_ALIASES)],
            description:
              'Filter by TimeZest status: new, sent, scheduled, cancelled, closed. ' +
              'Legacy aliases are accepted and mapped: pending→sent, booked→scheduled, completed→closed. ' +
              'Sent as a TQL filter (scheduling_request.status EQ <value>). TimeZest ignores a status query parameter.',
          },
          filter: {
            type: 'string',
            description: 'TQL filter string (e.g., "createdAt:>=2024-01-01")',
          },
        },
      },
    },
    {
      name: 'timezest_scheduling_get',
      description: 'Get details for a specific scheduling request by ID',
      _meta: SCHEDULING_REQUEST_CARD_META,
      inputSchema: {
        type: 'object',
        properties: {
          requestId: {
            type: 'string',
            description: 'Scheduling request ID',
          },
        },
        required: ['requestId'],
      },
    },
    {
      name: 'timezest_scheduling_create_request',
      description: 'Create a new scheduling request - supports PSA ticket association',
      inputSchema: {
        type: 'object',
        properties: {
          appointmentTypeId: {
            type: 'string',
            description: 'Appointment type ID (required)',
          },
          triggerMode: {
            type: 'string',
            enum: ['pod', 'generate_url'],
            description: 'pod = fires PSA workflow, generate_url = returns booking link',
          },
          endUser: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Customer name' },
              email: { type: 'string', description: 'Customer email' },
              phone: { type: 'string', description: 'Customer phone' },
              company: { type: 'string', description: 'Customer company' },
            },
            required: ['name'],
            description: 'End user contact information',
          },
          timeRange: {
            type: 'object',
            properties: {
              earliestDate: { type: 'string', description: 'Earliest date (YYYY-MM-DD)' },
              earliestTime: { type: 'string', description: 'Earliest time (HH:MM)' },
              latestDate: { type: 'string', description: 'Latest date (YYYY-MM-DD)' },
              latestTime: { type: 'string', description: 'Latest time (HH:MM)' },
              timezone: { type: 'string', description: 'IANA timezone (e.g., America/New_York) - REQUIRED' },
            },
            description: 'Preferred scheduling window',
          },
          resourceIds: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Resource IDs (agent or team ids) to book with. Sent to TimeZest as the JSON array resource_ids. Omit to send an empty array — TimeZest requires the field to be an array.',
          },
          notes: {
            type: 'string',
            description: 'Additional notes or requirements',
          },
          associatedEntities: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                type: {
                  type: 'string',
                  enum: ['connectwise', 'autotask', 'halo'],
                  description: 'PSA system type',
                },
                id: {
                  type: 'string',
                  description: 'PSA entity ID',
                },
                number: {
                  type: 'string',
                  description: 'PSA entity number/reference (optional)',
                },
              },
              required: ['type', 'id'],
            },
            description: 'Associated PSA tickets/entities',
          },
        },
        required: ['triggerMode', 'endUser'],
      },
    },
    {
      name: 'timezest_scheduling_cancel',
      description: 'Cancel a scheduling request',
      inputSchema: {
        type: 'object',
        properties: {
          requestId: {
            type: 'string',
            description: 'Scheduling request ID to cancel',
          },
          reason: {
            type: 'string',
            description: 'Reason for cancellation',
          },
        },
        required: ['requestId'],
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
      case 'timezest_scheduling_list': {
        const requests = await client.schedulingRequests.list({
          pageSize: args.pageSize as number,
          status: args.status as any,
          filter: args.filter as string,
        });

        logger.info('Listed scheduling requests', { count: requests.length, status: args.status });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(requests, null, 2),
          }],
        };
      }

      case 'timezest_scheduling_get': {
        const requestId = args.requestId as string;
        const request = await client.schedulingRequests.get(requestId);

        logger.info('Retrieved scheduling request', { requestId });

        // MCP Apps: attach the normalized card payload the ui://
        // scheduling-request card renders from. Best-effort — a null card
        // just means no UI surface; the JSON payload is otherwise unchanged.
        const payload: Record<string, unknown> = { ...request };
        try {
          const card = await buildSchedulingRequestCard(payload, client);
          if (card) payload._card = card;
        } catch {
          // Card building never fails the tool result.
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(payload, null, 2),
          }],
        };
      }

      case 'timezest_scheduling_create_request': {
        // Elicitation: if no appointmentTypeId provided, help user select one
        let appointmentTypeId = args.appointmentTypeId as string;
        if (!appointmentTypeId) {
          const types = await client.appointmentTypes.list();
          if (types.length === 0) {
            return {
              content: [{
                type: 'text',
                text: 'No appointment types available. Please contact your administrator.',
              }],
              isError: true,
            };
          }

          const selection = await elicitSelection(
            'Please select an appointment type:',
            types.map((t: { id: string; name: string; duration: number; description?: string }) => ({
              value: t.id,
              label: t.name,
              description: `${t.duration} min - ${t.description || 'No description'}`,
            }))
          );

          if (selection) {
            appointmentTypeId = selection;
          } else {
            // Fallback: use first available type
            appointmentTypeId = types[0]!.id;
            logger.info('Using first available appointment type as fallback', { appointmentTypeId });
          }
        }

        const requestData = {
          ...args,
          appointmentTypeId,
        };

        const request = await client.schedulingRequests.create(requestData as any);

        logger.info('Created scheduling request', { requestId: request.id, triggerMode: request.triggerMode });

        let response = JSON.stringify(request, null, 2);
        if (request.bookingUrl) {
          response += `\n\n✅ Booking URL generated: ${request.bookingUrl}`;
        }

        return {
          content: [{ type: 'text', text: response }],
        };
      }

      case 'timezest_scheduling_cancel': {
        const requestId = args.requestId as string;

        // Elicitation: confirm cancellation (destructive action)
        const confirmed = await elicitConfirmation(
          `Are you sure you want to cancel scheduling request ${requestId}?`,
          false
        );

        if (confirmed === false) {
          return {
            content: [{
              type: 'text',
              text: 'Cancellation aborted by user.',
            }],
          };
        }

        const cancelled = await client.schedulingRequests.cancel(requestId, {
          reason: args.reason as string,
        });

        logger.info('Cancelled scheduling request', { requestId });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(cancelled, null, 2),
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
    logger.error('Scheduling operation failed', { toolName, error });
    return {
      content: [{
        type: 'text',
        text: `Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`,
      }],
      isError: true,
    };
  }
}

export const schedulingHandler: DomainHandler = { getTools, handleCall };
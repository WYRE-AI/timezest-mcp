/**
 * getHandlerForTool is the registry every MCP tool call routes through
 * (see server.ts).
 *
 * This replaces the old lazy getDomainHandler(domain) coverage: routing is
 * by tool name now, not by a domain the caller had to enter first. The
 * tool-name-to-handler mapping itself is asserted in tool-surface.test.ts;
 * what matters here is that each domain's tools reach the handler that
 * implements them, and that unknown names route nowhere.
 */
import { describe, it, expect } from 'vitest';
import { getHandlerForTool, statusHandler } from '../domains/index.js';
import { agentsHandler } from '../domains/agents.js';
import { teamsHandler } from '../domains/teams.js';
import { appointmentTypesHandler } from '../domains/appointment-types.js';
import { resourcesHandler } from '../domains/resources.js';
import { schedulingHandler } from '../domains/scheduling.js';

describe('getHandlerForTool', () => {
  it.each([
    ['timezest_status', statusHandler],
    ['timezest_agents_list', agentsHandler],
    ['timezest_teams_get', teamsHandler],
    ['timezest_appointment_types_list', appointmentTypesHandler],
    ['timezest_resources_list', resourcesHandler],
    ['timezest_scheduling_create_request', schedulingHandler],
  ])('routes %s to its implementing handler', (toolName, expected) => {
    expect(getHandlerForTool(toolName as string)).toBe(expected);
  });

  it('returns null for an unknown tool', () => {
    expect(getHandlerForTool('timezest_billing_list')).toBeNull();
  });

  it('returns null for the removed navigation tools', () => {
    // Conduit suppresses these by suffix; nothing here implements them any
    // more either, so a stale client cache calling one gets a clean
    // "unknown tool" instead of silently reaching a handler.
    expect(getHandlerForTool('timezest_navigate')).toBeNull();
    expect(getHandlerForTool('timezest_back')).toBeNull();
  });
});

/**
 * Handler-invocation coverage for the navigation domain. No API client
 * involved here — this is pure decision-tree logic — but it was never
 * invoked in any existing test either.
 */
import { describe, it, expect } from 'vitest';
import { navigationHandler } from '../domains/navigation.js';

describe('navigationHandler.getTools', () => {
  it('exposes navigate and status tools', () => {
    const names = navigationHandler.getTools().map((t) => t.name);
    expect(names).toEqual(['timezest_navigate', 'timezest_status']);
  });

  it('enumerates all five domains in the navigate tool schema', () => {
    const tools = navigationHandler.getTools();
    const navigate = tools.find((t) => t.name === 'timezest_navigate')!;
    const enumValues = (navigate.inputSchema.properties as any).domain.enum;
    expect(enumValues).toEqual(['agents', 'teams', 'appointment_types', 'resources', 'scheduling']);
  });
});

describe('navigationHandler.handleCall', () => {
  it('timezest_navigate returns the domain name and description for a valid domain', async () => {
    const result = await navigationHandler.handleCall('timezest_navigate', { domain: 'scheduling' });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('Navigated to Scheduling');
    expect(result.content[0].text).toContain('Create, view, and manage scheduling requests');
  });

  it('timezest_navigate returns isError for an invalid domain', async () => {
    const result = await navigationHandler.handleCall('timezest_navigate', { domain: 'billing' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Invalid domain: billing');
  });

  it('timezest_status lists every domain with its id and description', async () => {
    const result = await navigationHandler.handleCall('timezest_status', {});

    const text = result.content[0].text;
    expect(text).toContain('agents - Agents');
    expect(text).toContain('teams - Teams');
    expect(text).toContain('appointment_types - Appointment Types');
    expect(text).toContain('resources - Resources');
    expect(text).toContain('scheduling - Scheduling');
  });

  it('returns isError for an unknown tool name', async () => {
    const result = await navigationHandler.handleCall('timezest_teleport', {});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Unknown tool: timezest_teleport');
  });
});

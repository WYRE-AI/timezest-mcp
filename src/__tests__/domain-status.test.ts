/**
 * Handler-invocation coverage for timezest_status. No API client involved —
 * this is pure orientation text.
 *
 * Replaces domain-navigation.test.ts: the navigate/back menu this used to
 * cover was removed when the tool list was flattened (see domains/index.ts).
 */
import { describe, it, expect } from 'vitest';
import { statusHandler } from '../domains/status.js';

describe('statusHandler.getTools', () => {
  it('exposes only the status tool', () => {
    const names = statusHandler.getTools().map((t) => t.name);
    expect(names).toEqual(['timezest_status']);
  });
});

describe('statusHandler.handleCall', () => {
  it('timezest_status names every tool group', async () => {
    const text = (await statusHandler.handleCall('timezest_status', {})).content[0].text;

    expect(text).toContain('Agents');
    expect(text).toContain('Teams');
    expect(text).toContain('Appointment Types');
    expect(text).toContain('Resources');
    expect(text).toContain('Scheduling');
  });

  it('timezest_status lists the callable tool names, not a menu to enter', async () => {
    // The old status text told the caller to "use timezest_navigate to enter
    // a domain" — advice that was unfollowable through Conduit, which
    // suppresses that tool. Status must describe tools the caller can
    // actually call right now.
    const text = (await statusHandler.handleCall('timezest_status', {})).content[0].text;

    expect(text).toContain('timezest_agents_list');
    expect(text).toContain('timezest_scheduling_create_request');
    expect(text).not.toContain('timezest_navigate');
  });

  it('returns isError for an unknown tool name', async () => {
    const result = await statusHandler.handleCall('timezest_teleport', {});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Unknown tool: timezest_teleport');
  });
});

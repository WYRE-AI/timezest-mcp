/**
 * Handler-invocation coverage for the teams domain (mirrors domain-agents.test.ts).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { teamsHandler } from '../domains/teams.js';
import { getClient } from '../utils/client.js';

vi.mock('../utils/client.js', () => ({
  getClient: vi.fn(),
}));

const mockedGetClient = vi.mocked(getClient);

function clientWith(overrides: Partial<{ list: any; get: any }>) {
  return {
    teams: {
      list: overrides.list ?? vi.fn(),
      get: overrides.get ?? vi.fn(),
    },
  } as any;
}

describe('teamsHandler.getTools', () => {
  it('exposes list, get, and back tools', () => {
    const names = teamsHandler.getTools().map((t) => t.name);
    expect(names).toEqual(['timezest_teams_list', 'timezest_teams_get', 'timezest_back']);
  });
});

describe('teamsHandler.handleCall', () => {
  beforeEach(() => {
    mockedGetClient.mockReset();
  });

  it('timezest_teams_list forwards pageSize and filter, and returns the JSON-stringified list', async () => {
    const list = vi.fn().mockResolvedValue([{ id: 't1', name: 'Support' }]);
    mockedGetClient.mockResolvedValue(clientWith({ list }));

    const result = await teamsHandler.handleCall('timezest_teams_list', {
      pageSize: 10,
      filter: 'active:true',
    });

    expect(list).toHaveBeenCalledWith({ pageSize: 10, filter: 'active:true' });
    expect(result.content[0]).toEqual({
      type: 'text',
      text: JSON.stringify([{ id: 't1', name: 'Support' }], null, 2),
    });
  });

  it('timezest_teams_get forwards the teamId and returns the JSON-stringified team', async () => {
    const get = vi.fn().mockResolvedValue({ id: 't1', name: 'Support' });
    mockedGetClient.mockResolvedValue(clientWith({ get }));

    const result = await teamsHandler.handleCall('timezest_teams_get', { teamId: 't1' });

    expect(get).toHaveBeenCalledWith('t1');
    expect(result.content[0]).toEqual({
      type: 'text',
      text: JSON.stringify({ id: 't1', name: 'Support' }, null, 2),
    });
  });

  it('timezest_back returns a navigation message without touching the client', async () => {
    const list = vi.fn();
    mockedGetClient.mockResolvedValue(clientWith({ list }));

    const result = await teamsHandler.handleCall('timezest_back', {});

    expect(list).not.toHaveBeenCalled();
    expect(result.content[0].text).toMatch(/Returned to main navigation/);
  });

  it('returns isError for an unknown tool name', async () => {
    mockedGetClient.mockResolvedValue(clientWith({}));

    const result = await teamsHandler.handleCall('timezest_teams_delete', {});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Unknown tool: timezest_teams_delete');
  });

  it('maps a thrown client error into an isError result instead of throwing', async () => {
    const get = vi.fn().mockRejectedValue(new Error('team not found'));
    mockedGetClient.mockResolvedValue(clientWith({ get }));

    const result = await teamsHandler.handleCall('timezest_teams_get', { teamId: 'missing' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Error: team not found');
  });
});

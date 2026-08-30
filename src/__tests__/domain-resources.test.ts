/**
 * Handler-invocation coverage for the resources domain (mixed agents+teams).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resourcesHandler } from '../domains/resources.js';
import { getClient } from '../utils/client.js';

vi.mock('../utils/client.js', () => ({
  getClient: vi.fn(),
}));

const mockedGetClient = vi.mocked(getClient);

function clientWith(overrides: Partial<{ list: any }>) {
  return {
    resources: {
      list: overrides.list ?? vi.fn(),
    },
  } as any;
}

describe('resourcesHandler.getTools', () => {
  it('exposes list and back tools', () => {
    const names = resourcesHandler.getTools().map((t) => t.name);
    expect(names).toEqual(['timezest_resources_list', 'timezest_back']);
  });
});

describe('resourcesHandler.handleCall', () => {
  beforeEach(() => {
    mockedGetClient.mockReset();
  });

  it('timezest_resources_list forwards pageSize, type, and filter, and returns the JSON-stringified list', async () => {
    const list = vi.fn().mockResolvedValue([{ id: 'r1', type: 'agent' }]);
    mockedGetClient.mockResolvedValue(clientWith({ list }));

    const result = await resourcesHandler.handleCall('timezest_resources_list', {
      pageSize: 20,
      type: 'agent',
      filter: 'active:true',
    });

    expect(list).toHaveBeenCalledWith({ pageSize: 20, type: 'agent', filter: 'active:true' });
    expect(result.content[0]).toEqual({
      type: 'text',
      text: JSON.stringify([{ id: 'r1', type: 'agent' }], null, 2),
    });
  });

  it('timezest_back returns a navigation message without touching the client', async () => {
    const list = vi.fn();
    mockedGetClient.mockResolvedValue(clientWith({ list }));

    const result = await resourcesHandler.handleCall('timezest_back', {});

    expect(list).not.toHaveBeenCalled();
    expect(result.content[0].text).toMatch(/Returned to main navigation/);
  });

  it('returns isError for an unknown tool name', async () => {
    mockedGetClient.mockResolvedValue(clientWith({}));

    const result = await resourcesHandler.handleCall('timezest_resources_delete', {});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Unknown tool: timezest_resources_delete');
  });

  it('maps a thrown client error into an isError result instead of throwing', async () => {
    const list = vi.fn().mockRejectedValue(new Error('upstream unavailable'));
    mockedGetClient.mockResolvedValue(clientWith({ list }));

    const result = await resourcesHandler.handleCall('timezest_resources_list', {});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Error: upstream unavailable');
  });
});
